import * as anchor from "@coral-xyz/anchor";
import { AmbientApiError, callAmbient } from "./ambient";
import { fetchMatchState } from "./match";
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
