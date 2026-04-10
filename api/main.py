"""SolIntent API — NLP intent parsing, agent creation, and execution."""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from models import ParseIntentRequest, ParseIntentResponse, ExecuteRequest
from intent_parser import parse_intent
from action_executor import build_create_agent_tx, build_execute_intent_tx, crank_execute_blocks

app = FastAPI(title="SolIntent API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "0.1.0"}


@app.post("/api/parse-intent", response_model=ParseIntentResponse)
async def handle_parse_intent(req: ParseIntentRequest):
    """Parse natural language intent into structured ActionBlocks."""
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Empty intent text")

    result = await parse_intent(req.text, req.wallet)

    return ParseIntentResponse(
        intent=req.text,
        blocks=result["blocks"],
        summary=result["summary"],
        confidence=result["confidence"],
    )


@app.post("/api/build-agent")
async def handle_build_agent(req: ExecuteRequest):
    """Build a create_agent transaction for the user to sign."""
    if not req.wallet:
        raise HTTPException(status_code=400, detail="Wallet address required")
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
async def handle_crank_execute(agent_id: int, user_wallet: str, exec_id: int):
    """Crank endpoint: process execution blocks (authority-only)."""
    try:
        sigs = await crank_execute_blocks(agent_id, user_wallet, exec_id)
        return {"signatures": sigs, "blocks_processed": len(sigs)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
