import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { getProgram } from "./anchor";
import { fetchMatchState, logMatchState } from "./match";
import { getArgOrExit, usage } from "./utils";

async function main() {
  const matchPdaStr = getArgOrExit(usage("read_match.ts", "<MATCH_PDA>"));
  const { program } = getProgram();
  const matchPda = new anchor.web3.PublicKey(matchPdaStr);
  const state = await fetchMatchState(program as any, matchPda);
  logMatchState(matchPda, state);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
