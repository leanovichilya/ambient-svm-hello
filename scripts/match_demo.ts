import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { AmbientApiError, callAmbient } from "./ambient";
import { getProgram } from "./anchor";
import { ensureConfig, getConfigPda } from "./config";
import { buildMatchPrompt } from "./prompts";
import { fetchMatchState, getMatchEscrowPda, getMatchPda, logMatchState } from "./match";
import {
  getModelIdOrExit,
  logReceipt,
  normalizeWinner,
  parseJsonBlock,
  requireEnv,
  sha256Bytes,
} from "./utils";
import { MATCH_STAKE_LAMPORTS } from "./constants";

const MATCH_TYPE = 1;
const FUND_PLAYER_B = 2_000_000;

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

async function main() {
  const AMBIENT_API_KEY = requireEnv("AMBIENT_API_KEY");
  const MODEL_ID = getModelIdOrExit();

  const { provider, program } = getProgram();
  const playerA = provider.wallet.publicKey;
  await ensureConfig(program as any, playerA);

  const playerB = anchor.web3.Keypair.generate();
  await fundWallet(provider, playerB.publicKey, FUND_PLAYER_B);

  const nonce = new anchor.BN(Date.now());
  const matchPda = getMatchPda(program.programId, playerA, nonce);
  const escrowPda = getMatchEscrowPda(program.programId, matchPda);

  const criteria = "Pick the more concrete and feasible plan.";
  const inputA = "Plan A: deliver MVP in 2 weeks with a small scope and clear milestones.";
  const inputB = "Plan B: deliver full product in 2 weeks with no timeline details.";
  const extra = "If insufficient info, return Tie.";

  await program.methods
    .createMatch(
      MATCH_TYPE,
      criteria,
      inputA,
      inputB,
      extra,
      new anchor.BN(MATCH_STAKE_LAMPORTS),
      nonce
    )
    .accounts({
      gameMatch: matchPda,
      matchEscrow: escrowPda,
      playerA,
      playerB: playerB.publicKey,
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

  const { responseText, receiptRootBytes, receiptPresent } = ambientResult;
  if (!responseText) {
    console.error("Empty model response");
    process.exit(1);
  }
  const verdict = parseWinner(responseText);

  await program.methods
    .finalizeMatch(verdict, receiptRootBytes as any, promptHash as any, MODEL_ID)
    .accounts({
      config: getConfigPda(program.programId),
      gameMatch: matchPda,
      relayer: playerA,
    })
    .rpc();

  await program.methods
    .executeMatch()
    .accounts({
      gameMatch: matchPda,
      matchEscrow: escrowPda,
      playerA,
      playerB: playerB.publicKey,
      executor: playerA,
    })
    .rpc();

  console.log("match:", matchPda.toBase58());
  console.log("verdict:", verdict);
  logReceipt("referee", receiptPresent, receiptRootBytes);

  const state = await fetchMatchState(program as any, matchPda);
  logMatchState(matchPda, state);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
