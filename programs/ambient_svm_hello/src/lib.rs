use anchor_lang::prelude::*;


declare_id!("F8ScaDMtYwunu5Xx1geVDPoVon5C4PyjaTsoFbAdCkhu");

const MAX_PROMPT_LEN: usize = 280;

#[program]
pub mod ambient_svm_hello {
    use super::*;

    pub fn init_config(ctx: Context<InitConfig>, relayer: Pubkey) -> Result<()> {
        let cfg = &mut ctx.accounts.config;
        cfg.admin = ctx.accounts.admin.key();
        cfg.relayer = relayer;
        Ok(())
    }

    // nonce нужен только чтобы делать уникальные PDA для разных запросов
    pub fn create_request(ctx: Context<CreateRequest>, prompt: String, nonce: u64) -> Result<()> {
        require!(prompt.as_bytes().len() <= MAX_PROMPT_LEN, ErrorCode::PromptTooLong);

        let req = &mut ctx.accounts.request;
        req.authority = ctx.accounts.user.key();
        req.status = 0; // 0 = pending, 1 = fulfilled
        req.nonce = nonce;

        req.prompt = prompt.clone();

        req.response_hash = [0u8; 32];
        req.receipt_root = [0u8; 32];

        Ok(())
    }

    pub fn fulfill_request(
        ctx: Context<FulfillRequest>,
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

        req.response_hash = response_hash;
        req.receipt_root = receipt_root;
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
#[instruction(prompt: String, nonce: u64)]
pub struct CreateRequest<'info> {
    #[account(
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = user,
        space = Request::space(),
        seeds = [b"req", user.key().as_ref(), &nonce.to_le_bytes()],
        bump
    )]
    pub request: Account<'info, Request>,

    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FulfillRequest<'info> {
    #[account(
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,

    #[account(mut)]
    pub request: Account<'info, Request>,

    pub relayer: Signer<'info>,
}

#[account]
pub struct Config {
    pub admin: Pubkey,
    pub relayer: Pubkey,
}

#[account]
pub struct Request {
    pub authority: Pubkey,
    pub status: u8,
    pub nonce: u64,

    pub response_hash: [u8; 32],
    pub receipt_root: [u8; 32],

    pub prompt: String,
}

impl Request {
    pub fn space() -> usize {
        8   // discriminator
        + 32 // authority
        + 1  // status
        + 8  // nonce
        + 32 // response_hash
        + 32 // receipt_root
        + 4 + MAX_PROMPT_LEN // String prefix + bytes
    }
}

#[error_code]
pub enum ErrorCode {
    #[msg("Prompt too long")]
    PromptTooLong,
    #[msg("Bad relayer signer")]
    BadRelayer,
    #[msg("Request already fulfilled")]
    AlreadyFulfilled,
}
