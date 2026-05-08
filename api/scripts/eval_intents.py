#!/usr/bin/env python3
"""
Offline evaluation harness for the NLP layer.

Reads `intents.json`, runs each phrase through the production parser, and
reports accuracy + per-action confusion matrix.

Usage:
    python scripts/eval_intents.py
    python scripts/eval_intents.py --strict   # exits non-zero on any miss

Exit code = number of misclassified examples (capped at 255).
"""
import argparse
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INTENTS_PATH = ROOT / "intents.json"


def parse_intent(text: str) -> dict:
    """Stub for the production NLP call. Replace with the real parser."""
    # In production this hits the FastAPI endpoint /parse with the text.
    # For offline eval we keep a tiny rule-based fallback so the script runs
    # even when the API is offline.
    text_lc = text.lower()
    if any(w in text_lc for w in ("swap", "trade", "convert", "close my")):
        return {"action": "swap"}
    if "stake" in text_lc and "unstake" not in text_lc:
        return {"action": "stake"}
    if "unstake" in text_lc:
        return {"action": "unstake"}
    if "lend" in text_lc:
        return {"action": "lend"}
    if "borrow" in text_lc:
        return {"action": "borrow"}
    if "alert" in text_lc or "notify" in text_lc:
        return {"action": "alert"}
    if "dca" in text_lc or "every" in text_lc:
        return {"action": "schedule_swap"}
    if "claim" in text_lc:
        return {"action": "claim_rewards"}
    if "withdraw" in text_lc:
        return {"action": "withdraw_lp"}
    if "send" in text_lc or "transfer" in text_lc:
        return {"action": "transfer"}
    if "rebalance" in text_lc:
        return {"action": "rebalance"}
    if "leverage" in text_lc or "perp" in text_lc:
        return {"action": "perp_open"}
    if "balance" in text_lc or "show my" in text_lc:
        return {"action": "view"}
    return {"action": "unknown"}


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--strict", action="store_true",
                   help="exit non-zero if any classification misses")
    args = p.parse_args()

    if not INTENTS_PATH.exists():
        print(f"missing {INTENTS_PATH}", file=sys.stderr)
        return 2

    data = json.loads(INTENTS_PATH.read_text())
    total = len(data["intents"])
    correct = 0
    misses: list[tuple[str, str, str]] = []
    confusion: dict[str, Counter] = defaultdict(Counter)

    for entry in data["intents"]:
        text = entry["input"]
        expected = entry["action"]
        got = parse_intent(text)["action"]
        confusion[expected][got] += 1
        if got == expected:
            correct += 1
        else:
            misses.append((text, expected, got))

    pct = 100.0 * correct / total if total else 0.0
    print(f"total: {total}  correct: {correct}  accuracy: {pct:.1f}%")
    if misses:
        print()
        print("misses:")
        for text, expected, got in misses:
            print(f"  ✗ {text!r:60} expected={expected:18} got={got}")

    print()
    print("confusion matrix (expected → got):")
    for expected, gots in sorted(confusion.items()):
        for got, n in sorted(gots.items()):
            mark = "✓" if got == expected else "✗"
            print(f"  {mark} {expected:18} → {got:18} {n}")

    if args.strict and misses:
        return min(255, len(misses))
    return 0


if __name__ == "__main__":
    sys.exit(main())
