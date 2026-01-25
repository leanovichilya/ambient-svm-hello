import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { AmbientApiError, callAmbient } from "./ambient";
import { getProgram } from "./anchor";
import { ensureTreasury, extractVotesSummary, getProposalText } from "./governance";
import { buildJudgePrompt } from "./prompts";
import {
  getArgOrExit,
  getModelIdOrExit,
  logReceipt,
  normalizeVerdict,
  parseJsonBlock,
  requireEnv,
  usage,
} from "./utils";
import { ACTION_LAMPORTS, TREASURY_TOPUP_LAMPORTS } from "./constants";

function parseResponse(text: string): number {
  const parsed: any = parseJsonBlock(text);
  if (!parsed?.verdict) {
    throw new Error("Missing verdict in model response");
  }
  return normalizeVerdict(String(parsed.verdict));
}

async function main() {
  const proposalPdaStr = getArgOrExit(
    usage("ai_judge_consensus.ts", "<PROPOSAL_PDA>")
  );

  const AMBIENT_API_KEY = requireEnv("AMBIENT_API_KEY");
  const MODEL_ID = getModelIdOrExit();

  const { provider, program } = getProgram();
  const user = provider.wallet.publicKey;
  const proposalPda = new anchor.web3.PublicKey(proposalPdaStr);
  const proposal = await program.account.proposal.fetch(proposalPda);

  if (proposal.status !== 0) {
    console.error(`Proposal already finalized. status=${proposal.status}`);
    process.exit(1);
  }

  const votes = extractVotesSummary(proposal as any);
  const prompt = buildJudgePrompt(getProposalText(proposal), votes);

  await ensureTreasury(
    program as any,
    provider,
    ACTION_LAMPORTS,
    TREASURY_TOPUP_LAMPORTS
  );

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

    const verdictCode = parseResponse(responseText);
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

  console.log("proposal:", proposalPda.toBase58());
  console.log("final_verdict:", updated.finalVerdict);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
