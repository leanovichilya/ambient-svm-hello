import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { writeFile } from "fs/promises";
import { getProgram } from "../anchor";
import {
  getModelIdOrExit,
  requireEnv,
} from "../utils";
import {
  fundKeypairs,
} from "./helpers";
import {
  MATCH_DEFAULT_CRITERIA,
  MATCH_DEFAULT_EXTRA,
  MATCH_DEFAULT_INPUT_A,
  MATCH_DEFAULT_INPUT_B,
  TOURNAMENT_FUND_PLAYER,
} from "./config";
import { runMatch } from "./run_match";

async function main() {
  const AMBIENT_API_KEY = requireEnv("AMBIENT_API_KEY");
  const MODEL_ID = getModelIdOrExit();
  const { provider, program } = getProgram();

  const players = Array.from({ length: 4 }, () => anchor.web3.Keypair.generate());
  await fundKeypairs(provider, players, TOURNAMENT_FUND_PLAYER);

  const criteria = MATCH_DEFAULT_CRITERIA;
  const inputA = MATCH_DEFAULT_INPUT_A;
  const inputB = MATCH_DEFAULT_INPUT_B;
  const extra = MATCH_DEFAULT_EXTRA;

  const semi1 = await runMatch(
    program as any,
    players[0],
    players[1],
    criteria,
    inputA,
    inputB,
    extra,
    AMBIENT_API_KEY,
    MODEL_ID
  );
  const semi2 = await runMatch(
    program as any,
    players[2],
    players[3],
    criteria,
    inputA,
    inputB,
    extra,
    AMBIENT_API_KEY,
    MODEL_ID
  );

  if (!semi1.winner || !semi2.winner) {
    console.log("Tournament ended in a tie in semifinals.");
    return;
  }

  const winner1 = players.find((p) => p.publicKey.equals(semi1.winner));
  const winner2 = players.find((p) => p.publicKey.equals(semi2.winner));
  if (!winner1 || !winner2) {
    console.error("Could not resolve semifinal winners");
    process.exit(1);
  }
  const finalMatch = await runMatch(
    program as any,
    winner1,
    winner2,
    criteria,
    inputA,
    inputB,
    extra,
    AMBIENT_API_KEY,
    MODEL_ID
  );

  console.log("semi_final_1:", semi1.matchPda.toBase58());
  console.log("semi_final_2:", semi2.matchPda.toBase58());
  console.log("final_match:", finalMatch.matchPda.toBase58());
  console.log("champion:", finalMatch.winner?.toBase58() ?? "tie");
  await writeFile("last_match_pda.txt", `${finalMatch.matchPda.toBase58()}\n`, "utf8");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
