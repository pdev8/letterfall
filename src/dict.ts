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
 * sorted-letters -> true for every lexicon word (3-8 letters).
 * Built once at module scope; used for dead-deal detection.
 */
const anagramKeys: Map<string, true> = (() => {
  const m = new Map<string, true>();
  for (const w of lexiconSet) {
    if (w.length >= 3 && w.length <= 8) m.set(sortKey(w), true);
  }
  return m;
})();

export function isValidWord(word: string): boolean {
  return word.length >= 3 && word.length <= 8 && lexiconSet.has(word.toLowerCase());
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
    if (anagramKeys.has(picked.join(''))) return true;
  }
  return false;
}
