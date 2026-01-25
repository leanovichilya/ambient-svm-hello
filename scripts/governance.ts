import * as anchor from "@coral-xyz/anchor";

export function getProposalPda(
  programId: anchor.web3.PublicKey,
  authority: anchor.web3.PublicKey,
  nonce: anchor.BN
): anchor.web3.PublicKey {
  const [proposalPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("proposal_v2"), authority.toBuffer(), nonce.toArrayLike(Buffer, "le", 8)],
    programId
  );
  return proposalPda;
}

type TreasuryCache = { treasuryPda: anchor.web3.PublicKey; vaultPda: anchor.web3.PublicKey };
const treasuryCache = new Map<string, TreasuryCache>();

function getTreasuryCache(programId: anchor.web3.PublicKey): TreasuryCache {
  const key = programId.toBase58();
  const cached = treasuryCache.get(key);
  if (cached) return cached;
  const [treasuryPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    programId
  );
  const [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("treasury_vault")],
    programId
  );
  const value = { treasuryPda, vaultPda };
  treasuryCache.set(key, value);
  return value;
}

export function getActionPda(
  programId: anchor.web3.PublicKey,
  proposalPda: anchor.web3.PublicKey
): anchor.web3.PublicKey {
  const [actionPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("action"), proposalPda.toBuffer()],
    programId
  );
  return actionPda;
}

export function getTreasuryPda(programId: anchor.web3.PublicKey): anchor.web3.PublicKey {
  return getTreasuryCache(programId).treasuryPda;
}

export function getTreasuryVaultPda(
  programId: anchor.web3.PublicKey
): anchor.web3.PublicKey {
  return getTreasuryCache(programId).vaultPda;
}

export async function ensureTreasury(
  program: anchor.Program,
  provider: anchor.AnchorProvider,
  minVaultLamports: number,
  topupLamports: number
): Promise<{ treasuryPda: anchor.web3.PublicKey; vaultPda: anchor.web3.PublicKey }> {
  const treasuryPda = getTreasuryPda(program.programId);
  const vaultPda = getTreasuryVaultPda(program.programId);
  const treasuryInfo = await provider.connection.getAccountInfo(treasuryPda);
  if (!treasuryInfo) {
    await program.methods
      .initTreasury()
      .accounts({
        payer: provider.wallet.publicKey,
      })
      .rpc();
  }
  const vaultInfo = await provider.connection.getAccountInfo(vaultPda);
  if (!vaultInfo) {
    await program.methods
      .initTreasuryVault()
      .accounts({
        treasuryVault: vaultPda,
        payer: provider.wallet.publicKey,
      })
      .rpc();
  }
  if (minVaultLamports > 0 && topupLamports > 0) {
    const vaultBalance = (await provider.connection.getAccountInfo(vaultPda))?.lamports ?? 0;
    if (vaultBalance < minVaultLamports) {
      await program.methods
        .fundTreasury(new anchor.BN(topupLamports))
        .accounts({
          treasuryVault: vaultPda,
          funder: provider.wallet.publicKey,
        })
        .rpc();
    }
  }
  return { treasuryPda, vaultPda };
}

export async function createProposalWithRevisionAndVote(
  program: anchor.Program,
  authority: anchor.web3.PublicKey,
  proposalText: string,
  revisionText: string,
  voteChoice: number,
  nonce?: anchor.BN
): Promise<{ proposalPda: anchor.web3.PublicKey; nonce: anchor.BN }> {
  const usedNonce = nonce ?? new anchor.BN(Date.now());
  const proposalPda = getProposalPda(program.programId, authority, usedNonce);

  await program.methods
    .createGovernanceProposal(proposalText, new anchor.BN(0), usedNonce)
    .accounts({
      user: authority,
    })
    .rpc();

  await program.methods
    .addRevision(new anchor.BN(1), revisionText)
    .accounts({
      proposal: proposalPda,
      user: authority,
    })
    .rpc();

  await program.methods
    .castVote(voteChoice)
    .accounts({
      proposal: proposalPda,
      voter: authority,
    })
    .rpc();

  return { proposalPda, nonce: usedNonce };
}

export async function fetchGovernanceState(
  program: anchor.Program,
  proposalPda: anchor.web3.PublicKey
): Promise<{
  proposal: any;
  action: any | null;
  actionPda: anchor.web3.PublicKey;
  vaultPda: anchor.web3.PublicKey;
  vaultLamports: number;
}> {
  const accountNs: any = (program as any).account;
  const proposal = await accountNs.proposal.fetch(proposalPda);
  const actionPda = getActionPda(program.programId, proposalPda);
  let action: any | null = null;
  try {
    action = await accountNs.actionRequest.fetch(actionPda);
  } catch {
    action = null;
  }
  const vaultPda = getTreasuryVaultPda(program.programId);
  const vaultLamports =
    (await program.provider.connection.getAccountInfo(vaultPda))?.lamports ?? 0;
  return { proposal, action, actionPda, vaultPda, vaultLamports };
}

export function getProposalText(proposal: { proposalText?: unknown }): string {
  return String(proposal?.proposalText ?? "");
}

export function extractVotesSummary(proposal: {
  votesFor?: any;
  votesAgainst?: any;
  votesAbstain?: any;
}): { for: number; against: number; abstain: number } {
  const toNum = (v: any): number => (v?.toNumber ? v.toNumber() : Number(v || 0));
  return {
    for: toNum(proposal.votesFor),
    against: toNum(proposal.votesAgainst),
    abstain: toNum(proposal.votesAbstain),
  };
}

export function logGovernanceState(
  proposalPda: anchor.web3.PublicKey,
  state: {
    proposal: any;
    action: any | null;
    actionPda: anchor.web3.PublicKey;
    vaultPda: anchor.web3.PublicKey;
    vaultLamports: number;
  }
): void {
  const { proposal, action, actionPda, vaultPda, vaultLamports } = state;
  console.log("proposal:", proposalPda.toBase58());
  console.log("authority:", proposal.authority.toBase58());
  console.log("status:", proposal.status);
  console.log("revision_count:", proposal.revisionCount);
  console.log("votes_for:", proposal.votesFor);
  console.log("votes_against:", proposal.votesAgainst);
  console.log("votes_abstain:", proposal.votesAbstain);
  console.log("judge_approve:", proposal.judgeApprove);
  console.log("judge_reject:", proposal.judgeReject);
  console.log("judge_needs:", proposal.judgeNeeds);
  console.log("final_verdict:", proposal.finalVerdict);
  console.log("proposal_text:", proposal.proposalText);
  console.log("action_request:", actionPda.toBase58());
  if (action) {
    console.log("action_status:", action.status);
    console.log("action_amount_lamports:", action.amountLamports);
    console.log("action_recipient:", action.recipient.toBase58());
    console.log("action_executor:", action.executor.toBase58());
  } else {
    console.log("action_status: not_found");
  }
  console.log("treasury_vault:", vaultPda.toBase58());
  console.log("treasury_vault_lamports:", vaultLamports);
}
