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
