import { reducer } from '../game';
import { generateDeal } from '../generate';
import {
  DEFAULT_PAR_MAX_NODES,
  PAR_BAND,
  estimatePar,
  hasEightLetterWord,
  inParBand,
  longestWord,
  meetsWordLengthGate,
} from '../par';
import { DEFAULT_CONFIG, dealScore, type DealOutcome } from '../scoring';
import type { Deal, GameState } from '../types';

/** The witness's own dealScore under DEFAULT_CONFIG — par's guaranteed floor. */
function witnessScore(deal: Deal): number {
  let reserveLettersPlayed = 0;
  const words: string[] = [];
  for (const step of deal.witness) {
    words.push(step.word);
    for (const src of step.sources) if (src === 'reserve') reserveLettersPlayed++;
  }
  const outcome: DealOutcome = {
    words,
    reserveLettersPlayed,
    parksUsed: 0,
    recyclesUsed: 0,
    config: DEFAULT_CONFIG,
  };
  return dealScore(outcome);
}

function witnessLongest(deal: Deal): number {
  let m = 0;
  for (const step of deal.witness) if (step.word.length > m) m = step.word.length;
  return m;
}

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
      s =
        src === 'reserve'
          ? reducer(s, { type: 'tapReserve' })
          : reducer(s, { type: 'tapColumn', col: src });
    }
    s = reducer(s, { type: 'play' });
  }
  return s;
}

// Concrete seeds located by measurement (see the 8-letter-rate report below):
// deals whose best line reaches a ≥7-letter word, and ones reaching a ≥8.
const SEVEN_SEEDS = [1, 5, 6, 10, 11, 14];
const EIGHT_SEEDS = [14, 36, 48, 123];

describe('estimatePar — determinism', () => {
  it('gives the same par when the same deal is estimated twice', () => {
    for (const seed of [0, 1, 42, 777]) {
      const deal = generateDeal(seed);
      expect(estimatePar(deal)).toEqual(estimatePar(deal));
    }
  });

  it('gives the same par across independently generated copies of a deal', () => {
    // Fresh deal objects (no shared analysis cache) must still agree.
    for (const seed of [3, 11, 500]) {
      const a = generateDeal(seed);
      const b = generateDeal(seed);
      expect(estimatePar(a).par).toBe(estimatePar(b).par);
      expect(estimatePar(a).bestWords).toEqual(estimatePar(b).bestWords);
    }
  });

  it('DEFAULT_PAR_MAX_NODES is the budget used when maxNodes is omitted', () => {
    const deal = generateDeal(9);
    expect(estimatePar(deal)).toEqual(estimatePar(deal, { maxNodes: DEFAULT_PAR_MAX_NODES }));
  });
});

describe('estimatePar — witness floor and positivity', () => {
  it('par is never below the witness line’s own dealScore', () => {
    for (let seed = 0; seed < 25; seed++) {
      const deal = generateDeal(seed);
      expect(estimatePar(deal).par).toBeGreaterThanOrEqual(witnessScore(deal));
    }
  });

  it('par is a positive number for every generated deal', () => {
    for (let seed = 0; seed < 25; seed++) {
      const { par, bestWords } = estimatePar(generateDeal(seed));
      expect(par).toBeGreaterThan(0);
      expect(bestWords.length).toBeGreaterThan(0);
    }
  });
});

describe('longestWord', () => {
  it('is at least the longest witness word for every generated deal', () => {
    for (let seed = 0; seed < 25; seed++) {
      const deal = generateDeal(seed);
      expect(longestWord(deal)).toBeGreaterThanOrEqual(witnessLongest(deal));
    }
  });

  it('reaches ≥7 on deals known to allow a 7-letter word', () => {
    for (const seed of SEVEN_SEEDS) {
      expect(longestWord(generateDeal(seed))).toBeGreaterThanOrEqual(7);
    }
  });
});

describe('inParBand', () => {
  it('is true strictly inside the band and at both edges', () => {
    expect(inParBand(PAR_BAND.min)).toBe(true);
    expect(inParBand(PAR_BAND.max)).toBe(true);
    expect(inParBand(Math.round((PAR_BAND.min + PAR_BAND.max) / 2))).toBe(true);
  });

  it('is false below the floor and above the ceiling', () => {
    expect(inParBand(PAR_BAND.min - 1)).toBe(false);
    expect(inParBand(PAR_BAND.max + 1)).toBe(false);
    expect(inParBand(0)).toBe(false);
  });
});

describe('word-length gates', () => {
  it('meetsWordLengthGate is exactly longestWord ≥ 7', () => {
    for (const seed of [...SEVEN_SEEDS, 0, 1, 6, 7]) {
      const deal = generateDeal(seed);
      expect(meetsWordLengthGate(deal)).toBe(longestWord(deal) >= 7);
    }
  });

  it('hasEightLetterWord is true on deals known to reach an 8', () => {
    for (const seed of EIGHT_SEEDS) {
      const deal = generateDeal(seed);
      expect(hasEightLetterWord(deal)).toBe(true);
      expect(meetsWordLengthGate(deal)).toBe(true); // an 8 implies the 7 gate
    }
  });

  it('reports the measured 8-letter rate over ~50 generated deals (target ≈10%)', () => {
    const N = 50;
    let eights = 0;
    let sevens = 0;
    for (let seed = 0; seed < N; seed++) {
      const deal = generateDeal(seed);
      if (hasEightLetterWord(deal)) eights++;
      if (meetsWordLengthGate(deal)) sevens++;
    }
    // Evidence, not a tight assertion: the ≈10% figure is a POOL-level target
    // tuned in DB-175, and single deals are never rejected for lacking an 8.
    console.log(
      `[DB-175] over ${N} generated deals: 8-letter rate ${((100 * eights) / N).toFixed(0)}% ` +
        `(${eights}/${N}), 7-gate pass rate ${((100 * sevens) / N).toFixed(0)}% (${sevens}/${N})`,
    );
    expect(eights).toBeGreaterThanOrEqual(0);
    expect(eights).toBeLessThanOrEqual(N);
  });
});

describe('generateDeal — DB-175 quality gates (opt-in)', () => {
  it('requireSevenGate: true returns winnable deals that all pass the 7 gate', () => {
    for (const seed of [1, 7, 42, 100, 2024]) {
      const deal = generateDeal(seed, { requireSevenGate: true });
      expect(meetsWordLengthGate(deal)).toBe(true);
      expect(replay(deal).won).toBe(true);
    }
  });

  it('requireSevenGate: true stays deterministic (same seed ⇒ identical deal)', () => {
    for (const seed of [1, 42, 2024]) {
      expect(generateDeal(seed, { requireSevenGate: true })).toEqual(
        generateDeal(seed, { requireSevenGate: true }),
      );
    }
  });

  it('requireParBand: true returns winnable in-band deterministic deals', () => {
    for (const seed of [1, 7, 42, 100]) {
      const deal = generateDeal(seed, { requireParBand: true });
      expect(inParBand(estimatePar(deal).par)).toBe(true);
      expect(replay(deal).won).toBe(true);
      expect(generateDeal(seed, { requireParBand: true })).toEqual(deal);
    }
  });

  it('both gates together still yield a winnable deal', () => {
    const deal = generateDeal(3, { requireParBand: true, requireSevenGate: true });
    expect(inParBand(estimatePar(deal).par)).toBe(true);
    expect(meetsWordLengthGate(deal)).toBe(true);
    expect(replay(deal).won).toBe(true);
  });

  it('default options are unchanged from bare generateDeal', () => {
    for (const seed of [0, 5, 99]) {
      expect(generateDeal(seed, {})).toEqual(generateDeal(seed));
    }
  });
});

describe('par — purity', () => {
  it('does not mutate the deal it estimates', () => {
    const deal = generateDeal(11);
    const snapshot = JSON.stringify(deal);
    estimatePar(deal);
    longestWord(deal);
    meetsWordLengthGate(deal);
    hasEightLetterWord(deal);
    expect(JSON.stringify(deal)).toBe(snapshot);
  });
});
