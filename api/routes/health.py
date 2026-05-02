"""Health check route — used by Render/Railway probes and the frontend banner.

Returns liveness + dependency status so the dashboard can show 'green' when
all upstream services respond.
"""
from fastapi import APIRouter
from datetime import datetime, timezone
import os
import time

router = APIRouter()
START = time.time()


@router.get("/health")
async def health():
    return {
        "ok": True,
        "service": "solintent-api",
        "version": os.getenv("APP_VERSION", "0.5.5"),
        "uptime_seconds": int(time.time() - START),
        "now": datetime.now(timezone.utc).isoformat(),
        "deps": {
            "anthropic": bool(os.getenv("ANTHROPIC_API_KEY")),
            "helius_rpc": bool(os.getenv("HELIUS_RPC_URL")),
            "jupiter_api": True,
        },
    }


@router.get("/ready")
async def ready():
    """Readiness probe — stricter than /health; fails if any dep is missing."""
    missing = []
    if not os.getenv("ANTHROPIC_API_KEY"):
        missing.append("ANTHROPIC_API_KEY")
    if not os.getenv("HELIUS_RPC_URL"):
        missing.append("HELIUS_RPC_URL")
    return {"ready": not missing, "missing": missing}
