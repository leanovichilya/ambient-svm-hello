import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { AmbientApiError, callAmbient } from "./ambient";
import { getProgram } from "./anchor";
import {
  createProposalWithRevisionAndVote,
  ensureTreasury,
  fetchGovernanceState,
} from "./governance";
import { buildJudgePrompt } from "./prompts";
import {
  ACTION_LAMPORTS,
  TREASURY_TOPUP_LAMPORTS,
} from "./constants";
import {
  getModelIdOrExit,
  logReceipt,
  normalizeVerdict,
  parseJsonBlock,
  requireEnv,
} from "./utils";

function parseVerdict(text: string): number {
  const parsed: any = parseJsonBlock(text);
  if (!parsed?.verdict) {
    throw new Error("Missing verdict in model response");
  }
  return normalizeVerdict(String(parsed.verdict));
}

async function main() {
  const AMBIENT_API_KEY = requireEnv("AMBIENT_API_KEY");
  const MODEL_ID = getModelIdOrExit();

  const { provider, program } = getProgram();
  const user = provider.wallet.publicKey;

  await ensureTreasury(
    program as any,
    provider,
    ACTION_LAMPORTS,
    TREASURY_TOPUP_LAMPORTS
  );

  const proposalText = "Demo proposal: execute on-chain action after approval.";
  const revisionText = "Revision 1: clarify the action recipient.";
  const { proposalPda } = await createProposalWithRevisionAndVote(
    program as any,
    user,
    proposalText,
    revisionText,
    1
  );

  const proposal = await program.account.proposal.fetch(proposalPda);
  const votes = {
    for: proposal.votesFor?.toNumber?.() ?? 0,
    against: proposal.votesAgainst?.toNumber?.() ?? 0,
    abstain: proposal.votesAbstain?.toNumber?.() ?? 0,
  };
  const prompt = buildJudgePrompt(String(proposal.proposalText || ""), votes);

  const judges = [
    anchor.web3.Keypair.generate(),
    anchor.web3.Keypair.generate(),
    anchor.web3.Keypair.generate(),
  ];

  for (let i = 0; i < judges.length; i++) {
    let ambientResult;
    try {
      ambientResult = await callAmbient(prompt, MODEL_ID, AMBIENT_API_KEY);
    } catch (e) {
      if (e instanceof AmbientApiError && (e.status === 429 || e.status === 500)) {
        console.error(`Ambient API ${e.status}`);
        process.exit(1);
      }
      throw e;
    }

    const { responseText, receiptPresent, receiptRootBytes } = ambientResult;
    if (!responseText) {
      console.error("Empty model response");
      process.exit(1);
    }

    const verdictCode = parseVerdict(responseText);
    await program.methods
      .submitJudgeResult(verdictCode)
      .accounts({
        proposal: proposalPda,
        payer: user,
        judge: judges[i].publicKey,
      })
      .signers([judges[i]])
      .rpc();

    console.log(`judge_${i + 1}_verdict:`, verdictCode);
    logReceipt(`judge_${i + 1}`, receiptPresent, receiptRootBytes);
  }

  await program.methods
    .finalizeConsensus()
    .accounts({
      proposal: proposalPda,
      finalizer: user,
    })
    .rpc();

  const updated = await program.account.proposal.fetch(proposalPda);
  if (updated.finalVerdict === 1) {
    await program.methods
      .completeAction()
      .accounts({
        proposal: proposalPda,
        recipient: updated.authority,
        executor: user,
      })
      .rpc();
  }

  const state = await fetchGovernanceState(program as any, proposalPda);
  console.log("proposal:", proposalPda.toBase58());
  console.log("final_verdict:", state.proposal.finalVerdict);
  console.log("action_request:", state.actionPda.toBase58());
  if (state.action) {
    console.log("action_status:", state.action.status);
    console.log("action_amount_lamports:", state.action.amountLamports);
    console.log("action_recipient:", state.action.recipient.toBase58());
    console.log("action_executor:", state.action.executor.toBase58());
  } else {
    console.log("action_status: not_found");
  }
  console.log("treasury_vault:", state.vaultPda.toBase58());
  console.log("treasury_vault_lamports:", state.vaultLamports);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
