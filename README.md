# Ambient Web3 Experiment #4 - Provably Fair Match (SVM)

## Week 4 Scope
Emergent behavior: provably fair economic agents enabled by verified inference + on-chain execution.

### Scenario
Two players escrow stake. An AI referee produces a winner with verified inference, and on-chain execution pays out the winner (or refunds on tie).

Match types
- 1 = contest
- 2 = auction
- 3 = simulation

On-chain accounts
- `Match` (match_type, inputs, stake, verdict, prompt_hash, receipt_root, model_id)
- `match_escrow` PDA (system account holding both stakes)

Instructions
- `create_match` (both players escrow stake)
- `finalize_match` (relayer writes verdict + receipt_root + prompt_hash)
- `execute_match` (payout winner or refund on tie)

Off-chain scripts
- `scripts/match_demo.ts` (end-to-end demo)
- `scripts/match_referee.ts` (Ambient referee)
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

Manual flow
1) Referee a match (writes verdict + receipt_root on-chain)
```bash
yarn ts-node scripts/match_referee.ts <MATCH_PDA>
```

2) Execute payout (winner gets stake, tie refunds)
```bash
yarn ts-node scripts/execute_match.ts <MATCH_PDA>
```

3) Read match state
```bash
yarn ts-node scripts/read_match.ts <MATCH_PDA>
```
