use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::IntentError;
use crate::constants::*;

#[derive(Accounts)]
#[instruction(agent_id: u64)]
pub struct CreateAgent<'info> {
    #[account(
        init,
        payer = user,
        space = 8 + UserAgent::INIT_SPACE,
        seeds = [AGENT_SEED, user.key().as_ref(), &agent_id.to_le_bytes()],
        bump,
    )]
    pub agent: Account<'info, UserAgent>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<CreateAgent>,
    agent_id: u64,
    name: String,
    agent_type: AgentType,
    blocks: Vec<ActionBlock>,
    trigger: Option<TriggerCondition>,
) -> Result<()> {
    require!(name.len() <= MAX_AGENT_NAME_LEN, IntentError::NameTooLong);
    require!(blocks.len() <= MAX_BLOCKS_PER_AGENT, IntentError::TooManyBlocks);

    let clock = Clock::get()?;
    let agent = &mut ctx.accounts.agent;
    agent.user = ctx.accounts.user.key();
    agent.agent_id = agent_id;
    agent.name = name;
    agent.agent_type = agent_type;
    agent.blocks = blocks;
    agent.trigger = trigger;
    agent.is_active = true;
    agent.total_executions = 0;
    agent.created_at = clock.unix_timestamp;
    agent.bump = ctx.bumps.agent;
    Ok(())
}
