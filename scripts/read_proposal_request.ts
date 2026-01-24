import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { getProgram } from "./anchor";
import { getArgOrExit } from "./utils";

async function main() {
  const requestPdaStr = getArgOrExit(
    "Usage: yarn ts-node scripts/read_proposal_request.ts <PROPOSAL_REQUEST_PDA>"
  );

  const { program } = getProgram();

  const requestPda = new anchor.web3.PublicKey(requestPdaStr);
  const req = await program.account.proposalRequest.fetch(requestPda);

  console.log("proposal_request:", requestPda.toBase58());
  console.log("authority:", req.authority.toBase58());
  console.log("status:", req.status);
  console.log("verdict_code:", req.verdictCode);
  console.log("summary_hash:", Buffer.from(req.summaryHash).toString("hex"));
  console.log("receipt_root:", Buffer.from(req.receiptRoot).toString("hex"));
  console.log("prompt_hash:", Buffer.from(req.promptHash).toString("hex"));
  console.log("model_id:", req.modelId);
  console.log("proposal_text:", req.proposalText);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
