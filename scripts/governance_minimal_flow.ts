import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { getProgram } from "./anchor";

const TREASURY_LAMPORTS = 2_000_000;
const ACTION_LAMPORTS = 1_000_000;
const JUDGE_LAMPORTS = 2_000_000;

async function fundWallet(
  provider: anchor.AnchorProvider,
  to: anchor.web3.PublicKey,
  lamports: number
) {
  const tx = new anchor.web3.Transaction().add(
    anchor.web3.SystemProgram.transfer({
      fromPubkey: provider.wallet.publicKey,
      toPubkey: to,
      lamports,
    })
  );
  await provider.sendAndConfirm(tx, []);
}

async function ensureTreasury(program: anchor.Program, provider: anchor.AnchorProvider) {
  const [treasuryPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    program.programId
  );
  const [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("treasury_vault")],
    program.programId
  );
  const info = await provider.connection.getAccountInfo(treasuryPda);
  if (!info) {
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
        payer: provider.wallet.publicKey,
      })
      .rpc();
  }
  return treasuryPda;
}

async function main() {
  const { provider, program } = getProgram();
  const user = provider.wallet.publicKey;

  await ensureTreasury(program as any, provider);
  await program.methods
    .fundTreasury(new anchor.BN(TREASURY_LAMPORTS))
    .accounts({
      funder: user,
    })
    .rpc();

  const proposalText =
    "Minimal proposal: fund an automation action after approval.";
  const nonce = new anchor.BN(Date.now());
  const [proposalPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("proposal_v2"), user.toBuffer(), nonce.toArrayLike(Buffer, "le", 8)],
    program.programId
  );

  await program.methods
    .createGovernanceProposal(proposalText, new anchor.BN(0), nonce)
    .accounts({
      user,
    })
    .rpc();

  const revisionText = "Revision 1: clarify the action recipient.";
  await program.methods
    .addRevision(new anchor.BN(1), revisionText)
    .accounts({
      proposal: proposalPda,
      user,
    })
    .rpc();

  await program.methods
    .castVote(1)
    .accounts({
      proposal: proposalPda,
      voter: user,
    })
    .rpc();

  const judges = [
    anchor.web3.Keypair.generate(),
    anchor.web3.Keypair.generate(),
    anchor.web3.Keypair.generate(),
  ];
  for (const judge of judges) {
    await fundWallet(provider, judge.publicKey, JUDGE_LAMPORTS);
  }

  await program.methods
    .submitJudgeResult(1)
    .accounts({
      proposal: proposalPda,
      payer: user,
      judge: judges[0].publicKey,
    })
    .signers([judges[0]])
    .rpc();

  await program.methods
    .submitJudgeResult(1)
    .accounts({
      proposal: proposalPda,
      payer: user,
      judge: judges[1].publicKey,
    })
    .signers([judges[1]])
    .rpc();

  await program.methods
    .submitJudgeResult(2)
    .accounts({
      proposal: proposalPda,
      payer: user,
      judge: judges[2].publicKey,
    })
    .signers([judges[2]])
    .rpc();

  await program.methods
    .finalizeConsensus()
    .accounts({
      proposal: proposalPda,
      finalizer: user,
    })
    .rpc();

  await program.methods
    .completeAction()
    .accounts({
      proposal: proposalPda,
      recipient: user,
      executor: user,
    })
    .rpc();

  const proposal = await program.account.proposal.fetch(proposalPda);
  const [actionPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("action"), proposalPda.toBuffer()],
    program.programId
  );
  const action = await program.account.actionRequest.fetch(actionPda);

  console.log("proposal:", proposalPda.toBase58());
  console.log("final_verdict:", proposal.finalVerdict);
  console.log("action_request:", actionPda.toBase58());
  console.log("action_status:", action.status);
  console.log("action_amount_lamports:", action.amountLamports);
  console.log("action_recipient:", action.recipient.toBase58());
  console.log("action_executor:", action.executor.toBase58());
  console.log("expected_action_lamports:", ACTION_LAMPORTS);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
