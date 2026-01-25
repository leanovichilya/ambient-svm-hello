import { createHash } from "crypto";
import { DEFAULT_MODEL_ID, MAX_MODEL_ID_LEN } from "./constants";

export function sha256Bytes(text: string): number[] {
  return Array.from(createHash("sha256").update(text, "utf8").digest());
}

export function extractJsonBlock(text: string): string | null {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenceMatch ? fenceMatch[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  return body.slice(start, end + 1);
}

export function parseJsonBlock<T>(text: string): T {
  const jsonBlock = extractJsonBlock(text);
  if (!jsonBlock) {
    throw new Error("Could not find JSON in model response");
  }
  try {
    return JSON.parse(jsonBlock) as T;
  } catch {
    throw new Error("Could not parse JSON from model response");
  }
}

export function getArgOrExit(usage: string): string {
  const arg = process.argv[2];
  if (!arg) {
    console.error(usage);
    process.exit(1);
  }
  return arg;
}

export function normalizeVerdict(raw: string): number {
  const v = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (v === "approve") return 1;
  if (v === "reject") return 2;
  if (v === "needs_more_info") return 3;
  throw new Error(`Unknown verdict value: ${raw}`);
}

export function usage(script: string, args: string): string {
  return `Usage: yarn ts-node scripts/${script} ${args}`;
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name} in env`);
    process.exit(1);
  }
  return value;
}

export function getModelIdOrExit(): string {
  const modelId = process.env.AMBIENT_MODEL_ID || DEFAULT_MODEL_ID;
  if (modelId.length > MAX_MODEL_ID_LEN) {
    console.error("AMBIENT_MODEL_ID too long");
    process.exit(1);
  }
  return modelId;
}

export function logReceipt(
  label: string,
  receiptPresent: boolean,
  receiptRootBytes: number[]
): void {
  console.log(`${label}_receipt_present:`, receiptPresent);
  if (receiptPresent) {
    console.log(`${label}_receipt_root:`, Buffer.from(receiptRootBytes).toString("hex"));
  }
}
