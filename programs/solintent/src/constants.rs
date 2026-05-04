pub const CONFIG_SEED: &[u8] = b"intent_config";
pub const AGENT_SEED: &[u8] = b"agent";
pub const EXECUTION_SEED: &[u8] = b"execution";

pub const MAX_AGENT_NAME_LEN: usize = 64;
pub const MAX_BLOCKS_PER_AGENT: usize = 10;
pub const MAX_TX_SIGS_PER_EXECUTION: usize = 10;
pub const MAX_ERROR_LEN: usize = 256;
pub const MAX_CONDITION_LEN: usize = 128;
pub const MAX_PARAMS_LEN: usize = 256;

pub const BPS_DENOMINATOR: u64 = 10_000;
