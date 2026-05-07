import { useState, useRef, useEffect, useCallback, useMemo, Component, type ReactNode } from 'react';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import ReactFlow, {
  Background,
  Controls,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
  Handle,
  Position,
} from 'reactflow';
import { useAtom } from 'jotai';
import { messagesAtom, inputAtom } from './state/chatAtoms';
import 'reactflow/dist/style.css';

const PROGRAM_ID = 'AHvsBUGTcXewYD3hyE2F2HunXGszJRJ3k1BCAFwoqCk1';

type ExecState = 'idle' | 'building' | 'signing' | 'confirming' | 'done' | 'error';

/* ═══════════════════════════════════════════════════════════
   SHARED COMPONENTS
   ═══════════════════════════════════════════════════════════ */

function GradientMeshBg() {
  return (
    <>
      <div className="gradient-mesh-bg" />
      <div className="dot-grid-overlay" />
    </>
  );
}

function FloatingParticles() {
  const particles = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        id: i,
        size: 2 + Math.random() * 4,
        left: Math.random() * 100,
        duration: 15 + Math.random() * 20,
        delay: Math.random() * 15,
        color: i % 2 === 0 ? 'rgba(139, 92, 246, 0.35)' : 'rgba(236, 72, 153, 0.3)',
      })),
    [],
  );

  return (
    <>
      {particles.map((p) => (
        <div
          key={p.id}
          className="particle"
          style={{
            width: p.size,
            height: p.size,
            left: `${p.left}%`,
            background: p.color,
            boxShadow: `0 0 ${p.size * 3}px ${p.color}`,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </>
  );
}

function LogoText({ size = 'lg' }: { size?: 'sm' | 'lg' }) {
  const cls = size === 'lg' ? 'text-2xl' : 'text-xl';
  return (
    <span className={`font-bold ${cls} font-mono tracking-tight`}>
      <span className="text-white">Sol</span>
      <span className="gradient-text-logo">Intent</span>
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════
   ERROR BOUNDARY
   ═══════════════════════════════════════════════════════════ */

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="glass-panel rounded-2xl p-10 max-w-md text-center">
            <div className="text-3xl mb-4">⚠</div>
            <h2 className="text-white font-mono font-bold text-lg mb-2">Something went wrong</h2>
            <p className="text-white/40 text-sm mb-6 font-mono">{this.state.error.message}</p>
            <button
              onClick={() => { this.setState({ error: null }); window.location.href = '/'; }}
              className="exec-btn text-sm font-semibold px-6 py-2.5 rounded-xl"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function NotFoundPage() {
  return (
    <div className="flex items-center justify-center py-32">
      <div className="glass-panel rounded-2xl p-10 max-w-sm text-center">
        <p className="text-5xl font-mono font-bold gradient-text mb-4">404</p>
        <p className="text-white/50 text-sm mb-6">This page doesn&apos;t exist.</p>
        <Link to="/app" className="exec-btn text-sm font-semibold px-6 py-2.5 rounded-xl inline-block">
          Go to Chat
        </Link>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   ROOT ROUTER
   ═══════════════════════════════════════════════════════════ */

export default function App() {
  return (
    <AppErrorBoundary>
      <Routes>
        <Route path="/" element={<LandingChat />} />
        <Route path="/app" element={<AppShell />}>
          <Route index element={<ChatPage />} />
          <Route path="builder" element={<BuilderPage />} />
          <Route path="agents" element={<AgentsPage />} />
          <Route path="guide" element={<GuidePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppErrorBoundary>
  );
}

/* ═══════════════════════════════════════════════════════════
   LANDING — conversational onboarding
   ═══════════════════════════════════════════════════════════ */

interface LandingMsg {
  from: 'agent' | 'user';
  text: string;
  action?: 'connect-wallet' | 'enter-app';
  typing?: boolean;
}

const GREETING_LINES = [
  'gm.',
  "I'm SolIntent — your AI-powered DeFi co-pilot on Solana.",
  'Tell me what you want to do in plain English, and I handle the rest.',
  'Swaps, staking, limit orders, multi-step strategies — just say the word.',
  '',
  'Ready to try? Type anything below.',
];

function LandingChat() {
  const { publicKey, connected } = useWallet();
  const navigate = useNavigate();
  const [msgs, setMsgs] = useState<LandingMsg[]>([]);
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<'greeting' | 'waiting' | 'connect' | 'ready'>('greeting');
  const [typingLine, setTypingLine] = useState(0);
  const [typingText, setTypingText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs, typingText]);

  // typewriter effect for greeting
  useEffect(() => {
    if (phase !== 'greeting') return;
    if (typingLine >= GREETING_LINES.length) {
      setPhase('waiting');
      inputRef.current?.focus();
      return;
    }

    const line = GREETING_LINES[typingLine];

    // empty line = pause
    if (line === '') {
      const t = setTimeout(() => setTypingLine((p) => p + 1), 400);
      return () => clearTimeout(t);
    }

    let charIdx = 0;
    setTypingText('');

    const iv = setInterval(() => {
      charIdx++;
      setTypingText(line.slice(0, charIdx));
      if (charIdx >= line.length) {
        clearInterval(iv);
        // commit the line
        setMsgs((prev) => [...prev, { from: 'agent', text: line }]);
        setTypingText('');
        setTimeout(() => setTypingLine((p) => p + 1), 300);
      }
    }, 28);

    return () => clearInterval(iv);
  }, [phase, typingLine]);

  // watch wallet connection
  useEffect(() => {
    if (connected && publicKey && phase === 'connect') {
      const addr = publicKey.toBase58();
      const short = addr.slice(0, 4) + '...' + addr.slice(-4);
      setMsgs((prev) => [
        ...prev,
        { from: 'agent', text: `Connected: ${short}` },
        { from: 'agent', text: "You're all set. Let's build something." },
        { from: 'agent', text: '', action: 'enter-app' },
      ]);
      setPhase('ready');
    }
  }, [connected, publicKey, phase]);

  const handleSend = () => {
    const txt = input.trim();
    if (!txt) return;

    setMsgs((prev) => [...prev, { from: 'user', text: txt }]);
    setInput('');

    if (phase === 'waiting' || phase === 'greeting') {
      // user typed something — prompt wallet connect
      setTimeout(() => {
        if (connected && publicKey) {
          // already connected — skip to ready
          const addr = publicKey.toBase58();
          const short = addr.slice(0, 4) + '...' + addr.slice(-4);
          setMsgs((prev) => [
            ...prev,
            { from: 'agent', text: `Wallet already connected: ${short}` },
            { from: 'agent', text: "Nice, let's go." },
            { from: 'agent', text: '', action: 'enter-app' },
          ]);
          setPhase('ready');
        } else {
          setMsgs((prev) => [
            ...prev,
            { from: 'agent', text: 'First, connect your Solana wallet so I can build transactions for you.' },
            { from: 'agent', text: '', action: 'connect-wallet' },
          ]);
          setPhase('connect');
        }
      }, 600);
    } else if (phase === 'connect') {
      // still waiting for wallet
      setTimeout(() => {
        setMsgs((prev) => [
          ...prev,
          { from: 'agent', text: 'Hit the connect button above — I need your wallet to proceed.' },
        ]);
      }, 400);
    }
  };

  return (
    <div className="min-h-screen flex flex-col relative">
      <GradientMeshBg />
      <FloatingParticles />

      {/* decorative circuit lines */}
      <div className="floating-decoration circuit-lines-left" />
      <div className="floating-decoration circuit-lines-right" />

      {/* minimal top bar */}
      <header className="px-6 py-5 flex justify-between items-center relative z-10">
        <div className="flex items-center gap-3">
          {/* logo icon */}
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500/30 to-pink-500/20 border border-purple-500/20 flex items-center justify-center shadow-lg shadow-purple-500/10">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 1L14 5V11L8 15L2 11V5L8 1Z" stroke="url(#logoGrad)" strokeWidth="1.5" fill="none" />
              <circle cx="8" cy="8" r="2.5" fill="url(#logoGrad)" />
              <defs>
                <linearGradient id="logoGrad" x1="2" y1="1" x2="14" y2="15">
                  <stop stopColor="#a78bfa" />
                  <stop offset="1" stopColor="#ec4899" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <LogoText size="lg" />
        </div>
        <div className="flex items-center gap-3">
          {phase === 'ready' && (
            <button
              onClick={() => navigate('/app')}
              className="text-xs font-mono text-purple-300/70 hover:text-white transition-colors"
            >
              skip to app &rarr;
            </button>
          )}
        </div>
      </header>

      {/* chat area */}
      <div className="flex-1 flex flex-col max-w-2xl w-full mx-auto px-6 pb-6 relative z-10">
        <div className="flex-1 overflow-y-auto space-y-3 pb-4">
          {msgs.map((m, i) => (
            <LandingBubble key={i} msg={m} onEnterApp={() => navigate('/app')} />
          ))}

          {/* active typing line */}
          {typingText && (
            <div className="landing-bubble flex justify-start">
              <div className="max-w-[85%] rounded-2xl px-5 py-3.5 msg-agent">
                <p className="text-sm leading-relaxed font-mono text-white/90">
                  {typingText}
                  <span className="inline-block w-[2px] h-4 bg-purple-400 ml-1 align-middle animate-blink rounded-full" />
                </p>
              </div>
            </div>
          )}

          {/* typing dots when agent is "thinking" after user message */}
          {(phase === 'waiting' || phase === 'connect') && msgs.length > 0 && msgs[msgs.length - 1].from === 'user' && (
            <div className="flex justify-start">
              <div className="msg-agent rounded-2xl px-5 py-3.5">
                <div className="flex gap-1.5">
                  <span className="typing-dot w-2 h-2 bg-purple-400/80 rounded-full" />
                  <span className="typing-dot w-2 h-2 bg-purple-400/60 rounded-full" />
                  <span className="typing-dot w-2 h-2 bg-purple-400/40 rounded-full" />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* input bar */}
        <div className="landing-input input-glow glass-panel-strong rounded-2xl p-2 flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={
              phase === 'greeting'
                ? '...'
                : phase === 'ready'
                  ? 'You\'re in — hit Enter App above'
                  : 'Tell me what you want to do on Solana...'
            }
            className="flex-1 bg-transparent px-4 py-3 text-white placeholder-white/20 outline-none text-sm font-mono"
            disabled={phase === 'greeting'}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || phase === 'greeting'}
            className="bg-gradient-to-r from-purple-500 to-pink-500 text-white font-mono font-bold px-6 py-3 rounded-xl hover:opacity-90 disabled:opacity-20 transition-all hover:shadow-lg hover:shadow-purple-500/20 text-sm"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        </div>
      </div>

      {/* ambient footer */}
      <footer className="text-center pb-5 px-6 relative z-10">
        <p className="text-white/10 text-[11px] font-mono tracking-wide">
          Solana devnet &middot; NLP + on-chain execution &middot; open source
        </p>
      </footer>
    </div>
  );
}

function LandingBubble({ msg, onEnterApp }: { msg: LandingMsg; onEnterApp: () => void }) {
  if (msg.action === 'connect-wallet') {
    return (
      <div className="landing-bubble flex justify-start">
        <div className="inline-block wallet-btn-landing">
          <WalletMultiButton />
        </div>
      </div>
    );
  }

  if (msg.action === 'enter-app') {
    return (
      <div className="landing-bubble flex justify-start mt-2">
        <button
          onClick={onEnterApp}
          className="enter-app-btn bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 text-white font-mono font-bold px-10 py-4 rounded-2xl hover:scale-[1.03] active:scale-[0.98] transition-transform text-sm tracking-wide"
        >
          Enter App &rarr;
        </button>
      </div>
    );
  }

  return (
    <div className={`landing-bubble flex ${msg.from === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-5 py-3.5 ${
          msg.from === 'user'
            ? 'msg-user text-white'
            : 'msg-agent text-white/90'
        }`}
      >
        <p className={`text-sm leading-relaxed ${msg.from === 'agent' ? 'font-mono' : ''}`}>
          {msg.text}
        </p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   APP SHELL — header + nav + outlet (the real app)
   ═══════════════════════════════════════════════════════════ */

function AppShell() {
  const loc = useLocation();
  const navLinks = [
    { to: '/app', label: 'Chat', icon: chatIcon },
    { to: '/app/builder', label: 'Builder', icon: builderIcon },
    { to: '/app/agents', label: 'My Agents', icon: agentsIcon },
    { to: '/app/guide', label: 'Guide', icon: guideIcon },
  ];

  return (
    <div className="min-h-screen relative">
      <GradientMeshBg />

      <header className="app-header px-6 py-3.5 sticky top-0 z-50 relative">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2.5 hover:opacity-85 transition-opacity">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500/25 to-pink-500/15 border border-purple-500/20 flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M8 1L14 5V11L8 15L2 11V5L8 1Z" stroke="url(#lgA)" strokeWidth="1.5" fill="none" />
                  <circle cx="8" cy="8" r="2.5" fill="url(#lgA)" />
                  <defs>
                    <linearGradient id="lgA" x1="2" y1="1" x2="14" y2="15">
                      <stop stopColor="#a78bfa" />
                      <stop offset="1" stopColor="#ec4899" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
              <LogoText size="sm" />
            </Link>
            <nav className="flex gap-1.5">
              {navLinks.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  className={`nav-pill flex items-center gap-2 ${
                    loc.pathname === l.to ? 'nav-pill-active' : ''
                  }`}
                >
                  <span className="opacity-60">{l.icon}</span>
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>
          <WalletMultiButton />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 relative z-10 page-enter">
        <Routes>
          <Route index element={<ChatPage />} />
          <Route path="builder" element={<BuilderPage />} />
          <Route path="agents" element={<AgentsPage />} />
          <Route path="guide" element={<GuidePage />} />
        </Routes>
      </main>
    </div>
  );
}

/* nav icons (inline SVGs) */
const chatIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
  </svg>
);
const builderIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
  </svg>
);
const agentsIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
  </svg>
);
const guideIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
  </svg>
);

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

/* ─── helper: color accent by action type ─── */
function actionAccentColor(type: string): string {
  const t = type.toLowerCase();
  if (t.includes('swap')) return '#8b5cf6';
  if (t.includes('stake')) return '#3b82f6';
  if (t.includes('alert')) return '#fb923c';
  if (t.includes('transfer') || t.includes('send')) return '#10b981';
  if (t.includes('lend') || t.includes('borrow')) return '#ec4899';
  return '#8b5cf6';
}

function actionBadgeClasses(type: string): string {
  const t = type.toLowerCase();
  if (t.includes('swap')) return 'bg-purple-500/20 text-purple-300 border border-purple-500/20';
  if (t.includes('stake')) return 'bg-blue-500/20 text-blue-300 border border-blue-500/20';
  if (t.includes('alert')) return 'bg-orange-500/20 text-orange-300 border border-orange-500/20';
  if (t.includes('transfer') || t.includes('send')) return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/20';
  if (t.includes('lend') || t.includes('borrow')) return 'bg-pink-500/20 text-pink-300 border border-pink-500/20';
  return 'bg-purple-500/20 text-purple-300 border border-purple-500/20';
}

function actionDataType(type: string): string {
  const t = type.toLowerCase();
  if (t.includes('swap')) return 'swap';
  if (t.includes('stake')) return 'stake';
  if (t.includes('alert')) return 'alert';
  if (t.includes('transfer') || t.includes('send')) return 'transfer';
  if (t.includes('lend') || t.includes('borrow')) return 'lend';
  return 'swap';
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

  // jotai atoms — cross-component state sync for chat history
  const [, syncMessages] = useAtom(messagesAtom);
  const [, syncInput] = useAtom(inputAtom);
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

    const userMsg: ChatMsg = { role: 'user', text: txt };
    setMessages((prev) => {
      const next = [...prev, userMsg];
      syncMessages(next.map((m) => ({ role: m.role, content: m.text, blocks: m.blocks, ts: Date.now() })));
      return next;
    });
    setInput('');
    syncInput('');
    setLoading(true);

    try {
      const resp = await fetch('/api/parse-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: txt, wallet: publicKey?.toBase58() ?? '' }),
      });

      if (!resp.ok) throw new Error('Backend returned ' + resp.status);
      const data = await resp.json();

      const hasBlocks = data.blocks && data.blocks.length > 0;
      const assistantText = hasBlocks
        ? (data.summary || 'Here is what I parsed:')
        : (data.reply || data.summary || "I'm not sure what to do with that. Try describing a DeFi action like \"swap 1 SOL to USDC\".");

      setMessages((prev) => {
        const next = [
          ...prev,
          {
            role: 'assistant' as const,
            text: assistantText,
            blocks: hasBlocks ? data.blocks : undefined,
            confidence: hasBlocks ? data.confidence : undefined,
          },
        ];
        syncMessages(next.map((m) => ({ role: m.role, content: m.text, blocks: m.blocks, ts: Date.now() })));
        return next;
      });
    } catch {
      setMessages((prev) => {
        const next = [
          ...prev,
          { role: 'assistant' as const, text: 'Could not reach the backend. Make sure the API is running on port 8010.' },
        ];
        syncMessages(next.map((m) => ({ role: m.role, content: m.text, blocks: m.blocks, ts: Date.now() })));
        return next;
      });
    } finally {
      setLoading(false);
    }
  }, [input, loading, publicKey, syncMessages, syncInput]);

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
          keys: data.accounts.map((a: { pubkey: string; isSigner: boolean; isWritable: boolean }) => ({
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
      } catch (err: unknown) {
        const errMsg =
          err instanceof Error ? err.message : 'Unknown error during execution';
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

  const execBtnClass = (state: ExecState | undefined): string => {
    if (state === 'done') return 'exec-btn exec-btn-success';
    if (state === 'error') return 'exec-btn exec-btn-error';
    if (state === 'signing') return 'exec-btn exec-btn-pulse';
    return 'exec-btn';
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)]">
      {/* messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.map((m, i) => (
          <div key={i} className={`chat-bubble flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-5 py-3.5 ${
                m.role === 'user'
                  ? 'msg-user text-white'
                  : 'msg-agent text-white/90'
              }`}
            >
              <p className="text-sm leading-relaxed">{m.text}</p>

              {m.blocks && m.blocks.length > 0 && (
                <div className="mt-4 space-y-3">
                  {m.blocks.map((b, j) => (
                    <div
                      key={j}
                      className="action-block"
                      data-type={actionDataType(b.action_type)}
                      style={{ '--accent-color': actionAccentColor(b.action_type) } as React.CSSProperties}
                    >
                      <div className="flex items-center gap-2.5 mb-2">
                        <span className={`text-[10px] font-mono font-bold uppercase px-2.5 py-1 rounded-md ${actionBadgeClasses(b.action_type)}`}>
                          {b.action_type}
                        </span>
                        <span className="text-[11px] text-white/40 font-mono">{b.protocol}</span>
                      </div>
                      <div className="text-xs text-white/50 font-mono flex flex-wrap gap-x-4 gap-y-1">
                        {Object.entries(b.params || {}).map(([k, v]) => (
                          <span key={k}>
                            <span className="text-white/30">{k}:</span>{' '}
                            <span className="text-white/75">{String(v)}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* confidence meter */}
                  {m.confidence != null && (
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-[10px] text-white/30 font-mono uppercase tracking-wider">Confidence</span>
                      <div className="confidence-meter flex-1 max-w-[120px]">
                        <div
                          className="confidence-meter-fill"
                          style={{ width: `${Math.round(m.confidence * 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-white/50 font-mono">{Math.round(m.confidence * 100)}%</span>
                    </div>
                  )}

                  {publicKey ? (
                    <>
                      {executing[i] === 'done' && txSigs[i] ? (
                        <a
                          href={`https://explorer.solana.com/tx/${txSigs[i]}?cluster=devnet`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="exec-btn exec-btn-success mt-3 inline-flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          View on Explorer &#8599;
                        </a>
                      ) : (
                        <button
                          disabled={isExecBusy(executing[i])}
                          onClick={() => handleExecute(i, m.blocks!)}
                          className={`${execBtnClass(executing[i])} mt-3 text-sm font-semibold px-5 py-2.5 rounded-xl inline-flex items-center gap-2`}
                        >
                          {isExecBusy(executing[i]) && (
                            <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                            </svg>
                          )}
                          {!isExecBusy(executing[i]) && !executing[i] && (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                            </svg>
                          )}
                          {execButtonLabel(executing[i])}
                        </button>
                      )}
                      {executing[i] === 'error' && execErrors[i] && (
                        <p className="text-xs text-red-300/70 mt-1.5 break-all font-mono">
                          {execErrors[i]}
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center gap-2 mt-2">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-yellow-400/60">
                        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                      <p className="text-xs text-yellow-300/60">Connect wallet to execute</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start chat-bubble">
            <div className="msg-agent rounded-2xl px-5 py-3.5">
              <div className="flex gap-1.5">
                <span className="typing-dot w-2 h-2 bg-purple-400/80 rounded-full" />
                <span className="typing-dot w-2 h-2 bg-purple-400/60 rounded-full" />
                <span className="typing-dot w-2 h-2 bg-purple-400/40 rounded-full" />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* input */}
      <div className="input-glow glass-panel-strong rounded-2xl p-2 flex gap-2">
        <input
          value={input}
          onChange={(e) => { setInput(e.target.value); syncInput(e.target.value); }}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder={publicKey ? 'Describe your DeFi action...' : 'Connect wallet first, then type here...'}
          className="flex-1 bg-transparent px-4 py-3 text-white placeholder-white/20 outline-none text-sm font-mono"
          disabled={loading}
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          className="bg-gradient-to-r from-purple-500 to-pink-500 text-white font-mono font-bold px-6 py-3 rounded-xl hover:opacity-90 disabled:opacity-20 transition-all hover:shadow-lg hover:shadow-purple-500/20 text-sm flex items-center gap-2"
        >
          <span>Send</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/* ─── BuilderPage ─── */

const BLOCK_PALETTE = [
  { type: 'Swap', protocol: 'Jupiter', color: '#8b5cf6', icon: 'swap', desc: 'Exchange tokens' },
  { type: 'Stake', protocol: 'Marinade', color: '#3b82f6', icon: 'stake', desc: 'Stake for yield' },
  { type: 'Unstake', protocol: 'Marinade', color: '#06b6d4', icon: 'unstake', desc: 'Unstake tokens' },
  { type: 'LimitOrder', protocol: 'Drift', color: '#10b981', icon: 'limit', desc: 'Conditional buy/sell' },
  { type: 'Dca', protocol: 'Jupiter', color: '#f59e0b', icon: 'dca', desc: 'Dollar-cost average' },
  { type: 'Alert', protocol: 'Drift', color: '#fb923c', icon: 'alert', desc: 'Price alert trigger' },
] as const;

interface BuilderBlockData {
  blockType: string;
  protocol: string;
  color: string;
  params: Record<string, string>;
}

function blockNodeStyle(color: string) {
  return {
    background: 'rgba(12, 10, 26, 0.6)',
    border: `1px solid ${color}40`,
    borderLeft: `3px solid ${color}`,
    borderRadius: '16px',
    padding: '16px 20px',
    color: '#e2e0ff',
    fontSize: '13px',
    fontFamily: "'Space Mono', monospace",
    backdropFilter: 'blur(12px)',
    minWidth: 200,
    boxShadow: `0 4px 20px rgba(0, 0, 0, 0.2), 0 0 20px ${color}15`,
  };
}

function BlockIcon({ icon, color, size = 14 }: { icon: string; color: string; size?: number }) {
  const props = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (icon) {
    case 'swap': return <svg {...props}><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>;
    case 'stake': return <svg {...props}><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>;
    case 'unstake': return <svg {...props}><path d="M12 19V5"/><polyline points="5 12 12 5 19 12"/></svg>;
    case 'limit': return <svg {...props}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
    case 'dca': return <svg {...props}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>;
    case 'alert': return <svg {...props}><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>;
    default: return null;
  }
}

const PARAM_FIELDS: Record<string, { label: string; placeholder: string }[]> = {
  Swap: [
    { label: 'token_in', placeholder: 'SOL' },
    { label: 'token_out', placeholder: 'USDC' },
    { label: 'amount', placeholder: '1.0' },
  ],
  Stake: [
    { label: 'token', placeholder: 'SOL' },
    { label: 'amount', placeholder: '5.0' },
  ],
  Unstake: [
    { label: 'token', placeholder: 'mSOL' },
    { label: 'amount', placeholder: 'all' },
  ],
  LimitOrder: [
    { label: 'token_in', placeholder: 'USDC' },
    { label: 'token_out', placeholder: 'SOL' },
    { label: 'price_trigger', placeholder: '120' },
  ],
  Dca: [
    { label: 'token_in', placeholder: 'USDC' },
    { label: 'token_out', placeholder: 'SOL' },
    { label: 'amount', placeholder: '10' },
    { label: 'frequency', placeholder: 'daily' },
  ],
  Alert: [
    { label: 'token', placeholder: 'SOL' },
    { label: 'price', placeholder: '100' },
    { label: 'direction', placeholder: 'below' },
  ],
};

let nodeCounter = 0;

function BuilderPage() {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [agentName, setAgentName] = useState('my-agent');
  const [deployState, setDeployState] = useState<ExecState>('idle');
  const [deploySig, setDeploySig] = useState('');
  const [deployError, setDeployError] = useState('');

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => applyNodeChanges(changes, nds));
      for (const c of changes) {
        if (c.type === 'remove' && c.id === selectedNode) setSelectedNode(null);
      }
    },
    [selectedNode],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((eds) => applyEdgeChanges(changes, eds));
    },
    [],
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      setEdges((eds) => addEdge({
        ...conn,
        animated: true,
        style: { stroke: '#a78bfa', strokeWidth: 2, filter: 'drop-shadow(0 0 4px rgba(167, 139, 250, 0.4))' },
      }, eds));
    },
    [],
  );

  const addBlock = useCallback((palette: typeof BLOCK_PALETTE[number]) => {
    const id = `block-${++nodeCounter}`;
    const defaults: Record<string, string> = {};
    (PARAM_FIELDS[palette.type] || []).forEach(f => { defaults[f.label] = ''; });

    const newNode: Node = {
      id,
      position: { x: 100 + (nodeCounter % 3) * 280, y: 80 + Math.floor(nodeCounter / 3) * 160 },
      data: { blockType: palette.type, protocol: palette.protocol, color: palette.color, params: defaults } as BuilderBlockData,
      type: 'builder',
      draggable: true,
    };
    setNodes((nds) => [...nds, newNode]);
    setSelectedNode(id);
  }, []);

  const removeBlock = useCallback((id: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
    if (selectedNode === id) setSelectedNode(null);
  }, [selectedNode]);

  const updateParam = useCallback((nodeId: string, key: string, value: string) => {
    setNodes((nds) => nds.map((n) => {
      if (n.id !== nodeId) return n;
      const d = n.data as BuilderBlockData;
      return { ...n, data: { ...d, params: { ...d.params, [key]: value } } };
    }));
  }, []);

  // compute execution order from edges (topological sort)
  const getOrderedBlocks = useCallback((): { action_type: string; protocol: string; params: Record<string, string>; order: number }[] => {
    const nodeMap = new Map(nodes.map(n => [n.id, n.data as BuilderBlockData]));
    const inDeg = new Map<string, number>();
    const adj = new Map<string, string[]>();
    nodes.forEach(n => { inDeg.set(n.id, 0); adj.set(n.id, []); });
    edges.forEach(e => {
      inDeg.set(e.target, (inDeg.get(e.target) || 0) + 1);
      adj.get(e.source)?.push(e.target);
    });
    const queue = nodes.filter(n => (inDeg.get(n.id) || 0) === 0).map(n => n.id);
    const sorted: string[] = [];
    while (queue.length) {
      const cur = queue.shift()!;
      sorted.push(cur);
      for (const next of adj.get(cur) || []) {
        const d = (inDeg.get(next) || 1) - 1;
        inDeg.set(next, d);
        if (d === 0) queue.push(next);
      }
    }
    // include any disconnected nodes at the end
    nodes.forEach(n => { if (!sorted.includes(n.id)) sorted.push(n.id); });

    return sorted.map((id, i) => {
      const d = nodeMap.get(id)!;
      const cleanParams: Record<string, string> = {};
      Object.entries(d.params).forEach(([k, v]) => { if (v) cleanParams[k] = v; });
      return { action_type: d.blockType, protocol: d.protocol, params: cleanParams, order: i };
    });
  }, [nodes, edges]);

  const handleDeploy = useCallback(async () => {
    if (!publicKey || nodes.length === 0) return;
    const blocks = getOrderedBlocks();
    setDeployState('building');
    setDeployError('');

    try {
      const resp = await fetch('/api/build-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: publicKey.toBase58(), agent_name: agentName, blocks }),
      });
      if (!resp.ok) throw new Error(await resp.text() || `Build failed (${resp.status})`);
      const data = await resp.json();

      const ix = new TransactionInstruction({
        programId: new PublicKey(data.programId),
        keys: data.accounts.map((a: { pubkey: string; isSigner: boolean; isWritable: boolean }) => ({ pubkey: new PublicKey(a.pubkey), isSigner: a.isSigner, isWritable: a.isWritable })),
        data: Buffer.from(data.instructionData, 'base64'),
      });
      const tx = new Transaction().add(ix);
      tx.feePayer = publicKey;
      tx.recentBlockhash = (await connection.getLatestBlockhash('confirmed')).blockhash;

      setDeployState('signing');
      const sig = await sendTransaction(tx, connection, { skipPreflight: true, preflightCommitment: 'confirmed' });

      setDeployState('confirming');
      await connection.confirmTransaction(sig, 'confirmed');

      setDeploySig(sig);
      setDeployState('done');
    } catch (err: unknown) {
      setDeployError(err instanceof Error ? err.message : 'Deploy failed');
      setDeployState('error');
    }
  }, [publicKey, sendTransaction, connection, nodes, edges, agentName, getOrderedBlocks]);

  const selectedData = nodes.find(n => n.id === selectedNode)?.data as BuilderBlockData | undefined;

  // custom node component for ReactFlow
  const BuilderNode = useMemo(() => {
    const NodeComponent = ({ id, data }: { id: string; data: BuilderBlockData }) => {
      const paletteItem = BLOCK_PALETTE.find(p => p.type === data.blockType);
      const paramStr = Object.entries(data.params).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(', ');
      return (
        <div style={{ position: 'relative', ...blockNodeStyle(data.color), minWidth: 190, cursor: 'grab' }}>
          <Handle type="target" position={Position.Top} style={{ width: 10, height: 10, background: data.color, border: '2px solid #1a1033', top: -5 }} />
          <button
            onClick={(e) => { e.stopPropagation(); removeBlock(id); }}
            style={{ position: 'absolute', top: -8, right: -8, background: 'rgba(239,68,68,0.8)', border: 'none', borderRadius: '50%', width: 20, height: 20, color: '#fff', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, zIndex: 10 }}
          >&times;</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <BlockIcon icon={paletteItem?.icon || 'swap'} color={data.color} />
            <span style={{ fontSize: 10, color: data.color, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' as const }}>{data.blockType}</span>
          </div>
          <div style={{ fontSize: 12, fontWeight: 600 }}>{paramStr || 'click to configure'}</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 6 }}>via {data.protocol}</div>
          <Handle type="source" position={Position.Bottom} style={{ width: 10, height: 10, background: data.color, border: '2px solid #1a1033', bottom: -5 }} />
        </div>
      );
    };
    return NodeComponent;
  }, [removeBlock]);

  const nodeTypes = useMemo(() => ({ builder: BuilderNode }), [BuilderNode]);

  return (
    <div className="flex gap-5 h-[calc(100vh-120px)]">
      {/* ── Sidebar ── */}
      <div className="w-60 shrink-0 flex flex-col gap-4">
        {/* palette */}
        <div className="glass-panel rounded-2xl p-4 space-y-2">
          <h3 className="text-[11px] font-mono text-white/40 uppercase tracking-wider mb-3">Action Blocks</h3>
          {BLOCK_PALETTE.map((b) => (
            <button
              key={b.type}
              onClick={() => addBlock(b)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all hover:bg-white/5 group"
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-transform group-hover:scale-110"
                style={{ background: `${b.color}15`, border: `1px solid ${b.color}30` }}>
                <BlockIcon icon={b.icon} color={b.color} />
              </div>
              <div>
                <div className="text-xs font-mono font-semibold text-white/80">{b.type}</div>
                <div className="text-[10px] text-white/30">{b.desc}</div>
              </div>
            </button>
          ))}
        </div>

        {/* config panel */}
        {selectedData && (
          <div className="glass-panel rounded-2xl p-4 space-y-3 page-enter">
            <div className="flex items-center gap-2 mb-1">
              <BlockIcon icon={BLOCK_PALETTE.find(p => p.type === selectedData.blockType)?.icon || 'swap'} color={selectedData.color} />
              <h3 className="text-xs font-mono font-bold text-white/80">{selectedData.blockType}</h3>
            </div>
            {(PARAM_FIELDS[selectedData.blockType] || []).map((f) => (
              <div key={f.label}>
                <label className="text-[10px] font-mono text-white/30 uppercase tracking-wider block mb-1">{f.label}</label>
                <input
                  value={selectedData.params[f.label] || ''}
                  onChange={(e) => updateParam(selectedNode!, f.label, e.target.value)}
                  placeholder={f.placeholder}
                  className="w-full bg-white/5 border border-white/8 rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-white/20 outline-none focus:border-purple-500/40 transition-colors"
                />
              </div>
            ))}
          </div>
        )}

        {/* deploy section */}
        <div className="glass-panel rounded-2xl p-4 space-y-3 mt-auto">
          <label className="text-[10px] font-mono text-white/30 uppercase tracking-wider block">Agent Name</label>
          <input
            value={agentName}
            onChange={(e) => setAgentName(e.target.value)}
            placeholder="my-agent"
            className="w-full bg-white/5 border border-white/8 rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-white/20 outline-none focus:border-purple-500/40 transition-colors"
          />
          {deployState === 'done' && deploySig ? (
            <a
              href={`https://explorer.solana.com/tx/${deploySig}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="exec-btn exec-btn-success w-full text-center text-xs font-semibold px-4 py-2.5 rounded-xl inline-flex items-center justify-center gap-2"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              View on Explorer &#8599;
            </a>
          ) : (
            <button
              onClick={handleDeploy}
              disabled={!publicKey || nodes.length === 0 || deployState === 'building' || deployState === 'signing' || deployState === 'confirming'}
              className="exec-btn w-full text-xs font-semibold px-4 py-2.5 rounded-xl inline-flex items-center justify-center gap-2 disabled:opacity-30"
            >
              {(deployState === 'building' || deployState === 'signing' || deployState === 'confirming') && (
                <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/></svg>
              )}
              {deployState === 'idle' || deployState === 'error' ? 'Deploy Agent' : deployState === 'building' ? 'Building...' : deployState === 'signing' ? 'Sign in wallet...' : 'Confirming...'}
            </button>
          )}
          {deployState === 'error' && deployError && (
            <p className="text-[10px] text-red-300/70 font-mono break-all">{deployError}</p>
          )}
          {!publicKey && (
            <p className="text-[10px] text-yellow-300/50 font-mono">Connect wallet to deploy</p>
          )}
          {nodes.length === 0 && (
            <p className="text-[10px] text-white/25 font-mono">Add blocks from the palette above</p>
          )}
        </div>
      </div>

      {/* ── Canvas ── */}
      <div className="flex-1 flex flex-col gap-4">
        <div className="glass-panel rounded-2xl p-4 flex items-center justify-between">
          <h2 className="text-white text-lg font-semibold font-mono flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/10 border border-purple-500/20 flex items-center justify-center">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
              </svg>
            </div>
            Agent Builder
          </h2>
          <span className="text-[10px] font-mono text-white/25">
            {nodes.length} block{nodes.length !== 1 ? 's' : ''} &middot; {edges.length} connection{edges.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="glass-panel rounded-2xl overflow-hidden border-glow-purple flex-1" style={{ minHeight: 400 }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedNode(node.id)}
            onPaneClick={() => setSelectedNode(null)}
            fitView={nodes.length > 0}
            proOptions={{ hideAttribution: true }}
            deleteKeyCode="Backspace"
          >
            <Background color="rgba(139, 92, 246, 0.06)" gap={24} size={1} />
            <Controls />
          </ReactFlow>
        </div>

        <p className="text-white/20 text-[11px] text-center font-mono tracking-wide">
          Click a block from the palette to add &middot; Drag handles to connect &middot; Click node to configure &middot; Backspace to delete
        </p>
      </div>
    </div>
  );
}

/* ─── GuidePage ─── */

function GuideSection({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-xl font-bold font-mono text-white mb-4 flex items-center gap-3">
        <span className="w-1 h-6 rounded-full bg-gradient-to-b from-purple-500 to-pink-500" />
        {title}
      </h2>
      <div className="text-sm leading-relaxed text-white/65 space-y-4">
        {children}
      </div>
    </section>
  );
}

function GuideFaq({ q, children }: { q: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="glass-panel rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/[0.02] transition-colors"
      >
        <span className="text-sm font-medium text-white/80">{q}</span>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={`text-white/30 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="px-5 pb-4 text-sm text-white/55 leading-relaxed space-y-2 border-t border-white/5 pt-3">
          {children}
        </div>
      )}
    </div>
  );
}

function GuidePage() {
  const tocItems = [
    { id: 'overview', label: 'What is SolIntent?' },
    { id: 'getting-started', label: 'Getting Started' },
    { id: 'chat-mode', label: 'Chat Mode' },
    { id: 'builder-mode', label: 'Agent Builder' },
    { id: 'actions', label: 'Supported Actions' },
    { id: 'protocols', label: 'Protocols' },
    { id: 'agents', label: 'Managing Agents' },
    { id: 'on-chain', label: 'How It Works On-Chain' },
    { id: 'faq', label: 'FAQ' },
  ];

  return (
    <div className="flex gap-8 max-w-5xl mx-auto">
      {/* table of contents — sticky sidebar */}
      <nav className="w-48 shrink-0 hidden lg:block sticky top-24 self-start">
        <div className="glass-panel rounded-2xl p-4">
          <h3 className="text-[10px] font-mono text-white/30 uppercase tracking-wider mb-3">Contents</h3>
          <ul className="space-y-1">
            {tocItems.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className="block text-xs text-white/40 hover:text-white/80 transition-colors py-1 px-2 rounded-lg hover:bg-white/5 font-mono"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      {/* main content */}
      <div className="flex-1 min-w-0 space-y-12 pb-20">
        {/* hero */}
        <div className="glass-panel rounded-2xl p-8">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/25 to-pink-500/15 border border-purple-500/20 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
                <path d="M8 1L14 5V11L8 15L2 11V5L8 1Z" stroke="url(#lgG)" strokeWidth="1.5" fill="none" />
                <circle cx="8" cy="8" r="2.5" fill="url(#lgG)" />
                <defs>
                  <linearGradient id="lgG" x1="2" y1="1" x2="14" y2="15">
                    <stop stopColor="#a78bfa" />
                    <stop offset="1" stopColor="#ec4899" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold font-mono text-white">SolIntent Guide</h1>
              <p className="text-sm text-white/40 mt-1">Everything you need to know about using SolIntent</p>
            </div>
          </div>
        </div>

        {/* ── Sections ── */}

        <GuideSection id="overview" title="What is SolIntent?">
          <p>
            SolIntent is an AI-powered DeFi co-pilot built on Solana. Instead of navigating complex
            DEX interfaces, swapping across multiple tabs, and manually building transactions — you simply
            describe what you want to do in plain English, and SolIntent handles the rest.
          </p>
          <p>
            The platform operates in two modes: <strong className="text-white/80">Chat Mode</strong> for
            quick single-step or multi-step actions via natural language, and{' '}
            <strong className="text-white/80">Agent Builder</strong> for constructing reusable multi-step
            DeFi strategies with a visual drag-and-drop interface.
          </p>
          <p>
            Every action is executed on-chain through a Solana smart contract. Your transactions are
            transparent, verifiable, and non-custodial — SolIntent never holds your funds.
          </p>
        </GuideSection>

        <GuideSection id="getting-started" title="Getting Started">
          <p>To start using SolIntent, you need:</p>
          <ol className="list-decimal list-inside space-y-2 pl-2">
            <li><strong className="text-white/80">A Solana wallet</strong> — Phantom or Solflare are supported. Install one as a browser extension if you haven&apos;t already.</li>
            <li><strong className="text-white/80">Some SOL on devnet</strong> — This is a devnet application. Get free devnet SOL from{' '}
              <span className="font-mono text-purple-400">solfaucet.com</span> or run{' '}
              <code className="text-xs bg-white/5 border border-white/10 rounded px-2 py-0.5 font-mono text-purple-300">solana airdrop 2</code> in your terminal.
            </li>
            <li><strong className="text-white/80">Connect your wallet</strong> — When you first visit the landing page, our AI agent will guide you through connecting. You can also click the wallet button in the top-right corner at any time.</li>
          </ol>
          <div className="glass-panel rounded-xl p-4 mt-2">
            <p className="text-xs text-white/40 font-mono">
              Tip: The landing page features a conversational onboarding flow. Just type anything — &ldquo;hi&rdquo;,
              &ldquo;let&apos;s go&rdquo;, or &ldquo;start&rdquo; — and the agent will walk you through setup step by step.
            </p>
          </div>
        </GuideSection>

        <GuideSection id="chat-mode" title="Chat Mode">
          <p>
            Chat Mode is the fastest way to interact with SolIntent. Navigate to the{' '}
            <strong className="text-white/80">Chat</strong> tab and type your intent in plain English.
            The AI parser will analyze your message, break it into structured action blocks, and present
            a preview before execution.
          </p>

          <h3 className="text-white/80 font-semibold text-sm mt-4 mb-2">Example prompts:</h3>
          <div className="grid gap-2">
            {[
              { text: 'swap 1 SOL to USDC', desc: 'Simple token exchange via Jupiter' },
              { text: 'stake 5 SOL on Marinade', desc: 'Liquid staking for mSOL yield' },
              { text: 'DCA 10 USDC into SOL every day for a week', desc: 'Automated dollar-cost averaging' },
              { text: 'set a limit order to buy SOL at $120', desc: 'Conditional order via Drift' },
              { text: 'alert me when SOL drops below $100', desc: 'Price monitoring trigger' },
              { text: 'swap 2 SOL to USDC then stake it on Kamino', desc: 'Multi-step chained actions' },
            ].map((ex) => (
              <div key={ex.text} className="flex items-start gap-3 bg-white/[0.02] rounded-lg p-3">
                <code className="text-xs font-mono text-purple-300 bg-purple-500/10 px-2 py-1 rounded shrink-0">{ex.text}</code>
                <span className="text-xs text-white/40">{ex.desc}</span>
              </div>
            ))}
          </div>

          <h3 className="text-white/80 font-semibold text-sm mt-4 mb-2">How execution works:</h3>
          <ol className="list-decimal list-inside space-y-2 pl-2">
            <li>You type your intent and press Send.</li>
            <li>The AI returns a preview with parsed action blocks and a confidence score.</li>
            <li>Review the blocks — each shows the action type, protocol, and parameters.</li>
            <li>Click <strong className="text-white/80">Sign &amp; Execute</strong> to proceed.</li>
            <li>Your wallet will prompt you to approve the transaction.</li>
            <li>Once confirmed on-chain, you&apos;ll see a link to view it on Solana Explorer.</li>
          </ol>

          <h3 className="text-white/80 font-semibold text-sm mt-4 mb-2">You can also ask questions:</h3>
          <p>
            SolIntent isn&apos;t limited to executing actions. You can ask things like &ldquo;what can you do?&rdquo;,
            &ldquo;how does staking work?&rdquo;, or &ldquo;what&apos;s the difference between Jupiter and Marinade?&rdquo;
            — the AI will respond conversationally without generating any action blocks.
          </p>
        </GuideSection>

        <GuideSection id="builder-mode" title="Agent Builder">
          <p>
            The Agent Builder is a visual, no-code interface for creating multi-step DeFi strategies.
            Think of it like connecting building blocks: each block represents a single action
            (swap, stake, alert, etc.), and connections between blocks define the execution order.
          </p>

          <h3 className="text-white/80 font-semibold text-sm mt-4 mb-2">How to use the Builder:</h3>
          <ol className="list-decimal list-inside space-y-3 pl-2">
            <li>
              <strong className="text-white/80">Add blocks</strong> — Click any action from the left sidebar
              palette. Each click adds a new block to the canvas.
            </li>
            <li>
              <strong className="text-white/80">Configure blocks</strong> — Click a block on the canvas
              to select it. A configuration panel will appear in the sidebar where you can fill in parameters
              (token names, amounts, prices, etc.).
            </li>
            <li>
              <strong className="text-white/80">Connect blocks</strong> — Drag from the bottom handle of one
              block to the top handle of another to create a connection. This defines the execution order:
              the first block runs first, then the second, and so on.
            </li>
            <li>
              <strong className="text-white/80">Remove blocks</strong> — Click the &times; button on a block,
              or select it and press Backspace.
            </li>
            <li>
              <strong className="text-white/80">Name your agent</strong> — Enter a name in the bottom-left
              panel. This is how your agent will appear in the My Agents list.
            </li>
            <li>
              <strong className="text-white/80">Deploy</strong> — Click &ldquo;Deploy Agent&rdquo; to create
              the agent on-chain. Your wallet will prompt for transaction approval. After confirmation,
              you&apos;ll get an Explorer link and the agent will appear on the My Agents page.
            </li>
          </ol>

          <h3 className="text-white/80 font-semibold text-sm mt-4 mb-2">Example strategy: Swap &amp; Stake</h3>
          <div className="glass-panel rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono bg-purple-500/15 text-purple-300 px-2 py-1 rounded">Swap</span>
              <span className="text-xs text-white/30">1 SOL → USDC via Jupiter</span>
            </div>
            <div className="flex items-center gap-2 pl-5">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(167,139,250,0.5)" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono bg-blue-500/15 text-blue-300 px-2 py-1 rounded">Stake</span>
              <span className="text-xs text-white/30">USDC on Kamino, auto-compound</span>
            </div>
            <div className="flex items-center gap-2 pl-5">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(167,139,250,0.5)" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono bg-orange-500/15 text-orange-300 px-2 py-1 rounded">Alert</span>
              <span className="text-xs text-white/30">Notify if APY &lt; 5%</span>
            </div>
          </div>
        </GuideSection>

        <GuideSection id="actions" title="Supported Actions">
          <div className="space-y-3">
            {[
              { name: 'Swap', color: '#8b5cf6', desc: 'Exchange one token for another. Specify the input token, output token, and amount. Routed through Jupiter for optimal pricing across all Solana DEXs.', params: 'token_in, token_out, amount' },
              { name: 'Stake', color: '#3b82f6', desc: 'Stake SOL or other tokens to earn yield. Supports liquid staking through Marinade (receive mSOL) or lending through Kamino (auto-compounding).', params: 'token, amount' },
              { name: 'Unstake', color: '#06b6d4', desc: 'Reverse a staking position. Convert mSOL back to SOL, or withdraw from a lending pool.', params: 'token, amount' },
              { name: 'Limit Order', color: '#10b981', desc: 'Set a conditional buy or sell that triggers when a token reaches a specific price. Executed through Drift protocol.', params: 'token_in, token_out, price_trigger' },
              { name: 'DCA', color: '#f59e0b', desc: 'Dollar-cost average into a token over time. Specify the amount, frequency (daily/weekly), and duration. Helps reduce the impact of volatility.', params: 'token_in, token_out, amount, frequency' },
              { name: 'Alert', color: '#fb923c', desc: 'Set a price monitoring trigger. When the condition is met, the system can execute a follow-up action or send a notification.', params: 'token, price, direction (above/below)' },
            ].map((a) => (
              <div key={a.name} className="glass-panel rounded-xl p-4">
                <div className="flex items-center gap-3 mb-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: a.color }} />
                  <strong className="text-white/85 text-sm font-mono">{a.name}</strong>
                </div>
                <p className="text-xs text-white/50 mb-2">{a.desc}</p>
                <p className="text-[10px] font-mono text-white/30">Parameters: {a.params}</p>
              </div>
            ))}
          </div>
        </GuideSection>

        <GuideSection id="protocols" title="Protocols">
          <p>SolIntent integrates with four major Solana DeFi protocols:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
            {[
              { name: 'Jupiter', desc: 'The leading Solana DEX aggregator. Routes swaps across all major liquidity pools (Orca, Raydium, etc.) for the best price. Also powers DCA and limit orders.', actions: 'Swap, DCA, Limit Order' },
              { name: 'Marinade', desc: 'Liquid staking protocol. Stake SOL and receive mSOL — a yield-bearing token you can use elsewhere in DeFi while still earning staking rewards.', actions: 'Stake, Unstake' },
              { name: 'Drift', desc: 'Decentralized perpetuals and order book exchange. Used for limit orders and conditional triggers based on price movements.', actions: 'Limit Order, Alert' },
              { name: 'Kamino', desc: 'Automated liquidity management and lending. Deposit tokens to earn auto-compounding yield without manual intervention.', actions: 'Stake' },
            ].map((p) => (
              <div key={p.name} className="glass-panel rounded-xl p-4">
                <strong className="text-white/85 text-sm font-mono block mb-1.5">{p.name}</strong>
                <p className="text-xs text-white/50 mb-2">{p.desc}</p>
                <p className="text-[10px] font-mono text-purple-400/60">Used for: {p.actions}</p>
              </div>
            ))}
          </div>
        </GuideSection>

        <GuideSection id="agents" title="Managing Agents">
          <p>
            Every action you execute — whether from Chat or the Builder — creates an{' '}
            <strong className="text-white/80">Agent</strong> on-chain. Agents are Solana accounts owned by your
            wallet that store the action blocks, execution history, and status.
          </p>
          <p>Navigate to the <strong className="text-white/80">My Agents</strong> tab to see all agents associated with your connected wallet. Each agent card shows:</p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li><strong className="text-white/80">Name</strong> — The name you gave the agent (or &ldquo;chat-agent&rdquo; by default for Chat actions).</li>
            <li><strong className="text-white/80">Agent ID</strong> — A unique on-chain identifier.</li>
            <li><strong className="text-white/80">Type</strong> — Chat (single intent) or Builder (multi-step flow).</li>
            <li><strong className="text-white/80">Status</strong> — Active (green dot with pulse) or Paused (red dot).</li>
            <li><strong className="text-white/80">Executions</strong> — How many times this agent has been triggered.</li>
          </ul>
        </GuideSection>

        <GuideSection id="on-chain" title="How It Works On-Chain">
          <p>SolIntent is powered by a Solana smart contract (Anchor program) deployed on devnet. Here&apos;s how the pieces fit together:</p>
          <ol className="list-decimal list-inside space-y-3 pl-2">
            <li>
              <strong className="text-white/80">You describe an intent</strong> — either in Chat or Builder mode.
            </li>
            <li>
              <strong className="text-white/80">The AI parses it</strong> — Your text is sent to a FastAPI backend that uses
              Claude AI to extract structured action blocks (action type, protocol, parameters).
            </li>
            <li>
              <strong className="text-white/80">A transaction is built</strong> — The backend constructs a Solana transaction
              instruction that calls the SolIntent program&apos;s{' '}
              <code className="text-xs bg-white/5 border border-white/10 rounded px-1.5 py-0.5 font-mono text-purple-300">create_agent</code>{' '}
              instruction with your action blocks encoded as Borsh data.
            </li>
            <li>
              <strong className="text-white/80">You sign &amp; send</strong> — The transaction is sent to your wallet for
              approval. Your wallet signs it, and it&apos;s submitted to the Solana network.
            </li>
            <li>
              <strong className="text-white/80">On-chain state is created</strong> — The program creates a{' '}
              <code className="text-xs bg-white/5 border border-white/10 rounded px-1.5 py-0.5 font-mono text-purple-300">UserAgent</code>{' '}
              PDA (Program Derived Address) that stores your agent&apos;s configuration.
            </li>
            <li>
              <strong className="text-white/80">Execution happens</strong> — A crank service picks up pending agents and
              processes their action blocks sequentially.
            </li>
          </ol>

          <h3 className="text-white/80 font-semibold text-sm mt-4 mb-2">On-chain accounts:</h3>
          <div className="space-y-2">
            {[
              { name: 'IntentConfig', desc: 'Global singleton. Stores the program authority, fee settings, and total execution counter.' },
              { name: 'UserAgent', desc: 'One per agent. Stores the agent name, action blocks, trigger conditions, activation status, and execution count. PDA derived from your wallet + agent ID.' },
              { name: 'IntentExecution', desc: 'One per execution run. Tracks which blocks have completed, stores transaction signatures, and records errors. Closed after completion to return rent.' },
            ].map((a) => (
              <div key={a.name} className="flex items-start gap-3 bg-white/[0.02] rounded-lg p-3">
                <code className="text-xs font-mono text-purple-300 bg-purple-500/10 px-2 py-1 rounded shrink-0">{a.name}</code>
                <span className="text-xs text-white/45">{a.desc}</span>
              </div>
            ))}
          </div>

          <div className="glass-panel rounded-xl p-4 mt-3">
            <p className="text-xs text-white/40 font-mono">
              Program ID:{' '}
              <code className="text-purple-300">AHvsBUGTcXewYD3hyE2F2HunXGszJRJ3k1BCAFwoqCk1</code>
            </p>
            <p className="text-xs text-white/30 font-mono mt-1">Network: Solana Devnet</p>
          </div>
        </GuideSection>

        <GuideSection id="faq" title="FAQ">
          <div className="space-y-2">
            <GuideFaq q="Is SolIntent safe? Do you have access to my funds?">
              <p>SolIntent is fully non-custodial. We never have access to your private keys or funds. Every transaction requires your explicit wallet approval. The smart contract only executes actions you&apos;ve explicitly configured and signed.</p>
            </GuideFaq>

            <GuideFaq q="What happens if a transaction fails?">
              <p>If a transaction fails (network congestion, insufficient balance, etc.), the execution status will show &ldquo;Failed&rdquo; with an error message. Your funds remain safe — failed transactions on Solana are atomic, meaning no partial execution occurs. You can retry by clicking the button again.</p>
            </GuideFaq>

            <GuideFaq q="Why does the confidence score matter?">
              <p>The confidence score (0-100%) indicates how well the AI understood your intent. High confidence (90%+) means the parser is very sure about the action type, protocol, and parameters. Lower confidence might mean ambiguous phrasing — review the parsed blocks carefully before executing.</p>
            </GuideFaq>

            <GuideFaq q="Can I use SolIntent on mainnet?">
              <p>Currently SolIntent is deployed only on Solana devnet for testing and demonstration. Do not send real SOL or tokens. Mainnet deployment would require additional security audits, real protocol integrations (Jupiter CPI, Marinade CPI), and production-grade infrastructure.</p>
            </GuideFaq>

            <GuideFaq q="What's the difference between Chat and Builder?">
              <p>Chat is for quick, one-off actions — type what you want and execute immediately. Builder is for creating reusable multi-step strategies that you can deploy as persistent on-chain agents. Use Chat for simple tasks, Builder for complex flows you want to save and reuse.</p>
            </GuideFaq>

            <GuideFaq q="How does the AI understand my intent?">
              <p>SolIntent uses Claude AI (Anthropic&apos;s language model) to parse your natural language into structured DeFi action blocks. The AI has been prompted with knowledge of Solana DeFi protocols, supported action types, and parameter formats. If the AI can&apos;t reach the API, a keyword-based fallback parser handles common patterns.</p>
            </GuideFaq>

            <GuideFaq q="Can I delete an agent?">
              <p>Yes, agents can be closed on-chain via the{' '}
                <code className="text-xs bg-white/5 border border-white/10 rounded px-1.5 py-0.5 font-mono text-purple-300">delete_agent</code>{' '}
                instruction. This returns the rent-exempt SOL back to your wallet. This feature will be available from the My Agents page in a future update.</p>
            </GuideFaq>

            <GuideFaq q="What tokens are supported?">
              <p>SolIntent can parse intents for any SPL token by name (SOL, USDC, USDT, mSOL, jitoSOL, BONK, etc.). The AI recognizes common token symbols and maps them to the appropriate protocol. For obscure tokens, specify the mint address in your prompt.</p>
            </GuideFaq>

            <GuideFaq q="How much does it cost?">
              <p>The only cost is the standard Solana transaction fee (~0.000005 SOL per transaction) plus rent for on-chain account storage (~0.002 SOL per agent, refundable when deleted). There are no platform fees in the current devnet version.</p>
            </GuideFaq>

            <GuideFaq q="Can I build a multi-step strategy in Chat mode?">
              <p>Yes! Just describe the full flow in one message: &ldquo;swap 2 SOL to USDC then stake it on Kamino&rdquo;. The AI will parse it into multiple action blocks executed in sequence. For more complex flows with branching or conditional logic, use the Builder instead.</p>
            </GuideFaq>
          </div>
        </GuideSection>
      </div>
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

const DELETE_AGENT_DISC = new Uint8Array([92, 170, 90, 13, 148, 155, 212, 55]);

function AgentsPage() {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const [agents, setAgents] = useState<AgentAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});

  const fetchAgents = useCallback(() => {
    if (!publicKey) return;
    setLoading(true);

    const programId = new PublicKey(PROGRAM_ID);
    connection
      .getProgramAccounts(programId, {
        filters: [
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

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  const handleDelete = useCallback(async (ag: AgentAccount) => {
    if (!publicKey) return;
    setDeleting((prev) => ({ ...prev, [ag.pubkey]: true }));
    try {
      const programId = new PublicKey(PROGRAM_ID);
      const agentIdBn = BigInt(ag.agentId);
      const agentIdBuf = Buffer.alloc(8);
      agentIdBuf.writeBigUInt64LE(agentIdBn);

      const [agentPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('agent'), publicKey.toBuffer(), agentIdBuf],
        programId,
      );

      const ix = new TransactionInstruction({
        programId,
        keys: [
          { pubkey: agentPda, isSigner: false, isWritable: true },
          { pubkey: publicKey, isSigner: true, isWritable: true },
        ],
        data: Buffer.from(DELETE_AGENT_DISC),
      });

      const tx = new Transaction().add(ix);
      tx.feePayer = publicKey;
      tx.recentBlockhash = (await connection.getLatestBlockhash('confirmed')).blockhash;

      const sig = await sendTransaction(tx, connection, { skipPreflight: true });
      await connection.confirmTransaction(sig, 'confirmed');

      // remove from local state immediately
      setAgents((prev) => prev.filter((a) => a.pubkey !== ag.pubkey));
    } catch {
      // silently fail — agent remains in list for retry
    } finally {
      setDeleting((prev) => ({ ...prev, [ag.pubkey]: false }));
    }
  }, [publicKey, sendTransaction, connection]);

  if (!publicKey) {
    return (
      <div className="glass-panel rounded-2xl p-12 text-center max-w-md mx-auto">
        <div className="empty-state-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(139, 92, 246, 0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
        </div>
        <p className="text-white/50 text-sm font-medium mb-2">Wallet not connected</p>
        <p className="text-white/25 text-xs">Connect your Solana wallet to view and manage your agents.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-white text-xl font-semibold font-mono flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/10 border border-purple-500/20 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
            </svg>
          </div>
          My Agents
        </h2>
        <span className="text-[11px] text-white/30 font-mono bg-white/5 px-3 py-1.5 rounded-full">
          {agents.length} agent{agents.length !== 1 ? 's' : ''}
        </span>
      </div>

      {loading ? (
        <div className="glass-panel rounded-2xl p-10 text-center">
          <div className="flex justify-center gap-2">
            <span className="typing-dot w-2.5 h-2.5 bg-purple-400/60 rounded-full" />
            <span className="typing-dot w-2.5 h-2.5 bg-purple-400/40 rounded-full" />
            <span className="typing-dot w-2.5 h-2.5 bg-purple-400/20 rounded-full" />
          </div>
          <p className="text-white/20 text-xs mt-4 font-mono">Loading agents...</p>
        </div>
      ) : agents.length === 0 ? (
        <div className="glass-panel rounded-2xl p-12 text-center max-w-lg mx-auto">
          <div className="empty-state-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(139, 92, 246, 0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
            </svg>
          </div>
          <p className="text-white/60 text-sm font-medium mb-2">No agents yet</p>
          <p className="text-white/30 text-xs leading-relaxed">
            Head to the{' '}
            <Link to="/app" className="text-purple-400 hover:text-purple-300 transition-colors underline underline-offset-2">
              Chat
            </Link>{' '}
            page and describe a DeFi action to create your first agent.
          </p>
          <Link
            to="/app"
            className="inline-flex items-center gap-2 mt-6 text-xs font-mono text-purple-300/80 hover:text-white bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/15 px-4 py-2 rounded-xl transition-all"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Create your first agent
          </Link>
        </div>
      ) : (
        <div className="grid gap-3">
          {agents.map((ag) => (
            <div
              key={ag.pubkey}
              className="agent-card flex items-center justify-between"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/15 to-pink-500/10 border border-purple-500/15 flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 1v4M12 19v4" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-white font-medium text-sm">{ag.name}</h3>
                  <p className="text-white/30 text-[11px] font-mono mt-1 flex items-center gap-2">
                    <span>ID: {ag.agentId}</span>
                    <span className="text-white/15">&middot;</span>
                    <span>{ag.agentType}</span>
                    <span className="text-white/15">&middot;</span>
                    <span>{ag.totalExecutions} executions</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span
                    className={`status-dot ${ag.isActive ? 'status-dot-active' : 'status-dot-paused'}`}
                  />
                  <span className="text-[11px] text-white/40 font-mono">
                    {ag.isActive ? 'active' : 'paused'}
                  </span>
                </div>
                <button
                  onClick={() => handleDelete(ag)}
                  disabled={deleting[ag.pubkey]}
                  className="text-[11px] font-mono text-red-400/60 hover:text-red-400 bg-red-500/5 hover:bg-red-500/15 border border-red-500/10 hover:border-red-500/25 px-3 py-1.5 rounded-lg transition-all disabled:opacity-40"
                >
                  {deleting[ag.pubkey] ? 'Closing...' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
