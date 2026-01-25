export function merkleRootBytes(merkleRoot: string): number[] {
  let hex = String(merkleRoot).replace(/^0x/, "");
  if (hex.length % 2 === 1) {
    hex = `0${hex}`;
  }
  if (hex.length > 64) {
    throw new Error("merkle_root hex too long");
  }
  const padded = hex.padStart(64, "0");
  return Array.from(Buffer.from(padded, "hex"));
}

export class AmbientApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`Ambient API error ${status}: ${body}`);
    this.status = status;
    this.body = body;
  }
}

export async function callAmbient(
  prompt: string,
  modelId: string,
  apiKey: string
): Promise<{
  data: any;
  responseText: string;
  receiptRootBytes: number[];
  receiptPresent: boolean;
}> {
  const res = await fetch("https://api.ambient.xyz/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      stream: false,
      emit_verified: true,
      wait_for_verification: false,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new AmbientApiError(res.status, t);
  }

  const data: any = await res.json();
  const responseText =
    data?.choices?.[0]?.message?.content ??
    data?.choices?.[0]?.delta?.content ??
    "";

  const merkleRoot = data?.receipt?.merkle_root ?? data?.merkle_root ?? null;
  const receiptRootBytes = merkleRoot
    ? merkleRootBytes(merkleRoot)
    : new Array(32).fill(0);

  return { data, responseText, receiptRootBytes, receiptPresent: Boolean(merkleRoot) };
}
