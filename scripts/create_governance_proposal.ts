import "dotenv/config";
import { getProgram } from "./anchor";
import { createProposalWithRevisionAndVote } from "./governance";

async function main() {
  const { provider, program } = getProgram();
  const user = provider.wallet.publicKey;

  const proposalText =
    "Minimal proposal: fund an automation action after approval.";
  const revisionText = "Revision 1: clarify the action recipient.";
  const { proposalPda } = await createProposalWithRevisionAndVote(
    program as any,
    user,
    proposalText,
    revisionText,
    1
  );

  console.log("proposal:", proposalPda.toBase58());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
