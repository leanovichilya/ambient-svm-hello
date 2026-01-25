import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { getProgram } from "./anchor";
import { fetchGovernanceState, logGovernanceState } from "./governance";
import { getArgOrExit, usage } from "./utils";

async function main() {
  const proposalPdaStr = getArgOrExit(
    usage("read_governance_state.ts", "<PROPOSAL_PDA>")
  );

  const { program } = getProgram();
  const proposalPda = new anchor.web3.PublicKey(proposalPdaStr);
  const state = await fetchGovernanceState(program as any, proposalPda);
  logGovernanceState(proposalPda, state);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
