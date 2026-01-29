import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { assert } from "chai";
import { AmbientSvmHello } from "../target/types/ambient_svm_hello";
import { commitMatchInput, getMatchPda } from "../scripts/match/state";

const STAKE_LAMPORTS = 1_000_000;
const CHALLENGE_SLOTS = 2;
const FUND_PLAYER_B = 2_000_000;
const FUND_JUDGE = 5_000_000;

async function fundWallet(
  provider: anchor.AnchorProvider,
  to: anchor.web3.PublicKey,
  lamports: number
) {
  const tx = new anchor.web3.Transaction().add(
    anchor.web3.SystemProgram.transfer({
      fromPubkey: provider.wallet.publicKey,
      toPubkey: to,
      lamports,
    })
  );
  await provider.sendAndConfirm(tx, []);
}

async function waitForSlot(
  provider: anchor.AnchorProvider,
  target: number,
  maxChecks = 10,
  intervalMs = 500
) {
  for (let i = 0; i < maxChecks; i += 1) {
    const slot = await provider.connection.getSlot();
    if (slot >= target) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

describe("match flow (devnet)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.AmbientSvmHello as Program<AmbientSvmHello>;

  it("create → reveal → judges → finalize → execute", async () => {
    const playerA = provider.wallet.publicKey;
    const playerB = anchor.web3.Keypair.generate();
    await fundWallet(provider, playerB.publicKey, FUND_PLAYER_B);

    const judges = Array.from({ length: 3 }, () => anchor.web3.Keypair.generate());
    for (const judge of judges) {
      await fundWallet(provider, judge.publicKey, FUND_JUDGE);
    }

    const criteria = "Pick the more concrete and feasible plan.";
    const inputA = "Plan A: deliver MVP in 2 weeks with a small scope and clear milestones.";
    const inputB = "Plan B: deliver full product in 2 weeks with no timeline details.";
    const extra = "If insufficient info, return Tie.";
    const saltA = anchor.web3.Keypair.generate().secretKey.slice(0, 16);
    const saltB = anchor.web3.Keypair.generate().secretKey.slice(0, 16);
    const commitA = commitMatchInput(inputA, Buffer.from(saltA));
    const commitB = commitMatchInput(inputB, Buffer.from(saltB));
    const nonce = new anchor.BN(Date.now() + Math.floor(Math.random() * 1000));
    const matchPda = getMatchPda(program.programId, playerA, nonce);

    await program.methods
      .createMatch(
        1,
        criteria,
        extra,
        commitA as any,
        commitB as any,
        new anchor.BN(STAKE_LAMPORTS),
        new anchor.BN(CHALLENGE_SLOTS),
        nonce
      )
      .accounts({
        playerA,
        playerB: playerB.publicKey,
      })
      .signers([playerB])
      .rpc();

    await program.methods
      .revealMatchInput(inputA, Buffer.from(saltA))
      .accounts({
        gameMatch: matchPda,
        player: playerA,
      })
      .rpc();

    await program.methods
      .revealMatchInput(inputB, Buffer.from(saltB))
      .accounts({
        gameMatch: matchPda,
        player: playerB.publicKey,
      })
      .signers([playerB])
      .rpc();

    const receiptRoot = new Array(32).fill(2);
    const promptHash = new Array(32).fill(1);
    for (const judge of judges) {
      await program.methods
        .submitMatchJudgeResult(1, receiptRoot as any, promptHash as any, "test-model")
        .accounts({
          gameMatch: matchPda,
          judge: judge.publicKey,
        })
        .signers([judge])
        .rpc();
    }

    await program.methods
      .finalizeMatch()
      .accounts({
        gameMatch: matchPda,
        finalizer: playerA,
      })
      .rpc();

    const mAfterFinalize: any = await (program as any).account.match.fetch(matchPda);
    await waitForSlot(provider, Number(mAfterFinalize.executeAfterSlot));

    await program.methods
      .executeMatch()
      .accounts({
        gameMatch: matchPda,
        playerA,
        playerB: playerB.publicKey,
        judge0: judges[0].publicKey,
        judge1: judges[1].publicKey,
        judge2: judges[2].publicKey,
        executor: playerA,
      })
      .rpc();

    const m: any = await (program as any).account.match.fetch(matchPda);
    assert.equal(Number(m.status), 2);
    assert.equal(Number(m.verdict), 1);
  });

  it("execute before challenge window fails", async () => {
    const playerA = provider.wallet.publicKey;
    const playerB = anchor.web3.Keypair.generate();
    await fundWallet(provider, playerB.publicKey, FUND_PLAYER_B);

    const judges = Array.from({ length: 3 }, () => anchor.web3.Keypair.generate());
    for (const judge of judges) {
      await fundWallet(provider, judge.publicKey, FUND_JUDGE);
    }

    const criteria = "Pick the more concrete and feasible plan.";
    const inputA = "Plan A: deliver MVP in 2 weeks with a small scope and clear milestones.";
    const inputB = "Plan B: deliver full product in 2 weeks with no timeline details.";
    const extra = "If insufficient info, return Tie.";
    const saltA = anchor.web3.Keypair.generate().secretKey.slice(0, 16);
    const saltB = anchor.web3.Keypair.generate().secretKey.slice(0, 16);
    const commitA = commitMatchInput(inputA, Buffer.from(saltA));
    const commitB = commitMatchInput(inputB, Buffer.from(saltB));
    const nonce = new anchor.BN(Date.now() + Math.floor(Math.random() * 1000));
    const matchPda = getMatchPda(program.programId, playerA, nonce);

    await program.methods
      .createMatch(
        1,
        criteria,
        extra,
        commitA as any,
        commitB as any,
        new anchor.BN(STAKE_LAMPORTS),
        new anchor.BN(CHALLENGE_SLOTS),
        nonce
      )
      .accounts({
        playerA,
        playerB: playerB.publicKey,
      })
      .signers([playerB])
      .rpc();

    await program.methods
      .revealMatchInput(inputA, Buffer.from(saltA))
      .accounts({
        gameMatch: matchPda,
        player: playerA,
      })
      .rpc();

    await program.methods
      .revealMatchInput(inputB, Buffer.from(saltB))
      .accounts({
        gameMatch: matchPda,
        player: playerB.publicKey,
      })
      .signers([playerB])
      .rpc();

    const receiptRoot = new Array(32).fill(2);
    const promptHash = new Array(32).fill(1);
    for (const judge of judges) {
      await program.methods
        .submitMatchJudgeResult(1, receiptRoot as any, promptHash as any, "test-model")
        .accounts({
          gameMatch: matchPda,
          judge: judge.publicKey,
        })
        .signers([judge])
        .rpc();
    }

    await program.methods
      .finalizeMatch()
      .accounts({
        gameMatch: matchPda,
        finalizer: playerA,
      })
      .rpc();

    let failed = false;
    try {
      await program.methods
        .executeMatch()
        .accounts({
          gameMatch: matchPda,
          playerA,
          playerB: playerB.publicKey,
          judge0: judges[0].publicKey,
          judge1: judges[1].publicKey,
          judge2: judges[2].publicKey,
          executor: playerA,
        })
        .rpc();
    } catch (e: any) {
      failed = true;
      const msg = String(e);
      assert.include(msg, "ChallengePeriodActive");
    }
    assert.equal(failed, true);
  });
});
