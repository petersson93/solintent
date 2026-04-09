use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::IntentError;
use crate::constants::*;

#[derive(Accounts)]
pub struct ExecuteStake<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        constraint = config.authority == authority.key() @ IntentError::Unauthorized,
    )]
    pub config: Account<'info, IntentConfig>,
    #[account(
        seeds = [AGENT_SEED, agent.user.as_ref(), &agent.agent_id.to_le_bytes()],
        bump = agent.bump,
        constraint = agent.is_active @ IntentError::AgentNotActive,
    )]
    pub agent: Account<'info, UserAgent>,
    #[account(
        mut,
        seeds = [EXECUTION_SEED, agent.key().as_ref(), &execution.exec_id.to_le_bytes()],
        bump = execution.bump,
        constraint = execution.agent == agent.key() @ IntentError::Unauthorized,
    )]
    pub execution: Account<'info, IntentExecution>,
    pub authority: Signer<'info>,
}

/// Crank executes a stake/unstake block from the agent's action list.
/// In production this would CPI into Marinade. For MVP: crank confirms result.
pub fn handler(ctx: Context<ExecuteStake>, tx_sig: [u8; 64]) -> Result<()> {
    let execution = &mut ctx.accounts.execution;
    let agent = &ctx.accounts.agent;

    require!(
        execution.status == ExecutionStatus::Pending || execution.status == ExecutionStatus::Executing,
        IntentError::ExecutionNotActive
    );

    let block_idx = execution.blocks_completed as usize;
    require!(block_idx < agent.blocks.len(), IntentError::InvalidBlockIndex);

    // verify this block is stake or unstake
    let action = agent.blocks[block_idx].action_type;
    require!(
        action == ActionType::Stake || action == ActionType::Unstake,
        IntentError::InvalidBlockIndex
    );

    execution.status = ExecutionStatus::Executing;
    execution.blocks_completed = execution.blocks_completed
        .checked_add(1)
        .ok_or(IntentError::MathOverflow)?;
    execution.tx_signatures.push(tx_sig);

    if execution.blocks_completed as usize >= agent.blocks.len() {
        let clock = Clock::get()?;
        execution.status = ExecutionStatus::Completed;
        execution.completed_at = Some(clock.unix_timestamp);
    }

    Ok(())
}
