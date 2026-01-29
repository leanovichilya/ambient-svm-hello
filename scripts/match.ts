import * as anchor from "@coral-xyz/anchor";
import { createHash } from "crypto";

export function getMatchPda(
  programId: anchor.web3.PublicKey,
  playerA: anchor.web3.PublicKey,
  nonce: anchor.BN
): anchor.web3.PublicKey {
  const [matchPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("match"), playerA.toBuffer(), nonce.toArrayLike(Buffer, "le", 8)],
    programId
  );
  return matchPda;
}

export function getMatchEscrowPda(
  programId: anchor.web3.PublicKey,
  matchPda: anchor.web3.PublicKey
): anchor.web3.PublicKey {
  const [escrowPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("match_escrow"), matchPda.toBuffer()],
    programId
  );
  return escrowPda;
}

export function getMatchJudgePda(
  programId: anchor.web3.PublicKey,
  matchPda: anchor.web3.PublicKey,
  judge: anchor.web3.PublicKey
): anchor.web3.PublicKey {
  const [judgePda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("match_judge"), matchPda.toBuffer(), judge.toBuffer()],
    programId
  );
  return judgePda;
}

export function commitMatchInput(input: string, salt: Buffer): number[] {
  const hash = createHash("sha256");
  hash.update(Buffer.from("match"));
  hash.update(Buffer.from(input, "utf8"));
  hash.update(salt);
  return Array.from(hash.digest());
}

export async function fetchMatchState(
  program: anchor.Program,
  matchPda: anchor.web3.PublicKey
): Promise<{
  match: any;
  escrowPda: anchor.web3.PublicKey;
  escrowLamports: number;
}> {
  const accountNs: any = (program as any).account;
  const match = await accountNs.match.fetch(matchPda);
  const escrowPda = getMatchEscrowPda(program.programId, matchPda);
  const escrowLamports =
    (await program.provider.connection.getAccountInfo(escrowPda))?.lamports ?? 0;
  return { match, escrowPda, escrowLamports };
}

export function logMatchState(
  matchPda: anchor.web3.PublicKey,
  state: { match: any; escrowPda: anchor.web3.PublicKey; escrowLamports: number }
): void {
  const { match, escrowPda, escrowLamports } = state;
  console.log("match:", matchPda.toBase58());
  console.log("player_a:", match.playerA.toBase58());
  console.log("player_b:", match.playerB.toBase58());
  console.log("status:", match.status);
  console.log("match_type:", match.matchType);
  console.log("stake_lamports:", match.stakeLamports);
  console.log("verdict:", match.verdict);
  console.log("prompt_hash:", Buffer.from(match.promptHash).toString("hex"));
  console.log("receipt_root:", Buffer.from(match.receiptRoot).toString("hex"));
  console.log("model_id:", match.modelId);
  console.log("criteria:", match.criteria);
  console.log("input_a:", match.inputA);
  console.log("input_b:", match.inputB);
  console.log("extra:", match.extra);
  console.log("commit_a:", Buffer.from(match.commitA).toString("hex"));
  console.log("commit_b:", Buffer.from(match.commitB).toString("hex"));
  console.log("revealed_a:", match.revealedA);
  console.log("revealed_b:", match.revealedB);
  console.log("reveal_deadline:", match.revealDeadline.toString());
  console.log("finalized_slot:", match.finalizedSlot.toString());
  console.log("execute_after_slot:", match.executeAfterSlot.toString());
  console.log("judge_a:", match.judgeA);
  console.log("judge_b:", match.judgeB);
  console.log("judge_tie:", match.judgeTie);
  console.log("judge_count:", match.judgeCount);
  console.log("executor:", match.executor.toBase58());
  console.log("escrow:", escrowPda.toBase58());
  console.log("escrow_lamports:", escrowLamports);
}
