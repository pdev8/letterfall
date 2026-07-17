import seedsJson from '../assets/seeds.json';
import type { Deal, Seeds } from './types';

// Cast through unknown so we depend on the schema, not the literal JSON type.
const seeds = seedsJson as unknown as Seeds;

export const deals: Deal[] = seeds.deals;

/** Exact-word lookup for PLAY validation. */
export const lexiconSet: Set<string> = new Set(seeds.lexicon.map((w) => w.toLowerCase()));

function sortKey(word: string): string {
  return word.split('').sort().join('');
}

/**
 * sorted-letters -> true for every lexicon word (3-8 letters).
 * Built once at module scope; used for dead-deal detection.
 */
const anagramKeys: Map<string, true> = (() => {
  const m = new Map<string, true>();
  for (const raw of seeds.lexicon) {
    const w = raw.toLowerCase();
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
