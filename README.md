# Ambient Web3 Experiment #4 - Provably Fair Match (SVM)

## Week 4 Scope
Emergent behavior: provably fair economic agents enabled by verified inference + on-chain execution.

### Scenario
Two players escrow stake. They commit to inputs, reveal them on-chain, then three AI judges submit receipts and a majority verdict is finalized. After a short challenge window, on-chain execution pays out the winner (or refunds on tie).

Match types
- 1 = contest
- 2 = auction
- 3 = simulation

On-chain accounts
- `Match` (commitments, revealed inputs, stake, judge counts, verdict, execute_after)
- `MatchJudgeResult` (per-judge verdict + receipt_root + prompt_hash + model_id)
- `match_escrow` PDA (system account holding both stakes)

Instructions
- `create_match` (both players escrow stake + store commitments)
- `reveal_match_input` (players reveal inputs)
- `submit_match_judge_result` (3 AI judges submit receipts)
- `finalize_match` (majority verdict + sets execute_after)
- `execute_match` (payout winner or refund on tie after challenge window)

Off-chain scripts
- `scripts/match_demo.ts` (end-to-end demo)
- `scripts/match_referee.ts` (submit 1 judge result)
- `scripts/finalize_match.ts`
- `scripts/execute_match.ts`, `scripts/read_match.ts`

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

Example run (devnet, match demo)
- Match PDA: 91rotwDSYp9nr5MvLPhuez1e4TFibm4rmMayC8iikPoz
- Final verdict: 1 (A)
- Judge receipt roots:
  - cdc701b2db7de4c08c7453389812a3ec91919600f14d8ff7422102d92aecfb73
  - 7299930bccbf03b5cd57c2c1b987950b6bf48b4e3b6f969b4732928e36cd8136
  - d2966db41a921d026edbe14cfd05082eb96b1495c67d1b0b29fad3ac49a59ff7
- Prompt hash: 41994d7e18b253ddbf048efd8a5951af9aceb3d7fbe2fad0b8107bfc8a0a4b88
- Model id: zai-org/GLM-4.6
- Escrow PDA: 7QMtM6ecdYZ4hfV2DDzAjFLq8jXKM5F9goQt99UW9dtb
