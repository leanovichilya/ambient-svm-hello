# Ambient Web3 Experiment #3 - AI-driven governance (SVM)

## Week 3 Scope
AI-driven governance and automation with verified inference artifacts.

### AI Proposal Summarizer (Snapshot/Tally -> Ambient -> On-chain)
Goal: minimal on-chain proposal request that stores a verifiable AI verdict.

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

AI role
- Off-chain relayer builds a deterministic prompt and calls Ambient to produce strict JSON verdict + summary
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

How to run (proposal summarizer)
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

2) Create a proposal request from a governance URL (Snapshot or Tally)
```bash
yarn ts-node scripts/create_proposal_from_url.ts <PROPOSAL_URL>
```

3) Fulfill as relayer
```bash
yarn ts-node scripts/relayer_proposal_fulfill.ts <PROPOSAL_REQUEST_PDA>
```

4) Read proposal request (inspect on-chain state)
```bash
yarn ts-node scripts/read_proposal_request.ts <PROPOSAL_REQUEST_PDA>
```

### Governance Extensions (Minimal)
Adds minimal support for revisions, voting, multi-judge consensus, and automation:
- Proposal + ProposalRevision accounts
- VoteRecord (1 wallet = 1 vote, For/Against/Abstain)
- JudgeResult (3 judges) + finalize_consensus (majority)
- ActionRequest created on finalize; complete_action transfers a fixed amount from treasury to proposal author

How to run (governance minimal flow)
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
- ActionRequest uses a fixed transfer amount of 0.001 SOL from the treasury vault.
- The script funds the treasury vault with 0.002 SOL from your wallet before running the flow.
- Treasury funds are held in a separate PDA vault (`treasury_vault`) to allow system transfers.

Read governance state
```bash
yarn ts-node scripts/read_governance_state.ts <PROPOSAL_PDA>
```

Execute pending action
```bash
yarn ts-node scripts/execute_action.ts <PROPOSAL_PDA>
```

### AI Judges + Consensus (Ambient)
1) Create a proposal (no judges yet)
```bash
yarn ts-node scripts/create_governance_proposal.ts
```

2) Run AI judges (3 Ambient calls), finalize consensus, and auto-complete action on approve
```bash
yarn ts-node scripts/ai_judge_consensus.ts <PROPOSAL_PDA>
```

Notes
- Requires AMBIENT_API_KEY (and optional AMBIENT_MODEL_ID)
- Logs receipt_root when the API returns a verified receipt
- Ensures treasury and vault exist, and tops up the vault if needed for action execution

3) Read state
```bash
yarn ts-node scripts/read_governance_state.ts <PROPOSAL_PDA>
```

### Demo Runner (All-in-one)
Runs the full governance flow in one command (create proposal + 3 AI judges + consensus + action execution).
```bash
yarn ts-node scripts/demo_runner.ts
```

Example run (devnet, proposal summarizer)
- Proposal Request PDA: MHMch9Zb4QkLQXarTaNgoTocZ5Nvh9yN95EQRGi7nWw
- Fulfill tx: 3GpoMprk6boCeWfv9AYCZDjEsKJjXeHJTdGrKCacbQ5pYo4CEkd4ArbqscLiQbnGQqvNKsuhX4hu9oPkaBi5FJVz
- Verdict: 3 (needs_more_info)
- Summary hash (sha256): 0xf4ec52dc6e64929d4049017feabf24946a9f87c09b40622104e625100f0a49d8
- Prompt hash (sha256): 0x74db00db1ad022ff02a92eea9d6d7401bd8611642e61bb1b38371013f7127fff
- Model id: zai-org/GLM-4.6
- Receipt root: 0xf9f525cd5ff30496af18c0a27100d23db4b48e3cc74ced197ad02ca8c2a5b3d9

Example run (devnet, governance minimal)
- Proposal PDA: YfHqJZwGK4MERzUPWz4CrnY78vYxzaSaWQp7ANFLLL7
- Action PDA: 25RGL5Bw62ZaWmhBp4SdEpKZCUb5WYzszsDHVopUgFzq
- Treasury vault PDA: 25U9QMCA3Z76i72EjKX1WEv7GDYKUPCpNWMdiJSQWHdY
- Final verdict: 1 (approve)
- Votes: for=1 against=0 abstain=0
- Judge results: approve=2 reject=1 needs=0

Example run (devnet, AI judges + consensus)
- Proposal PDA: ALAWAgzjkWk8mdn5M227dPXdgDefdkLcwcvujx2BFicU
- Action PDA: FCPgeA54xBGftEqe6Z1bYuy5Bmv2zEWnQgZkeo5F6H8Q
- Treasury vault PDA: 25U9QMCA3Z76i72EjKX1WEv7GDYKUPCpNWMdiJSQWHdY
- Final verdict: 3 (needs_more_info)
- Votes: for=1 against=0 abstain=0
- Judge results: approve=0 reject=0 needs=3
- Receipt roots (3 judges):
  - 2dec920d5de22f3d0dd08a18d0f6428e11fcbe67563b74b6ef9faa19dca3907e
  - 08172b44a0051d1a0627a6f15acb54c267b4956ef77e4cdba18374fa4747d526
  - f4deae173e6b0e9ce83dc87686ef7b5eeed9072b90ec9b8764e5b6d03a76833a
