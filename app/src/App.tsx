import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import ReactFlow, { Background, Controls, type Node, type Edge } from 'reactflow';
import 'reactflow/dist/style.css';

const PROGRAM_ID = 'AHvsBUGTcXewYD3hyE2F2HunXGszJRJ3k1BCAFwoqCk1';

type ExecState = 'idle' | 'building' | 'signing' | 'confirming' | 'done' | 'error';

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
  const { publicKey, signTransaction, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: 'assistant',
      text: 'Hey! Tell me what you want to do on Solana. Try something like "swap 1 SOL to USDC" or "stake 5 SOL on Marinade".',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState<Record<number, ExecState>>({});
  const [txSigs, setTxSigs] = useState<Record<number, string>>({});
  const [execErrors, setExecErrors] = useState<Record<number, string>>({});
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

  const handleExecute = useCallback(
    async (msgIndex: number, blocks: ParsedBlock[]) => {
      if (!publicKey || !signTransaction) return;

      const setState = (s: ExecState) =>
        setExecuting((prev) => ({ ...prev, [msgIndex]: s }));
      const setErr = (msg: string) =>
        setExecErrors((prev) => ({ ...prev, [msgIndex]: msg }));
      const setSig = (sig: string) =>
        setTxSigs((prev) => ({ ...prev, [msgIndex]: sig }));

      try {
        setState('building');

        const resp = await fetch('/api/build-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wallet: publicKey.toBase58(),
            agent_name: 'chat-agent',
            blocks,
          }),
        });

        if (!resp.ok) {
          const errBody = await resp.text();
          throw new Error(errBody || `Build failed (${resp.status})`);
        }

        const data = await resp.json();

        // Build transaction on frontend with fresh blockhash
        const ix = new TransactionInstruction({
          programId: new PublicKey(data.programId),
          keys: data.accounts.map((a: any) => ({
            pubkey: new PublicKey(a.pubkey),
            isSigner: a.isSigner,
            isWritable: a.isWritable,
          })),
          data: Buffer.from(data.instructionData, 'base64'),
        });

        const tx = new Transaction();
        tx.add(ix);
        tx.feePayer = publicKey;
        const { blockhash } = await connection.getLatestBlockhash('confirmed');
        tx.recentBlockhash = blockhash;

        setState('signing');
        const sig = await sendTransaction(tx, connection, {
          skipPreflight: true,
          preflightCommitment: 'confirmed',
        });

        setState('confirming');
        await connection.confirmTransaction(sig, 'confirmed');

        setSig(sig);
        setState('done');
      } catch (err: any) {
        const errMsg =
          err?.message || err?.toString?.() || 'Unknown error during execution';
        setErr(errMsg);
        setState('error');
      }
    },
    [publicKey, signTransaction, connection],
  );

  const execButtonLabel = (state: ExecState | undefined): string => {
    switch (state) {
      case 'building':
        return 'Building tx...';
      case 'signing':
        return 'Sign in wallet...';
      case 'confirming':
        return 'Confirming...';
      case 'done':
        return 'View on Explorer \u2197';
      case 'error':
        return 'Failed \u2014 retry?';
      default:
        return 'Sign & Execute';
    }
  };

  const isExecBusy = (state: ExecState | undefined): boolean =>
    state === 'building' || state === 'signing' || state === 'confirming';

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
                    <>
                      {executing[i] === 'done' && txSigs[i] ? (
                        <a
                          href={`https://explorer.solana.com/tx/${txSigs[i]}?cluster=devnet`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-block bg-green-500/80 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-green-500 transition-colors"
                        >
                          View on Explorer &#8599;
                        </a>
                      ) : (
                        <button
                          disabled={isExecBusy(executing[i])}
                          onClick={() => handleExecute(i, m.blocks!)}
                          className={`mt-2 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-opacity ${
                            executing[i] === 'error'
                              ? 'bg-gradient-to-r from-red-500 to-orange-500 hover:opacity-90'
                              : 'bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90'
                          } disabled:opacity-50 disabled:cursor-wait`}
                        >
                          {execButtonLabel(executing[i])}
                        </button>
                      )}
                      {executing[i] === 'error' && execErrors[i] && (
                        <p className="text-xs text-red-300/80 mt-1 break-all">
                          {execErrors[i]}
                        </p>
                      )}
                    </>
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

const flowNodeStyle = {
  background: 'rgba(139, 92, 246, 0.15)',
  border: '1px solid rgba(139, 92, 246, 0.4)',
  borderRadius: '12px',
  padding: '14px 18px',
  color: '#e2e0ff',
  fontSize: '13px',
  fontFamily: "'Space Mono', monospace",
  backdropFilter: 'blur(8px)',
  minWidth: 180,
};

const demoNodes: Node[] = [
  {
    id: 'swap',
    position: { x: 60, y: 180 },
    data: {
      label: (
        <div>
          <div style={{ fontSize: 10, color: '#c084fc', marginBottom: 4 }}>SWAP</div>
          <div>SOL &rarr; USDC</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>via Jupiter</div>
        </div>
      ),
    },
    style: flowNodeStyle,
  },
  {
    id: 'stake',
    position: { x: 340, y: 180 },
    data: {
      label: (
        <div>
          <div style={{ fontSize: 10, color: '#f0abfc', marginBottom: 4 }}>STAKE</div>
          <div>USDC on Kamino</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>auto-compound</div>
        </div>
      ),
    },
    style: flowNodeStyle,
  },
  {
    id: 'alert',
    position: { x: 620, y: 180 },
    data: {
      label: (
        <div>
          <div style={{ fontSize: 10, color: '#fb923c', marginBottom: 4 }}>ALERT</div>
          <div>APY &lt; 5%</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>notify &amp; unwind</div>
        </div>
      ),
    },
    style: flowNodeStyle,
  },
];

const demoEdges: Edge[] = [
  {
    id: 'swap-stake',
    source: 'swap',
    target: 'stake',
    animated: true,
    style: { stroke: '#a78bfa', strokeWidth: 2 },
  },
  {
    id: 'stake-alert',
    source: 'stake',
    target: 'alert',
    animated: true,
    style: { stroke: '#c084fc', strokeWidth: 2 },
  },
];

function BuilderPage() {
  const [nodes, setNodes] = useState<Node[]>(demoNodes);
  const [edges] = useState<Edge[]>(demoEdges);

  const onNodesChange = useCallback(
    (changes: any) => {
      setNodes((nds) => {
        const updated = [...nds];
        for (const change of changes) {
          if (change.type === 'position' && change.position) {
            const idx = updated.findIndex((n) => n.id === change.id);
            if (idx !== -1) {
              updated[idx] = { ...updated[idx], position: change.position };
            }
          }
        }
        return updated;
      });
    },
    [],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-white text-xl font-semibold font-mono">
          Visual Agent Builder
        </h2>
        <span className="text-xs font-mono text-purple-400/60 bg-purple-500/10 px-3 py-1 rounded-full">
          demo mode
        </span>
      </div>
      <div
        className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden"
        style={{ height: 520 }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background color="rgba(139, 92, 246, 0.08)" gap={20} />
          <Controls
            style={{
              background: 'rgba(30, 20, 60, 0.8)',
              border: '1px solid rgba(139, 92, 246, 0.3)',
              borderRadius: 8,
            }}
          />
        </ReactFlow>
      </div>
      <p className="text-white/30 text-xs text-center font-mono">
        Drag nodes to rearrange. Connect swap, stake, and alert blocks to build multi-step DeFi agents.
      </p>
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
