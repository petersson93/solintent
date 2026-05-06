# SolIntent

> NLP-powered DeFi actions + visual no-code builder for Solana.

**Live preview (devnet):** https://solintent.vercel.app

## Why SolIntent?

| Feature                     | SolIntent | CLI Tools | Other Bots |
|-----------------------------|-----------|-----------|------------|
| Natural language input      | Yes       | No        | Partial    |
| Visual flow builder         | Yes       | No        | No         |
| Multi-step composition      | Yes       | Manual    | No         |
| On-chain execution          | Yes       | Yes       | Limited    |
| Preview before sign         | Yes       | No        | Partial    |
| Reusable saved flows        | Yes       | No        | No         |

Most DeFi tools force you to choose between the chat-style "tell me what you want" UX and the precise CLI-style "wire every parameter yourself" UX. SolIntent lets the same flow start as a sentence and end as a saved, repeatable canvas.

## Core Action

Type `"swap 1 SOL to USDC"` → see preview → sign → done.

## Stack

- Anchor (Rust) + Vite/React + ReactFlow
- Python/FastAPI + Claude API
- Jupiter SDK for swaps

## Setup

```bash
anchor build && anchor deploy
cd api && pip install -r requirements.txt && uvicorn main:app
cd app && npm install && npm run dev
```

## License

MIT
