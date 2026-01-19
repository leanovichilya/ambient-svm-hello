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

    const criteria = "Pick the clearer and more helpful response.";
    const inputA = "Here is a vague answer with no specifics.";
    const inputB = "This response is concise, specific, and addresses the question.";
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
});
