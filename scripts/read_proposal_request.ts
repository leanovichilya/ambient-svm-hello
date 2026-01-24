import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AmbientSvmHello } from "../target/types/ambient_svm_hello";

async function main() {
  const requestPdaStr = process.argv[2];
  if (!requestPdaStr) {
    console.error("Usage: yarn ts-node scripts/read_proposal_request.ts <PROPOSAL_REQUEST_PDA>");
    process.exit(1);
  }

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.AmbientSvmHello as Program<AmbientSvmHello>;

  const requestPda = new anchor.web3.PublicKey(requestPdaStr);
  const req = await program.account.proposalRequest.fetch(requestPda);

  console.log("proposal_request:", requestPda.toBase58());
  console.log("authority:", req.authority.toBase58());
  console.log("status:", req.status);
  console.log("verdict_code:", req.verdictCode);
  console.log("summary_hash:", Buffer.from(req.summaryHash).toString("hex"));
  console.log("receipt_root:", Buffer.from(req.receiptRoot).toString("hex"));
  console.log("proposal_text:", req.proposalText);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
