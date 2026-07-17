import seedsJson from '../../assets/seeds.json';
import { isValidWord, wordTier } from '../dict';
import { reducer } from '../game';
import type { GameState, Seeds } from '../types';

const seeds = seedsJson as unknown as Seeds;

describe('seeds.json schema', () => {
  it('has deals and nothing else (lexicon moved to assets/lexicon.json in DB-202)', () => {
    expect(seeds.deals.length).toBeGreaterThan(0);
    expect(Object.keys(seedsJson as object)).toEqual(['deals']);
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

  it('every witness word is a valid lexicon word', () => {
    for (const deal of seeds.deals) {
      for (const step of deal.witness) {
        expect(isValidWord(step.word)).toBe(true);
      }
    }
  });
});

describe('lexicon lookups', () => {
  it('validates only 3-8 letter lexicon words', () => {
    expect(isValidWord('quiz')).toBe(true);
    expect(isValidWord('cat')).toBe(true);
    expect(isValidWord('QUIZ')).toBe(true); // case-insensitive
    expect(isValidWord('zzzzz')).toBe(false);
    expect(isValidWord('at')).toBe(false); // too short even if a word
    expect(isValidWord('')).toBe(false);
  });

  it('wordTier returns the frequency tier, 5 for rare or absent words', () => {
    expect(wordTier('the')).toBe(1);
    expect(wordTier('cat')).toBeLessThanOrEqual(2);
    expect(wordTier('CAT')).toBe(wordTier('cat')); // case-insensitive
    expect(wordTier('zzzzz')).toBe(5); // not a word -> rare fallback
    for (const w of ['the', 'quiz', 'aaliis']) {
      expect(wordTier(w)).toBeGreaterThanOrEqual(1);
      expect(wordTier(w)).toBeLessThanOrEqual(5);
    }
  });
});

describe('witness replay — every deal winnable promise', () => {
  it('replays every stored witness through the real reducer to a win', () => {
    seeds.deals.forEach((deal, di) => {
      let s: GameState = {
        dealIndex: di,
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
