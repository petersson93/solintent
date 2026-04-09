use anchor_lang::prelude::*;

#[error_code]
pub enum IntentError {
    #[msg("Unauthorized caller")]
    Unauthorized,
    #[msg("Agent not active")]
    AgentNotActive,
    #[msg("Too many blocks in agent")]
    TooManyBlocks,
    #[msg("Agent name too long")]
    NameTooLong,
    #[msg("No route found for swap")]
    NoRouteFound,
    #[msg("Insufficient balance")]
    InsufficientBalance,
    #[msg("Execution already in progress")]
    ExecutionInProgress,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Invalid block index")]
    InvalidBlockIndex,
}
