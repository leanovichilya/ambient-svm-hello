import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { randomBytes } from "crypto";
import { writeFile } from "fs/promises";
import { getProgram } from "./anchor";
import { buildMatchPrompt } from "./prompts";
import {
  commitMatchInput,
  fetchMatchState,
  getMatchPda,
} from "./match";
import {
  getModelIdOrExit,
  requireEnv,
  sha256Bytes,
} from "./utils";
import {
  fundKeypairs,
  getAmbientJudgeResult,
  submitMatchJudgeResult,
  waitForExecuteSlot,
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
  const matchPda = getMatchPda(program.programId, playerA.publicKey, nonce);

  const saltA = randomBytes(16);
  const saltB = randomBytes(16);
  const commitA = commitMatchInput(inputA, saltA);
  const commitB = commitMatchInput(inputB, saltB);

  await (program as any).methods
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
      playerA: playerA.publicKey,
      playerB: playerB.publicKey,
    })
    .signers([playerA, playerB])
    .rpc();

  await (program as any).methods
    .revealMatchInput(inputA, saltA)
    .accounts({
      gameMatch: matchPda,
      player: playerA.publicKey,
    })
    .signers([playerA])
    .rpc();

  await (program as any).methods
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

  const judges = Array.from({ length: JUDGES }, () => anchor.web3.Keypair.generate());
  await fundKeypairs(provider, judges, JUDGE_LAMPORTS);

  for (const judge of judges) {
    const { verdict, receiptRootBytes } = await getAmbientJudgeResult(
      prompt,
      modelId,
      ambientApiKey
    );
    await submitMatchJudgeResult(
      program as any,
      matchPda,
      judge,
      verdict,
      receiptRootBytes,
      promptHash,
      modelId
    );
  }

  await (program as any).methods
    .finalizeMatch()
    .accounts({
      gameMatch: matchPda,
      finalizer: (program.provider as anchor.AnchorProvider).wallet.publicKey,
    })
    .rpc();

  await waitForExecuteSlot(program, matchPda);

  await (program as any).methods
    .executeMatch()
    .accounts({
      gameMatch: matchPda,
      playerA: playerA.publicKey,
      playerB: playerB.publicKey,
      judge0: judges[0].publicKey,
      judge1: judges[1].publicKey,
      judge2: judges[2].publicKey,
      executor: provider.wallet.publicKey,
    })
    .rpc();

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

  const winner1 = anchor.web3.Keypair.fromSecretKey(players.find((p) => p.publicKey.equals(semi1.winner))!.secretKey);
  const winner2 = anchor.web3.Keypair.fromSecretKey(players.find((p) => p.publicKey.equals(semi2.winner))!.secretKey);
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
