import { createHash } from "crypto";

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
