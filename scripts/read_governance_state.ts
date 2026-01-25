import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { getProgram } from "./anchor";
import { fetchGovernanceState } from "./governance";
import { getArgOrExit, usage } from "./utils";

async function main() {
  const proposalPdaStr = getArgOrExit(
    usage("read_governance_state.ts", "<PROPOSAL_PDA>")
  );

  const { program } = getProgram();
  const proposalPda = new anchor.web3.PublicKey(proposalPdaStr);
  const { proposal, action, actionPda, vaultPda, vaultLamports } =
    await fetchGovernanceState(program as any, proposalPda);

  console.log("proposal:", proposalPda.toBase58());
  console.log("authority:", proposal.authority.toBase58());
  console.log("status:", proposal.status);
  console.log("revision_count:", proposal.revisionCount);
  console.log("votes_for:", proposal.votesFor);
  console.log("votes_against:", proposal.votesAgainst);
  console.log("votes_abstain:", proposal.votesAbstain);
  console.log("judge_approve:", proposal.judgeApprove);
  console.log("judge_reject:", proposal.judgeReject);
  console.log("judge_needs:", proposal.judgeNeeds);
  console.log("final_verdict:", proposal.finalVerdict);
  console.log("proposal_text:", proposal.proposalText);

  console.log("action_request:", actionPda.toBase58());
  if (action) {
    console.log("action_status:", action.status);
    console.log("action_amount_lamports:", action.amountLamports);
    console.log("action_recipient:", action.recipient.toBase58());
    console.log("action_executor:", action.executor.toBase58());
  } else {
    console.log("action_status: not_found");
  }
  console.log("treasury_vault:", vaultPda.toBase58());
  console.log("treasury_vault_lamports:", vaultLamports);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
