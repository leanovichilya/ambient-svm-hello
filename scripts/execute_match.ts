import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { getProgram } from "./anchor";
import { getArgOrExit, usage } from "./utils";

async function main() {
  const matchPdaStr = getArgOrExit(usage("execute_match.ts", "<MATCH_PDA>"));
  const { provider, program } = getProgram();
  const matchPda = new anchor.web3.PublicKey(matchPdaStr);
  const accountNs: any = (program as any).account;
  const m = await accountNs.match.fetch(matchPda);
  const executeAfterRaw = m.executeAfterSlot;
  const executeAfter =
    typeof executeAfterRaw?.toNumber === "function"
      ? executeAfterRaw.toNumber()
      : Number(executeAfterRaw ?? 0);
  const slot = await program.provider.connection.getSlot();
  if (executeAfter > slot) {
    console.error(`Challenge period active. execute_after_slot=${executeAfter}`);
    process.exit(1);
  }

  const judgeKeys = (m.judgeKeys as anchor.web3.PublicKey[]).map((k) =>
    k && !k.equals(anchor.web3.PublicKey.default) ? k : provider.wallet.publicKey
  );
  await program.methods
    .executeMatch()
    .accounts({
      gameMatch: matchPda,
      playerA: m.playerA,
      playerB: m.playerB,
      judge0: judgeKeys[0],
      judge1: judgeKeys[1],
      judge2: judgeKeys[2],
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
