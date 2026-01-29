# Ambient Web3 Experiment #4 - Provably Fair Match (SVM)

## Week 4 Scope
Emergent behavior: provably fair economic agents enabled by verified inference + on-chain execution.

### Scenario
Two players escrow stake. They commit to inputs, reveal them on-chain, then three AI judges submit receipts and a majority verdict is finalized. After a short challenge window, on-chain execution pays out the winner (or refunds on tie). If only one player reveals by the deadline, that player wins; if neither reveals, it’s a tie refund.

Match types
- 1 = contest
- 2 = auction
- 3 = simulation

On-chain accounts
- `Match` (commitments, revealed inputs, stake, judge counts, verdict, execute_after)
- `MatchJudgeResult` (per-judge verdict + receipt_root + prompt_hash + model_id)
- `match_escrow` PDA (system account holding both stakes)

Instructions
- `create_match` (both players escrow stake + store commitments + configurable challenge window)
- `reveal_match_input` (players reveal inputs)
- `submit_match_judge_result` (3 AI judges submit receipts)
- `finalize_match` (majority verdict or reveal-timeout verdict + sets execute_after)
- `execute_match` (payout winner or refund on tie after challenge window)

Off-chain scripts
- `scripts/match_demo.ts` (end-to-end demo)
- `scripts/match_referee.ts` (submit 1 judge result)
- `scripts/finalize_match.ts`
- `scripts/execute_match.ts`, `scripts/read_match.ts`
- `scripts/verify_match_receipt.ts` (checks prompt_hash consistency + receipt_root presence)

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
- Match PDA: ENK23j13NFQY1BJG7DXe6bwHu5KNyYGxQ6tfBFHXf5Ji
- Final verdict: 1 (A)
- Judge receipt roots:
  - ab7c2b5b51b501fc781601931974bf379f49c041c6bf1e9901d7c5e18c5015b9
  - cf25758a39c5869ad63b2c27748ed885b107dd5959525cd692df425691c3b71e
  - 9d66dbd34b363e0bc8692ca856737fa0987e1d193a25a9ccd281d865c037a732
- Prompt hash: 41994d7e18b253ddbf048efd8a5951af9aceb3d7fbe2fad0b8107bfc8a0a4b88
- Model id: zai-org/GLM-4.6
- Escrow PDA: 8DTVMLHBc6uZSi7S66NxnT3kxQgnYBsoCGA8d5asMX3e
