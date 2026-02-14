# Ambient Web3 Experiment #5 - Verification Boundaries (SVM)

## What changed in Week 5
AI is no longer treated as an auto-verdict.

Current execution boundary:
1) AI judges produce receipts and a recommendation.
2) `finalize_match` stores `ai_recommendation`, `ai_uncertain`, `ai_confidence_bps`.
3) A human signer (`player_a` or `player_b`) must call `confirm_match`.
4) Only then `execute_match` can move funds.

Core principle:
- verified != true
- trustless != fully automated
- trustless = auditable + bounded

## Week 4 docs moved
Week 4 details and older examples are archived in `README_ARCHIVE.md`.

## Requirements
- Solana CLI
- Anchor CLI
- Node.js 18+ and Yarn
- `AMBIENT_API_KEY` in `.env`

## Env setup
```bash
cp .env.example .env
```

Important:
- scripts use `AnchorProvider.env()`, so `ANCHOR_PROVIDER_URL` and `ANCHOR_WALLET` come from environment.
- exported shell variables override `.env`.

Recommended Ambient RPC values:
```bash
ANCHOR_PROVIDER_URL="https://rpc.ambient.xyz"
ANCHOR_WALLET="/home/crypto/.config/solana/ambient-id-home.json"
```

## Ambient RPC + wallet check (`...S5MiCKe`)
```bash
# expected pubkey suffix: ...S5MiCKe
solana-keygen pubkey /home/crypto/.config/solana/ambient-id-home.json

# check what is set in .env
rg '^ANCHOR_PROVIDER_URL=|^ANCHOR_WALLET=' .env

# quick RPC connectivity check with explicit override
ANCHOR_PROVIDER_URL="https://rpc.ambient.xyz" \
ANCHOR_WALLET="/home/crypto/.config/solana/ambient-id-home.json" \
solana -u https://rpc.ambient.xyz block-height
```

## Build and deploy
```bash
anchor build
anchor deploy --provider.cluster https://rpc.ambient.xyz --provider.wallet /home/crypto/.config/solana/ambient-id-home.json --no-idl
```

## Quick run (end-to-end)
```bash
ANCHOR_PROVIDER_URL="https://rpc.ambient.xyz" \
ANCHOR_WALLET="/home/crypto/.config/solana/ambient-id-home.json" \
yarn ts-node scripts/match/demo.ts
```

## Manual Week 5 flow
1) Submit 3 AI judge results
```bash
yarn ts-node scripts/match/referee.ts <MATCH_PDA>
```

2) Finalize AI recommendation
```bash
yarn ts-node scripts/finalize_match.ts <MATCH_PDA>
```

3) Human confirmation (default: accept AI recommendation)
```bash
yarn ts-node scripts/match/confirm_match.ts <MATCH_PDA> [A|B|Tie]
```

4) Execute payout after challenge window
```bash
yarn ts-node scripts/match/execute_match.ts <MATCH_PDA>
```

5) Read state
```bash
yarn ts-node scripts/match/read_match.ts <MATCH_PDA>
```

6) Verify prompt hash and receipt root
```bash
yarn ts-node scripts/match/verify_match_receipt.ts <MATCH_PDA>
```

## Status map
- `0` = collecting/reveal/judges
- `1` = finalized, waiting human confirmation
- `2` = human confirmed, waiting execute window
- `3` = executed

## Menu
Interactive helper:
```bash
bash scripts/menu.sh
```
