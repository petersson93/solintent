"""Intent parser — uses Claude API to parse natural language into ActionBlocks."""

import json
import os

import anthropic
from dotenv import load_dotenv

from models import ParsedBlock, ActionType, Protocol

load_dotenv()

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

SYSTEM_PROMPT = """You are SolIntent — an AI DeFi co-pilot on Solana. You help users execute on-chain actions through natural language.

Your job has TWO modes:

MODE 1 — ACTION INTENT (user wants to DO something on-chain):
Parse the intent into structured action blocks and return JSON:
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
  "summary": "one-line summary of what will happen",
  "confidence": 0.85-1.0,
  "reply": null
}

Supported actions: Swap, Stake, Unstake, LimitOrder, Dca, Alert
Supported protocols: Jupiter, Marinade, Drift, Kamino
For swaps: params = token_in, token_out, amount
For stakes: params = amount, token
For alerts: params = token, price, direction (above/below)

MODE 2 — QUESTION / CHAT (user asks a question, wants info, or is just chatting):
Return JSON with empty blocks and a helpful conversational reply:
{
  "blocks": [],
  "summary": "",
  "confidence": 0.0,
  "reply": "Your friendly, helpful answer here. Keep it short (1-3 sentences). You can explain what you can do, answer Solana/DeFi questions briefly, or suggest actions the user could try."
}

Examples of MODE 2 triggers:
- "what can you do?" → reply explaining your capabilities
- "how much SOL do I have?" → reply that you can't check balances yet, suggest connecting a wallet explorer
- "what is SOL?" → brief explanation
- "hello" / "hi" / "gm" → friendly greeting + suggest an action
- "what's the price of SOL?" → reply that you don't have live price data, suggest an action instead

IMPORTANT: Return ONLY valid JSON. No markdown, no explanation outside JSON."""


async def parse_intent(user_text: str, wallet_address=None) -> dict:
    """Parse natural language into structured action blocks via Claude API."""
    if not ANTHROPIC_API_KEY:
        return _fallback_parse(user_text)

    client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY, timeout=15.0)

    user_msg = user_text
    if wallet_address:
        user_msg += f"\n\nUser wallet: {wallet_address}"

    try:
        response = await client.messages.create(
            model=os.getenv("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001"),
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_msg}],
        )

        raw_text = response.content[0].text.strip()
        # Strip markdown code block wrappers if present
        if raw_text.startswith("```"):
            raw_text = raw_text.split("\n", 1)[1] if "\n" in raw_text else raw_text[3:]
        if raw_text.endswith("```"):
            raw_text = raw_text[:-3].strip()
        parsed = json.loads(raw_text)

        valid_actions = {e.value for e in ActionType}
        valid_protocols = {e.value for e in Protocol}

        blocks = []
        for raw_block in parsed.get("blocks", []):
            at = raw_block.get("action_type", "Swap")
            pr = raw_block.get("protocol", "Jupiter")
            # skip blocks with unsupported action types / protocols
            if at not in valid_actions or pr not in valid_protocols:
                continue
            blocks.append(ParsedBlock(
                action_type=at,
                protocol=pr,
                description=raw_block.get("description", ""),
                params=raw_block.get("params", {}),
                order=raw_block.get("order", len(blocks)),
                condition=raw_block.get("condition"),
            ))

        reply = parsed.get("reply")

        # if all blocks were filtered out (unsupported action types),
        # generate a helpful reply instead of returning empty blocks
        if not blocks and not reply:
            reply = parsed.get("summary") or "I can't handle that action yet. Try: swap, stake, unstake, limit order, DCA, or price alert."

        return {
            "blocks": blocks,
            "summary": parsed.get("summary", "") if blocks else "",
            "confidence": parsed.get("confidence", 0.8) if blocks else 0.0,
            "reply": reply,
        }

    except (json.JSONDecodeError, anthropic.APIError, anthropic.APITimeoutError, IndexError, KeyError):
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
    if not blocks:
        return {
            "blocks": [],
            "summary": "",
            "confidence": 0.0,
            "reply": "I didn't quite catch that. Try something like \"swap 1 SOL to USDC\" or \"stake 5 SOL on Marinade\".",
        }

    return {
        "blocks": blocks,
        "summary": user_text,
        "confidence": 0.1,
        "reply": None,
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
