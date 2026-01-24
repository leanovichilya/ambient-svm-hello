import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AmbientSvmHello } from "../target/types/ambient_svm_hello";

describe("ambient_svm_hello (devnet)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.AmbientSvmHello as Program<AmbientSvmHello>;

  it("init_config (if needed) + create_judge_request", async () => {
    const user = provider.wallet.publicKey;

    const [configPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId
    );

    const cfgInfo = await provider.connection.getAccountInfo(configPda);
    if (!cfgInfo) {
      await program.methods
        .initConfig(user)
        .accounts({
          config: configPda,
          admin: user,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      console.log("config inited:", configPda.toBase58());
    } else {
      console.log("config already exists:", configPda.toBase58());
    }

    const criteria =
      'Choose the safer and more correct patch for preventing accidental secret leaks and unsafe logging in a Node relayer that uses an API key. Prefer minimal changes that actually block secrets from being committed and printed. Output JSON only: {"winner":"A"|"B"|"TIE","reason":"1-2 sentences"}.';
    const inputA = `Patch A:

Add .env to .gitignore.

Print the API key at startup to confirm it is loaded.

If request fails, log the full request headers for debugging.

In README, include an example .env with a real-looking API key format to show where it goes.`;
    const inputB = `Patch B:

Add .env, .anchor/, target/, and .idea/ to .gitignore.

Use env vars for the API key and never print it; log only whether it is set (true/false).

On errors, log status code and a short message; never log full headers or Authorization.

Add .env.example with placeholder value and README instructions to copy it to .env.`;
    const nonce = new anchor.BN(Date.now());

    const [requestPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("req"), user.toBuffer(), nonce.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    await program.methods
      .createJudgeRequest(criteria, inputA, inputB, nonce)
      .accounts({
        config: configPda,
        request: requestPda,
        user,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("request created:", requestPda.toBase58());

    const req = await program.account.judgeRequest.fetch(requestPda);
    console.log("status:", req.status);
    console.log("criteria:", req.criteria);
    console.log("inputA:", req.inputA);
    console.log("inputB:", req.inputB);
  });

  it("create_proposal_request", async () => {
    const user = provider.wallet.publicKey;

    const [configPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId
    );

    const cfgInfo = await provider.connection.getAccountInfo(configPda);
    if (!cfgInfo) {
      await program.methods
        .initConfig(user)
        .accounts({
          config: configPda,
          admin: user,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      console.log("config inited:", configPda.toBase58());
    }

    const proposalText =
      "Proposal: Allocate 5% of the treasury to fund quarterly security audits and publish a public report.";
    const nonce = new anchor.BN(Date.now());

    const [requestPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("proposal"),
        user.toBuffer(),
        nonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    await program.methods
      .createProposalRequest(proposalText, nonce)
      .accounts({
        config: configPda,
        request: requestPda,
        user,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("proposal request created:", requestPda.toBase58());

    const req = await program.account.proposalRequest.fetch(requestPda);
    console.log("proposal status:", req.status);
  });
});
