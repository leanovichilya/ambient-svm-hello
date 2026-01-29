import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { getProgram } from "./anchor";
import { buildMatchPrompt } from "./prompts";
import { fetchMatchState } from "./match";
import { getArgOrExit, sha256Bytes, usage } from "./utils";

async function main() {
  const matchPdaStr = getArgOrExit(usage("verify_match_receipt.ts", "<MATCH_PDA>"));
  const { program } = getProgram();
  const matchPda = new anchor.web3.PublicKey(matchPdaStr);
  const state = await fetchMatchState(program as any, matchPda);
  const m = state.match;

  const prompt = buildMatchPrompt({
    matchType: Number(m.matchType),
    criteria: String(m.criteria || ""),
    inputA: String(m.inputA || ""),
    inputB: String(m.inputB || ""),
    extra: String(m.extra || ""),
    stakeLamports: Number(m.stakeLamports || 0),
  });
  const computedHash = Buffer.from(sha256Bytes(prompt)).toString("hex");
  const onchainHash = Buffer.from(m.promptHash).toString("hex");
  const receiptRoot = Buffer.from(m.receiptRoot).toString("hex");

  console.log("match:", matchPda.toBase58());
  console.log("prompt_hash_onchain:", onchainHash);
  console.log("prompt_hash_computed:", computedHash);
  console.log("prompt_hash_match:", onchainHash === computedHash);
  console.log("receipt_root:", receiptRoot);
  console.log("receipt_present:", receiptRoot !== "0".repeat(64));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
