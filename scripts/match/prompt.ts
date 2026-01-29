import { buildMatchPrompt } from "../prompts";
import { sha256Bytes } from "../utils";

export function buildPromptAndHash(params: {
  matchType: number;
  criteria: string;
  inputA: string;
  inputB: string;
  extra: string;
  stakeLamports: number;
}) {
  const prompt = buildMatchPrompt(params);
  const promptHash = sha256Bytes(prompt);
  return { prompt, promptHash };
}
