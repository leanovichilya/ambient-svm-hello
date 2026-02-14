# Week 5 Write-up: What Is Actually Verified?

Week 5 focused on one boundary: AI output is not auto-truth and should not be auto-execution.

In this repo, we changed the match flow so AI produces a recommendation, not a final on-chain verdict. `finalize_match` now stores `ai_recommendation`, `ai_uncertain`, and `ai_confidence_bps`. A human signer (`player_a` or `player_b`) must call `confirm_match` before `execute_match` can transfer escrow. This makes the system auditable and bounded instead of blindly automated.

What is verifiable:
- Prompt integrity (`prompt_hash`) matches recomputed prompt hash.
- Receipt provenance is recorded (`receipt_root` present).
- On-chain state shows explicit human confirmation before payout (`human_confirmed=1`).

What is not verifiable:
- Whether the model conclusion is true in the real world.
- Whether the recommendation is fair/correct beyond the encoded rules.

Observed run (Ambient RPC, 2026-02-14):
- Program deployed to `https://rpc.ambient.xyz`
- Program ID: `D7qtpBkxFBck6WtnfrcFaf9EnaErg2nfZsTAvRvmCpVW`
- Deploy signature: `3Uh3PZ6cd4Fc2jevcTg7ST6vVcuWsxYc1aXTcegVuP7Ub5pxwEQwHXm7cP3vaCV4QZdqvK9C15RyNq5mvAeP1zHh` (slot `35627931`)
- Match: `5o3m2oS3BqYZbRTGYp6PePCsv63J2FjAAWAgNrnxL5pq`
- Final state: `status=3`, `verdict=1`, `ai_recommendation=1`, `ai_uncertain=0`, `human_confirmed=1`, `human_override=0`
- Verification artifacts: `prompt_hash=41994d7e18b253ddbf048efd8a5951af9aceb3d7fbe2fad0b8107bfc8a0a4b88`, `receipt_root=538e9b5ae11cfb0f72e971882674b2982730aee428016973785d157c8f2ed056`, `model_id=zai-org/GLM-4.6`

On-chain audit summary:
- Confirmed sequence: `CreateMatch -> RevealMatchInput x2 -> SubmitMatchJudgeResult x3 -> FinalizeMatch -> ConfirmMatch -> ExecuteMatch`
- `finalized_slot=35628085`, `execute_after_slot=35628090`, execution happened at slot `35628093` (window respected)
- Escrow economics matched expected flow:
  - create: escrow +`2,000,256` lamports (2 stakes + rent)
  - judges: escrow +`3,000,000` lamports (3 bonds)
  - execute: escrow -`5,000,000` lamports (winner payout + judge bond payouts)
  - final escrow balance: `256` lamports (rent floor)

Operational note (billing boundary):
- Ambient API/chat usage is billed via Web2 credits (USD balance), not AMB token balance.
- AMB is for on-chain activity (fees/testnet activity), so API availability and on-chain wallet balance are separate concerns.

Key takeaway:
Trustless does not mean "AI decides everything." It means decisions are traceable, constrained, and explicitly handed off between verified computation and accountable human/rule control.
