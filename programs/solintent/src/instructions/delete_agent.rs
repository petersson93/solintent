use anchor_lang::prelude::*;
use crate::state::UserAgent;
use crate::errors::IntentError;

#[derive(Accounts)]
pub struct DeleteAgent<'info> {
    #[account(
        mut,
        close = user,
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
