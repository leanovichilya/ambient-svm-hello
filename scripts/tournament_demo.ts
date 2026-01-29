import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { writeFile } from "fs/promises";
import { getProgram } from "./anchor";
import { buildMatchPrompt } from "./prompts";
import { fetchMatchState } from "./match";
import {
  getModelIdOrExit,
  requireEnv,
  sha256Bytes,
} from "./utils";
import {
  createMatchAndReveal,
  finalizeAndExecuteMatch,
  fundKeypairs,
  runJudgesAndSubmit,
} from "./match_helpers";
import {
  JUDGE_LAMPORTS,
  MATCH_CHALLENGE_PERIOD_SLOTS,
  MATCH_STAKE_LAMPORTS,
} from "./constants";

const MATCH_TYPE = 1;
const FUND_PLAYER = 60_000_000;
const JUDGES = 3;

async function runMatch(
  program: any,
  playerA: anchor.web3.Keypair,
  playerB: anchor.web3.Keypair,
  criteria: string,
  inputA: string,
  inputB: string,
  extra: string,
  ambientApiKey: string,
  modelId: string
): Promise<{ matchPda: anchor.web3.PublicKey; winner: anchor.web3.PublicKey | null }> {
  const provider = program.provider as anchor.AnchorProvider;

  const nonce = new anchor.BN(Date.now() + Math.floor(Math.random() * 1000));
  const { matchPda } = await createMatchAndReveal({
    program: program as any,
    matchType: MATCH_TYPE,
    criteria,
    extra,
    inputA,
    inputB,
    stakeLamports: MATCH_STAKE_LAMPORTS,
    challengeSlots: MATCH_CHALLENGE_PERIOD_SLOTS,
    nonce,
    playerA: playerA.publicKey,
    playerB: playerB.publicKey,
    signerA: playerA,
    signerB: playerB,
  });

  const prompt = buildMatchPrompt({
    matchType: MATCH_TYPE,
    criteria,
    inputA,
    inputB,
    extra,
    stakeLamports: MATCH_STAKE_LAMPORTS,
  });
  const promptHash = sha256Bytes(prompt);

  const judges = Array.from({ length: JUDGES }, () => anchor.web3.Keypair.generate());
  await fundKeypairs(provider, judges, JUDGE_LAMPORTS);

  await runJudgesAndSubmit(
    program as any,
    matchPda,
    judges,
    prompt,
    promptHash,
    modelId,
    ambientApiKey
  );

  await finalizeAndExecuteMatch({
    program: program as any,
    matchPda,
    playerA: playerA.publicKey,
    playerB: playerB.publicKey,
    judges: judges.map((j) => j.publicKey),
    finalizer: (program.provider as anchor.AnchorProvider).wallet.publicKey,
    executor: provider.wallet.publicKey,
  });

  const state = await fetchMatchState(program as any, matchPda);
  const verdict = Number(state.match.verdict);
  const winner = verdict === 1 ? playerA.publicKey : verdict === 2 ? playerB.publicKey : null;
  return { matchPda, winner };
}

async function main() {
  const AMBIENT_API_KEY = requireEnv("AMBIENT_API_KEY");
  const MODEL_ID = getModelIdOrExit();
  const { provider, program } = getProgram();

  const players = Array.from({ length: 4 }, () => anchor.web3.Keypair.generate());
  await fundKeypairs(provider, players, FUND_PLAYER);

  const criteria = "Pick the more concrete and feasible plan.";
  const inputA = "Plan A: deliver MVP in 2 weeks with a small scope and clear milestones.";
  const inputB = "Plan B: deliver full product in 2 weeks with no timeline details.";
  const extra = "If insufficient info, return Tie.";

  const semi1 = await runMatch(
    program as any,
    players[0],
    players[1],
    criteria,
    inputA,
    inputB,
    extra,
    AMBIENT_API_KEY,
    MODEL_ID
  );
  const semi2 = await runMatch(
    program as any,
    players[2],
    players[3],
    criteria,
    inputA,
    inputB,
    extra,
    AMBIENT_API_KEY,
    MODEL_ID
  );

  if (!semi1.winner || !semi2.winner) {
    console.log("Tournament ended in a tie in semifinals.");
    return;
  }

  const winner1 = players.find((p) => p.publicKey.equals(semi1.winner));
  const winner2 = players.find((p) => p.publicKey.equals(semi2.winner));
  if (!winner1 || !winner2) {
    console.error("Could not resolve semifinal winners");
    process.exit(1);
  }
  const finalMatch = await runMatch(
    program as any,
    winner1,
    winner2,
    criteria,
    inputA,
    inputB,
    extra,
    AMBIENT_API_KEY,
    MODEL_ID
  );

  console.log("semi_final_1:", semi1.matchPda.toBase58());
  console.log("semi_final_2:", semi2.matchPda.toBase58());
  console.log("final_match:", finalMatch.matchPda.toBase58());
  console.log("champion:", finalMatch.winner?.toBase58() ?? "tie");
  await writeFile("last_match_pda.txt", `${finalMatch.matchPda.toBase58()}\n`, "utf8");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
