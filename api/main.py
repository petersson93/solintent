"""SolIntent API — NLP intent parsing and trigger monitoring."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="SolIntent API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/parse-intent")
async def parse_intent(payload: dict):
    """Parse natural language intent into ActionBlocks."""
    # TODO: Claude API integration
    return {
        "intent": payload.get("text", ""),
        "blocks": [],
        "message": "NLP parser not yet wired",
    }
