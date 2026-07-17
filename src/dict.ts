import lexiconJson from '../assets/lexicon.json';
import seedsJson from '../assets/seeds.json';
import type { Deal, Seeds } from './types';

// Cast through unknown so we depend on the schema, not the literal JSON type.
const seeds = seedsJson as unknown as Seeds;
const lexicon = lexiconJson as unknown as { words: Record<string, number> };

export const deals: Deal[] = seeds.deals;

/** Exact-word lookup for PLAY validation. Lexicon words are lowercase 3-8 letters. */
export const lexiconSet: Set<string> = new Set(Object.keys(lexicon.words));

/**
 * Frequency tier for a lexicon word: 1 (top-5k) .. 4 (in count list),
 * 5 = rare (absent from the count list) — also returned for non-words.
 * Consumed by E7 steering/openness and the E8 retirement ladder.
 */
export function wordTier(word: string): number {
  return lexicon.words[word.toLowerCase()] ?? 5;
}

function sortKey(word: string): string {
  return word.split('').sort().join('');
}

/**
 * sorted-letters -> the lexicon words (3-8 letters) with exactly those letters.
 * Built once at module scope. Powers dead-deal detection (`existsPlayableWord`),
 * the DB-171 solver's play enumeration (`isWordFromLetters`), and openness
 * counting (`wordsFromLetters`).
 */
const wordsByKey: Map<string, string[]> = (() => {
  const m = new Map<string, string[]>();
  for (const w of lexiconSet) {
    if (w.length >= 3 && w.length <= 8) {
      const key = sortKey(w);
      const bucket = m.get(key);
      if (bucket) bucket.push(w);
      else m.set(key, [w]);
    }
  }
  return m;
})();

export function isValidWord(word: string): boolean {
  return word.length >= 3 && word.length <= 8 && lexiconSet.has(word.toLowerCase());
}

/**
 * True if the EXACT multiset `letters` (3-8) is an anagram of some lexicon word.
 * Used by the solver to test whether a chosen set of source cards forms a word.
 */
export function isWordFromLetters(letters: string[]): boolean {
  const n = letters.length;
  if (n < 3 || n > 8) return false;
  return wordsByKey.has([...letters].sort().join(''));
}

/**
 * Every lexicon word that is an exact anagram of `letters` (empty if none, or if
 * the length is outside 3-8). Used by `openness` to count distinct playable words.
 */
export function wordsFromLetters(letters: string[]): string[] {
  const n = letters.length;
  if (n < 3 || n > 8) return [];
  return wordsByKey.get([...letters].sort().join('')) ?? [];
}

/**
 * True if ANY subset (size >= 3) of the usable letters can be arranged into a
 * lexicon word. letters.length is at most 8, so at most 2^8 subsets.
 */
export function existsPlayableWord(letters: string[]): boolean {
  const n = letters.length;
  if (n < 3) return false;
  const total = 1 << n;
  for (let mask = 1; mask < total; mask++) {
    let bits = 0;
    for (let m = mask; m > 0; m >>= 1) bits += m & 1;
    if (bits < 3) continue;
    const picked: string[] = [];
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) picked.push(letters[i]);
    }
    picked.sort();
    if (wordsByKey.has(picked.join(''))) return true;
  }
  return false;
}
