import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { getProgram } from "../anchor";
import { fetchMatchState } from "./state";
import { getArgOrExit, normalizeWinner, usage } from "../utils";

function parseVerdictArg(arg: string | undefined, aiRecommendation: number): number {
  if (!arg) {
    return aiRecommendation;
  }
  const trimmed = arg.trim();
  if (trimmed === "1" || trimmed === "2" || trimmed === "3") {
    return Number(trimmed);
  }
  return normalizeWinner(trimmed);
}

async function main() {
  const matchPdaStr = getArgOrExit(
    usage("match/confirm_match.ts", "<MATCH_PDA> [A|B|Tie|1|2|3] [--ack]")
  );
  const verdictArg = process.argv[3]?.startsWith("--") ? undefined : process.argv[3];
  const hasAckFlag = process.argv.includes("--ack");
  const { provider, program } = getProgram();
  const matchPda = new anchor.web3.PublicKey(matchPdaStr);

  const state = await fetchMatchState(program as any, matchPda);
  const m = state.match;
  const aiRecommendation = Number(m.aiRecommendation);
  if (aiRecommendation < 1 || aiRecommendation > 3) {
    console.error("AI recommendation is not ready. Run finalize_match first.");
    process.exit(1);
  }
  const verdict = parseVerdictArg(verdictArg, aiRecommendation);
  if (verdict < 1 || verdict > 3) {
    console.error("Bad verdict. Use A|B|Tie or 1|2|3.");
    process.exit(1);
  }
  const aiUncertain = Number(m.aiUncertain) === 1;
  const acknowledgeOverride = hasAckFlag || aiUncertain || verdict !== aiRecommendation;

  await program.methods
    .confirmMatch(verdict, acknowledgeOverride)
    .accounts({
      gameMatch: matchPda,
      confirmer: provider.wallet.publicKey,
    })
    .rpc();

  const updated = await fetchMatchState(program as any, matchPda);
  console.log("match:", matchPda.toBase58());
  console.log("ai_recommendation:", aiRecommendation);
  console.log("ai_uncertain:", Number(m.aiUncertain));
  console.log("human_verdict:", Number(updated.match.verdict));
  console.log("human_override:", Number(updated.match.humanOverride));
  console.log("human_confirmer:", updated.match.humanConfirmer.toBase58());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
