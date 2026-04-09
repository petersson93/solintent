use anchor_lang::prelude::*;
use crate::state::IntentConfig;
use crate::errors::IntentError;
use crate::constants::CONFIG_SEED;

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + IntentConfig::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump,
    )]
    pub config: Account<'info, IntentConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeConfig>, fee_bps: u16) -> Result<()> {
    require!(fee_bps <= 10_000, IntentError::InvalidFee);

    let config = &mut ctx.accounts.config;
    config.authority = ctx.accounts.authority.key();
    config.treasury = ctx.accounts.authority.key();
    config.fee_bps = fee_bps;
    config.total_intents_executed = 0;
    config.bump = ctx.bumps.config;
    Ok(())
}
