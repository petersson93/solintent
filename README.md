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

## Chat Mode

Type what you want in plain English; the NLP layer (Claude Haiku) parses it into a typed action plan, drops it onto the canvas as one or more wired blocks, and shows you a preview before any signature.

```
> swap 0.5 SOL to USDC, then stake the rest with marinade

[swap] 0.5 SOL → USDC via Jupiter (slippage 0.5%)
   ↓
[stake] remainder → marinade (mSOL receipt)
```

A confidence score is attached to every parsed plan. Below `0.85` the app refuses to auto-execute and asks you to confirm or rewrite. Above `0.85` it streams the preview straight into the builder.

Supported intents include swap, stake/unstake, transfer, LP add/remove, and "wallet snapshot" — more shipping behind a feature flag.

## Builder Mode

Drag blocks from the action palette onto the canvas. Wire outputs into inputs. The builder enforces type compatibility — you can't pipe an `Amount<SOL>` into a slot that expects `Amount<USDC>` without inserting a swap block in between.

Keyboard:

- `Cmd+K` — open the action palette
- `Backspace` — delete selected node
- `Cmd+D` — duplicate node
- `Cmd+S` — save flow as a reusable template
- `Cmd+Enter` — preview flow against your wallet
- `Cmd+Shift+Enter` — preview + sign + execute

Saved flows appear in the left panel and can be re-run with one click. Useful for routine moves like "every Friday rebalance into 60/40".

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

## Example Intents

A few prompts that already parse cleanly to a single signable plan:

```
swap 1 SOL to USDC
swap 0.5 SOL to BONK with 1% slippage
stake 2 SOL with marinade
unstake all jitoSOL back to SOL
transfer 100 USDC to <pubkey>
add liquidity 1 SOL + 80 USDC to raydium SOL/USDC
take a snapshot of my wallet
```

Multi-step prompts also work:

```
swap 1 SOL to USDC, then send 50 USDC to <pubkey>
unstake mSOL, swap half to JUP, transfer the rest back to my wallet
```

(screenshots placeholder — drop captures into `docs/intents/` once the demo ledger is fresh)

## License

| Layer                    | License | File                   |
|--------------------------|---------|------------------------|
| Anchor program (`programs/`) | MIT | [LICENSE](LICENSE) |
| FastAPI / NLP layer (`api/`) | MIT | [LICENSE](LICENSE) |
| Frontend + builder (`app/`)  | MIT | [LICENSE](LICENSE) |

Single MIT grant covers every module in this repo — parsed intents, generated plans, and any saved flow templates inherit the same terms.
