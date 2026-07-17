// Daily-set difficulty ramp (DB-173). The 5 scored games of a day get
// progressively harder via board SHAPE, steering GENEROSITY (DB-172), and the
// difficulty knobs recycles + max-parked (DB-131/DB-177). Pure data + helper.
//
// Decision (the DB-173 open question): there is NO separate per-game score
// multiplier. Difficulty comes from the knobs, and `configMult` already
// derives the multiplier from them (game 5's 0 recycles / 1 bay = ×1.4), so
// harder games in the ramp are automatically worth more — no double-counting.
import type { GameConfig } from './scoring';

/** Steering warmth for a daily game: 1 = kindest (game 1), 0 = minimal (game 5). */
export interface DailyGameParams {
  /** Board shape: 7 column heights summing to 28 (position-shuffled at generation). */
  heights: number[];
  /** Steering generosity 0..1 fed to steerNextCard (DB-172). */
  generosity: number;
  /** Difficulty knobs (recycles allowed, max parked) — also set the score multiplier. */
  config: GameConfig;
}

/** The 5 daily games, easiest first. Mirrors the GENERATION.md table. */
export const DAILY_RAMP: readonly DailyGameParams[] = [
  { heights: [4, 4, 4, 4, 4, 4, 4], generosity: 1.0, config: { recycles: 2, parkBays: 3 } },
  { heights: [2, 3, 4, 4, 5, 5, 5], generosity: 0.75, config: { recycles: 2, parkBays: 3 } },
  { heights: [2, 3, 4, 4, 5, 5, 5], generosity: 0.5, config: { recycles: 1, parkBays: 2 } },
  { heights: [1, 2, 3, 4, 5, 6, 7], generosity: 0.25, config: { recycles: 1, parkBays: 2 } },
  { heights: [1, 1, 2, 4, 6, 7, 7], generosity: 0.0, config: { recycles: 0, parkBays: 1 } },
];

/** Number of scored games in a daily set. */
export const DAILY_GAME_COUNT = DAILY_RAMP.length;

/** Params for daily game `index` (0-based). Throws if out of range. */
export function rampFor(index: number): DailyGameParams {
  const p = DAILY_RAMP[index];
  if (p === undefined) {
    throw new Error(`rampFor: game index ${index} out of range 0..${DAILY_RAMP.length - 1}`);
  }
  return p;
}
