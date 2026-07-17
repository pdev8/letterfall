import seedsJson from '../../assets/seeds.json';
import { isValidWord } from '../dict';
import type { Seeds } from '../types';

const seeds = seedsJson as unknown as Seeds;

describe('seeds.json schema', () => {
  it('has a substantial lexicon of lowercase words', () => {
    expect(seeds.lexicon.length).toBeGreaterThan(10000);
    for (const w of seeds.lexicon) {
      expect(w).toMatch(/^[a-z]+$/);
    }
  });

  it('has deals', () => {
    expect(seeds.deals.length).toBeGreaterThan(0);
  });

  it('every deal has the klondike shape: 7 columns, heights 1..7, 28 cards, 20 stock', () => {
    for (const deal of seeds.deals) {
      expect(deal.columns).toHaveLength(7);
      expect(deal.columns.map((c) => c.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
      expect(deal.columns.join('')).toMatch(/^[a-z]{28}$/);
      expect(deal.stock).toMatch(/^[a-z]{20}$/);
      expect(['smooth', 'tight']).toContain(deal.label);
      expect(deal.solverWords).toBeGreaterThanOrEqual(4);
      expect(deal.solverWords).toBeLessThanOrEqual(12);
    }
  });
});

describe('lexicon lookups', () => {
  it('validates only 3-8 letter lexicon words', () => {
    expect(isValidWord(seeds.lexicon.find((w) => w.length === 3)!)).toBe(true);
    expect(isValidWord('zzzzz')).toBe(false);
    expect(isValidWord('at')).toBe(false); // too short even if a word
    expect(isValidWord('')).toBe(false);
  });
});
