import * as anchor from "@coral-xyz/anchor";

export function getConfigPda(programId: anchor.web3.PublicKey): anchor.web3.PublicKey {
  const [configPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    programId
  );
  return configPda;
}

export async function ensureConfig(
  program: anchor.Program,
  admin: anchor.web3.PublicKey
): Promise<anchor.web3.PublicKey> {
  const configPda = getConfigPda(program.programId);
  const info = await program.provider.connection.getAccountInfo(configPda);
  if (!info) {
    await program.methods
      .initConfig(admin)
      .accounts({
        admin,
      })
      .rpc();
  }
  return configPda;
}
