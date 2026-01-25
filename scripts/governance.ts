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
