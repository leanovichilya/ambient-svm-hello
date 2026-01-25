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
Optional env validation:
```bash
yarn ts-node scripts/validate_env.ts
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
Flags:
- `--skip-judges` to skip Ambient calls and consensus
- `--skip-action` to skip action execution
- `--proposal <PDA>` to reuse an existing proposal

Example run (devnet, demo runner)
- Proposal PDA: AntU77zSZLYRXjJt8UCbPQUgA1tixSF415LsfehduihV
- Final verdict: 3 (needs_more_info)
- Votes: for=1 against=0 abstain=0
- Judge results: approve=0 reject=0 needs=3
- Receipt roots (3 judges):
  - b1cd9058943dc1c3fe9d508e35af86f968d88d8958fbb07c13f8be3a7bd48e17
  - d118f6bb6cb6a02374019fc3ebd51ba05929964563e0475a2f751afaa5db3103
  - e3cc5162b6aa9f5de1d81de8d77fb4d7c25eeed27dcd68bf0daf7be7415f3917
