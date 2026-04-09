use anchor_lang::prelude::*;
use crate::state::UserAgent;
use crate::errors::IntentError;
use crate::constants::AGENT_SEED;

#[derive(Accounts)]
pub struct DeleteAgent<'info> {
    #[account(
        mut,
        close = user,
        seeds = [AGENT_SEED, user.key().as_ref(), &agent.agent_id.to_le_bytes()],
        bump = agent.bump,
        constraint = agent.user == user.key() @ IntentError::Unauthorized,
    )]
    pub agent: Account<'info, UserAgent>,
    #[account(mut)]
    pub user: Signer<'info>,
}

pub fn handler(ctx: Context<DeleteAgent>) -> Result<()> {
    // account closed via close = user constraint, rent returned
    msg!("agent {} deleted", ctx.accounts.agent.name);
    Ok(())
}
