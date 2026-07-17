// Missed-word feedback loop (DB-203) — pure accounting, no React, no I/O.
// Valid-looking words the player attempts that the lexicon rejects are
// tallied here so dictionary gaps become data (feeds the DB-201 pipeline's
// additions overlay; Supabase sync lands with DB-186).

/** Cap on tracked words — the map never grows past this. */
export const MISSED_LIMIT = 500;

/** Rejected word -> times the player attempted it. */
export type MissedWords = Record<string, number>;

/** Only shapes the game could actually play are worth logging. */
const VALID_MISS = /^[a-z]{3,8}$/;

/**
 * Records one rejected attempt, immutably. Input is lowercased; anything
 * that isn't 3-8 plain letters is ignored (returns `m` unchanged). When the
 * map exceeds MISSED_LIMIT, the lowest-count entries are pruned back to the
 * limit (ties drop alphabetically last first — deterministic).
 */
export function recordMiss(m: MissedWords, word: string): MissedWords {
  const w = word.toLowerCase();
  if (!VALID_MISS.test(w)) return m;

  const next: MissedWords = { ...m, [w]: (m[w] ?? 0) + 1 };
  const words = Object.keys(next);
  if (words.length <= MISSED_LIMIT) return next;

  // Keep the top MISSED_LIMIT by count desc, then alphabetically first —
  // so the lowest-count, alphabetically-last entries fall off first.
  words.sort((a, b) => next[b] - next[a] || (a < b ? -1 : 1));
  const pruned: MissedWords = {};
  for (const kept of words.slice(0, MISSED_LIMIT)) pruned[kept] = next[kept];
  return pruned;
}

/** Most-missed words: count desc, then alphabetical for determinism. */
export function topMisses(m: MissedWords, n = 20): { word: string; count: number }[] {
  return Object.entries(m)
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || (a.word < b.word ? -1 : 1))
    .slice(0, n);
}
