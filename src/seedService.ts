// Seed service (DB-176). Turns a play-day + game index into the deterministic
// seed that drives the Living Deck (DB-170 generator, DB-172 steering), so
// every player gets the SAME daily set. Two phases:
//
//   Phase 1 (launch, no backend): seeds are derived on-device from
//   hash(date, gameIndex, salt). Fully offline; equal for everyone because
//   the date and salt are shared. A determined cheater who reimplements the
//   whole steering algorithm could simulate draws — accepted at launch, same
//   risk every offline word game carries.
//
//   Phase 2 (server, DB-186 Supabase): a server issues the daily seeds and
//   validates submitted move logs by replaying them through the same
//   deterministic steering. The `SeedSource` interface below is the seam —
//   the app depends on it, not on the local hash, so swapping in a server
//   source is a one-line change.

/** Fixed salt so the seed stream is stable across builds but not guessable-trivial. */
export const SEED_SALT = 0x9e3779b9; // golden-ratio constant, arbitrary but fixed

/** A play day as an ISO date string, e.g. "2026-07-19" (UTC). */
export type PlayDay = string;

/** Today's play day (UTC) from a timestamp (ms). Injectable for tests/determinism. */
export function playDayOf(nowMs: number): PlayDay {
  const d = new Date(nowMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 32-bit FNV-1a over a string → unsigned int. */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The deterministic seed for daily game `gameIndex` (0-based) on `day`.
 * Same (day, gameIndex, salt) ⇒ same seed, everywhere.
 */
export function dailySeed(day: PlayDay, gameIndex: number, salt: number = SEED_SALT): number {
  return fnv1a(`${day}#${gameIndex}#${salt}`);
}

/** Source of daily seeds — local hash now, server-issued later (phase 2). */
export interface SeedSource {
  /** Seed for game `gameIndex` (0-based) of the set for `day`. */
  seedFor(day: PlayDay, gameIndex: number): number | Promise<number>;
}

/** Phase-1 offline source: pure hash of (day, gameIndex, salt). */
export function localSeedSource(salt: number = SEED_SALT): SeedSource {
  return { seedFor: (day, gameIndex) => dailySeed(day, gameIndex, salt) };
}
