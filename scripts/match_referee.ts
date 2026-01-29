import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { getProgram } from "./anchor";
import { buildMatchPrompt } from "./prompts";
import { fetchMatchState } from "./match";
import {
  getArgOrExit,
  getModelIdOrExit,
  logReceipt,
  requireEnv,
  sha256Bytes,
  usage,
} from "./utils";
import { JUDGE_LAMPORTS } from "./constants";
import { fundWallet, getAmbientJudgeResult } from "./match_helpers";

async function main() {
  const matchPdaStr = getArgOrExit(usage("match_referee.ts", "<MATCH_PDA>"));

  const AMBIENT_API_KEY = requireEnv("AMBIENT_API_KEY");
  const MODEL_ID = getModelIdOrExit();

  const { provider, program } = getProgram();

  const matchPda = new anchor.web3.PublicKey(matchPdaStr);
  const state = await fetchMatchState(program as any, matchPda);
  const m = state.match;

  if (m.status !== 0) {
    console.error(`Match already finalized. status=${m.status}`);
    process.exit(1);
  }
  if (Number(m.revealedA) !== 1 || Number(m.revealedB) !== 1) {
    console.error("Match inputs not revealed yet");
    process.exit(1);
  }

  const prompt = buildMatchPrompt({
    matchType: Number(m.matchType),
    criteria: String(m.criteria || ""),
    inputA: String(m.inputA || ""),
    inputB: String(m.inputB || ""),
    extra: String(m.extra || ""),
    stakeLamports: Number(m.stakeLamports || 0),
  });

  const promptHash = sha256Bytes(prompt);

  const { verdict, receiptRootBytes, receiptPresent } = await getAmbientJudgeResult(
    prompt,
    MODEL_ID,
    AMBIENT_API_KEY
  );
  const judge = anchor.web3.Keypair.generate();
  await fundWallet(provider, judge.publicKey, JUDGE_LAMPORTS);
  await program.methods
    .submitMatchJudgeResult(verdict, receiptRootBytes as any, promptHash as any, MODEL_ID)
    .accounts({
      gameMatch: matchPda,
      judge: judge.publicKey,
    })
    .signers([judge])
    .rpc();

  console.log("match:", matchPda.toBase58());
  console.log("verdict:", verdict);
  logReceipt("judge", receiptPresent, receiptRootBytes);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
