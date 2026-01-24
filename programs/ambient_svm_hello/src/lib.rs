use anchor_lang::prelude::*;


declare_id!("F8ScaDMtYwunu5Xx1geVDPoVon5C4PyjaTsoFbAdCkhu");

const MAX_CRITERIA_LEN: usize = 512;
const MAX_INPUT_LEN: usize = 512;
const MAX_PROPOSAL_TEXT_LEN: usize = 512;
const MAX_MODEL_ID_LEN: usize = 64;

#[program]
pub mod ambient_svm_hello {
    use super::*;

    pub fn init_config(ctx: Context<InitConfig>, relayer: Pubkey) -> Result<()> {
        let cfg = &mut ctx.accounts.config;
        cfg.admin = ctx.accounts.admin.key();
        cfg.relayer = relayer;
        Ok(())
    }


    pub fn create_judge_request(
        ctx: Context<CreateJudgeRequest>,
        criteria: String,
        input_a: String,
        input_b: String,
        nonce: u64,
    ) -> Result<()> {
        require!(
            criteria.as_bytes().len() <= MAX_CRITERIA_LEN,
            ErrorCode::CriteriaTooLong
        );
        require!(
            input_a.as_bytes().len() <= MAX_INPUT_LEN,
            ErrorCode::InputTooLong
        );
        require!(
            input_b.as_bytes().len() <= MAX_INPUT_LEN,
            ErrorCode::InputTooLong
        );

        let req = &mut ctx.accounts.request;
        req.authority = ctx.accounts.user.key();
        req.status = 0;
        req.nonce = nonce;

        req.decision = 0;

        req.criteria = criteria;
        req.input_a = input_a;
        req.input_b = input_b;

        req.response_hash = [0u8; 32];
        req.receipt_root = [0u8; 32];

        Ok(())
    }

    pub fn fulfill_judge_request(
        ctx: Context<FulfillJudgeRequest>,
        decision: u8,
        response_hash: [u8; 32],
        receipt_root: [u8; 32],
    ) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.config.relayer,
            ctx.accounts.relayer.key(),
            ErrorCode::BadRelayer
        );

        let req = &mut ctx.accounts.request;
        require!(req.status == 0, ErrorCode::AlreadyFulfilled);
        require!(decision >= 1 && decision <= 3, ErrorCode::BadDecision);

        req.decision = decision;
        req.response_hash = response_hash;
        req.receipt_root = receipt_root;
        req.status = 1;

        Ok(())
    }

    pub fn create_proposal_request(
        ctx: Context<CreateProposalRequest>,
        proposal_text: String,
        nonce: u64,
    ) -> Result<()> {
        require!(
            proposal_text.as_bytes().len() <= MAX_PROPOSAL_TEXT_LEN,
            ErrorCode::ProposalTooLong
        );

        let req = &mut ctx.accounts.request;
        req.authority = ctx.accounts.user.key();
        req.status = 0;
        req.nonce = nonce;

        req.verdict_code = 0;

        req.proposal_text = proposal_text;

        req.summary_hash = [0u8; 32];
        req.receipt_root = [0u8; 32];
        req.prompt_hash = [0u8; 32];
        req.model_id = String::new();

        Ok(())
    }

    pub fn fulfill_proposal_request(
        ctx: Context<FulfillProposalRequest>,
        verdict_code: u8,
        summary_hash: [u8; 32],
        receipt_root: [u8; 32],
        prompt_hash: [u8; 32],
        model_id: String,
    ) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.config.relayer,
            ctx.accounts.relayer.key(),
            ErrorCode::BadRelayer
        );

        let req = &mut ctx.accounts.request;
        require!(req.status == 0, ErrorCode::AlreadyFulfilled);
        require!(verdict_code >= 1 && verdict_code <= 3, ErrorCode::BadVerdict);
        require!(
            model_id.as_bytes().len() <= MAX_MODEL_ID_LEN,
            ErrorCode::ModelIdTooLong
        );

        req.verdict_code = verdict_code;
        req.summary_hash = summary_hash;
        req.receipt_root = receipt_root;
        req.prompt_hash = prompt_hash;
        req.model_id = model_id;
        req.status = 1;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + 32 + 32,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(criteria: String, input_a: String, input_b: String, nonce: u64)]
pub struct CreateJudgeRequest<'info> {
    #[account(
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = user,
        space = JudgeRequest::space(),
        seeds = [b"req", user.key().as_ref(), &nonce.to_le_bytes()],
        bump
    )]
    pub request: Account<'info, JudgeRequest>,

    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FulfillJudgeRequest<'info> {
    #[account(
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,

    #[account(mut)]
    pub request: Account<'info, JudgeRequest>,

    pub relayer: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(proposal_text: String, nonce: u64)]
pub struct CreateProposalRequest<'info> {
    #[account(
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = user,
        space = ProposalRequest::space(),
        seeds = [b"proposal", user.key().as_ref(), &nonce.to_le_bytes()],
        bump
    )]
    pub request: Account<'info, ProposalRequest>,

    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FulfillProposalRequest<'info> {
    #[account(
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,

    #[account(mut)]
    pub request: Account<'info, ProposalRequest>,

    pub relayer: Signer<'info>,
}

#[account]
pub struct Config {
    pub admin: Pubkey,
    pub relayer: Pubkey,
}

#[account]
pub struct JudgeRequest {
    pub authority: Pubkey,
    pub status: u8,
    pub nonce: u64,

    pub decision: u8,

    pub response_hash: [u8; 32],
    pub receipt_root: [u8; 32],

    pub criteria: String,
    pub input_a: String,
    pub input_b: String,
}

impl JudgeRequest {
    pub fn space() -> usize {
        8
        + 32
        + 1
        + 8
        + 1
        + 32
        + 32
        + 4 + MAX_CRITERIA_LEN
        + 4 + MAX_INPUT_LEN
        + 4 + MAX_INPUT_LEN
    }
}

#[account]
pub struct ProposalRequest {
    pub authority: Pubkey,
    pub status: u8,
    pub nonce: u64,

    pub verdict_code: u8,

    pub summary_hash: [u8; 32],
    pub receipt_root: [u8; 32],
    pub prompt_hash: [u8; 32],
    pub model_id: String,

    pub proposal_text: String,
}

impl ProposalRequest {
    pub fn space() -> usize {
        8
        + 32
        + 1
        + 8
        + 1
        + 32
        + 32
        + 32
        + 4 + MAX_MODEL_ID_LEN
        + 4 + MAX_PROPOSAL_TEXT_LEN
    }
}

#[error_code]
pub enum ErrorCode {
    #[msg("Criteria too long")]
    CriteriaTooLong,
    #[msg("Input too long")]
    InputTooLong,
    #[msg("Proposal text too long")]
    ProposalTooLong,
    #[msg("Bad relayer signer")]
    BadRelayer,
    #[msg("Request already fulfilled")]
    AlreadyFulfilled,
    #[msg("Bad decision value")]
    BadDecision,
    #[msg("Bad verdict code")]
    BadVerdict,
    #[msg("Model id too long")]
    ModelIdTooLong,
}
