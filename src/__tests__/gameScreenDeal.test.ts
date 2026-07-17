// DB-174: dealToState builds a playable GameState from a concrete Deal (the
// bridge that lets daily mode run a generated deal through the same reducer).
import { dealToState } from '../game';
import { DEFAULT_CONFIG } from '../scoring';
import type { Deal } from '../types';

const DEAL: Deal = {
  // Uppercase on purpose — dealToState must normalize to the lowercase the
  // reducer/dictionary use. Heights are illustrative, not the 1..7/28 invariant.
  columns: ['AB', 'CDE', 'F', 'GHIJ', 'K', 'LM', 'NOP'],
  stock: 'QRSTUV',
  label: 'test',
  solverWords: 0,
  witness: [],
};

describe('dealToState', () => {
  it('builds native columns (lowercased, fromStock:false) from the deal', () => {
    const s = dealToState(DEAL);
    expect(s.columns).toHaveLength(7);
    expect(s.columns.map((c) => c.map((card) => card.letter).join(''))).toEqual([
      'ab',
      'cde',
      'f',
      'ghij',
      'k',
      'lm',
      'nop',
    ]);
    expect(s.columns.flat().every((card) => card.fromStock === false)).toBe(true);
  });

  it('builds the stock as lowercase letters in draw order', () => {
    const s = dealToState(DEAL);
    expect(s.stock).toEqual(['q', 'r', 's', 't', 'u', 'v']);
  });

  it('starts empty/zeroed and not won', () => {
    const s = dealToState(DEAL);
    expect(s.reserve).toEqual([]);
    expect(s.tray).toEqual([]);
    expect(s.played).toEqual([]);
    expect(s.movesMade).toBe(0);
    expect(s.reserveLettersPlayed).toBe(0);
    expect(s.parksUsed).toBe(0);
    expect(s.recyclesUsed).toBe(0);
    expect(s.rerollsUsed).toBe(0);
    expect(s.won).toBe(false);
  });

  it('defaults to DEFAULT_CONFIG, with recyclesLeft matching the config', () => {
    const s = dealToState(DEAL);
    expect(s.config).toEqual(DEFAULT_CONFIG);
    expect(s.recyclesLeft).toBe(DEFAULT_CONFIG.recycles);
  });

  it('designates parkBays distinct in-range bays, deterministically per deal (DB-179)', () => {
    const s = dealToState(DEAL);
    expect(s.bays).toHaveLength(DEFAULT_CONFIG.parkBays);
    expect(new Set(s.bays).size).toBe(s.bays.length);
    expect(s.bays.every((b) => Number.isInteger(b) && b >= 0 && b < 7)).toBe(true);
    expect(dealToState(DEAL).bays).toEqual(s.bays); // same deal → same bays
  });

  it('honors a provided config and sanitizes out-of-range knobs', () => {
    const s = dealToState(DEAL, { recycles: 0, parkBays: 1 });
    expect(s.config).toEqual({ recycles: 0, parkBays: 1 });
    expect(s.recyclesLeft).toBe(0);

    const clamped = dealToState(DEAL, { recycles: 9, parkBays: 9 } as never);
    expect(clamped.config).toEqual({ recycles: 2, parkBays: 3 });
  });

  it('carries provided session stats through (default is fresh 0/0/0)', () => {
    expect(dealToState(DEAL).stats).toEqual({ won: 0, played: 0, streak: 0 });
    const withStats = dealToState(DEAL, DEFAULT_CONFIG, { won: 2, played: 3, streak: 1 });
    expect(withStats.stats).toEqual({ won: 2, played: 3, streak: 1 });
  });
});
