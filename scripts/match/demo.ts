import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { writeFile } from "fs/promises";
import { getProgram } from "../anchor";
import { fetchMatchState } from "./state";
import { logMatchState } from "./log";
import {
  getModelIdOrExit,
  logReceipt,
  requireEnv,
} from "../utils";
import {
  createMatchAndReveal,
  finalizeAndExecuteMatch,
  fundKeypairs,
  fundWallet,
  runJudgesAndSubmit,
} from "./helpers";
import {
  JUDGE_LAMPORTS,
  MATCH_CHALLENGE_PERIOD_SLOTS,
  MATCH_DEFAULT_CRITERIA,
  MATCH_DEFAULT_EXTRA,
  MATCH_DEFAULT_INPUT_A,
  MATCH_DEFAULT_INPUT_B,
  MATCH_FUND_PLAYER_B,
  MATCH_JUDGES,
  MATCH_STAKE_LAMPORTS,
  MATCH_TYPE,
} from "./config";
import { buildPromptAndHash } from "./prompt";

async function main() {
  const AMBIENT_API_KEY = requireEnv("AMBIENT_API_KEY");
  const MODEL_ID = getModelIdOrExit();

  const { provider, program } = getProgram();
  const playerA = provider.wallet.publicKey;

  const playerB = anchor.web3.Keypair.generate();
  await fundWallet(provider, playerB.publicKey, MATCH_FUND_PLAYER_B);

  const judges = Array.from({ length: MATCH_JUDGES }, () => anchor.web3.Keypair.generate());
  await fundKeypairs(provider, judges, JUDGE_LAMPORTS);

  const nonce = new anchor.BN(Date.now());
  const criteria = MATCH_DEFAULT_CRITERIA;
  const inputA = MATCH_DEFAULT_INPUT_A;
  const inputB = MATCH_DEFAULT_INPUT_B;
  const extra = MATCH_DEFAULT_EXTRA;

  const { matchPda } = await createMatchAndReveal({
    program,
    matchType: MATCH_TYPE,
    criteria,
    extra,
    inputA,
    inputB,
    stakeLamports: MATCH_STAKE_LAMPORTS,
    challengeSlots: MATCH_CHALLENGE_PERIOD_SLOTS,
    nonce,
    playerA,
    playerB: playerB.publicKey,
    signerB: playerB,
  });

  const { prompt, promptHash } = buildPromptAndHash({
    matchType: MATCH_TYPE,
    criteria,
    inputA,
    inputB,
    extra,
    stakeLamports: MATCH_STAKE_LAMPORTS,
  });
  await runJudgesAndSubmit(
    program as any,
    matchPda,
    judges,
    prompt,
    promptHash,
    MODEL_ID,
    AMBIENT_API_KEY,
    (index, verdict, receiptRootBytes, receiptPresent) => {
      console.log(`judge_${index + 1}_verdict:`, verdict);
      logReceipt(`judge_${index + 1}`, receiptPresent, receiptRootBytes);
    }
  );

  await finalizeAndExecuteMatch({
    program,
    matchPda,
    playerA,
    playerB: playerB.publicKey,
    judges: judges.map((j) => j.publicKey),
    finalizer: playerA,
    confirmer: playerA,
    executor: playerA,
  });

  const state = await fetchMatchState(program as any, matchPda);
  console.log("final_verdict:", state.match.verdict);
  console.log("match:", matchPda.toBase58());
  await writeFile("last_match_pda.txt", `${matchPda.toBase58()}\n`, "utf8");
  logMatchState(matchPda, state);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
