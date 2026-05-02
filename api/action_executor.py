"""Action executor — builds Solana transactions for parsed intent blocks."""

import json
import struct
import os
import time
import random
from pathlib import Path

from solders.keypair import Keypair
from solders.pubkey import Pubkey
from solders.system_program import ID as SYSTEM_PROGRAM_ID
from solders.instruction import Instruction, AccountMeta
from solders.transaction import Transaction
from solders.message import Message
from solana.rpc.async_api import AsyncClient
from solana.rpc.commitment import Confirmed
from dotenv import load_dotenv

from models import ParsedBlock, ActionType

load_dotenv()

PROGRAM_ID = os.getenv("PROGRAM_ID", "AHvsBUGTcXewYD3hyE2F2HunXGszJRJ3k1BCAFwoqCk1")
RPC_URL = os.getenv("ANCHOR_PROVIDER_URL", "https://api.devnet.solana.com")
WALLET_PATH = os.getenv("ANCHOR_WALLET", "~/.config/solana/id.json")

# Anchor instruction discriminators (from IDL — must match deployed program)
CREATE_AGENT_DISC = bytes([143, 66, 198, 95, 110, 85, 83, 249])
EXECUTE_INTENT_DISC = bytes([53, 130, 47, 154, 227, 220, 122, 212])
EXECUTE_SWAP_DISC = bytes([56, 182, 124, 215, 155, 140, 157, 102])
EXECUTE_STAKE_DISC = bytes([123, 140, 82, 174, 137, 211, 238, 49])

# PDA seeds
CONFIG_SEED = b"intent_config"
AGENT_SEED = b"agent"
EXECUTION_SEED = b"execution"


def load_keypair(path: str) -> Keypair:
    """Resolve the signing keypair, env-first then filesystem.

    On Railway there is no `~/.config/solana/id.json`, so we look for
    CRANK_KEYPAIR_JSON (an inline 64-byte JSON array, with or without
    surrounding brackets) before falling back to disk.
    """
    inline = (os.getenv("CRANK_KEYPAIR_JSON") or "").strip()
    if inline:
        body = inline.lstrip("[(").rstrip(")]")
        try:
            secret = json.loads(inline) if inline.startswith("[") else json.loads(f"[{body}]")
        except json.JSONDecodeError:
            secret = [int(b) for b in body.split(",") if b.strip()]
        return Keypair.from_bytes(bytes(secret[:64]))
    expanded = Path(path).expanduser()
    with open(expanded) as f:
        secret = json.load(f)
    return Keypair.from_bytes(bytes(secret[:64]))


def derive_config_pda(program_id: Pubkey) -> tuple[Pubkey, int]:
    return Pubkey.find_program_address([CONFIG_SEED], program_id)


def derive_agent_pda(user: Pubkey, agent_id: int, program_id: Pubkey) -> tuple[Pubkey, int]:
    return Pubkey.find_program_address(
        [AGENT_SEED, bytes(user), struct.pack("<Q", agent_id)],
        program_id,
    )


def derive_execution_pda(agent: Pubkey, exec_id: int, program_id: Pubkey) -> tuple[Pubkey, int]:
    return Pubkey.find_program_address(
        [EXECUTION_SEED, bytes(agent), struct.pack("<Q", exec_id)],
        program_id,
    )


def encode_action_type(action_type: ActionType) -> int:
    mapping = {
        ActionType.swap: 0,
        ActionType.stake: 1,
        ActionType.unstake: 2,
        ActionType.limit_order: 3,
        ActionType.dca: 4,
        ActionType.alert: 5,
    }
    return mapping.get(action_type, 0)


def encode_protocol(protocol_name: str) -> int:
    mapping = {"Jupiter": 0, "Marinade": 1, "Drift": 2, "Kamino": 3}
    return mapping.get(protocol_name, 0)


def encode_action_block(block: ParsedBlock) -> bytes:
    """Borsh-encode a single ActionBlock struct."""
    buf = bytearray()
    buf += struct.pack("<B", encode_action_type(block.action_type))
    buf += struct.pack("<B", encode_protocol(block.protocol))

    params_bytes = json.dumps(block.params).encode("utf-8")[:256]
    buf += struct.pack("<I", len(params_bytes))
    buf += params_bytes

    buf += struct.pack("<B", block.order)

    if block.condition:
        cond_bytes = block.condition.encode("utf-8")[:128]
        buf += struct.pack("<B", 1)  # Option::Some
        buf += struct.pack("<I", len(cond_bytes))
        buf += cond_bytes
    else:
        buf += struct.pack("<B", 0)  # Option::None

    return bytes(buf)


def encode_agent_type(agent_type: str) -> int:
    return 0 if agent_type == "Chat" else 1


def encode_create_agent_data(
    agent_id: int,
    name: str,
    agent_type: str,
    blocks: list[ParsedBlock],
    trigger: None = None,
) -> bytes:
    """Borsh-encode the create_agent instruction data."""
    buf = bytearray(CREATE_AGENT_DISC)
    buf += struct.pack("<Q", agent_id)

    name_bytes = name.encode("utf-8")[:64]
    buf += struct.pack("<I", len(name_bytes))
    buf += name_bytes

    buf += struct.pack("<B", encode_agent_type(agent_type))

    buf += struct.pack("<I", len(blocks))
    for block in blocks:
        buf += encode_action_block(block)

    # trigger: Option<TriggerCondition> — None for now
    buf += struct.pack("<B", 0)

    return bytes(buf)


def encode_execute_intent_data(exec_id: int) -> bytes:
    buf = bytearray(EXECUTE_INTENT_DISC)
    buf += struct.pack("<Q", exec_id)
    return bytes(buf)


async def build_create_agent_tx(
    wallet_pubkey: str,
    agent_name: str,
    blocks: list[ParsedBlock],
) -> dict:
    """Build create_agent instruction data. Frontend builds + signs the tx."""
    import base64

    program_id = Pubkey.from_string(PROGRAM_ID)
    user_pk = Pubkey.from_string(wallet_pubkey)

    agent_id = int(time.time() * 1000_000) + random.randint(0, 999_999)
    agent_pda, _ = derive_agent_pda(user_pk, agent_id, program_id)

    ix_data = encode_create_agent_data(agent_id, agent_name, "Chat", blocks)

    return {
        "programId": PROGRAM_ID,
        "instructionData": base64.b64encode(ix_data).decode("ascii"),
        "accounts": [
            {"pubkey": str(agent_pda), "isSigner": False, "isWritable": True},
            {"pubkey": wallet_pubkey, "isSigner": True, "isWritable": True},
            {"pubkey": str(SYSTEM_PROGRAM_ID), "isSigner": False, "isWritable": False},
        ],
        "agent_id": agent_id,
        "agent_pda": str(agent_pda),
    }


async def build_execute_intent_tx(
    wallet_pubkey: str,
    agent_id: int,
) -> dict:
    """Build an execute_intent transaction. Returns serialized tx for frontend signing."""
    program_id = Pubkey.from_string(PROGRAM_ID)
    user_pk = Pubkey.from_string(wallet_pubkey)

    agent_pda, _ = derive_agent_pda(user_pk, agent_id, program_id)
    config_pda, _ = derive_config_pda(program_id)

    exec_id = int(time.time() * 1000_000) + random.randint(0, 999_999)
    execution_pda, _ = derive_execution_pda(agent_pda, exec_id, program_id)

    ix_data = encode_execute_intent_data(exec_id)

    ix = Instruction(
        program_id=program_id,
        accounts=[
            AccountMeta(config_pda, is_signer=False, is_writable=True),
            AccountMeta(agent_pda, is_signer=False, is_writable=True),
            AccountMeta(execution_pda, is_signer=False, is_writable=True),
            AccountMeta(user_pk, is_signer=True, is_writable=True),
            AccountMeta(SYSTEM_PROGRAM_ID, is_signer=False, is_writable=False),
        ],
        data=ix_data,
    )

    client = AsyncClient(RPC_URL)
    try:
        recent = await client.get_latest_blockhash(commitment=Confirmed)
        blockhash = recent.value.blockhash

        msg = Message.new_with_blockhash([ix], user_pk, blockhash)
        tx = Transaction.new_unsigned(msg)

        import base64
        tx_bytes = bytes(tx)
        tx_base64 = base64.b64encode(tx_bytes).decode("ascii")

        return {
            "transaction": tx_base64,
            "exec_id": exec_id,
            "execution_pda": str(execution_pda),
            "blockhash": str(blockhash),
        }
    finally:
        await client.close()


async def crank_execute_blocks(agent_id: int, user_pubkey: str, exec_id: int) -> list[str]:
    """Crank: execute swap/stake blocks for an active execution. Authority-only."""
    program_id = Pubkey.from_string(PROGRAM_ID)
    user_pk = Pubkey.from_string(user_pubkey)
    authority = load_keypair(WALLET_PATH)
    client = AsyncClient(RPC_URL)

    agent_pda, _ = derive_agent_pda(user_pk, agent_id, program_id)
    config_pda, _ = derive_config_pda(program_id)
    execution_pda, _ = derive_execution_pda(agent_pda, exec_id, program_id)

    # NOTE: placeholder — real implementation should read agent blocks from on-chain,
    # perform the actual swap via Jupiter, then pass the real tx signature.
    # Currently sends execute_swap with zeroed sig as proof-of-concept.
    dummy_sig = bytes(64)

    ix_data = bytearray(EXECUTE_SWAP_DISC)
    ix_data += dummy_sig

    ix = Instruction(
        program_id=program_id,
        accounts=[
            AccountMeta(config_pda, is_signer=False, is_writable=False),
            AccountMeta(agent_pda, is_signer=False, is_writable=False),
            AccountMeta(execution_pda, is_signer=False, is_writable=True),
            AccountMeta(authority.pubkey(), is_signer=True, is_writable=False),
        ],
        data=bytes(ix_data),
    )

    sigs = []
    try:
        recent = await client.get_latest_blockhash(commitment=Confirmed)
        blockhash = recent.value.blockhash

        msg = Message.new_with_blockhash([ix], authority.pubkey(), blockhash)
        tx = Transaction.new_unsigned(msg)
        tx.sign([authority], blockhash)

        resp = await client.send_transaction(tx)
        sigs.append(str(resp.value))
    except Exception as exc:
        print(f"[executor] crank failed: {exc}")
    finally:
        await client.close()

    return sigs
