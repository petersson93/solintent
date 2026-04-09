use anchor_lang::prelude::*;
use crate::constants::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum ExecutionStatus {
    Pending,
    Executing,
    Completed,
    Failed,
}

#[account]
#[derive(InitSpace)]
pub struct IntentExecution {
    pub agent: Pubkey,
    pub exec_id: u64,
    pub status: ExecutionStatus,
    pub blocks_completed: u8,
    #[max_len(MAX_TX_SIGS_PER_EXECUTION, 64)]
    pub tx_signatures: Vec<[u8; 64]>,
    #[max_len(MAX_ERROR_LEN)]
    pub error: Option<String>,
    pub created_at: i64,
    pub completed_at: Option<i64>,
    pub bump: u8,
}
