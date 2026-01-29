import * as anchor from "@coral-xyz/anchor";

export function logMatchState(
  matchPda: anchor.web3.PublicKey,
  state: { match: any; escrowPda: anchor.web3.PublicKey; escrowLamports: number },
  mode: "short" | "full" = "full"
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
  console.log("executor:", match.executor.toBase58());
  console.log("escrow:", escrowPda.toBase58());
  console.log("escrow_lamports:", escrowLamports);

  if (mode === "short") {
    return;
  }

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
}
