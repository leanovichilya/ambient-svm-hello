use anchor_lang::prelude::*;
use anchor_lang::system_program;


declare_id!("F8ScaDMtYwunu5Xx1geVDPoVon5C4PyjaTsoFbAdCkhu");

const MAX_CRITERIA_LEN: usize = 512;
const MAX_INPUT_LEN: usize = 512;
const MAX_PROPOSAL_TEXT_LEN: usize = 4096;
const MAX_MODEL_ID_LEN: usize = 64;
const MAX_SOURCE_LEN: usize = 16;
const MAX_PROPOSAL_ID_LEN: usize = 128;
const MAX_GOV_PROPOSAL_TEXT_LEN: usize = 512;
const MAX_REVISION_TEXT_LEN: usize = 512;
const ACTION_LAMPORTS: u64 = 1_000_000;
const MAX_MATCH_EXTRA_LEN: usize = 512;

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
        source: String,
        proposal_id: String,
        proposal_text: String,
        nonce: u64,
    ) -> Result<()> {
        require!(
            source.as_bytes().len() <= MAX_SOURCE_LEN,
            ErrorCode::SourceTooLong
        );
        require!(
            proposal_id.as_bytes().len() <= MAX_PROPOSAL_ID_LEN,
            ErrorCode::ProposalIdTooLong
        );
        require!(
            proposal_text.as_bytes().len() <= MAX_PROPOSAL_TEXT_LEN,
            ErrorCode::ProposalTooLong
        );

        let req = &mut ctx.accounts.request;
        req.authority = ctx.accounts.user.key();
        req.status = 0;
        req.nonce = nonce;

        req.verdict_code = 0;

        req.source = source;
        req.proposal_id = proposal_id;
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

    pub fn init_treasury(ctx: Context<InitTreasury>) -> Result<()> {
        let treasury = &mut ctx.accounts.treasury;
        treasury.bump = ctx.bumps.treasury;
        Ok(())
    }

    pub fn init_treasury_vault(ctx: Context<InitTreasuryVault>) -> Result<()> {
        let vault = &ctx.accounts.treasury_vault;
        if vault.owner == &system_program::ID && vault.lamports() > 0 {
            return Ok(());
        }
        let rent = Rent::get()?;
        let lamports = rent.minimum_balance(0);
        let bump = ctx.bumps.treasury_vault;
        let signer_seeds: &[&[u8]] = &[b"treasury_vault", &[bump]];
        let signer = &[signer_seeds];
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            system_program::CreateAccount {
                from: ctx.accounts.payer.to_account_info(),
                to: vault.to_account_info(),
            },
            signer,
        );
        system_program::create_account(cpi_ctx, lamports, 0, &system_program::ID)?;
        Ok(())
    }

    pub fn fund_treasury(ctx: Context<FundTreasury>, amount: u64) -> Result<()> {
        let cpi_ctx = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.funder.to_account_info(),
                to: ctx.accounts.treasury_vault.to_account_info(),
            },
        );
        system_program::transfer(cpi_ctx, amount)?;
        Ok(())
    }

    pub fn create_governance_proposal(
        ctx: Context<CreateGovernanceProposal>,
        proposal_text: String,
        revision_number: u64,
        nonce: u64,
    ) -> Result<()> {
        require!(
            proposal_text.as_bytes().len() <= MAX_GOV_PROPOSAL_TEXT_LEN,
            ErrorCode::GovernanceTextTooLong
        );
        require!(revision_number == 0, ErrorCode::BadRevisionNumber);

        let proposal = &mut ctx.accounts.proposal;
        proposal.authority = ctx.accounts.user.key();
        proposal.status = 0;
        proposal.nonce = nonce;
        proposal.revision_count = 1;
        proposal.votes_for = 0;
        proposal.votes_against = 0;
        proposal.votes_abstain = 0;
        proposal.judge_approve = 0;
        proposal.judge_reject = 0;
        proposal.judge_needs = 0;
        proposal.final_verdict = 0;
        proposal.proposal_text = proposal_text.clone();

        let revision = &mut ctx.accounts.revision;
        revision.proposal = proposal.key();
        revision.revision_number = 0;
        revision.text = proposal_text;

        Ok(())
    }

    pub fn add_revision(
        ctx: Context<AddRevision>,
        revision_number: u64,
        revision_text: String,
    ) -> Result<()> {
        require!(
            revision_text.as_bytes().len() <= MAX_REVISION_TEXT_LEN,
            ErrorCode::GovernanceTextTooLong
        );
        let proposal = &mut ctx.accounts.proposal;
        require!(proposal.status == 0, ErrorCode::AlreadyFinalized);
        require!(revision_number == proposal.revision_count, ErrorCode::BadRevisionNumber);
        require_keys_eq!(proposal.authority, ctx.accounts.user.key(), ErrorCode::NotAuthority);

        proposal.revision_count = proposal.revision_count.checked_add(1).unwrap();
        proposal.proposal_text = revision_text.clone();

        let revision = &mut ctx.accounts.revision;
        revision.proposal = proposal.key();
        revision.revision_number = revision_number;
        revision.text = revision_text;

        Ok(())
    }

    pub fn cast_vote(ctx: Context<CastVote>, choice: u8) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        require!(proposal.status == 0, ErrorCode::AlreadyFinalized);
        require!(choice >= 1 && choice <= 3, ErrorCode::BadVoteChoice);

        match choice {
            1 => proposal.votes_for = proposal.votes_for.checked_add(1).unwrap(),
            2 => proposal.votes_against = proposal.votes_against.checked_add(1).unwrap(),
            3 => proposal.votes_abstain = proposal.votes_abstain.checked_add(1).unwrap(),
            _ => {}
        }

        let record = &mut ctx.accounts.vote_record;
        record.proposal = proposal.key();
        record.voter = ctx.accounts.voter.key();
        record.choice = choice;

        Ok(())
    }

    pub fn submit_judge_result(ctx: Context<SubmitJudgeResult>, verdict: u8) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        require!(proposal.status == 0, ErrorCode::AlreadyFinalized);
        require!(verdict >= 1 && verdict <= 3, ErrorCode::BadJudgeVerdict);

        let total = proposal.judge_approve as u16
            + proposal.judge_reject as u16
            + proposal.judge_needs as u16;
        require!(total < 3, ErrorCode::TooManyJudges);

        match verdict {
            1 => proposal.judge_approve = proposal.judge_approve.saturating_add(1),
            2 => proposal.judge_reject = proposal.judge_reject.saturating_add(1),
            3 => proposal.judge_needs = proposal.judge_needs.saturating_add(1),
            _ => {}
        }

        let result = &mut ctx.accounts.judge_result;
        result.proposal = proposal.key();
        result.judge = ctx.accounts.judge.key();
        result.verdict = verdict;

        Ok(())
    }

    pub fn finalize_consensus(ctx: Context<FinalizeConsensus>) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        require!(proposal.status == 0, ErrorCode::AlreadyFinalized);

        let total = proposal.judge_approve as u16
            + proposal.judge_reject as u16
            + proposal.judge_needs as u16;
        require!(total == 3, ErrorCode::NotEnoughJudges);

        let verdict = if proposal.judge_approve >= 2 {
            1
        } else if proposal.judge_reject >= 2 {
            2
        } else {
            3
        };

        proposal.final_verdict = verdict;
        proposal.status = 1;

        let action = &mut ctx.accounts.action_request;
        action.proposal = proposal.key();
        action.status = if verdict == 1 { 0 } else { 2 };
        action.amount_lamports = ACTION_LAMPORTS;
        action.recipient = proposal.authority;
        action.executor = Pubkey::default();

        Ok(())
    }

    pub fn complete_action(ctx: Context<CompleteAction>) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        require!(proposal.final_verdict == 1, ErrorCode::ActionNotApproved);

        let action = &mut ctx.accounts.action_request;
        require!(action.status == 0, ErrorCode::ActionNotPending);
        require_keys_eq!(action.recipient, ctx.accounts.recipient.key(), ErrorCode::BadRecipient);

        let bump = ctx.bumps.treasury_vault;
        let signer_seeds: &[&[u8]] = &[b"treasury_vault", &[bump]];
        let signer = &[signer_seeds];

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.treasury_vault.to_account_info(),
                to: ctx.accounts.recipient.to_account_info(),
            },
            signer,
        );
        system_program::transfer(cpi_ctx, action.amount_lamports)?;

        action.status = 1;
        action.executor = ctx.accounts.executor.key();

        Ok(())
    }

    pub fn create_match(
        ctx: Context<CreateMatch>,
        match_type: u8,
        criteria: String,
        input_a: String,
        input_b: String,
        extra: String,
        stake_lamports: u64,
        nonce: u64,
    ) -> Result<()> {
        require!(match_type >= 1 && match_type <= 3, ErrorCode::BadMatchType);
        require!(
            criteria.as_bytes().len() <= MAX_CRITERIA_LEN,
            ErrorCode::MatchTextTooLong
        );
        require!(
            input_a.as_bytes().len() <= MAX_INPUT_LEN,
            ErrorCode::MatchTextTooLong
        );
        require!(
            input_b.as_bytes().len() <= MAX_INPUT_LEN,
            ErrorCode::MatchTextTooLong
        );
        require!(
            extra.as_bytes().len() <= MAX_MATCH_EXTRA_LEN,
            ErrorCode::MatchTextTooLong
        );
        require!(stake_lamports > 0, ErrorCode::BadStake);
        require_keys_neq!(
            ctx.accounts.player_a.key(),
            ctx.accounts.player_b.key(),
            ErrorCode::BadMatchPlayer
        );

        let rent = Rent::get()?;
        let lamports = rent.minimum_balance(0);
        let bump = ctx.bumps.match_escrow;
        let match_key = ctx.accounts.game_match.key();
        let signer_seeds: &[&[u8]] = &[b"match_escrow", match_key.as_ref(), &[bump]];
        let signer = &[signer_seeds];
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            system_program::CreateAccount {
                from: ctx.accounts.player_a.to_account_info(),
                to: ctx.accounts.match_escrow.to_account_info(),
            },
            signer,
        );
        system_program::create_account(cpi_ctx, lamports, 0, &system_program::ID)?;

        let cpi_ctx_a = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.player_a.to_account_info(),
                to: ctx.accounts.match_escrow.to_account_info(),
            },
        );
        system_program::transfer(cpi_ctx_a, stake_lamports)?;

        let cpi_ctx_b = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.player_b.to_account_info(),
                to: ctx.accounts.match_escrow.to_account_info(),
            },
        );
        system_program::transfer(cpi_ctx_b, stake_lamports)?;

        let m = &mut ctx.accounts.game_match;
        m.player_a = ctx.accounts.player_a.key();
        m.player_b = ctx.accounts.player_b.key();
        m.status = 0;
        m.nonce = nonce;
        m.match_type = match_type;
        m.stake_lamports = stake_lamports;
        m.verdict = 0;
        m.prompt_hash = [0u8; 32];
        m.receipt_root = [0u8; 32];
        m.model_id = String::new();
        m.criteria = criteria;
        m.input_a = input_a;
        m.input_b = input_b;
        m.extra = extra;
        m.executor = Pubkey::default();

        Ok(())
    }

    pub fn finalize_match(
        ctx: Context<FinalizeMatch>,
        verdict: u8,
        receipt_root: [u8; 32],
        prompt_hash: [u8; 32],
        model_id: String,
    ) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.config.relayer,
            ctx.accounts.relayer.key(),
            ErrorCode::BadRelayer
        );
        let m = &mut ctx.accounts.game_match;
        require!(m.status == 0, ErrorCode::MatchAlreadyFinalized);
        require!(verdict >= 1 && verdict <= 3, ErrorCode::BadMatchVerdict);
        require!(
            model_id.as_bytes().len() <= MAX_MODEL_ID_LEN,
            ErrorCode::ModelIdTooLong
        );

        m.verdict = verdict;
        m.receipt_root = receipt_root;
        m.prompt_hash = prompt_hash;
        m.model_id = model_id;
        m.status = 1;

        Ok(())
    }

    pub fn execute_match(ctx: Context<ExecuteMatch>) -> Result<()> {
        let m = &mut ctx.accounts.game_match;
        require!(m.status == 1, ErrorCode::MatchNotFinalized);
        require_keys_eq!(m.player_a, ctx.accounts.player_a.key(), ErrorCode::BadMatchPlayer);
        require_keys_eq!(m.player_b, ctx.accounts.player_b.key(), ErrorCode::BadMatchPlayer);

        let rent = Rent::get()?.minimum_balance(0);
        let total = m.stake_lamports.checked_mul(2).unwrap();
        let escrow_balance = ctx.accounts.match_escrow.lamports();
        require!(escrow_balance >= rent + total, ErrorCode::EscrowBalanceLow);

        let bump = ctx.bumps.match_escrow;
        let match_key = m.key();
        let signer_seeds: &[&[u8]] = &[b"match_escrow", match_key.as_ref(), &[bump]];
        let signer = &[signer_seeds];

        if m.verdict == 1 {
            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.match_escrow.to_account_info(),
                    to: ctx.accounts.player_a.to_account_info(),
                },
                signer,
            );
            system_program::transfer(cpi_ctx, total)?;
        } else if m.verdict == 2 {
            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.match_escrow.to_account_info(),
                    to: ctx.accounts.player_b.to_account_info(),
                },
                signer,
            );
            system_program::transfer(cpi_ctx, total)?;
        } else {
            let cpi_ctx_a = CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.match_escrow.to_account_info(),
                    to: ctx.accounts.player_a.to_account_info(),
                },
                signer,
            );
            system_program::transfer(cpi_ctx_a, m.stake_lamports)?;
            let cpi_ctx_b = CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.match_escrow.to_account_info(),
                    to: ctx.accounts.player_b.to_account_info(),
                },
                signer,
            );
            system_program::transfer(cpi_ctx_b, m.stake_lamports)?;
        }

        m.status = 2;
        m.executor = ctx.accounts.executor.key();

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
#[instruction(source: String, proposal_id: String, proposal_text: String, nonce: u64)]
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

#[derive(Accounts)]
pub struct InitTreasury<'info> {
    #[account(
        init,
        payer = payer,
        space = Treasury::space(),
        seeds = [b"treasury"],
        bump
    )]
    pub treasury: Account<'info, Treasury>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FundTreasury<'info> {
    #[account(
        seeds = [b"treasury"],
        bump = treasury.bump
    )]
    pub treasury: Account<'info, Treasury>,
    #[account(
        mut,
        seeds = [b"treasury_vault"],
        bump
    )]
    pub treasury_vault: SystemAccount<'info>,
    #[account(mut)]
    pub funder: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(proposal_text: String, revision_number: u64, nonce: u64)]
pub struct CreateGovernanceProposal<'info> {
    #[account(
        init,
        payer = user,
        space = Proposal::space(),
        seeds = [b"proposal_v2", user.key().as_ref(), &nonce.to_le_bytes()],
        bump
    )]
    pub proposal: Account<'info, Proposal>,
    #[account(
        init,
        payer = user,
        space = ProposalRevision::space(),
        seeds = [b"revision", proposal.key().as_ref(), &revision_number.to_le_bytes()],
        bump
    )]
    pub revision: Account<'info, ProposalRevision>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(revision_number: u64, revision_text: String)]
pub struct AddRevision<'info> {
    #[account(mut)]
    pub proposal: Account<'info, Proposal>,
    #[account(
        init,
        payer = user,
        space = ProposalRevision::space(),
        seeds = [b"revision", proposal.key().as_ref(), &revision_number.to_le_bytes()],
        bump
    )]
    pub revision: Account<'info, ProposalRevision>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CastVote<'info> {
    #[account(mut)]
    pub proposal: Account<'info, Proposal>,
    #[account(
        init,
        payer = voter,
        space = VoteRecord::space(),
        seeds = [b"vote", proposal.key().as_ref(), voter.key().as_ref()],
        bump
    )]
    pub vote_record: Account<'info, VoteRecord>,
    #[account(mut)]
    pub voter: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SubmitJudgeResult<'info> {
    #[account(mut)]
    pub proposal: Account<'info, Proposal>,
    #[account(
        init,
        payer = payer,
        space = JudgeResult::space(),
        seeds = [b"judge", proposal.key().as_ref(), judge.key().as_ref()],
        bump
    )]
    pub judge_result: Account<'info, JudgeResult>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub judge: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FinalizeConsensus<'info> {
    #[account(mut)]
    pub proposal: Account<'info, Proposal>,
    #[account(
        init,
        payer = finalizer,
        space = ActionRequest::space(),
        seeds = [b"action", proposal.key().as_ref()],
        bump
    )]
    pub action_request: Account<'info, ActionRequest>,
    #[account(mut)]
    pub finalizer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CompleteAction<'info> {
    #[account(mut)]
    pub proposal: Account<'info, Proposal>,
    #[account(
        mut,
        seeds = [b"action", proposal.key().as_ref()],
        bump
    )]
    pub action_request: Account<'info, ActionRequest>,
    #[account(
        seeds = [b"treasury"],
        bump = treasury.bump
    )]
    pub treasury: Account<'info, Treasury>,
    #[account(
        mut,
        seeds = [b"treasury_vault"],
        bump
    )]
    pub treasury_vault: SystemAccount<'info>,
    #[account(mut)]
    pub recipient: SystemAccount<'info>,
    #[account(mut)]
    pub executor: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(match_type: u8, criteria: String, input_a: String, input_b: String, extra: String, stake_lamports: u64, nonce: u64)]
pub struct CreateMatch<'info> {
    #[account(
        init,
        payer = player_a,
        space = Match::space(),
        seeds = [b"match", player_a.key().as_ref(), &nonce.to_le_bytes()],
        bump
    )]
    pub game_match: Account<'info, Match>,
    #[account(
        mut,
        seeds = [b"match_escrow", game_match.key().as_ref()],
        bump
    )]
    /// CHECK: PDA system account created via create_account; no data is stored.
    pub match_escrow: UncheckedAccount<'info>,
    #[account(mut)]
    pub player_a: Signer<'info>,
    #[account(mut)]
    pub player_b: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FinalizeMatch<'info> {
    #[account(
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub game_match: Account<'info, Match>,
    pub relayer: Signer<'info>,
}

#[derive(Accounts)]
pub struct ExecuteMatch<'info> {
    #[account(mut)]
    pub game_match: Account<'info, Match>,
    #[account(
        mut,
        seeds = [b"match_escrow", game_match.key().as_ref()],
        bump
    )]
    /// CHECK: PDA system account created via create_account; no data is stored.
    pub match_escrow: UncheckedAccount<'info>,
    #[account(mut)]
    pub player_a: SystemAccount<'info>,
    #[account(mut)]
    pub player_b: SystemAccount<'info>,
    #[account(mut)]
    pub executor: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitTreasuryVault<'info> {
    #[account(
        mut,
        seeds = [b"treasury_vault"],
        bump
    )]
    /// CHECK: PDA system account created via create_account; no data is stored.
    pub treasury_vault: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
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

    pub source: String,
    pub proposal_id: String,
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
        + 4 + MAX_SOURCE_LEN
        + 4 + MAX_PROPOSAL_ID_LEN
        + 4 + MAX_PROPOSAL_TEXT_LEN
    }
}

#[account]
pub struct Treasury {
    pub bump: u8,
}

impl Treasury {
    pub fn space() -> usize {
        8 + 1
    }
}

#[account]
pub struct Proposal {
    pub authority: Pubkey,
    pub status: u8,
    pub nonce: u64,
    pub revision_count: u64,
    pub votes_for: u64,
    pub votes_against: u64,
    pub votes_abstain: u64,
    pub judge_approve: u8,
    pub judge_reject: u8,
    pub judge_needs: u8,
    pub final_verdict: u8,
    pub proposal_text: String,
}

impl Proposal {
    pub fn space() -> usize {
        8
        + 32
        + 1
        + 8
        + 8
        + 8
        + 8
        + 8
        + 1
        + 1
        + 1
        + 1
        + 4 + MAX_GOV_PROPOSAL_TEXT_LEN
    }
}

#[account]
pub struct ProposalRevision {
    pub proposal: Pubkey,
    pub revision_number: u64,
    pub text: String,
}

impl ProposalRevision {
    pub fn space() -> usize {
        8
        + 32
        + 8
        + 4 + MAX_REVISION_TEXT_LEN
    }
}

#[account]
pub struct VoteRecord {
    pub proposal: Pubkey,
    pub voter: Pubkey,
    pub choice: u8,
}

impl VoteRecord {
    pub fn space() -> usize {
        8
        + 32
        + 32
        + 1
    }
}

#[account]
pub struct JudgeResult {
    pub proposal: Pubkey,
    pub judge: Pubkey,
    pub verdict: u8,
}

impl JudgeResult {
    pub fn space() -> usize {
        8
        + 32
        + 32
        + 1
    }
}

#[account]
pub struct ActionRequest {
    pub proposal: Pubkey,
    pub status: u8,
    pub amount_lamports: u64,
    pub recipient: Pubkey,
    pub executor: Pubkey,
}

impl ActionRequest {
    pub fn space() -> usize {
        8
        + 32
        + 1
        + 8
        + 32
        + 32
    }
}

#[account]
pub struct Match {
    pub player_a: Pubkey,
    pub player_b: Pubkey,
    pub status: u8,
    pub nonce: u64,
    pub match_type: u8,
    pub stake_lamports: u64,
    pub verdict: u8,
    pub prompt_hash: [u8; 32],
    pub receipt_root: [u8; 32],
    pub model_id: String,
    pub criteria: String,
    pub input_a: String,
    pub input_b: String,
    pub extra: String,
    pub executor: Pubkey,
}

impl Match {
    pub fn space() -> usize {
        8
        + 32
        + 32
        + 1
        + 8
        + 1
        + 8
        + 1
        + 32
        + 32
        + 4 + MAX_MODEL_ID_LEN
        + 4 + MAX_CRITERIA_LEN
        + 4 + MAX_INPUT_LEN
        + 4 + MAX_INPUT_LEN
        + 4 + MAX_MATCH_EXTRA_LEN
        + 32
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
    #[msg("Source too long")]
    SourceTooLong,
    #[msg("Proposal id too long")]
    ProposalIdTooLong,
    #[msg("Governance text too long")]
    GovernanceTextTooLong,
    #[msg("Bad revision number")]
    BadRevisionNumber,
    #[msg("Bad vote choice")]
    BadVoteChoice,
    #[msg("Bad judge verdict")]
    BadJudgeVerdict,
    #[msg("Already finalized")]
    AlreadyFinalized,
    #[msg("Not enough judges")]
    NotEnoughJudges,
    #[msg("Too many judges")]
    TooManyJudges,
    #[msg("Action not approved")]
    ActionNotApproved,
    #[msg("Action not pending")]
    ActionNotPending,
    #[msg("Bad recipient")]
    BadRecipient,
    #[msg("Not authority")]
    NotAuthority,
    #[msg("Bad match type")]
    BadMatchType,
    #[msg("Match text too long")]
    MatchTextTooLong,
    #[msg("Bad stake amount")]
    BadStake,
    #[msg("Match already finalized")]
    MatchAlreadyFinalized,
    #[msg("Match not finalized")]
    MatchNotFinalized,
    #[msg("Bad match verdict")]
    BadMatchVerdict,
    #[msg("Bad match player")]
    BadMatchPlayer,
    #[msg("Escrow balance too low")]
    EscrowBalanceLow,
}
