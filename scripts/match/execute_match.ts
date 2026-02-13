import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { getProgram } from "../anchor";
import { fetchMatchState } from "./state";
import { getArgOrExit, usage } from "../utils";
import { getExecuteAfterSlot, getJudgeKeys } from "./helpers";

async function main() {
  const matchPdaStr = getArgOrExit(usage("match/execute_match.ts", "<MATCH_PDA>"));
  const { provider, program } = getProgram();
  const matchPda = new anchor.web3.PublicKey(matchPdaStr);
  const state = await fetchMatchState(program as any, matchPda);
  const m = state.match;
  if (Number(m.humanConfirmed) !== 1) {
    console.error("Match is not human-confirmed. Run scripts/match/confirm_match.ts first.");
    process.exit(1);
  }
  const executeAfter = getExecuteAfterSlot(m);
  const slot = await program.provider.connection.getSlot();
  if (executeAfter > slot) {
    console.error(`Challenge period active. execute_after_slot=${executeAfter}`);
    process.exit(1);
  }

  const judgeKeys = getJudgeKeys(m, provider.wallet.publicKey);
  await program.methods
    .executeMatch()
    .accounts({
      gameMatch: matchPda,
      playerA: m.playerA,
      playerB: m.playerB,
      judge0: judgeKeys[0],
      judge1: judgeKeys[1],
      judge2: judgeKeys[2],
      executor: provider.wallet.publicKey,
    })
    .rpc();

  console.log("match:", matchPda.toBase58());
  console.log("status: executed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
