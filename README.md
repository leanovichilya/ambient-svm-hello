# Ambient Web3 Experiment #2 - LLM as Judge (SVM)

Goal: minimal on-chain "judge" flow that
1) submits two inputs + criteria on-chain
2) Ambient evaluates which is better (off-chain)
3) stores the decision and response hash on-chain

## Architecture (oracle pattern)
- On-chain program stores `JudgeRequest { criteria, input_a, input_b, decision, status, response_hash, receipt_root }`.
- Off-chain relayer reads inputs, builds a judge prompt, calls Ambient Web2 API, parses a winner, computes `sha256(responseText)`,
  then calls `fulfill_judge_request` to store `decision` + `response_hash` on-chain.

SVM programs can't do HTTP, so the AI call is done off-chain. On-chain stores a cheap, immutable commitment (hash) and the parsed decision.

## Decision codes
- 0 = unset
- 1 = A
- 2 = B
- 3 = tie

## Logic
- `create_judge_request` stores criteria + input A + input B in a PDA account.
- The relayer builds a deterministic prompt and asks Ambient to return JSON: `{ "winner": "A|B|Tie", "reason": "..." }`.
- The relayer parses the winner, hashes the full raw response, and fulfills the request on-chain.

## Failure cases
- Model response is not parseable JSON or missing `winner` -> relayer fails, request remains pending.
- Relayer crashes or loses key -> pending requests never fulfill.
- Inputs exceed max length -> transaction fails.
- The LLM can be non-deterministic or produce low-quality judgments.

## Limitations
- Off-chain trust: relayer can lie about the decision; hash/receipt only help with auditing.
- No on-chain verification of model behavior or bias.
- Single judge; no quorum or appeal process.
- Fixed input sizes (512 bytes each) and plain text only.

## Example run (devnet)
- Request PDA: 7CAnpfuLudjoY322fkVc5jyEDtyhmuTQi1EYHQmD7ErT (Explorer: https://explorer.solana.com/address/7CAnpfuLudjoY322fkVc5jyEDtyhmuTQi1EYHQmD7ErT?cluster=devnet)
- Fulfill tx: LcTv2iTUgfTkjqxfEbVoZJmbTCNvya2V9fZcHAZHZJz2CWbKigcwwdHHuzh3vhmcHNptEr9KvaUT3HMXzo16544 (Explorer: https://explorer.solana.com/tx/LcTv2iTUgfTkjqxfEbVoZJmbTCNvya2V9fZcHAZHZJz2CWbKigcwwdHHuzh3vhmcHNptEr9KvaUT3HMXzo16544?cluster=devnet)
- Decision: 2 (B)
- Response hash (sha256): 0x4cc8bfb2e5dc9528dd279983741e6f16ccbf22bf91d300cb0d4dcd874d8344f1

### Prompt used
```text
You are a strict judge. Compare Input A vs Input B using the criteria below.
Return ONLY a JSON object with keys: winner (A, B, or Tie) and reason (short).
No extra text.

Criteria: Choose the safer and more correct patch for preventing accidental secret leaks and unsafe logging in a Node relayer that uses an API key. Prefer minimal changes that actually block secrets from being committed and printed. Output JSON only: {"winner":"A"|"B"|"TIE","reason":"1-2 sentences"}.

Input A:
Patch A:

Add .env to .gitignore.

Print the API key at startup to confirm it is loaded.

If request fails, log the full request headers for debugging.

In README, include an example .env with a real-looking API key format to show where it goes.

Input B:
Patch B:

Add .env, .anchor/, target/, and .idea/ to .gitignore.

Use env vars for the API key and never print it; log only whether it is set (true/false).

On errors, log status code and a short message; never log full headers or Authorization.

Add .env.example with placeholder value and README instructions to copy it to .env.
```

### Env vars
Copy `.env.example` to `.env` and fill in secrets.

```bash
cp .env.example .env
```

## How to run (WSL/Linux)
### 1) Build
```bash
anchor build
```

### 2) Create a judge request
The test file creates a request on the configured cluster:
```bash
anchor test --skip-deploy
```

### 3) Fulfill as relayer
```bash
yarn ts-node scripts/relayer_fulfill.ts <REQUEST_PDA>
```
