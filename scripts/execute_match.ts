import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { getProgram } from "./anchor";
import { getMatchEscrowPda } from "./match";
import { getArgOrExit, usage } from "./utils";

async function main() {
  const matchPdaStr = getArgOrExit(usage("execute_match.ts", "<MATCH_PDA>"));
  const { provider, program } = getProgram();
  const matchPda = new anchor.web3.PublicKey(matchPdaStr);
  const accountNs: any = (program as any).account;
  const m = await accountNs.match.fetch(matchPda);
  const escrowPda = getMatchEscrowPda(program.programId, matchPda);

  await program.methods
    .executeMatch()
    .accounts({
      gameMatch: matchPda,
      matchEscrow: escrowPda,
      playerA: m.playerA,
      playerB: m.playerB,
      executor: provider.wallet.publicKey,
    })
    .rpc();

  console.log("match:", matchPda.toBase58());
  console.log("status: executed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
