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
- Fixed input sizes (280 bytes each) and plain text only.

## Example run (devnet)
- Request PDA: GsDXE3GTbbovoXmpZDkAEKurAANUbUpvScnfAd7q6vbG (Explorer: https://explorer.solana.com/address/GsDXE3GTbbovoXmpZDkAEKurAANUbUpvScnfAd7q6vbG?cluster=devnet)
- Fulfill tx: VFc2JskmNNRnENpF97ZUxqwokQyBV8UQUVqGmRSKwM1S78TrdWBXRSGmTCZutR9neBVXS1o5qYsGaoHrc4KLM15 (Explorer: https://explorer.solana.com/tx/VFc2JskmNNRnENpF97ZUxqwokQyBV8UQUVqGmRSKwM1S78TrdWBXRSGmTCZutR9neBVXS1o5qYsGaoHrc4KLM15?cluster=devnet)
- Decision: 2 (B)
- Response hash (sha256): 0xea38c93f2c845444e9f31dba32df6e046154308fe353f93fdd4788e5689cb0fc

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
