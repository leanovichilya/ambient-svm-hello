import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { AmbientApiError, callAmbient } from "./ambient";
import { getProgram } from "./anchor";
import {
  fetchVotesSummary,
  GovernanceSource,
  VotesSummary,
} from "./governance_sources";
import { buildProposalPrompt } from "./prompts";
import {
  getArgOrExit,
  getModelIdOrExit,
  normalizeVerdict,
  parseJsonBlock,
  requireEnv,
  sha256Bytes,
  usage,
} from "./utils";
import {
  MAX_LIST_ITEM_CHARS,
  MAX_LIST_ITEMS,
  MAX_SUMMARY_CHARS,
  MAX_SUMMARY_WORDS,
} from "./constants";

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

function clampList(list: unknown): string[] {
  if (!Array.isArray(list)) {
    throw new Error("missing_info and risks must be arrays");
  }
  const cleaned = list.map((item) => {
    if (typeof item !== "string") {
      throw new Error("missing_info and risks must contain strings");
    }
    const trimmed = item.trim();
    return trimmed.length > MAX_LIST_ITEM_CHARS
      ? trimmed.slice(0, MAX_LIST_ITEM_CHARS)
      : trimmed;
  });
  return cleaned.slice(0, MAX_LIST_ITEMS);
}

function parseResponse(text: string): { verdictCode: number; summary: string } {
  const parsed: any = parseJsonBlock(text);
  if (!parsed?.verdict || !parsed?.summary) {
    throw new Error("Missing verdict or summary in model response");
  }
  const verdictCode = normalizeVerdict(String(parsed.verdict));
  const summary = String(parsed.summary).trim();
  if (!summary) {
    throw new Error("Summary is empty");
  }
  const wordCount = countWords(summary);
  if (wordCount > MAX_SUMMARY_WORDS || summary.length > MAX_SUMMARY_CHARS) {
    throw new Error("Summary too long");
  }
  clampList(parsed.missing_info);
  clampList(parsed.risks);
  return { verdictCode, summary };
}

async function main() {
  const requestPdaStr = getArgOrExit(
    usage("relayer_proposal_fulfill.ts", "<PROPOSAL_REQUEST_PDA>")
  );

  const AMBIENT_API_KEY = requireEnv("AMBIENT_API_KEY");
  const MODEL_ID = getModelIdOrExit();

  const { provider, program } = getProgram();

  const user = provider.wallet.publicKey;
  const requestPda = new anchor.web3.PublicKey(requestPdaStr);

  const req = await program.account.proposalRequest.fetch(requestPda);
  const proposalText: string = req.proposalText;
  if (req.status !== 0) {
    console.error(`Request already fulfilled. status=${req.status}`);
    process.exit(1);
  }
  let votesSummary: VotesSummary | null = null;
  const source = String(req.source || "") as GovernanceSource;
  const proposalId = String(req.proposalId || "");
  if (source && proposalId) {
    try {
      votesSummary = await fetchVotesSummary(source, proposalId);
    } catch {}
  }

  const prompt = buildProposalPrompt(proposalText, votesSummary);
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

  const { data, responseText, receiptRootBytes, receiptPresent } = ambientResult;

  if (!responseText) {
    console.error("Could not parse response text. Full response keys:", Object.keys(data));
    console.log(JSON.stringify(data, null, 2));
    process.exit(1);
  }

  console.log("proposal_text:", proposalText);
  console.log("model response:", responseText);

  const { verdictCode, summary } = parseResponse(responseText);
  const summaryHash = sha256Bytes(summary);

  if (!receiptPresent) {
    console.log("receipt missing");
  }

  console.log("verdict code:", verdictCode);

  const sig = await program.methods
    .fulfillProposalRequest(
      verdictCode,
      summaryHash as any,
      receiptRootBytes as any,
      promptHash as any,
      MODEL_ID
    )
    .accounts({
      request: requestPda,
      relayer: user,
    })
    .rpc();

  console.log("fulfilled tx:", sig);

  const updated = await program.account.proposalRequest.fetch(requestPda);
  console.log("updated status:", updated.status);
  console.log(
    "stored summary_hash (first 8 bytes):",
    Buffer.from(updated.summaryHash).toString("hex").slice(0, 16)
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
