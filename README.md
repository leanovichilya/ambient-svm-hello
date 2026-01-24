# Ambient Web3 Experiment #3 - AI-driven governance (SVM)

## Weeks
current = Week 3

### Week 3 Web3 Experiment 3: AI-driven governance (AI proposal summarizer)

Goal: minimal on-chain proposal flow that
1) submits a proposal text on-chain
2) Ambient summarizes + returns a verdict (off-chain)
3) stores the verdict and summary hash on-chain

Verdict codes
- 0 = unset
- 1 = approve
- 2 = reject
- 3 = needs_more_info

Env vars
Copy `.env.example` to `.env` and fill in secrets.

```bash
cp .env.example .env
```

How to run (Week 3)
1) Build
```bash
anchor build
```

2) Create a proposal request
The test file creates a request on the configured cluster:
```bash
anchor test --skip-deploy
```

3) Fulfill as relayer
```bash
yarn ts-node scripts/relayer_proposal_fulfill.ts <PROPOSAL_REQUEST_PDA>
```

4) Read proposal request (inspect on-chain state)
```bash
yarn ts-node scripts/read_proposal_request.ts <PROPOSAL_REQUEST_PDA>
```

Example run (devnet)
- Proposal Request PDA: JAPocCSRDnuBk7MVsqXEHTmuAGkrPhHfdb728MDYqrX3 (Explorer: https://explorer.solana.com/address/JAPocCSRDnuBk7MVsqXEHTmuAGkrPhHfdb728MDYqrX3?cluster=devnet)
- Fulfill tx: 5Mm2HKj47UspmYEszLFZZdCobt4Xz8bujCzepUFAs17xYNfqBcJSvKhVBxjJXRP7cEEhAG3jpDuAsM67rsD1EKTR (Explorer: https://explorer.solana.com/tx/5Mm2HKj47UspmYEszLFZZdCobt4Xz8bujCzepUFAs17xYNfqBcJSvKhVBxjJXRP7cEEhAG3jpDuAsM67rsD1EKTR?cluster=devnet)
- Verdict: 3 (needs_more_info)
- Summary hash (sha256): 0x0fbafd3dff3250b4f8c5d1f3074b8ed623b5b8a5e9308bfccf2c042e1b2d1a15

### Week 2 is live: Stress the Edges

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
