# Builder block catalog

The visual builder is a small DAG of pre-defined blocks. This file is the
canonical list of what exists and how each block consumes/produces values.

> Keep this in sync with `app/src/components/blocks/*.tsx`. The runtime
> validation also reads `nodeId` strings from here.

## Source blocks (no inputs)

### `wallet`
Emits the connected wallet pubkey + main asset balances.
- **out**: `{ pubkey, sol, usdc, jup, bonk }`

### `priceFeed`
Subscribes to a Pyth feed.
- **params**: `{ asset: 'SOL' | 'JUP' | 'BTC' | 'ETH' }`
- **out**: `{ asset, price, ts }`

### `schedule`
Time-based trigger.
- **params**: `{ cadence: 'daily' | 'weekly:mon' | 'cron:0 9 * * *' }`
- **out**: `{ tick }`

## Action blocks (terminate the graph)

### `swap`
Routes a swap via Jupiter.
- **in**: `{ amount, in, out, slippageBps? }`
- **emits**: tx + outAmount

### `stake`
Stakes via Marinade or Jito.
- **in**: `{ amount, validator: 'marinade' | 'jito' }`

### `lend`
Deposits into Kamino.
- **in**: `{ amount, token, venue: 'kamino' }`

### `alert`
Sends a Telegram / Discord webhook.
- **in**: `{ message, urgency: 'info' | 'warn' | 'critical' }`

## Logic blocks

### `compare`
- **in**: `{ left, op: '<' | '>' | '==' | '!=', right }`
- **out**: `{ matches: bool }`

### `gate`
Forwards `value` only if `cond` is true.
- **in**: `{ value, cond: bool }`
- **out**: `{ value | nothing }`

### `split`
Fans out to N branches by ratio.
- **in**: `{ value, weights: number[] }`
- **out**: `{ branch_0..N }`

## Utility blocks

### `format`
Templates a string with input fields.
### `delay`
Waits N seconds before forwarding.
### `cap`
Clamps a numeric value to a range.

---

## Snippets (drag-insert ready)

These compositions appear in the right-rail "Templates" tray:

- **Quick SOL→USDC swap** — `wallet → swap{in:SOL, out:USDC, amount:1}`
- **DCA into BONK** — `schedule:daily → swap{in:USDC, out:BONK, amount:10}`
- **SOL price alarm** — `priceFeed{asset:SOL} → compare{op:<, right:80} → gate → alert`
- **Auto-stake idle SOL** — `wallet → cap{max:5} → stake{validator:marinade}`
