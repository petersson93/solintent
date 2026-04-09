import { Routes, Route, Link } from 'react-router-dom';

export default function App() {
  return (
    <div className="min-h-screen">
      <header className="bg-white/10 backdrop-blur-md border-b border-white/20 px-6 py-3">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <h1 className="text-white font-bold text-lg font-mono">SolIntent</h1>
          <nav className="flex gap-4">
            <Link to="/" className="text-white/80 text-sm hover:text-white">Chat</Link>
            <Link to="/builder" className="text-white/80 text-sm hover:text-white">Builder</Link>
            <Link to="/agents" className="text-white/80 text-sm hover:text-white">My Agents</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <Routes>
          <Route path="/" element={<ChatPage />} />
          <Route path="/builder" element={<BuilderPage />} />
          <Route path="/agents" element={<AgentsPage />} />
        </Routes>
      </main>
    </div>
  );
}

function ChatPage() {
  return (
    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20">
      <h2 className="text-white text-xl font-semibold mb-4">What do you want to do?</h2>
      <div className="flex gap-2">
        <input
          type="text"
          placeholder='Try "swap 1 SOL to USDC" or "stake 5 SOL on Marinade"'
          className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/40 outline-none focus:border-white/40"
        />
        <button className="bg-white text-purple-700 font-semibold px-6 py-3 rounded-xl hover:bg-white/90">
          Send
        </button>
      </div>
    </div>
  );
}

function BuilderPage() {
  return (
    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20 h-[600px] flex items-center justify-center">
      <p className="text-white/60">React Flow canvas — coming soon</p>
    </div>
  );
}

function AgentsPage() {
  return (
    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20">
      <h2 className="text-white text-xl font-semibold mb-4">My Agents</h2>
      <p className="text-white/60">No agents created yet</p>
    </div>
  );
}
