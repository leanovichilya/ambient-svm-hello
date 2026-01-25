# Ambient Web3 Experiment #3 - AI-driven governance (SVM)

## Weeks
current = Week 3

### Governance extensions (minimal)

Adds minimal support for revisions, voting, multi-judge consensus, and automation:
- Proposal + ProposalRevision accounts
- VoteRecord (1 wallet = 1 vote, For/Against/Abstain)
- JudgeResult (3 judges) + finalize_consensus (majority)
- ActionRequest created on finalize; complete_action transfers a fixed amount from treasury to proposal author

### Week 3 Web3 Experiment 3: AI-driven governance (AI proposal summarizer)

Goal: minimal on-chain proposal flow that
1) submits a proposal text on-chain
2) Ambient summarizes + returns a verdict (off-chain)
3) stores the verdict and summary hash on-chain

On-chain fields for ProposalRequest
- prompt_hash: sha256 of the exact prompt the relayer sends to the model
- model_id: model name from relayer config
- receipt_root: merkle_root from verified inference receipt when available, otherwise zeros
- source: governance platform (snapshot or tally)
- proposal_id: proposal identifier from the source
- proposal_text: canonical proposal text (may be truncated)

Canonical proposal text
- Deterministic field order: source, proposal_id, space, title, author, start_unix, end_unix, choices, body_sha256, body_truncated, body
- body_sha256 always hashes the full body fetched from the source
- body_truncated is true when the body is shortened to fit transaction size limits
- The create script trims the canonical text to stay within transaction limits (currently ~800 bytes)

AI role (proposal summarizer)
- Off-chain relayer builds a deterministic prompt and calls Ambient to produce a strict JSON verdict + summary
- On-chain stores verdict_code, summary_hash, prompt_hash, model_id, and receipt_root (when provided)

Trust artifacts
- prompt_hash: sha256 of the exact prompt used
- model_id: which model produced the output
- receipt_root: merkle_root from verified inference receipts (if available)

Limitations and failure cases
- Off-chain relayer is trusted and can lie about the decision
- Proposal bodies may be truncated due to transaction size limits
- If Ambient returns invalid JSON, fulfillment fails and the request stays pending
- If Ambient returns 429/500, relayer exits and request remains pending

Verdict codes
- 0 = unset
- 1 = approve
- 2 = reject
- 3 = needs_more_info

Env vars
Copy `.env.example` to `.env` and fill in secrets. AMBIENT_API_KEY is required. TALLY_API_KEY is required only for Tally proposals.

```bash
cp .env.example .env
```

How to run (Week 3)
1) Build
```bash
anchor build
```

Optional: deploy (devnet) if the program changed
```bash
anchor deploy --no-idl
```
If you need to refresh the on-chain IDL:
```bash
anchor idl close F8ScaDMtYwunu5Xx1geVDPoVon5C4PyjaTsoFbAdCkhu
anchor idl init -f target/idl/ambient_svm_hello.json F8ScaDMtYwunu5Xx1geVDPoVon5C4PyjaTsoFbAdCkhu
```

2) Create a proposal request
Create a request from a governance proposal URL (Snapshot or Tally):
```bash
yarn ts-node scripts/create_proposal_from_url.ts <PROPOSAL_URL>
```

You can also create one from the test file on the configured cluster:
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

How to run (Governance minimal flow)
1) Build
```bash
anchor build
```

2) Deploy (devnet) if the program changed
```bash
anchor deploy --no-idl
```

3) Run the minimal flow (creates proposal, revision, votes, 3 judge results, consensus, and action)
```bash
yarn ts-node scripts/governance_minimal_flow.ts
```

Notes
- ActionRequest uses a fixed transfer amount of 0.001 SOL from the treasury PDA.
- The script funds the treasury PDA with 0.002 SOL from your wallet before running the flow.
- Treasury funds are held in a separate PDA vault (`treasury_vault`) to allow system transfers.

Read governance state
```bash
yarn ts-node scripts/read_governance_state.ts <PROPOSAL_PDA>
```

Execute pending action
```bash
yarn ts-node scripts/execute_action.ts <PROPOSAL_PDA>
```

Example run (devnet, governance minimal)
- Proposal PDA: YfHqJZwGK4MERzUPWz4CrnY78vYxzaSaWQp7ANFLLL7
- Action PDA: 25RGL5Bw62ZaWmhBp4SdEpKZCUb5WYzszsDHVopUgFzq
- Treasury vault PDA: 25U9QMCA3Z76i72EjKX1WEv7GDYKUPCpNWMdiJSQWHdY
- Final verdict: 1 (approve)
- Votes: for=1 against=0 abstain=0
- Judge results: approve=2 reject=1 needs=0

Example run (devnet)
- Proposal Request PDA: MHMch9Zb4QkLQXarTaNgoTocZ5Nvh9yN95EQRGi7nWw (Explorer: https://explorer.solana.com/address/MHMch9Zb4QkLQXarTaNgoTocZ5Nvh9yN95EQRGi7nWw?cluster=devnet)
- Fulfill tx: 3GpoMprk6boCeWfv9AYCZDjEsKJjXeHJTdGrKCacbQ5pYo4CEkd4ArbqscLiQbnGQqvNKsuhX4hu9oPkaBi5FJVz (Explorer: https://explorer.solana.com/tx/3GpoMprk6boCeWfv9AYCZDjEsKJjXeHJTdGrKCacbQ5pYo4CEkd4ArbqscLiQbnGQqvNKsuhX4hu9oPkaBi5FJVz?cluster=devnet)
- Verdict: 3 (needs_more_info)
- Summary hash (sha256): 0xf4ec52dc6e64929d4049017feabf24946a9f87c09b40622104e625100f0a49d8
- Prompt hash (sha256): 0x74db00db1ad022ff02a92eea9d6d7401bd8611642e61bb1b38371013f7127fff
- Model id: zai-org/GLM-4.6
- Receipt root: 0xf9f525cd5ff30496af18c0a27100d23db4b48e3cc74ced197ad02ca8c2a5b3d9

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
