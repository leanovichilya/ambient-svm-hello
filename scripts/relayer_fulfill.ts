import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import {Program} from "@coral-xyz/anchor";
import {createHash} from "crypto";
import {AmbientSvmHello} from "../target/types/ambient_svm_hello";

function sha256Bytes(text: string): number[] {
    return Array.from(createHash("sha256").update(text, "utf8").digest());
}

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

function extractJsonBlock(text: string): string | null {
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const body = fenceMatch ? fenceMatch[1] : text;
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
        return null;
    }
    return body.slice(start, end + 1);
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
    const requestPdaStr = process.argv[2];
    if (!requestPdaStr) {
        console.error("Usage: yarn ts-node scripts/relayer_fulfill.ts <REQUEST_PDA>");
        process.exit(1);
    }

    const AMBIENT_API_KEY = process.env.AMBIENT_API_KEY;
    if (!AMBIENT_API_KEY) {
        console.error("Missing AMBIENT_API_KEY in env");
        process.exit(1);
    }

    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const program = anchor.workspace.AmbientSvmHello as Program<AmbientSvmHello>;

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

    const res = await fetch("https://api.ambient.xyz/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${AMBIENT_API_KEY}`,
        },
        body: JSON.stringify({
            model: "ambient-1",
            stream: false,
            emit_verified: true,
            wait_for_verification: false,
            messages: [{role: "user", content: prompt}],
        }),
    });

    if (!res.ok) {
        const t = await res.text();
        throw new Error(`Ambient API error ${res.status}: ${t}`);
    }

    const data: any = await res.json();

    const responseText =
        data?.choices?.[0]?.message?.content ??
        data?.choices?.[0]?.delta?.content ??
        "";

    if (!responseText) {
        console.error("Could not parse response text. Full response keys:", Object.keys(data));
        console.log(JSON.stringify(data, null, 2));
        process.exit(1);
    }

    console.log("model response:", responseText);

    const merkleRoot = data?.receipt?.merkle_root ?? data?.merkle_root ?? null;
    const receiptRootBytes = merkleRoot
        ? Array.from(Buffer.from(String(merkleRoot).replace(/^0x/, ""), "hex"))
        : new Array(32).fill(0);

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
