// DECKABET scoring — canonical implementation of docs/ROADMAP.md "Scoring".
// Pure functions only. Players never see this math directly (spec §4c):
// the UI presents named bonuses computed from these values.

/** Scrabble-derived letter values (spec §1). */
export const LETTER_VALUES: Readonly<Record<string, number>> = (() => {
  const v: Record<string, number> = {};
  for (const c of 'aeioulnstr') v[c] = 1;
  for (const c of 'dg') v[c] = 2;
  for (const c of 'bcmp') v[c] = 3;
  for (const c of 'fhvwy') v[c] = 4;
  v.k = 5;
  v.j = 8;
  v.x = 8;
  v.q = 10;
  v.z = 10;
  return v;
})();

/** Super-linear length multipliers (spec §2): one 6 beats two 3s. */
export const LENGTH_MULT: Readonly<Record<number, number>> = {
  3: 1.0,
  4: 1.25,
  5: 1.6,
  6: 2.0,
  7: 2.5,
  8: 3.2,
};

export function letterValue(letter: string): number {
  return LETTER_VALUES[letter.toLowerCase()] ?? 0;
}

/**
 * wordScore = round(Σ letterValue × lengthMult). Returns 0 for lengths
 * outside the playable 3-8 range (such words can never be played).
 */
export function wordScore(word: string): number {
  const mult = LENGTH_MULT[word.length];
  if (!mult) return 0;
  let sum = 0;
  for (const ch of word.toLowerCase()) sum += letterValue(ch);
  return Math.round(sum * mult);
}

/** Word-economy multiplier (spec §3): fewer, bigger words beat many small ones. */
export function wordEconomyMult(wordCount: number): number {
  if (wordCount <= 4) return 1.75;
  const table: Record<number, number> = { 5: 1.6, 6: 1.45, 7: 1.3, 8: 1.2, 9: 1.1, 10: 1.05 };
  return table[wordCount] ?? 1.0;
}

/**
 * Stock-economy multiplier (spec §3): start at 1.5, pay for every lean on
 * the stock; a zero-stock, zero-park, zero-recycle clear keeps the full
 * 1.5 (the Purist bonus). Drawing itself is free — consuming costs.
 */
export function stockEconomyMult(
  reserveLettersPlayed: number,
  parksUsed: number,
  recyclesUsed: number,
): number {
  const raw = 1.5 - 0.08 * reserveLettersPlayed - 0.05 * parksUsed - 0.08 * recyclesUsed;
  return Math.min(1.5, Math.max(1.0, raw));
}

/**
 * Per-deal game configuration (DB-131): no named presets — difficulty is two
 * knobs the player sets, and the score multiplier derives from them.
 */
export interface GameConfig {
  /** Reserve→stock recycles allowed per deal (0–2). */
  recycles: number;
  /** Empty columns (from the left) that accept a parked reserve card (1–3). */
  parkBays: number;
}

export const DEFAULT_CONFIG: GameConfig = { recycles: 2, parkBays: 3 };

const clampInt = (v: unknown, lo: number, hi: number, dflt: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : dflt;

/**
 * Clamps an unknown value into a valid GameConfig: integers within range,
 * per-field defaults on garbage, defaults wholesale for non-objects.
 * Never throws — corrupt storage must not crash the game.
 */
export function sanitizeConfig(x: unknown): GameConfig {
  if (typeof x !== 'object' || x === null) return { ...DEFAULT_CONFIG };
  const p = x as Record<string, unknown>;
  return {
    recycles: clampInt(p.recycles, 0, 2, DEFAULT_CONFIG.recycles),
    parkBays: clampInt(p.parkBays, 1, 3, DEFAULT_CONFIG.parkBays),
  };
}

/**
 * configMult = 1.0 + 0.10 × (2 − recycles) + 0.10 × (3 − parkBays).
 * Defaults ×1.0; maximum hardness (0 recycles, 1 bay) ×1.4. Computed in
 * tenths so every step is float-exact.
 */
export function configMult(c: GameConfig): number {
  const s = sanitizeConfig(c);
  return (10 + (2 - s.recycles) + (3 - s.parkBays)) / 10;
}

/** Σ wordScore with Encore: the final word of a winning deal scores double (spec §4b). */
export function dealBaseScore(words: string[]): number {
  const sum = words.reduce((a, w) => a + wordScore(w), 0);
  return words.length > 0 ? sum + wordScore(words[words.length - 1]) : 0;
}

export interface DealOutcome {
  words: string[];
  reserveLettersPlayed: number;
  parksUsed: number;
  recyclesUsed: number;
  config: GameConfig;
}

/** dealScore = round(base × wordEconomy × stockEconomy × configMult) — wins only (spec §3). */
export function dealScore(o: DealOutcome): number {
  return Math.round(
    dealBaseScore(o.words) *
      wordEconomyMult(o.words.length) *
      stockEconomyMult(o.reserveLettersPlayed, o.parksUsed, o.recyclesUsed) *
      configMult(o.config),
  );
}
