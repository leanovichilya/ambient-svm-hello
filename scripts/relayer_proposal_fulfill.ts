import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { createHash } from "crypto";
import { AmbientSvmHello } from "../target/types/ambient_svm_hello";

const MAX_SUMMARY_WORDS = 60;
const MAX_SUMMARY_CHARS = 400;
const MAX_LIST_ITEMS = 5;
const MAX_LIST_ITEM_CHARS = 120;

function sha256Bytes(text: string): number[] {
  return Array.from(createHash("sha256").update(text, "utf8").digest());
}

function buildProposalPrompt(proposalText: string): string {
  return [
    "You are an AI governance assistant. Evaluate the proposal under a \"trust and verification\" mindset.",
    "Return JSON only, with no extra text.",
    "Do not use markdown or code fences.",
    "",
    "Schema:",
    "{",
    "\"verdict\": \"approve\" | \"reject\" | \"needs_more_info\",",
    "\"summary\": \"one short paragraph\",",
    "\"missing_info\": [\"bullet\", \"bullet\", \"bullet\"],",
    "\"risks\": [\"bullet\", \"bullet\", \"bullet\"]",
    "}",
    "",
    "Rules:",
    "",
    "Keep summary under 60 words.",
    "",
    "Use \"needs_more_info\" if any key detail is missing (budget cap, scope, owners, timeline, success metric).",
    "",
    "Do not invent facts that are not in the proposal.",
    "",
    "If the proposal asks for anything unsafe or illegal, verdict must be \"reject\".",
    "",
    "Proposal:",
    proposalText,
  ].join("\n");
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

function extractJsonBlock(text: string): string | null {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenceMatch ? fenceMatch[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  return body.slice(start, end + 1);
}

function normalizeVerdict(raw: string): number {
  const v = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (v === "approve") return 1;
  if (v === "reject") return 2;
  if (v === "needs_more_info") return 3;
  throw new Error(`Unknown verdict value: ${raw}`);
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
  const jsonBlock = extractJsonBlock(text);
  if (!jsonBlock) {
    throw new Error("Could not find JSON in model response");
  }
  let parsed: any;
  try {
    parsed = JSON.parse(jsonBlock);
  } catch {
    throw new Error("Could not parse JSON from model response");
  }
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

function merkleRootBytes(merkleRoot: string): number[] {
  const hex = String(merkleRoot).replace(/^0x/, "");
  if (hex.length > 64) {
    throw new Error("merkle_root hex too long");
  }
  const padded = hex.padStart(64, "0");
  return Array.from(Buffer.from(padded, "hex"));
}

async function main() {
  const requestPdaStr = process.argv[2];
  if (!requestPdaStr) {
    console.error("Usage: yarn ts-node scripts/relayer_proposal_fulfill.ts <PROPOSAL_REQUEST_PDA>");
    process.exit(1);
  }

  const AMBIENT_API_KEY = process.env.AMBIENT_API_KEY;
  if (!AMBIENT_API_KEY) {
    console.error("Missing AMBIENT_API_KEY in env");
    process.exit(1);
  }
  const MODEL_ID = process.env.AMBIENT_MODEL_ID || "ambient-1";
  if (MODEL_ID.length > 64) {
    console.error("AMBIENT_MODEL_ID too long");
    process.exit(1);
  }

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.AmbientSvmHello as Program<AmbientSvmHello>;

  const user = provider.wallet.publicKey;
  const requestPda = new anchor.web3.PublicKey(requestPdaStr);

  const req = await program.account.proposalRequest.fetch(requestPda);
  const proposalText: string = req.proposalText;
  if (req.status !== 0) {
    console.error(`Request already fulfilled. status=${req.status}`);
    process.exit(1);
  }
  const prompt = buildProposalPrompt(proposalText);
  const promptHash = sha256Bytes(prompt);
  console.log("proposal_text:", proposalText);

  const res = await fetch("https://api.ambient.xyz/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AMBIENT_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL_ID,
      stream: false,
      emit_verified: true,
      wait_for_verification: false,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Ambient API error ${res.status}: ${t}`);
  }

  const data: any = await res.json();

  const responseText =
    data?.choices?.[0]?.message?.content ??
    data?.choices?.[0]?.delta?.content ??
    "";

  if (!responseText) {
    console.error("Could not parse response text. Full response keys:", Object.keys(data));
    console.log(JSON.stringify(data, null, 2));
    process.exit(1);
  }

  console.log("model response:", responseText);

  const { verdictCode, summary } = parseResponse(responseText);
  const summaryHash = sha256Bytes(summary);

  const merkleRoot = data?.receipt?.merkle_root ?? data?.merkle_root ?? null;
  const receiptRootBytes = merkleRoot
    ? merkleRootBytes(merkleRoot)
    : new Array(32).fill(0);
  if (!merkleRoot) {
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
