import * as anchor from "@coral-xyz/anchor";
import { randomBytes } from "crypto";
import { AmbientApiError, callAmbient } from "./ambient";
import { commitMatchInput, fetchMatchState, getMatchPda } from "./match";
import { buildMatchPrompt } from "./prompts";
import { normalizeWinner, parseJsonBlock } from "./utils";

export async function fundWallet(
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

export async function fundKeypairs(
  provider: anchor.AnchorProvider,
  keypairs: anchor.web3.Keypair[],
  lamports: number
) {
  for (const kp of keypairs) {
    await fundWallet(provider, kp.publicKey, lamports);
  }
}

export function parseWinner(text: string): number {
  const parsed: any = parseJsonBlock(text);
  if (!parsed?.winner) {
    throw new Error("Missing winner in model response");
  }
  return normalizeWinner(String(parsed.winner));
}

export function buildPromptFromMatch(match: any): string {
  return buildMatchPrompt({
    matchType: Number(match.matchType),
    criteria: String(match.criteria || ""),
    inputA: String(match.inputA || ""),
    inputB: String(match.inputB || ""),
    extra: String(match.extra || ""),
    stakeLamports: Number(match.stakeLamports || 0),
  });
}

export function getExecuteAfterSlot(match: any): number {
  const raw = match.executeAfterSlot;
  return typeof raw?.toNumber === "function" ? raw.toNumber() : Number(raw ?? 0);
}

export function getJudgeKeys(
  match: any,
  fallback: anchor.web3.PublicKey
): anchor.web3.PublicKey[] {
  const keys = (match.judgeKeys as anchor.web3.PublicKey[]) || [];
  return keys.map((k) => (k && !k.equals(anchor.web3.PublicKey.default) ? k : fallback));
}

export async function submitMatchJudgeResult(
  program: any,
  matchPda: anchor.web3.PublicKey,
  judge: anchor.web3.Keypair,
  verdict: number,
  receiptRootBytes: number[],
  promptHash: number[],
  modelId: string
) {
  await program.methods
    .submitMatchJudgeResult(verdict, receiptRootBytes as any, promptHash as any, modelId)
    .accounts({
      gameMatch: matchPda,
      judge: judge.publicKey,
    })
    .signers([judge])
    .rpc();
}

export async function createMatchAndReveal(params: {
  program: any;
  matchType: number;
  criteria: string;
  extra: string;
  inputA: string;
  inputB: string;
  stakeLamports: number;
  challengeSlots: number;
  nonce: anchor.BN;
  playerA: anchor.web3.PublicKey;
  playerB: anchor.web3.PublicKey;
  signerA?: anchor.web3.Keypair;
  signerB?: anchor.web3.Keypair;
}): Promise<{ matchPda: anchor.web3.PublicKey; saltA: Buffer; saltB: Buffer }> {
  const {
    program,
    matchType,
    criteria,
    extra,
    inputA,
    inputB,
    stakeLamports,
    challengeSlots,
    nonce,
    playerA,
    playerB,
    signerA,
    signerB,
  } = params;

  const matchPda = getMatchPda(program.programId, playerA, nonce);
  const saltA = randomBytes(16);
  const saltB = randomBytes(16);
  const commitA = commitMatchInput(inputA, saltA);
  const commitB = commitMatchInput(inputB, saltB);
  const signers: anchor.web3.Keypair[] = [];
  if (signerA) signers.push(signerA);
  if (signerB) signers.push(signerB);

  await program.methods
    .createMatch(
      matchType,
      criteria,
      extra,
      commitA as any,
      commitB as any,
      new anchor.BN(stakeLamports),
      new anchor.BN(challengeSlots),
      nonce
    )
    .accounts({
      playerA,
      playerB,
    })
    .signers(signers)
    .rpc();

  await program.methods
    .revealMatchInput(inputA, saltA)
    .accounts({
      gameMatch: matchPda,
      player: playerA,
    })
    .signers(signerA ? [signerA] : [])
    .rpc();

  await program.methods
    .revealMatchInput(inputB, saltB)
    .accounts({
      gameMatch: matchPda,
      player: playerB,
    })
    .signers(signerB ? [signerB] : [])
    .rpc();

  return { matchPda, saltA, saltB };
}

export async function finalizeAndExecuteMatch(params: {
  program: any;
  matchPda: anchor.web3.PublicKey;
  playerA: anchor.web3.PublicKey;
  playerB: anchor.web3.PublicKey;
  judges: anchor.web3.PublicKey[];
  finalizer: anchor.web3.PublicKey;
  executor: anchor.web3.PublicKey;
}) {
  const { program, matchPda, playerA, playerB, judges, finalizer, executor } = params;
  await program.methods
    .finalizeMatch()
    .accounts({
      gameMatch: matchPda,
      finalizer,
    })
    .rpc();

  await waitForExecuteSlot(program, matchPda);

  await program.methods
    .executeMatch()
    .accounts({
      gameMatch: matchPda,
      playerA,
      playerB,
      judge0: judges[0],
      judge1: judges[1],
      judge2: judges[2],
      executor,
    })
    .rpc();
}

export async function runJudgesAndSubmit(
  program: any,
  matchPda: anchor.web3.PublicKey,
  judges: anchor.web3.Keypair[],
  prompt: string,
  promptHash: number[],
  modelId: string,
  apiKey: string,
  onResult?: (index: number, verdict: number, receiptRootBytes: number[], receiptPresent: boolean) => void
) {
  for (let i = 0; i < judges.length; i += 1) {
    const judge = judges[i];
    const { verdict, receiptRootBytes, receiptPresent } = await getAmbientJudgeResult(
      prompt,
      modelId,
      apiKey
    );
    await submitMatchJudgeResult(
      program,
      matchPda,
      judge,
      verdict,
      receiptRootBytes,
      promptHash,
      modelId
    );
    if (onResult) {
      onResult(i, verdict, receiptRootBytes, receiptPresent);
    }
  }
}

export async function getAmbientJudgeResult(
  prompt: string,
  modelId: string,
  apiKey: string
): Promise<{ verdict: number; receiptRootBytes: number[]; receiptPresent: boolean }> {
  let ambientResult;
  try {
    ambientResult = await callAmbient(prompt, modelId, apiKey, { retries: 0 });
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
  return { verdict, receiptRootBytes, receiptPresent };
}

export async function waitForExecuteSlot(
  program: anchor.Program,
  matchPda: anchor.web3.PublicKey,
  maxChecks = 5,
  intervalMs = 2000
) {
  const provider = program.provider as anchor.AnchorProvider;
  for (let i = 0; i < maxChecks; i += 1) {
    const state = await fetchMatchState(program as any, matchPda);
    const executeAfterRaw = state.match.executeAfterSlot;
    const executeAfter =
      typeof executeAfterRaw?.toNumber === "function"
        ? executeAfterRaw.toNumber()
        : Number(executeAfterRaw ?? 0);
    const slot = await provider.connection.getSlot();
    if (slot >= executeAfter) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
