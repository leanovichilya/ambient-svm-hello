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
  const [treasuryPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    programId
  );
  return treasuryPda;
}

export function getTreasuryVaultPda(
  programId: anchor.web3.PublicKey
): anchor.web3.PublicKey {
  const [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("treasury_vault")],
    programId
  );
  return vaultPda;
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
  const proposal = await program.account.proposal.fetch(proposalPda);
  const actionPda = getActionPda(program.programId, proposalPda);
  let action: any | null = null;
  try {
    action = await program.account.actionRequest.fetch(actionPda);
  } catch {
    action = null;
  }
  const vaultPda = getTreasuryVaultPda(program.programId);
  const vaultLamports =
    (await program.provider.connection.getAccountInfo(vaultPda))?.lamports ?? 0;
  return { proposal, action, actionPda, vaultPda, vaultLamports };
}
