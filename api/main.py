"""SolIntent API — NLP intent parsing, agent creation, and execution."""

import os
import re
import time
from collections import defaultdict
from fastapi import FastAPI, HTTPException, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from solders.pubkey import Pubkey

from models import ParseIntentRequest, ParseIntentResponse, ExecuteRequest
from intent_parser import parse_intent
from action_executor import build_create_agent_tx, build_execute_intent_tx, crank_execute_blocks


def sanitize_text(text: str) -> str:
    """Strip HTML/script tags from user input to prevent XSS in stored responses."""
    return re.sub(r"<[^>]+>", "", text).strip()


# Simple in-memory rate limiter: max 20 requests per minute per IP
_rate_store: dict[str, list[float]] = defaultdict(list)
RATE_LIMIT = 20
RATE_WINDOW = 60


def check_rate_limit(ip: str) -> None:
    now = time.time()
    _rate_store[ip] = [t for t in _rate_store[ip] if now - t < RATE_WINDOW]
    if len(_rate_store[ip]) >= RATE_LIMIT:
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Try again later.")
    _rate_store[ip].append(now)

CRANK_SECRET = os.getenv("CRANK_SECRET", "")

app = FastAPI(title="SolIntent API", version="0.1.0")

ALLOWED_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5180,http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization", "x-crank-secret"],
)


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "0.1.0"}


@app.post("/api/parse-intent", response_model=ParseIntentResponse)
async def handle_parse_intent(req: ParseIntentRequest, request: Request):
    """Parse natural language intent into structured ActionBlocks."""
    check_rate_limit(request.client.host if request.client else "unknown")
    clean_text = sanitize_text(req.text)
    if not clean_text:
        raise HTTPException(status_code=400, detail="Empty intent text")

    if len(clean_text) > 500:
        clean_text = clean_text[:500]

    # validate wallet if provided
    clean_wallet = None
    if req.wallet:
        try:
            Pubkey.from_string(req.wallet)
            clean_wallet = req.wallet
        except Exception:
            clean_wallet = None

    result = await parse_intent(clean_text, clean_wallet)

    return ParseIntentResponse(
        intent=clean_text,
        blocks=result["blocks"],
        summary=result["summary"],
        confidence=result["confidence"],
        reply=result.get("reply"),
    )


@app.post("/api/build-agent")
async def handle_build_agent(req: ExecuteRequest):
    """Build a create_agent transaction for the user to sign."""
    if not req.wallet:
        raise HTTPException(status_code=400, detail="Wallet address required")
    try:
        Pubkey.from_string(req.wallet)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid Solana wallet address")
    if not req.blocks:
        raise HTTPException(status_code=400, detail="At least one action block required")

    try:
        tx_data = await build_create_agent_tx(req.wallet, req.agent_name, req.blocks)
        return tx_data
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/build-execute")
async def handle_build_execute(wallet: str, agent_id: int):
    """Build an execute_intent transaction for the user to sign."""
    if not wallet:
        raise HTTPException(status_code=400, detail="Wallet address required")

    try:
        tx_data = await build_execute_intent_tx(wallet, agent_id)
        return tx_data
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/crank-execute")
async def handle_crank_execute(
    agent_id: int,
    user_wallet: str,
    exec_id: int,
    x_crank_secret: str = Header(None),
):
    """Crank endpoint: process execution blocks (authority-only)."""
    if not CRANK_SECRET or x_crank_secret != CRANK_SECRET:
        raise HTTPException(status_code=403, detail="Invalid crank secret")
    try:
        sigs = await crank_execute_blocks(agent_id, user_wallet, exec_id)
        return {"signatures": sigs, "blocks_processed": len(sigs)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
