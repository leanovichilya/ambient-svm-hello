import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { getProgram } from "./anchor";

async function main() {
  const { provider, program } = getProgram();
  const user = provider.wallet.publicKey;

  const proposalText =
    "Minimal proposal: fund an automation action after approval.";
  const nonce = new anchor.BN(Date.now());
  const [proposalPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("proposal_v2"), user.toBuffer(), nonce.toArrayLike(Buffer, "le", 8)],
    program.programId
  );

  await program.methods
    .createGovernanceProposal(proposalText, new anchor.BN(0), nonce)
    .accounts({
      user,
    })
    .rpc();

  const revisionText = "Revision 1: clarify the action recipient.";
  await program.methods
    .addRevision(new anchor.BN(1), revisionText)
    .accounts({
      proposal: proposalPda,
      user,
    })
    .rpc();

  await program.methods
    .castVote(1)
    .accounts({
      proposal: proposalPda,
      voter: user,
    })
    .rpc();

  console.log("proposal:", proposalPda.toBase58());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
