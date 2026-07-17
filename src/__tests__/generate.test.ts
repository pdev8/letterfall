import lexiconJson from '../../assets/lexicon.json';
import { isValidWord } from '../dict';
import { reducer } from '../game';
import { generateDeal } from '../generate';
import type { Deal, GameState } from '../types';

/** Replay a deal's witness through the real reducer; returns the final state. */
function replay(deal: Deal): GameState {
  let s: GameState = {
    dealIndex: 0,
    config: { recycles: 2, parkBays: 3 },
    columns: deal.columns.map((c) => c.split('').map((letter) => ({ letter, fromStock: false }))),
    stock: deal.stock.split(''),
    reserve: [],
    recyclesLeft: 2,
    tray: [],
    played: [],
    movesMade: 0,
    reserveLettersPlayed: 0,
    parksUsed: 0,
    recyclesUsed: 0,
    rerollsUsed: 0,
    won: false,
    stats: { won: 0, played: 0, streak: 0 },
  };
  for (const step of deal.witness) {
    if (step.sources.includes('reserve')) s = reducer(s, { type: 'draw' });
    for (const src of step.sources) {
      s = src === 'reserve' ? reducer(s, { type: 'tapReserve' }) : reducer(s, { type: 'tapColumn', col: src });
    }
    const before = s.played.length;
    s = reducer(s, { type: 'play' });
    expect(s.played.length).toBe(before + 1);
  }
  return s;
}

describe('generateDeal — determinism', () => {
  it('same seed produces a byte-identical deal', () => {
    for (const seed of [1, 57, 1000, 999999]) {
      expect(generateDeal(seed)).toEqual(generateDeal(seed));
    }
  });

  it('different seeds generally produce different deals', () => {
    const a = generateDeal(1);
    const b = generateDeal(2);
    expect(a).not.toEqual(b);
  });
});

describe('generateDeal — schema', () => {
  it('matches the klondike shape: 7 cols heights [1..7], 28 tableau, 20 stock, all a-z', () => {
    for (const seed of [0, 3, 17, 42, 500]) {
      const deal = generateDeal(seed);
      expect(deal.columns).toHaveLength(7);
      expect(deal.columns.map((c) => c.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
      expect(deal.columns.join('')).toMatch(/^[a-z]{28}$/);
      expect(deal.stock).toMatch(/^[a-z]{20}$/);
      expect(['smooth', 'tight']).toContain(deal.label);
      expect(deal.solverWords).toBeGreaterThanOrEqual(7);
      expect(deal.solverWords).toBeLessThanOrEqual(10);
      expect(deal.witness.length).toBe(deal.solverWords);
    }
  });

  it('every witness word is a valid lexicon word', () => {
    for (const seed of [0, 3, 17, 42, 500]) {
      for (const step of generateDeal(seed).witness) {
        expect(isValidWord(step.word)).toBe(true);
      }
    }
  });
});

describe('generateDeal — winnable by construction', () => {
  it('every witness replays through the real reducer to a win', () => {
    for (const seed of [0, 1, 2, 5, 11, 42, 123, 777, 2024, 999999]) {
      expect(replay(generateDeal(seed)).won).toBe(true);
    }
  });
});

describe('generateDeal — distribution guard', () => {
  it('is balanced: ≤2 of any letter among visible tops, 2-4 top vowels, ≤5 per deal, ≤3 per stock', () => {
    const VOWELS = new Set('aeiou');
    const maxCount = (s: string) => {
      const c: Record<string, number> = {};
      let m = 0;
      for (const ch of s) m = Math.max(m, (c[ch] = (c[ch] ?? 0) + 1));
      return m;
    };
    for (const seed of [0, 1, 2, 5, 11, 42, 123, 777, 2024, 999999]) {
      const deal = generateDeal(seed);
      const tops = deal.columns.map((c) => c[c.length - 1]).join('');
      expect(maxCount(tops)).toBeLessThanOrEqual(2);
      const vowels = [...tops].filter((c) => VOWELS.has(c)).length;
      expect(vowels).toBeGreaterThanOrEqual(2);
      expect(vowels).toBeLessThanOrEqual(4);
      expect(maxCount(deal.stock)).toBeLessThanOrEqual(3);
      expect(maxCount(deal.columns.join('') + deal.stock)).toBeLessThanOrEqual(5);
    }
  });
});

describe('generateDeal — board-shape parameter', () => {
  it('honors a shuffled staircase and stays winnable', () => {
    const heights = [7, 6, 5, 4, 3, 2, 1];
    const deal = generateDeal(42, { heights });
    expect(deal.columns.map((c) => c.length)).toEqual(heights);
    expect(replay(deal).won).toBe(true);
  });

  it('honors non-staircase board shapes (DB-173 flat/gentle) and stays winnable', () => {
    for (const heights of [
      [4, 4, 4, 4, 4, 4, 4], // flat
      [2, 3, 4, 4, 5, 5, 5], // gentle
      [1, 1, 2, 4, 6, 7, 7], // steep
    ]) {
      const deal = generateDeal(7, { heights });
      expect(deal.columns.map((c) => c.length)).toEqual(heights);
      expect(deal.columns.join('')).toHaveLength(28);
      expect(replay(deal).won).toBe(true);
    }
  });

  it('is still deterministic under a custom shape', () => {
    const heights = [3, 1, 4, 5, 2, 7, 6];
    expect(generateDeal(9, { heights })).toEqual(generateDeal(9, { heights }));
  });

  it('rejects malformed heights (wrong count, wrong sum, non-positive)', () => {
    expect(() => generateDeal(1, { heights: [1, 2, 3, 4, 5, 6] })).toThrow(); // 6 columns
    expect(() => generateDeal(1, { heights: [1, 2, 3, 4, 5, 6, 8] })).toThrow(); // sums to 29
    expect(() => generateDeal(1, { heights: [1, 2, 3, 4, 5, 6, 7, 0] })).toThrow(); // 8 columns
    expect(() => generateDeal(1, { heights: [0, 2, 4, 5, 6, 4, 7] })).toThrow(); // a 0-height column
  });
});

describe('generateDeal — custom lexicon', () => {
  it('draws witness words only from the supplied pool', () => {
    // A real-lexicon subset (so the reducer's play validation still passes),
    // sized to cover every word length 3–8 with enough letter variety for the
    // balance guard (visible-tops vowel/dup limits need a broad pool).
    const all = Object.keys((lexiconJson as unknown as { words: Record<string, number> }).words);
    const pool: string[] = [];
    for (let len = 3; len <= 8; len++) {
      pool.push(...all.filter((w) => w.length === len).slice(0, 400));
    }
    const poolSet = new Set(pool);
    const deal = generateDeal(3, { lexicon: pool });
    for (const step of deal.witness) expect(poolSet.has(step.word)).toBe(true);
    expect(replay(deal).won).toBe(true);
  });
});
