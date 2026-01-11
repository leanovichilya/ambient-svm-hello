# Ambient Web3 Experiment #1 - Hello World (SVM)

Goal: minimal on-chain "Hello World" flow that
1) sends a prompt (stores it on-chain as a request)
2) stores the response hash on-chain
No agent logic, just request -> fulfill.

## Architecture (oracle pattern)
- On-chain program stores `Request { prompt, status, response_hash }`.
- Off-chain relayer reads `prompt`, calls Ambient Web2 API, computes `sha256(responseText)`,
  then calls `fulfill_request` to store `response_hash` on-chain.

SVM programs can't do HTTP, so the AI call is done off-chain. On-chain stores a cheap, immutable commitment (hash).

## Deployed (Solana devnet)
ProgramId:
F8ScaDMtYwunu5Xx1geVDPoVon5C4PyjaTsoFbAdCkhu

Example Request PDA:
DdrBY3YfuBz9xGqBxAEnyeBLoVd27Xg5g9byainHyYyo

Example fulfill tx:
4zfwVmmxhm79GFhHt8xth1GsCn1VWHXhGSnoy4XFXTTvFKRPhus4s9gJvkXgZf2d5k2Z9zGzrBGDCPd72HHfstUM

### Env vars
```bash
export ANCHOR_PROVIDER_URL="https://api.devnet.solana.com"
export ANCHOR_WALLET="$HOME/.config/solana/id_ambient.json"
export AMBIENT_API_KEY="YOUR_KEY"
```

## How to run (WSL/Linux)
### 1) Build
```bash
anchor build
