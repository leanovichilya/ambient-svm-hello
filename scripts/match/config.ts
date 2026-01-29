import {
  JUDGE_LAMPORTS,
  MATCH_CHALLENGE_PERIOD_SLOTS,
  MATCH_STAKE_LAMPORTS,
} from "../constants";

export const MATCH_TYPE = 1;
export const MATCH_JUDGES = 3;
export const MATCH_DEFAULT_CRITERIA = "Pick the more concrete and feasible plan.";
export const MATCH_DEFAULT_INPUT_A =
  "Plan A: deliver MVP in 2 weeks with a small scope and clear milestones.";
export const MATCH_DEFAULT_INPUT_B =
  "Plan B: deliver full product in 2 weeks with no timeline details.";
export const MATCH_DEFAULT_EXTRA = "If insufficient info, return Tie.";
export const MATCH_FUND_PLAYER_B = 2_000_000;
export const TOURNAMENT_FUND_PLAYER = 60_000_000;

export {
  JUDGE_LAMPORTS,
  MATCH_CHALLENGE_PERIOD_SLOTS,
  MATCH_STAKE_LAMPORTS,
};
