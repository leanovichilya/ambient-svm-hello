import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { createHash } from "crypto";
import { getProgram } from "./anchor";
import { fetchProposalFromUrl, ProposalDetails } from "./governance_sources";
import { getArgOrExit } from "./utils";

const MAX_PROPOSAL_TEXT_LEN = 4096;
const MAX_INSTRUCTION_BYTES = 800;

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function truncateUtf8ByBytes(text: string, maxBytes: number): string {
  if (maxBytes <= 0) return "";
  let used = 0;
  let out = "";
  for (const ch of text) {
    const bytes = Buffer.byteLength(ch, "utf8");
    if (used + bytes > maxBytes) break;
    out += ch;
    used += bytes;
  }
  return out;
}

function buildCanonicalProposalText(
  p: ProposalDetails,
  maxBytes: number
): { text: string; truncated: boolean } {
  const title = String(p.title || "").trim();
  const body = String(p.body || "").trim().replace(/\r\n/g, "\n");
  const author = String(p.author || "").trim();
  const space = String(p.space || "").trim();
  const start = Number(p.start || 0);
  const end = Number(p.end || 0);
  const choices = Array.isArray(p.choices) ? p.choices : [];
  const bodyHash = sha256Hex(body);
  const baseLines = [
    `source: ${p.source}`,
    `proposal_id: ${p.proposal_id}`,
    `space: ${space}`,
    `title: ${title}`,
    `author: ${author}`,
    `start_unix: ${start}`,
    `end_unix: ${end}`,
    "choices:",
    ...choices.map((c, i) => `${i + 1}. ${String(c).trim()}`),
    `body_sha256: ${bodyHash}`,
    "body_truncated: false",
    "body:",
  ];
  const baseText = baseLines.join("\n") + "\n";
  const baseBytes = Buffer.byteLength(baseText, "utf8");
  const bodyBytes = Buffer.byteLength(body, "utf8");
  if (baseBytes + bodyBytes <= maxBytes) {
    return { text: baseText + body, truncated: false };
  }
  baseLines[baseLines.length - 2] = "body_truncated: true";
  const truncBaseText = baseLines.join("\n") + "\n";
  const truncBaseBytes = Buffer.byteLength(truncBaseText, "utf8");
  const remaining = maxBytes - truncBaseBytes;
  if (remaining < 0) {
    throw new Error("Proposal text too long for on-chain storage");
  }
  const truncatedBody = truncateUtf8ByBytes(body, remaining);
  return { text: truncBaseText + truncatedBody, truncated: true };
}

async function ensureConfig(
  program: anchor.Program,
  user: anchor.web3.PublicKey
): Promise<anchor.web3.PublicKey> {
  const [configPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  );
  const cfgInfo = await program.provider.connection.getAccountInfo(configPda);
  if (!cfgInfo) {
    await program.methods
      .initConfig(user)
      .accounts({
        admin: user,
      })
      .rpc();
  }
  return configPda;
}

async function main() {
  const proposalUrl = getArgOrExit(
    "Usage: yarn ts-node scripts/create_proposal_from_url.ts <PROPOSAL_URL>"
  );

  const proposal = await fetchProposalFromUrl(proposalUrl);
  const maxBytes = Math.min(MAX_PROPOSAL_TEXT_LEN, MAX_INSTRUCTION_BYTES);
  const { text: canonicalText, truncated } = buildCanonicalProposalText(
    proposal,
    maxBytes
  );

  const { provider, program } = getProgram();
  const user = provider.wallet.publicKey;
  await ensureConfig(program as any, user);

  const nonce = new anchor.BN(Date.now());
  const [requestPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("proposal"), user.toBuffer(), nonce.toArrayLike(Buffer, "le", 8)],
    program.programId
  );

  await program.methods
    .createProposalRequest(proposal.source, proposal.proposal_id, canonicalText, nonce)
    .accounts({
      user,
    })
    .rpc();

  console.log("proposal_request:", requestPda.toBase58());
  console.log("source:", proposal.source);
  console.log("proposal_id:", proposal.proposal_id);
  console.log("body_truncated:", truncated);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
