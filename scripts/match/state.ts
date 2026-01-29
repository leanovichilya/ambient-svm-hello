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
