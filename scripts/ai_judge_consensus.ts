import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { AmbientApiError, callAmbient } from "./ambient";
import { getProgram } from "./anchor";
import { ensureTreasury } from "./governance";
import { getArgOrExit, normalizeVerdict, parseJsonBlock } from "./utils";

const TREASURY_TOPUP = 2_000_000;
const ACTION_LAMPORTS = 1_000_000;

function buildJudgePrompt(
  proposalText: string,
  votes: { for: number; against: number; abstain: number }
): string {
  return [
    "You are an AI governance judge. Evaluate the proposal under a verification-first mindset.",
    "Return JSON only, with no extra text or markdown.",
    "",
    "Schema:",
    "{",
    "\"verdict\": \"approve\" | \"reject\" | \"needs_more_info\",",
    "\"reason\": \"1-3 sentences\"",
    "}",
    "",
    "Rules:",
    "Use \"needs_more_info\" when key details are missing.",
    "Do not invent facts.",
    "",
    `Votes summary: for=${votes.for}, against=${votes.against}, abstain=${votes.abstain}`,
    "",
    "Proposal:",
    proposalText,
  ].join("\n");
}

function parseResponse(text: string): number {
  const parsed: any = parseJsonBlock(text);
  if (!parsed?.verdict) {
    throw new Error("Missing verdict in model response");
  }
  return normalizeVerdict(String(parsed.verdict));
}

async function main() {
  const proposalPdaStr = getArgOrExit(
    "Usage: yarn ts-node scripts/ai_judge_consensus.ts <PROPOSAL_PDA>"
  );

  const AMBIENT_API_KEY = process.env.AMBIENT_API_KEY;
  if (!AMBIENT_API_KEY) {
    console.error("Missing AMBIENT_API_KEY in env");
    process.exit(1);
  }
  const MODEL_ID = process.env.AMBIENT_MODEL_ID || "ambient-1";
  if (MODEL_ID.length > 64) {
    console.error("AMBIENT_MODEL_ID too long");
    process.exit(1);
  }

  const { provider, program } = getProgram();
  const user = provider.wallet.publicKey;
  const proposalPda = new anchor.web3.PublicKey(proposalPdaStr);
  const proposal = await program.account.proposal.fetch(proposalPda);

  if (proposal.status !== 0) {
    console.error(`Proposal already finalized. status=${proposal.status}`);
    process.exit(1);
  }

  const votes = {
    for: proposal.votesFor?.toNumber?.() ?? 0,
    against: proposal.votesAgainst?.toNumber?.() ?? 0,
    abstain: proposal.votesAbstain?.toNumber?.() ?? 0,
  };
  const prompt = buildJudgePrompt(String(proposal.proposalText || ""), votes);

  await ensureTreasury(program as any, provider, ACTION_LAMPORTS, TREASURY_TOPUP);

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
    console.log(`judge_${i + 1}_receipt_present:`, receiptPresent);
    if (receiptPresent) {
      console.log(
        `judge_${i + 1}_receipt_root:`,
        Buffer.from(receiptRootBytes).toString("hex")
      );
    }
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
