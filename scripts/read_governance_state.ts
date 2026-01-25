import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { getProgram } from "./anchor";
import { getActionPda, getTreasuryVaultPda } from "./governance";
import { getArgOrExit } from "./utils";

async function main() {
  const proposalPdaStr = getArgOrExit(
    "Usage: yarn ts-node scripts/read_governance_state.ts <PROPOSAL_PDA>"
  );

  const { program } = getProgram();
  const proposalPda = new anchor.web3.PublicKey(proposalPdaStr);
  const proposal = await program.account.proposal.fetch(proposalPda);

  const actionPda = getActionPda(program.programId, proposalPda);
  const vaultPda = getTreasuryVaultPda(program.programId);

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

  try {
    const action = await program.account.actionRequest.fetch(actionPda);
    console.log("action_request:", actionPda.toBase58());
    console.log("action_status:", action.status);
    console.log("action_amount_lamports:", action.amountLamports);
    console.log("action_recipient:", action.recipient.toBase58());
    console.log("action_executor:", action.executor.toBase58());
    const vaultInfo = await program.provider.connection.getAccountInfo(vaultPda);
    console.log("treasury_vault:", vaultPda.toBase58());
    console.log("treasury_vault_lamports:", vaultInfo?.lamports ?? 0);
  } catch {
    console.log("action_request:", actionPda.toBase58());
    console.log("action_status: not_found");
    console.log("treasury_vault:", vaultPda.toBase58());
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
