"""Pydantic models for SolIntent API requests and responses."""

from enum import Enum
from pydantic import BaseModel, Field


class ActionType(str, Enum):
    swap = "Swap"
    stake = "Stake"
    unstake = "Unstake"
    limit_order = "LimitOrder"
    dca = "Dca"
    alert = "Alert"


class Protocol(str, Enum):
    jupiter = "Jupiter"
    marinade = "Marinade"
    drift = "Drift"
    kamino = "Kamino"


class AgentType(str, Enum):
    chat = "Chat"
    builder = "Builder"


class ParsedBlock(BaseModel):
    action_type: ActionType
    protocol: Protocol
    description: str = ""
    params: dict = Field(default_factory=dict)
    order: int = 0
    condition: str | None = None


class ParseIntentRequest(BaseModel):
    text: str
    wallet: str | None = None


class ParseIntentResponse(BaseModel):
    intent: str
    blocks: list[ParsedBlock]
    summary: str
    confidence: float = 0.0


class ExecuteRequest(BaseModel):
    wallet: str
    agent_name: str = "chat-agent"
    blocks: list[ParsedBlock]
    network: str = "devnet"
