"""Intent parser — uses Claude API to parse natural language into ActionBlocks."""

import json
import os

import anthropic
from dotenv import load_dotenv

from models import ParsedBlock, ActionType, Protocol

load_dotenv()

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

SYSTEM_PROMPT = """You are a Solana DeFi intent parser. Convert user instructions into structured action blocks.

Supported actions:
- Swap: token exchange via Jupiter (e.g. "swap 1 SOL to USDC")
- Stake: stake SOL via Marinade (e.g. "stake 5 SOL")
- Unstake: unstake mSOL (e.g. "unstake 2 mSOL")
- LimitOrder: conditional swap (e.g. "buy SOL when price drops to $100")
- Dca: dollar cost average (e.g. "DCA 10 USDC into SOL daily")
- Alert: price alert (e.g. "alert me when SOL hits $200")

Supported protocols: Jupiter, Marinade, Drift, Kamino

Return a JSON object with:
{
  "blocks": [
    {
      "action_type": "Swap|Stake|Unstake|LimitOrder|Dca|Alert",
      "protocol": "Jupiter|Marinade|Drift|Kamino",
      "description": "human readable description",
      "params": { action-specific key-value pairs },
      "order": 0,
      "condition": null or "conditional expression"
    }
  ],
  "summary": "one-line summary of the full intent",
  "confidence": 0.0-1.0
}

For swaps, params should include: token_in, token_out, amount
For stakes, params should include: amount, token (SOL or mSOL)
For alerts, params should include: token, price, direction (above/below)

Return ONLY valid JSON. No explanation."""


async def parse_intent(user_text: str, wallet_address: str | None = None) -> dict:
    """Parse natural language into structured action blocks via Claude API."""
    if not ANTHROPIC_API_KEY:
        return _fallback_parse(user_text)

    client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)

    user_msg = user_text
    if wallet_address:
        user_msg += f"\n\nUser wallet: {wallet_address}"

    try:
        response = await client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=500,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_msg}],
        )

        raw_text = response.content[0].text.strip()
        parsed = json.loads(raw_text)

        blocks = []
        for raw_block in parsed.get("blocks", []):
            blocks.append(ParsedBlock(
                action_type=raw_block.get("action_type", "Swap"),
                protocol=raw_block.get("protocol", "Jupiter"),
                description=raw_block.get("description", ""),
                params=raw_block.get("params", {}),
                order=raw_block.get("order", len(blocks)),
                condition=raw_block.get("condition"),
            ))

        return {
            "blocks": blocks,
            "summary": parsed.get("summary", ""),
            "confidence": parsed.get("confidence", 0.8),
        }

    except (json.JSONDecodeError, anthropic.APIError, IndexError):
        return _fallback_parse(user_text)


def _fallback_parse(user_text: str) -> dict:
    """Simple keyword-based fallback when Claude API is unavailable."""
    text_lower = user_text.lower()
    blocks = []

    if "swap" in text_lower or "exchange" in text_lower or "convert" in text_lower:
        blocks.append(ParsedBlock(
            action_type=ActionType.swap,
            protocol=Protocol.jupiter,
            description=f"Swap: {user_text}",
            params=_extract_swap_params(text_lower),
            order=0,
        ))
    elif "stake" in text_lower and "unstake" not in text_lower:
        blocks.append(ParsedBlock(
            action_type=ActionType.stake,
            protocol=Protocol.marinade,
            description=f"Stake: {user_text}",
            params=_extract_amount_param(text_lower),
            order=0,
        ))
    elif "unstake" in text_lower:
        blocks.append(ParsedBlock(
            action_type=ActionType.unstake,
            protocol=Protocol.marinade,
            description=f"Unstake: {user_text}",
            params=_extract_amount_param(text_lower),
            order=0,
        ))
    elif "alert" in text_lower or "notify" in text_lower:
        blocks.append(ParsedBlock(
            action_type=ActionType.alert,
            protocol=Protocol.jupiter,
            description=f"Alert: {user_text}",
            params={},
            order=0,
        ))
    else:
        blocks.append(ParsedBlock(
            action_type=ActionType.swap,
            protocol=Protocol.jupiter,
            description=user_text,
            params={},
            order=0,
        ))

    return {
        "blocks": blocks,
        "summary": user_text,
        "confidence": 0.4,
    }


def _extract_swap_params(text: str) -> dict:
    """Try to extract token_in, token_out, amount from text."""
    import re
    params: dict = {}

    amount_match = re.search(r"(\d+\.?\d*)\s*(sol|usdc|msol|usdt)", text)
    if amount_match:
        params["amount"] = float(amount_match.group(1))
        params["token_in"] = amount_match.group(2).upper()

    to_match = re.search(r"to\s+(sol|usdc|msol|usdt)", text)
    if to_match:
        params["token_out"] = to_match.group(1).upper()

    return params


def _extract_amount_param(text: str) -> dict:
    """Try to extract an amount from text."""
    import re
    amount_match = re.search(r"(\d+\.?\d*)", text)
    if amount_match:
        return {"amount": float(amount_match.group(1))}
    return {}
