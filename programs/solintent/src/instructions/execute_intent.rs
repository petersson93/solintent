use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::IntentError;
use crate::constants::*;

#[derive(Accounts)]
#[instruction(exec_id: u64)]
pub struct ExecuteIntent<'info> {
    #[account(
        mut,
        constraint = agent.is_active @ IntentError::AgentNotActive,
        constraint = agent.user == user.key() @ IntentError::Unauthorized,
    )]
    pub agent: Account<'info, UserAgent>,
    #[account(
        init,
        payer = user,
        space = 8 + IntentExecution::INIT_SPACE,
        seeds = [EXECUTION_SEED, agent.key().as_ref(), &exec_id.to_le_bytes()],
        bump,
    )]
    pub execution: Account<'info, IntentExecution>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<ExecuteIntent>, exec_id: u64) -> Result<()> {
    let clock = Clock::get()?;

    let execution = &mut ctx.accounts.execution;
    execution.agent = ctx.accounts.agent.key();
    execution.exec_id = exec_id;
    execution.status = ExecutionStatus::Pending;
    execution.blocks_completed = 0;
    execution.tx_signatures = vec![];
    execution.error = None;
    execution.created_at = clock.unix_timestamp;
    execution.completed_at = None;
    execution.bump = ctx.bumps.execution;

    ctx.accounts.agent.total_executions = ctx.accounts.agent.total_executions
        .checked_add(1)
        .ok_or(IntentError::MathOverflow)?;

    Ok(())
}
