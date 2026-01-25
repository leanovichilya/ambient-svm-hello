import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { callAmbient } from "./ambient";
import { getProgram } from "./anchor";
import {
    extractJsonBlock,
    getArgOrExit,
    getModelIdOrExit,
    requireEnv,
    sha256Bytes,
    usage,
} from "./utils";

function buildJudgePrompt(criteria: string, inputA: string, inputB: string): string {
    return [
        "You are a strict judge. Compare Input A vs Input B using the criteria below.",
        "Return ONLY a JSON object with keys: winner (A, B, or Tie) and reason (short).",
        "No extra text.",
        "",
        `Criteria: ${criteria}`,
        "",
        "Input A:",
        inputA,
        "",
        "Input B:",
        inputB,
    ].join("\n");
}

function normalizeWinner(raw: string): number {
    const v = raw.trim().toLowerCase();
    if (v === "a" || v === "input a" || v === "option a") return 1;
    if (v === "b" || v === "input b" || v === "option b") return 2;
    if (v === "tie" || v === "draw" || v === "equal") return 3;
    throw new Error(`Unknown winner value: ${raw}`);
}

function parseDecision(text: string): number {
    const jsonBlock = extractJsonBlock(text);
    if (jsonBlock) {
        try {
            const parsed = JSON.parse(jsonBlock);
            if (parsed?.winner) {
                return normalizeWinner(String(parsed.winner));
            }
        } catch {
        }
    }

    const match = text.match(/winner\s*[:=]\s*([A-Za-z]+)/i);
    if (match?.[1]) {
        return normalizeWinner(match[1]);
    }

    throw new Error("Could not parse winner from model response");
}

async function main() {
    const requestPdaStr = getArgOrExit(usage("relayer_fulfill.ts", "<REQUEST_PDA>"));

    const AMBIENT_API_KEY = requireEnv("AMBIENT_API_KEY");
    const MODEL_ID = getModelIdOrExit();

    const { provider, program } = getProgram();

    const user = provider.wallet.publicKey;
    const requestPda = new anchor.web3.PublicKey(requestPdaStr);


    const req = await program.account.judgeRequest.fetch(requestPda);
    const criteria: string = req.criteria;
    const inputA: string = req.inputA;
    const inputB: string = req.inputB;
    const prompt = buildJudgePrompt(criteria, inputA, inputB);
    console.log("criteria:", criteria);
    console.log("input A:", inputA);
    console.log("input B:", inputB);
    const { data, responseText, receiptRootBytes } = await callAmbient(
        prompt,
        MODEL_ID,
        AMBIENT_API_KEY,
        { retries: 0 }
    );

    if (!responseText) {
        console.error("Could not parse response text. Full response keys:", Object.keys(data));
        console.log(JSON.stringify(data, null, 2));
        process.exit(1);
    }

    console.log("model response:", responseText);
    const decision = parseDecision(responseText);
    console.log("parsed decision:", decision);
    const responseHash = sha256Bytes(responseText);

    const sig = await program.methods
        .fulfillJudgeRequest(decision, responseHash as any, receiptRootBytes as any)
        .accounts({
            request: requestPda,
            relayer: user,
        })
        .rpc();

    console.log("fulfilled tx:", sig);

    const updated = await program.account.judgeRequest.fetch(requestPda);
    console.log("updated status:", updated.status);
    console.log("stored decision:", updated.decision);
    console.log("stored response_hash (first 8 bytes):", Buffer.from(updated.responseHash).toString("hex").slice(0, 16));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
