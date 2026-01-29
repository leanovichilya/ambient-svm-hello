import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { getProgram } from "../anchor";
import { logMatchState } from "./log";
import { fetchMatchState } from "./state";
import { getArgOrExit, usage } from "../utils";

async function main() {
  const matchPdaStr = getArgOrExit(usage("match/read_match.ts", "<MATCH_PDA>"));
  const flag = process.argv[3];
  const mode = flag === "--short" || flag === "-s" ? "short" : "full";
  const { program } = getProgram();
  const matchPda = new anchor.web3.PublicKey(matchPdaStr);
  const state = await fetchMatchState(program as any, matchPda);
  logMatchState(matchPda, state, mode);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
