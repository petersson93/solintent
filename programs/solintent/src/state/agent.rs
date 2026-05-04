use anchor_lang::prelude::*;
use crate::constants::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum AgentType {
    Chat,
    Builder,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum ActionType {
    Swap,
    Stake,
    Unstake,
    LimitOrder,
    Dca,
    Alert,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum Protocol {
    Jupiter,
    Marinade,
    Drift,
    Kamino,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct ActionBlock {
    pub action_type: ActionType,
    pub protocol: Protocol,
    #[max_len(MAX_PARAMS_LEN)]
    pub params: Vec<u8>,
    pub order: u8,
    #[max_len(MAX_CONDITION_LEN)]
    pub condition: Option<String>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum TriggerType {
    PriceAbove,
    PriceBelow,
    TimeInterval,
    YieldAbove,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace)]
pub struct TriggerCondition {
    pub trigger_type: TriggerType,
    pub value: u64,
    pub feed_id: Option<[u8; 32]>,
    pub interval_seconds: Option<u64>,
}

#[account]
#[derive(InitSpace)]
pub struct UserAgent {
    pub user: Pubkey,
    pub agent_id: u64,
    #[max_len(MAX_AGENT_NAME_LEN)]
    pub name: String,
    pub agent_type: AgentType,
    #[max_len(MAX_BLOCKS_PER_AGENT)]
    pub blocks: Vec<ActionBlock>,
    pub trigger: Option<TriggerCondition>,
    pub is_active: bool,
    pub total_executions: u64,
    pub created_at: i64,
    pub bump: u8,
}
