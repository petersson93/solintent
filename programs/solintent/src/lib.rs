#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;

mod errors;
mod instructions;
mod state;

// Inline constants — small + no logic, keeping them next to declare_id so reviewers
// see the full program surface in one file.
mod constants {
    // PDA seeds
    pub const CONFIG_SEED: &[u8] = b"intent_config";
    pub const AGENT_SEED: &[u8] = b"agent";
    pub const EXECUTION_SEED: &[u8] = b"execution";

    // Field length limits
    pub const MAX_AGENT_NAME_LEN: usize = 64;
    pub const MAX_BLOCKS_PER_AGENT: usize = 10;
    pub const MAX_TX_SIGS_PER_EXECUTION: usize = 10;
    pub const MAX_ERROR_LEN: usize = 256;
    pub const MAX_CONDITION_LEN: usize = 128;
    pub const MAX_PARAMS_LEN: usize = 256;

    // Fee math
    pub const BPS_DENOMINATOR: u64 = 10_000;
}

use instructions::*;

declare_id!("AHvsBUGTcXewYD3hyE2F2HunXGszJRJ3k1BCAFwoqCk1");

#[program]
pub mod solintent {
    use super::*;

    pub fn initialize_config(ctx: Context<InitializeConfig>, fee_bps: u16) -> Result<()> {
        instructions::initialize_config::handler(ctx, fee_bps)
    }

    pub fn create_agent(
        ctx: Context<CreateAgent>,
        agent_id: u64,
        name: String,
        agent_type: state::AgentType,
        blocks: Vec<state::ActionBlock>,
        trigger: Option<state::TriggerCondition>,
    ) -> Result<()> {
        instructions::create_agent::handler(ctx, agent_id, name, agent_type, blocks, trigger)
    }

    pub fn execute_intent(ctx: Context<ExecuteIntent>, exec_id: u64) -> Result<()> { instructions::execute_intent::handler(ctx, exec_id) }

    pub fn execute_swap(ctx: Context<ExecuteSwap>, tx_sig: [u8; 64]) -> Result<()> {
        instructions::execute_swap::handler(ctx, tx_sig)
    }

    pub fn execute_stake(ctx: Context<ExecuteStake>, tx_sig: [u8; 64]) -> Result<()> {
        instructions::execute_stake::handler(ctx, tx_sig)
    }

    pub fn delete_agent(ctx: Context<DeleteAgent>) -> Result<()> { instructions::delete_agent::handler(ctx) }
}
