import * as anchor from "@coral-xyz/anchor";
import {Program} from "@coral-xyz/anchor";
import {createHash} from "crypto";
import {AmbientSvmHello} from "../target/types/ambient_svm_hello";

function sha256Bytes(text: string): number[] {
    return Array.from(createHash("sha256").update(text, "utf8").digest());
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


    // 1) read on-chain prompt
    const req = await program.account.request.fetch(requestPda);
    const prompt: string = req.prompt;
    console.log("on-chain prompt:", prompt);

    // 2) call Ambient Web2 inference (no stream)
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

    // receipt root
    const merkleRoot = data?.receipt?.merkle_root ?? data?.merkle_root ?? null;
    const receiptRootBytes = merkleRoot
        ? Array.from(Buffer.from(String(merkleRoot).replace(/^0x/, ""), "hex"))
        : new Array(32).fill(0);

    // 3) hash response
    const responseHash = sha256Bytes(responseText);

    // 4) fulfill on-chain
    const sig = await program.methods
        .fulfillRequest(responseHash as any, receiptRootBytes as any)
        .accounts({
            request: requestPda,
            relayer: user,
        })
        .rpc();

    console.log("fulfilled tx:", sig);

    // 5) verify on-chain state
    const updated = await program.account.request.fetch(requestPda);
    console.log("updated status:", updated.status);
    console.log("stored response_hash (first 8 bytes):", Buffer.from(updated.responseHash).toString("hex").slice(0, 16));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
