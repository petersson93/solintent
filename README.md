# SolIntent

> NLP-powered DeFi actions + visual no-code builder for Solana.

## Why SolIntent?

| Feature | SolIntent | CLI Tools | Other Bots |
|---------|-----------|-----------|------------|
| Natural language | Yes | No | Partial |
| Visual builder | Yes | No | No |
| Multi-step flows | Yes | Manual | No |
| On-chain execution | Yes | Yes | Limited |

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
