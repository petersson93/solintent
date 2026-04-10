import { useState, useRef, useEffect, useCallback } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';

const PROGRAM_ID = 'AHvsBUGTcXewYD3hyE2F2HunXGszJRJ3k1BCAFwoqCk1';

export default function App() {
  const loc = useLocation();
  const navLinks = [
    { to: '/', label: 'Chat' },
    { to: '/builder', label: 'Builder' },
    { to: '/agents', label: 'My Agents' },
  ];

  return (
    <div className="min-h-screen">
      <header className="bg-white/5 backdrop-blur-xl border-b border-white/10 px-6 py-3 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-6">
            <h1 className="text-white font-bold text-xl font-mono tracking-tight">
              Sol<span className="text-purple-400">Intent</span>
            </h1>
            <nav className="flex gap-1">
              {navLinks.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    loc.pathname === l.to
                      ? 'bg-white/15 text-white font-medium'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>
          <WalletMultiButton />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6">
        <Routes>
          <Route path="/" element={<ChatPage />} />
          <Route path="/builder" element={<BuilderPage />} />
          <Route path="/agents" element={<AgentsPage />} />
        </Routes>
      </main>
    </div>
  );
}

/* ─── types ─── */

interface ParsedBlock {
  action_type: string;
  protocol: string;
  params: Record<string, string | number>;
  order: number;
}

interface ChatMsg {
  role: 'user' | 'assistant';
  text: string;
  blocks?: ParsedBlock[];
  confidence?: number;
}

/* ─── ChatPage ─── */

function ChatPage() {
  const { publicKey } = useWallet();
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: 'assistant',
      text: 'Hey! Tell me what you want to do on Solana. Try something like "swap 1 SOL to USDC" or "stake 5 SOL on Marinade".',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = useCallback(async () => {
    const txt = input.trim();
    if (!txt || loading) return;

    setMessages((prev) => [...prev, { role: 'user', text: txt }]);
    setInput('');
    setLoading(true);

    try {
      const resp = await fetch('/api/parse-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: txt, wallet: publicKey?.toBase58() ?? '' }),
      });

      if (!resp.ok) throw new Error('Backend returned ' + resp.status);
      const data = await resp.json();

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: data.summary || 'Here is what I understood:',
          blocks: data.blocks,
          confidence: data.confidence,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: 'Could not reach the backend. Make sure the API is running on port 8000.' },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, publicKey]);

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      {/* messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4 scrollbar-thin">
        {messages.map((m, i) => (
          <div key={i} className={`chat-bubble flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                m.role === 'user'
                  ? 'bg-purple-600 text-white'
                  : 'bg-white/10 backdrop-blur-md text-white/90 border border-white/10'
              }`}
            >
              <p className="text-sm leading-relaxed">{m.text}</p>

              {m.blocks && m.blocks.length > 0 && (
                <div className="mt-3 space-y-2">
                  {m.blocks.map((b, j) => (
                    <div key={j} className="bg-black/20 rounded-xl p-3 border border-white/10">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono bg-purple-500/30 text-purple-200 px-2 py-0.5 rounded">
                          {b.action_type}
                        </span>
                        <span className="text-xs text-white/50">{b.protocol}</span>
                      </div>
                      <div className="text-xs text-white/60 font-mono">
                        {Object.entries(b.params || {}).map(([k, v]) => (
                          <span key={k} className="mr-3">
                            {k}: <span className="text-white/80">{String(v)}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                  {m.confidence != null && (
                    <p className="text-xs text-white/40 mt-1">
                      confidence: {Math.round(m.confidence * 100)}%
                    </p>
                  )}
                  {publicKey ? (
                    <button className="mt-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:opacity-90 transition-opacity">
                      Sign & Execute
                    </button>
                  ) : (
                    <p className="text-xs text-yellow-300/70 mt-1">Connect wallet to execute</p>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white/10 backdrop-blur-md rounded-2xl px-4 py-3 border border-white/10">
              <div className="flex gap-1">
                <span className="typing-dot w-2 h-2 bg-white/60 rounded-full" />
                <span className="typing-dot w-2 h-2 bg-white/60 rounded-full" />
                <span className="typing-dot w-2 h-2 bg-white/60 rounded-full" />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* input */}
      <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-2 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder={publicKey ? 'Describe your DeFi action...' : 'Connect wallet first, then type here...'}
          className="flex-1 bg-transparent px-4 py-3 text-white placeholder-white/30 outline-none text-sm"
          disabled={loading}
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          className="bg-gradient-to-r from-purple-500 to-pink-500 text-white font-mono font-bold px-6 py-3 rounded-xl hover:opacity-90 disabled:opacity-40 transition-opacity text-sm"
        >
          Send
        </button>
      </div>
    </div>
  );
}

/* ─── BuilderPage ─── */

function BuilderPage() {
  return (
    <div className="bg-white/5 backdrop-blur-md rounded-2xl p-8 border border-white/10 h-[600px] flex flex-col items-center justify-center gap-4">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/30 to-pink-500/30 flex items-center justify-center border border-white/10">
        <svg className="w-8 h-8 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
        </svg>
      </div>
      <h2 className="text-white text-xl font-semibold font-mono">Visual Agent Builder</h2>
      <p className="text-white/40 text-sm max-w-md text-center">
        Drag-and-drop blocks to build multi-step DeFi agents. Connect swap, stake, limit order, and alert blocks.
      </p>
      <span className="text-xs font-mono text-purple-400/60 bg-purple-500/10 px-3 py-1 rounded-full">
        coming soon
      </span>
    </div>
  );
}

/* ─── AgentsPage ─── */

interface AgentAccount {
  pubkey: string;
  agentId: string;
  name: string;
  agentType: string;
  blockCount: number;
  isActive: boolean;
  totalExecutions: string;
}

function AgentsPage() {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const [agents, setAgents] = useState<AgentAccount[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!publicKey) return;
    setLoading(true);

    const programId = new PublicKey(PROGRAM_ID);
    connection
      .getProgramAccounts(programId, {
        filters: [
          { dataSize: 300 },
          { memcmp: { offset: 8, bytes: publicKey.toBase58() } },
        ],
      })
      .then((accounts) => {
        const parsed: AgentAccount[] = accounts.map((a) => {
          const data = a.account.data;
          const agentId = new DataView(data.buffer, data.byteOffset + 40, 8).getBigUint64(0, true);
          const nameLen = new DataView(data.buffer, data.byteOffset + 48, 4).getUint32(0, true);
          const name = new TextDecoder().decode(data.slice(52, 52 + nameLen));

          return {
            pubkey: a.pubkey.toBase58(),
            agentId: agentId.toString(),
            name: name || `Agent #${agentId}`,
            agentType: 'Chat',
            blockCount: 0,
            isActive: true,
            totalExecutions: '0',
          };
        });
        setAgents(parsed);
      })
      .catch(() => setAgents([]))
      .finally(() => setLoading(false));
  }, [publicKey, connection]);

  if (!publicKey) {
    return (
      <div className="bg-white/5 backdrop-blur-md rounded-2xl p-8 border border-white/10 text-center">
        <p className="text-white/50 text-sm">Connect your wallet to see your agents</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-white text-xl font-semibold font-mono">My Agents</h2>
        <span className="text-xs text-white/40 font-mono">{agents.length} agent{agents.length !== 1 ? 's' : ''}</span>
      </div>

      {loading ? (
        <div className="bg-white/5 backdrop-blur-md rounded-2xl p-8 border border-white/10 text-center">
          <div className="flex justify-center gap-1">
            <span className="typing-dot w-2 h-2 bg-white/60 rounded-full" />
            <span className="typing-dot w-2 h-2 bg-white/60 rounded-full" />
            <span className="typing-dot w-2 h-2 bg-white/60 rounded-full" />
          </div>
        </div>
      ) : agents.length === 0 ? (
        <div className="bg-white/5 backdrop-blur-md rounded-2xl p-8 border border-white/10 text-center">
          <p className="text-white/50 text-sm mb-2">No agents yet</p>
          <p className="text-white/30 text-xs">
            Go to the <Link to="/" className="text-purple-400 underline">Chat</Link> page and describe an action to create your first agent.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {agents.map((ag) => (
            <div
              key={ag.pubkey}
              className="bg-white/5 backdrop-blur-md rounded-xl p-4 border border-white/10 flex items-center justify-between"
            >
              <div>
                <h3 className="text-white font-medium">{ag.name}</h3>
                <p className="text-white/40 text-xs font-mono mt-1">
                  ID: {ag.agentId} &middot; {ag.agentType} &middot; {ag.totalExecutions} executions
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    ag.isActive ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
                  }`}
                >
                  {ag.isActive ? 'active' : 'paused'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
