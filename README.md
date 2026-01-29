# Ambient Web3 Experiment #4 - Provably Fair Match (SVM)

## Week 4 Scope
Emergent behavior: provably fair economic agents enabled by verified inference + on-chain execution.

## Requirements
- Solana CLI installed and configured for devnet
- Anchor CLI installed
- Node.js 18+ with Yarn (corepack or global yarn)

Install deps:
```bash
yarn install
```

### Scenario
Two players escrow stake. They commit to inputs, reveal them on-chain, then three AI judges submit receipts and a majority verdict is finalized. After a short challenge window (slot-based), on-chain execution pays out the winner (or refunds on tie). If only one player reveals by the deadline, that player wins; if neither reveals, it’s a tie refund. Judges post a small bond; minority judges are slashed to the winner.

Match types
- 1 = contest
- 2 = auction
- 3 = simulation

On-chain accounts
- `Match` (commitments, revealed inputs, stake, judge counts, verdict, execute_after)
- `MatchJudgeResult` (per-judge verdict + receipt_root + prompt_hash + model_id)
- `match_escrow` PDA (system account holding both stakes)

Instructions
- `create_match` (both players escrow stake + store commitments + configurable challenge window in slots)
- `reveal_match_input` (players reveal inputs)
- `submit_match_judge_result` (3 AI judges submit receipts + bond)
- `finalize_match` (majority verdict or reveal-timeout verdict + sets execute_after)
- `execute_match` (payout winner/refund + distribute judge bonds after challenge window)

Off-chain scripts
- `scripts/match_demo.ts` (end-to-end demo)
- `scripts/match_referee.ts` (submit 1 judge result)
- `scripts/finalize_match.ts`
- `scripts/execute_match.ts`, `scripts/read_match.ts`
- `scripts/verify_match_receipt.ts` (checks prompt_hash consistency + receipt_root presence)
- `scripts/tournament_demo.ts` (2 semifinals + final, prints champion)
- `scripts/menu.sh` (interactive menu to run demos and checks)
- `last_match_pda.txt` is written by demos for quick lookups
- `last_champion_pubkey.txt` is written by tournament demo for quick lookups

Env vars
Copy `.env.example` to `.env` and fill in secrets. AMBIENT_API_KEY is required.

```bash
cp .env.example .env
```
Optional env validation:
```bash
yarn ts-node scripts/validate_env.ts
```

Build / deploy
```bash
anchor build
anchor deploy --no-idl
```

Run demo (end-to-end)
```bash
yarn ts-node scripts/match_demo.ts
```

Manual flow (match already created + revealed)
1) Submit 3 judge results (run 3x)
```bash
yarn ts-node scripts/match_referee.ts <MATCH_PDA>
```

2) Finalize consensus
```bash
yarn ts-node scripts/finalize_match.ts <MATCH_PDA>
```

3) Execute payout after challenge window
```bash
yarn ts-node scripts/execute_match.ts <MATCH_PDA>
```

4) Read match state
```bash
yarn ts-node scripts/read_match.ts <MATCH_PDA>
```

5) Verify prompt hash and receipt root presence
```bash
yarn ts-node scripts/verify_match_receipt.ts <MATCH_PDA>
```

Example run (devnet, match demo)
- Match PDA: 5zZgyuPFBSWAKqopMi35zdpjiuM1HZo42KcM9YnrqjPo
- Final verdict: 1 (A)
- Judge receipt roots:
  - 63ce62919f3e4c3a07743fb96402817cb385b511b6e9757805ed9c7d85a30197
  - 8a2d3130a4ea9879a8c5990c3858fb87f41b17e0a9bbaf850a19857706561e4c
  - bb607c7093cb4c884e73eb1f108473c3c5fd52b74e4eaba575d07fc1029c6beb
- Prompt hash: 41994d7e18b253ddbf048efd8a5951af9aceb3d7fbe2fad0b8107bfc8a0a4b88
- Model id: zai-org/GLM-4.6
- Escrow PDA: 5z29K75AHdzXnfvuhLRKTeETL1ni4aFE3UTPchxCnPtU

Example run (devnet, tournament demo)
- Semi final 1: 7rRu2mzgSPwBaBwRqpHq3msuzAzZpk9uHiW3rkVPeuHp
- Semi final 2: 9TpNi44Ac9VA4Eo4KRXV232LpcX3XHA7fDkD5f9fFHSV
- Final match: 2VBqVcZdvPqnnH9aVMRNjJbsfHsaniHRpyV8RtandL2Z
- Champion: BJnbMvEfa5byaMeVt7cAz3RB65jHyS5oQN4qoQooSa1s
