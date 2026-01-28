import { VotesSummary } from "./governance_sources";

export function buildProposalPrompt(
  proposalText: string,
  votesSummary: VotesSummary | null
): string {
  const votesLine = votesSummary ? JSON.stringify(votesSummary) : "unavailable";
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
    "Be conservative. Use \"needs_more_info\" if any key detail is missing (budget cap, scope, owners, timeline, success metric) or if the data is sparse.",
    "If vote summary is unavailable or indicates low participation, prefer \"needs_more_info\".",
    "",
    "Do not invent facts that are not in the proposal.",
    "",
    "If the proposal asks for anything unsafe or illegal, verdict must be \"reject\".",
    "",
    "Vote summary (if available):",
    votesLine,
    "",
    "Proposal:",
    proposalText,
  ].join("\n");
}

export function buildJudgePrompt(
  proposalText: string,
  votes: { for: number; against: number; abstain: number }
): string {
  return [
    "You are an AI governance judge. Evaluate the proposal under a verification-first mindset.",
    "Return JSON only, with no extra text or markdown.",
    "",
    "Schema:",
    "{",
    "\"verdict\": \"approve\" | \"reject\" | \"needs_more_info\",",
    "\"reason\": \"1-3 sentences\"",
    "}",
    "",
    "Rules:",
    "Use \"needs_more_info\" when key details are missing.",
    "Do not invent facts.",
    "",
    `Votes summary: for=${votes.for}, against=${votes.against}, abstain=${votes.abstain}`,
    "",
    "Proposal:",
    proposalText,
  ].join("\n");
}

export function buildMatchPrompt(params: {
  matchType: number;
  criteria: string;
  inputA: string;
  inputB: string;
  extra: string;
  stakeLamports: number;
}): string {
  const matchType =
    params.matchType === 1
      ? "contest"
      : params.matchType === 2
      ? "auction"
      : params.matchType === 3
      ? "simulation"
      : "unknown";
  return [
    "You are an AI referee. Decide the winner based on the rules and inputs.",
    "Return JSON only, with no extra text or markdown.",
    "",
    "Schema:",
    "{",
    "\"winner\": \"A\" | \"B\" | \"Tie\",",
    "\"reason\": \"1-3 sentences\"",
    "}",
    "",
    "Rules:",
    "Do not invent facts.",
    "If information is insufficient, choose Tie.",
    "",
    `Match type: ${matchType}`,
    `Stake (lamports): ${params.stakeLamports}`,
    "",
    "Criteria:",
    params.criteria,
    "",
    "Input A:",
    params.inputA,
    "",
    "Input B:",
    params.inputB,
    "",
    "Extra context:",
    params.extra,
  ].join("\n");
}
