// Seeded, pure PRNG for the Living Deck (E7). Deterministic: a given seed
// always yields the same sequence, so on-device deal generation (DB-170) and
// draw-time steering (DB-172) can be replayed and verified in tests.
//
// Core generator is mulberry32 — a tiny, well-documented 32-bit PRNG with a
// full 2^32 period and good statistical quality for game use. Reference:
// https://github.com/bryc/code/blob/master/jshash/PRNGs.md#mulberry32

export interface Rng {
  /** Next float in [0, 1). */
  next(): number;
  /** Integer in [0, n); returns 0 for n <= 0. */
  int(n: number): number;
  /** Uniformly random element of a non-empty array. */
  pick<T>(arr: readonly T[]): T;
  /** Weighted single pick; `weights` aligns to `items` (need not be normalized). */
  weighted<T>(items: readonly T[], weights: readonly number[]): T;
  /** A NEW array with the elements of `arr` in random order (Fisher–Yates). */
  shuffle<T>(arr: readonly T[]): T[];
  /** `k` distinct elements sampled without replacement (capped at arr.length). */
  sample<T>(arr: readonly T[], k: number): T[];
}

/** Build a seeded PRNG. Same `seed` ⇒ same sequence of every method. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (n: number): number => (n <= 0 ? 0 : Math.floor(next() * n));

  const pick = <T>(arr: readonly T[]): T => arr[int(arr.length)];

  const weighted = <T>(items: readonly T[], weights: readonly number[]): T => {
    let total = 0;
    for (const w of weights) total += w;
    let r = next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r < 0) return items[i];
    }
    return items[items.length - 1];
  };

  const shuffle = <T>(arr: readonly T[]): T[] => {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = int(i + 1);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  const sample = <T>(arr: readonly T[], k: number): T[] => {
    const copy = arr.slice();
    const take = Math.min(Math.max(0, k), copy.length);
    for (let i = 0; i < take; i++) {
      const j = i + int(copy.length - i);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, take);
  };

  return { next, int, pick, weighted, shuffle, sample };
}
