import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { randomBytes } from "crypto";
import { AmbientApiError, callAmbient } from "./ambient";
import { getProgram } from "./anchor";
import { buildMatchPrompt } from "./prompts";
import {
  commitMatchInput,
  fetchMatchState,
  getMatchPda,
} from "./match";
import {
  getModelIdOrExit,
  normalizeWinner,
  parseJsonBlock,
  requireEnv,
  sha256Bytes,
} from "./utils";
import {
  JUDGE_LAMPORTS,
  MATCH_CHALLENGE_PERIOD_SLOTS,
  MATCH_STAKE_LAMPORTS,
} from "./constants";

const MATCH_TYPE = 1;
const FUND_PLAYER = 60_000_000;
const JUDGES = 3;

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

function parseWinner(text: string): number {
  const parsed: any = parseJsonBlock(text);
  if (!parsed?.winner) {
    throw new Error("Missing winner in model response");
  }
  return normalizeWinner(String(parsed.winner));
}

async function runMatch(
  program: any,
  playerA: anchor.web3.Keypair,
  playerB: anchor.web3.Keypair,
  criteria: string,
  inputA: string,
  inputB: string,
  extra: string
): Promise<{ matchPda: anchor.web3.PublicKey; winner: anchor.web3.PublicKey | null }> {
  const AMBIENT_API_KEY = requireEnv("AMBIENT_API_KEY");
  const MODEL_ID = getModelIdOrExit();
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
  for (const judge of judges) {
    await fundWallet(provider, judge.publicKey, JUDGE_LAMPORTS);
  }

  for (const judge of judges) {
    let ambientResult;
    try {
      ambientResult = await callAmbient(prompt, MODEL_ID, AMBIENT_API_KEY, { retries: 0 });
    } catch (e) {
      if (e instanceof AmbientApiError && (e.status === 429 || e.status === 500)) {
        console.error(`Ambient API ${e.status}`);
        process.exit(1);
      }
      throw e;
    }
    const { responseText, receiptRootBytes } = ambientResult;
    if (!responseText) {
      throw new Error("Empty model response");
    }
    const verdict = parseWinner(responseText);
    await (program as any).methods
      .submitMatchJudgeResult(verdict, receiptRootBytes as any, promptHash as any, MODEL_ID)
      .accounts({
        gameMatch: matchPda,
        judge: judge.publicKey,
      })
      .signers([judge])
      .rpc();
  }

  await (program as any).methods
    .finalizeMatch()
    .accounts({
      gameMatch: matchPda,
      finalizer: (program.provider as anchor.AnchorProvider).wallet.publicKey,
    })
    .rpc();

  for (let i = 0; i < 5; i += 1) {
    const state = await fetchMatchState(program as any, matchPda);
    const executeAfterRaw = state.match.executeAfterSlot;
    const executeAfter =
      typeof executeAfterRaw?.toNumber === "function"
        ? executeAfterRaw.toNumber()
        : Number(executeAfterRaw ?? 0);
    const slot = await provider.connection.getSlot();
    if (slot >= executeAfter) break;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

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
  requireEnv("AMBIENT_API_KEY");
  getModelIdOrExit();
  const { provider, program } = getProgram();

  const players = Array.from({ length: 4 }, () => anchor.web3.Keypair.generate());
  for (const p of players) {
    await fundWallet(provider, p.publicKey, FUND_PLAYER);
  }

  const criteria = "Pick the more concrete and feasible plan.";
  const inputA = "Plan A: deliver MVP in 2 weeks with a small scope and clear milestones.";
  const inputB = "Plan B: deliver full product in 2 weeks with no timeline details.";
  const extra = "If insufficient info, return Tie.";

  const semi1 = await runMatch(program as any, players[0], players[1], criteria, inputA, inputB, extra);
  const semi2 = await runMatch(program as any, players[2], players[3], criteria, inputA, inputB, extra);

  if (!semi1.winner || !semi2.winner) {
    console.log("Tournament ended in a tie in semifinals.");
    return;
  }

  const winner1 = anchor.web3.Keypair.fromSecretKey(players.find((p) => p.publicKey.equals(semi1.winner))!.secretKey);
  const winner2 = anchor.web3.Keypair.fromSecretKey(players.find((p) => p.publicKey.equals(semi2.winner))!.secretKey);
  const finalMatch = await runMatch(program as any, winner1, winner2, criteria, inputA, inputB, extra);

  console.log("semi_final_1:", semi1.matchPda.toBase58());
  console.log("semi_final_2:", semi2.matchPda.toBase58());
  console.log("final_match:", finalMatch.matchPda.toBase58());
  console.log("champion:", finalMatch.winner?.toBase58() ?? "tie");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
