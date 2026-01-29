import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { randomBytes } from "crypto";
import { writeFile } from "fs/promises";
import { getProgram } from "./anchor";
import { buildMatchPrompt } from "./prompts";
import { commitMatchInput, fetchMatchState, getMatchPda, logMatchState } from "./match";
import {
  getModelIdOrExit,
  logReceipt,
  requireEnv,
  sha256Bytes,
} from "./utils";
import { fundWallet, getAmbientJudgeResult, waitForExecuteSlot } from "./match_helpers";
import {
  JUDGE_LAMPORTS,
  MATCH_CHALLENGE_PERIOD_SLOTS,
  MATCH_STAKE_LAMPORTS,
} from "./constants";

const MATCH_TYPE = 1;
const FUND_PLAYER_B = 2_000_000;
const JUDGES = 3;

async function main() {
  const AMBIENT_API_KEY = requireEnv("AMBIENT_API_KEY");
  const MODEL_ID = getModelIdOrExit();

  const { provider, program } = getProgram();
  const playerA = provider.wallet.publicKey;

  const playerB = anchor.web3.Keypair.generate();
  await fundWallet(provider, playerB.publicKey, FUND_PLAYER_B);

  const judges = Array.from({ length: JUDGES }, () => anchor.web3.Keypair.generate());
  for (const judge of judges) {
    await fundWallet(provider, judge.publicKey, JUDGE_LAMPORTS);
  }

  const nonce = new anchor.BN(Date.now());
  const matchPda = getMatchPda(program.programId, playerA, nonce);

  const criteria = "Pick the more concrete and feasible plan.";
  const inputA = "Plan A: deliver MVP in 2 weeks with a small scope and clear milestones.";
  const inputB = "Plan B: deliver full product in 2 weeks with no timeline details.";
  const extra = "If insufficient info, return Tie.";
  const saltA = randomBytes(16);
  const saltB = randomBytes(16);
  const commitA = commitMatchInput(inputA, saltA);
  const commitB = commitMatchInput(inputB, saltB);

  await program.methods
    .createMatch(
      MATCH_TYPE,
      criteria,
      extra,
      commitA as any,
      commitB as any,
      new anchor.BN(MATCH_STAKE_LAMPORTS),
      new anchor.BN(MATCH_CHALLENGE_PERIOD_SLOTS),
      nonce
    )
    .accounts({
      playerA,
      playerB: playerB.publicKey,
    })
    .signers([playerB])
    .rpc();

  await program.methods
    .revealMatchInput(inputA, saltA)
    .accounts({
      gameMatch: matchPda,
      player: playerA,
    })
    .rpc();

  await program.methods
    .revealMatchInput(inputB, saltB)
    .accounts({
      gameMatch: matchPda,
      player: playerB.publicKey,
    })
    .signers([playerB])
    .rpc();

  const prompt = buildMatchPrompt({
    matchType: MATCH_TYPE,
    criteria,
    inputA,
    inputB,
    extra,
    stakeLamports: MATCH_STAKE_LAMPORTS,
  });

  const promptHash = sha256Bytes(prompt);
  for (let i = 0; i < judges.length; i += 1) {
    const { verdict, receiptRootBytes, receiptPresent } = await getAmbientJudgeResult(
      prompt,
      MODEL_ID,
      AMBIENT_API_KEY
    );
    const judge = judges[i];
    await program.methods
      .submitMatchJudgeResult(verdict, receiptRootBytes as any, promptHash as any, MODEL_ID)
      .accounts({
        gameMatch: matchPda,
        judge: judge.publicKey,
      })
      .signers([judge])
      .rpc();

    console.log(`judge_${i + 1}_verdict:`, verdict);
    logReceipt(`judge_${i + 1}`, receiptPresent, receiptRootBytes);
  }

  await program.methods
    .finalizeMatch()
    .accounts({
      gameMatch: matchPda,
      finalizer: playerA,
    })
    .rpc();

  await waitForExecuteSlot(program, matchPda);

  await program.methods
    .executeMatch()
    .accounts({
      gameMatch: matchPda,
      playerA,
      playerB: playerB.publicKey,
      judge0: judges[0].publicKey,
      judge1: judges[1].publicKey,
      judge2: judges[2].publicKey,
      executor: playerA,
    })
    .rpc();

  console.log("final_verdict:", (await fetchMatchState(program as any, matchPda)).match.verdict);
  console.log("match:", matchPda.toBase58());
  await writeFile("last_match_pda.txt", `${matchPda.toBase58()}\n`, "utf8");
  const state = await fetchMatchState(program as any, matchPda);
  logMatchState(matchPda, state);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
