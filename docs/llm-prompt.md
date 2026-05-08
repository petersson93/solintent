# NLP prompt design

How the natural-language layer turns user phrases into canonical actions.
Pulls from `api/intents.json` for few-shot examples and from this doc for
guardrails.

## System prompt skeleton

```
You are SolIntent, a DeFi action parser. Convert the user's free-form
request into a structured JSON action object. Always emit valid JSON.

Supported actions:
  swap, stake, unstake, lend, borrow, alert, schedule_swap,
  claim_rewards, withdraw_lp, transfer, rebalance, perp_open, view

Required fields per action are documented at /docs/builder-blocks.md.

If the input is ambiguous, ask ONE clarifying question, then re-prompt.
Never invent assets or amounts the user didn't specify.
```

## Guardrails

- **Never silently default** an amount. If user says "swap to USDC",
  ask "how much?".
- **Reject mainnet-only assets** unless user explicitly confirms.
- **Honor explicit slippage** when user provides one ("max 1% slippage").
- **Never sign** a tx — only return the action JSON.

## Output schema

```ts
type Action = {
  action: string                  // canonical action id
  params: Record<string, any>     // per-action shape (see intents.json)
  confidence: number              // 0..1
  needs_clarification?: string    // human Q if confidence < 0.6
}
```

## Few-shot examples (kept in intents.json)

The 20 entries in `api/intents.json` are the canonical few-shot examples.
Re-run `python api/scripts/eval_intents.py` after any change to verify
accuracy.

## Failure modes

- **Ambiguous asset** — "buy SOL" vs "trade for SOL" — fall back to
  `view: balance` if the user is asking, `swap` if they're acting.
- **Multi-action requests** — "stake 5 SOL and alert me at 200" — split
  into a workflow (multiple actions in builder canvas) instead of one.
- **Unsafe combinations** — "max leverage on a meme coin" — surface
  warning copy, require explicit confirmation in next turn.
