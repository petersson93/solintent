use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct IntentConfig {
    pub authority: Pubkey,
    pub fee_bps: u16,
    pub treasury: Pubkey,
    pub total_intents_executed: u64,
    pub bump: u8,
}
