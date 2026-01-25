import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { AmbientApiError, callAmbient } from "./ambient";
import { getProgram } from "./anchor";
import {
  createProposalWithRevisionAndVote,
  ensureTreasury,
  extractVotesSummary,
  fetchGovernanceState,
  getProposalText,
  logGovernanceState,
} from "./governance";
import { buildJudgePrompt } from "./prompts";
import {
  ACTION_LAMPORTS,
  TREASURY_TOPUP_LAMPORTS,
} from "./constants";
import {
  getModelIdOrExit,
  logReceipt,
  normalizeVerdict,
  parseJsonBlock,
  requireEnv,
} from "./utils";

function parseVerdict(text: string): number {
  const parsed: any = parseJsonBlock(text);
  if (!parsed?.verdict) {
    throw new Error("Missing verdict in model response");
  }
  return normalizeVerdict(String(parsed.verdict));
}

async function main() {
  const args = process.argv.slice(2);
  const skipJudges = args.includes("--skip-judges");
  const skipAction = args.includes("--skip-action");
  const proposalIndex = args.indexOf("--proposal");
  const proposalArg =
    proposalIndex !== -1 && args[proposalIndex + 1] ? args[proposalIndex + 1] : null;

  const AMBIENT_API_KEY = skipJudges ? "" : requireEnv("AMBIENT_API_KEY");
  const MODEL_ID = skipJudges ? "" : getModelIdOrExit();

  const { provider, program } = getProgram();
  const user = provider.wallet.publicKey;

  await ensureTreasury(
    program as any,
    provider,
    ACTION_LAMPORTS,
    TREASURY_TOPUP_LAMPORTS
  );

  let proposalPda: anchor.web3.PublicKey;
  if (proposalArg) {
    proposalPda = new anchor.web3.PublicKey(proposalArg);
  } else {
    const proposalText = "Demo proposal: execute on-chain action after approval.";
    const revisionText = "Revision 1: clarify the action recipient.";
    const created = await createProposalWithRevisionAndVote(
      program as any,
      user,
      proposalText,
      revisionText,
      1
    );
    proposalPda = created.proposalPda;
  }

  const proposal = await program.account.proposal.fetch(proposalPda);
  const votes = extractVotesSummary(proposal as any);
  const prompt = buildJudgePrompt(getProposalText(proposal), votes);

  if (!skipJudges) {
    const judges = [
      anchor.web3.Keypair.generate(),
      anchor.web3.Keypair.generate(),
      anchor.web3.Keypair.generate(),
    ];

    for (let i = 0; i < judges.length; i++) {
      let ambientResult;
      try {
        ambientResult = await callAmbient(prompt, MODEL_ID, AMBIENT_API_KEY);
      } catch (e) {
        if (e instanceof AmbientApiError && (e.status === 429 || e.status === 500)) {
          console.error(`Ambient API ${e.status}`);
          process.exit(1);
        }
        throw e;
      }

      const { responseText, receiptPresent, receiptRootBytes } = ambientResult;
      if (!responseText) {
        console.error("Empty model response");
        process.exit(1);
      }

      const verdictCode = parseVerdict(responseText);
      await program.methods
        .submitJudgeResult(verdictCode)
        .accounts({
          proposal: proposalPda,
          payer: user,
          judge: judges[i].publicKey,
        })
        .signers([judges[i]])
        .rpc();

      console.log(`judge_${i + 1}_verdict:`, verdictCode);
      logReceipt(`judge_${i + 1}`, receiptPresent, receiptRootBytes);
    }

    await program.methods
      .finalizeConsensus()
      .accounts({
        proposal: proposalPda,
        finalizer: user,
      })
      .rpc();
  }

  const updated = await program.account.proposal.fetch(proposalPda);
  if (!skipAction && updated.finalVerdict === 1) {
    await program.methods
      .completeAction()
      .accounts({
        proposal: proposalPda,
        recipient: updated.authority,
        executor: user,
      })
      .rpc();
  }

  const state = await fetchGovernanceState(program as any, proposalPda);
  logGovernanceState(proposalPda, state);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
