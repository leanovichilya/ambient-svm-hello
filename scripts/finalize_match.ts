import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { getProgram } from "./anchor";
import { getArgOrExit, usage } from "./utils";
import { fetchMatchState } from "./match/state";

async function main() {
  const matchPdaStr = getArgOrExit(usage("finalize_match.ts", "<MATCH_PDA>"));
  const { provider, program } = getProgram();
  const matchPda = new anchor.web3.PublicKey(matchPdaStr);

  await program.methods
    .finalizeMatch()
    .accounts({
      gameMatch: matchPda,
      finalizer: provider.wallet.publicKey,
    })
    .rpc();

  const state = await fetchMatchState(program as any, matchPda);
  const m = state.match;
  console.log("match:", matchPda.toBase58());
  console.log("final_verdict:", m.verdict);
  console.log("execute_after_slot:", m.executeAfterSlot.toString());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
