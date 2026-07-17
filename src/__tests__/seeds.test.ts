import seedsJson from '../../assets/seeds.json';
import { reducer } from '../game';
import type { GameState , Seeds } from '../types';
import { isValidWord } from '../dict';

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

describe('witness replay — every deal winnable promise', () => {
  it('replays every stored witness through the real reducer to a win', () => {
    seeds.deals.forEach((deal, di) => {
      let s: GameState = {
        dealIndex: di,
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
        won: false,
        stats: { won: 0, played: 0, streak: 0 },
      };
      expect(deal.witness.length).toBeGreaterThan(0);
      for (const step of deal.witness) {
        if (step.sources.includes('reserve')) s = reducer(s, { type: 'draw' });
        for (const src of step.sources) {
          s =
            src === 'reserve'
              ? reducer(s, { type: 'tapReserve' })
              : reducer(s, { type: 'tapColumn', col: src });
        }
        const before = s.played.length;
        s = reducer(s, { type: 'play' });
        expect(s.played.length).toBe(before + 1);
      }
      expect(s.won).toBe(true);
    });
  });
});
