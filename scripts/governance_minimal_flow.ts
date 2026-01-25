import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { getProgram } from "./anchor";
import {
  createProposalWithRevisionAndVote,
  ensureTreasury,
  fetchGovernanceState,
  logGovernanceState,
} from "./governance";
import {
  ACTION_LAMPORTS,
  JUDGE_LAMPORTS,
  TREASURY_FUND_LAMPORTS,
} from "./constants";

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

async function main() {
  const { provider, program } = getProgram();
  const user = provider.wallet.publicKey;

  await ensureTreasury(program as any, provider, 0, 0);
  await program.methods
    .fundTreasury(new anchor.BN(TREASURY_FUND_LAMPORTS))
    .accounts({
      funder: user,
    })
    .rpc();

  const proposalText =
    "Minimal proposal: fund an automation action after approval.";
  const revisionText = "Revision 1: clarify the action recipient.";
  const { proposalPda } = await createProposalWithRevisionAndVote(
    program as any,
    user,
    proposalText,
    revisionText,
    1
  );

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

  const state = await fetchGovernanceState(program as any, proposalPda);
  logGovernanceState(proposalPda, state);
  console.log("expected_action_lamports:", ACTION_LAMPORTS);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
