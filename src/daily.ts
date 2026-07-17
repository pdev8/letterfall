// Daily set mode (DB-174) — the public, ranked game. The heart of it is this
// pure, deterministic state machine that composes the whole Living Deck:
//   seed service (DB-176) → per-game seeds, same for everyone
//   difficulty ramp (DB-173) → per-game board shape / generosity / knobs
//   generator (DB-170) → the actual deal for a game (built on demand)
//   scoring (DB-1xx) → each game's banked dealScore
// Five scored games a day, one cumulative daily total, reset at the play-day
// rollover. Free play stays separate and unscored.
//
// The visible daily SCREEN (mode picker, game slots, reset countdown) wires
// this into the app; that layer is intentionally thin over this machine.
import { DAILY_GAME_COUNT, rampFor, type DailyGameParams } from './dailyRamp';
import { generateDeal } from './generate';
import { dailySeed, type PlayDay } from './seedService';
import type { Deal } from './types';

/** One game's slot in the daily set. `score` is 0 until played (win banks it). */
export interface DailyGame {
  seed: number;
  played: boolean;
  won: boolean;
  score: number;
}

export interface DailySet {
  /** The play day this set belongs to (UTC ISO). */
  day: PlayDay;
  games: DailyGame[];
}

/** A fresh, unplayed daily set for `day` — deterministic seeds shared by all players. */
export function newDailySet(day: PlayDay): DailySet {
  const games: DailyGame[] = [];
  for (let i = 0; i < DAILY_GAME_COUNT; i++) {
    games.push({ seed: dailySeed(day, i), played: false, won: false, score: 0 });
  }
  return { day, games };
}

/** Ramp params for daily game `index`. */
export function dailyParams(index: number): DailyGameParams {
  return rampFor(index);
}

/** Build the actual deal for daily game `index` of `set` (deterministic). */
export function dailyDeal(set: DailySet, index: number): Deal {
  const game = set.games[index];
  if (game === undefined) throw new Error(`dailyDeal: index ${index} out of range`);
  const { heights } = rampFor(index);
  return generateDeal(game.seed, { heights });
}

/** The next unplayed game index, or -1 when the set is complete. */
export function nextDailyGame(set: DailySet): number {
  return set.games.findIndex((g) => !g.played);
}

/**
 * Record a finished daily game (immutably). A game is played exactly once —
 * recording an already-played index is a no-op. Losses bank 0 (spec §5).
 */
export function recordDailyGame(
  set: DailySet,
  index: number,
  result: { won: boolean; score: number },
): DailySet {
  const game = set.games[index];
  if (game === undefined || game.played) return set;
  const games = set.games.slice();
  games[index] = {
    ...game,
    played: true,
    won: result.won,
    score: result.won ? Math.max(0, result.score) : 0,
  };
  return { ...set, games };
}

/** Σ of banked scores — the daily total that goes on the leaderboard. */
export function dailyTotal(set: DailySet): number {
  return set.games.reduce((n, g) => n + g.score, 0);
}

/** True once all five games are played. */
export function isDailyComplete(set: DailySet): boolean {
  return set.games.every((g) => g.played);
}

/** Games played so far (0..5). */
export function dailyProgress(set: DailySet): number {
  return set.games.filter((g) => g.played).length;
}

/**
 * The set to use for `day`: keep `prev` if it's the same day, otherwise a
 * fresh set — this is the daily reset. Also rebuilds if `prev` is malformed
 * (wrong game count / seeds), so corrupt storage can't strand the player.
 */
export function dailySetForDay(prev: DailySet | null, day: PlayDay): DailySet {
  if (
    prev !== null &&
    prev.day === day &&
    Array.isArray(prev.games) &&
    prev.games.length === DAILY_GAME_COUNT &&
    prev.games.every((g, i) => g.seed === dailySeed(day, i))
  ) {
    return prev;
  }
  return newDailySet(day);
}

/** ms until the next UTC play day begins — for the reset countdown UX. */
export function msUntilNextDay(nowMs: number): number {
  const d = new Date(nowMs);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  return next - nowMs;
}
