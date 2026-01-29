import * as anchor from "@coral-xyz/anchor";
import {
  MATCH_CHALLENGE_PERIOD_SLOTS,
  MATCH_JUDGES,
  MATCH_STAKE_LAMPORTS,
  MATCH_TYPE,
  JUDGE_LAMPORTS,
} from "./config";
import { buildPromptAndHash } from "./prompt";
import {
  createMatchAndReveal,
  finalizeAndExecuteMatch,
  fundKeypairs,
  runJudgesAndSubmit,
} from "./helpers";
import { fetchMatchState } from "./state";

export async function runMatch(params: {
  program: any;
  playerA: anchor.web3.Keypair;
  playerB: anchor.web3.Keypair;
  criteria: string;
  inputA: string;
  inputB: string;
  extra: string;
  ambientApiKey: string;
  modelId: string;
}) {
  const {
    program,
    playerA,
    playerB,
    criteria,
    inputA,
    inputB,
    extra,
    ambientApiKey,
    modelId,
  } = params;
  const provider = program.provider as anchor.AnchorProvider;

  const nonce = new anchor.BN(Date.now() + Math.floor(Math.random() * 1000));
  const { matchPda } = await createMatchAndReveal({
    program: program as any,
    matchType: MATCH_TYPE,
    criteria,
    extra,
    inputA,
    inputB,
    stakeLamports: MATCH_STAKE_LAMPORTS,
    challengeSlots: MATCH_CHALLENGE_PERIOD_SLOTS,
    nonce,
    playerA: playerA.publicKey,
    playerB: playerB.publicKey,
    signerA: playerA,
    signerB: playerB,
  });

  const { prompt, promptHash } = buildPromptAndHash({
    matchType: MATCH_TYPE,
    criteria,
    inputA,
    inputB,
    extra,
    stakeLamports: MATCH_STAKE_LAMPORTS,
  });

  const judges = Array.from({ length: MATCH_JUDGES }, () => anchor.web3.Keypair.generate());
  await fundKeypairs(provider, judges, JUDGE_LAMPORTS);

  await runJudgesAndSubmit(
    program as any,
    matchPda,
    judges,
    prompt,
    promptHash,
    modelId,
    ambientApiKey
  );

  await finalizeAndExecuteMatch({
    program: program as any,
    matchPda,
    playerA: playerA.publicKey,
    playerB: playerB.publicKey,
    judges: judges.map((j) => j.publicKey),
    finalizer: (program.provider as anchor.AnchorProvider).wallet.publicKey,
    executor: provider.wallet.publicKey,
  });

  const state = await fetchMatchState(program as any, matchPda);
  const verdict = Number(state.match.verdict);
  const winner =
    verdict === 1 ? playerA.publicKey : verdict === 2 ? playerB.publicKey : null;
  return { matchPda, winner };
}
