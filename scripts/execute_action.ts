import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { getProgram } from "./anchor";
import { getArgOrExit } from "./utils";

async function main() {
  const proposalPdaStr = getArgOrExit(
    "Usage: yarn ts-node scripts/execute_action.ts <PROPOSAL_PDA>"
  );

  const { provider, program } = getProgram();
  const proposalPda = new anchor.web3.PublicKey(proposalPdaStr);
  const proposal = await program.account.proposal.fetch(proposalPda);

  const [actionPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("action"), proposalPda.toBuffer()],
    program.programId
  );
  const [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("treasury_vault")],
    program.programId
  );
  const action = await program.account.actionRequest.fetch(actionPda);

  if (action.status !== 0) {
    console.log("action_status:", action.status);
    return;
  }

  await program.methods
    .completeAction()
    .accounts({
      proposal: proposalPda,
      recipient: proposal.authority,
      executor: provider.wallet.publicKey,
    })
    .rpc();

  const updated = await program.account.actionRequest.fetch(actionPda);
  console.log("action_request:", actionPda.toBase58());
  console.log("action_status:", updated.status);
  console.log("action_executor:", updated.executor.toBase58());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
