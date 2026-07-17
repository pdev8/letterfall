import {
  DEFAULT_CONFIG,
  LETTER_VALUES,
  configMult,
  dealBaseScore,
  dealScore,
  letterValue,
  sanitizeConfig,
  stockEconomyMult,
  wordEconomyMult,
  wordScore,
} from '../scoring';

describe('letter values', () => {
  it('covers all 26 letters with the spec table', () => {
    expect(Object.keys(LETTER_VALUES)).toHaveLength(26);
    expect(letterValue('e')).toBe(1);
    expect(letterValue('d')).toBe(2);
    expect(letterValue('b')).toBe(3);
    expect(letterValue('f')).toBe(4);
    expect(letterValue('k')).toBe(5);
    expect(letterValue('j')).toBe(8);
    expect(letterValue('x')).toBe(8);
    expect(letterValue('q')).toBe(10);
    expect(letterValue('z')).toBe(10);
  });

  it('is case-insensitive and 0 for non-letters', () => {
    expect(letterValue('Q')).toBe(10);
    expect(letterValue('?')).toBe(0);
    expect(letterValue('')).toBe(0);
  });
});

describe('wordScore', () => {
  it('matches the spec examples', () => {
    expect(wordScore('quiz')).toBe(28); // (10+1+1+10) × 1.25
    expect(wordScore('cat')).toBe(5); // (3+1+1) × 1.0
    expect(wordScore('prized')).toBe(36); // (3+1+1+10+1+2) × 2.0 — Encore example base
  });

  it('applies each length multiplier', () => {
    expect(wordScore('aaa')).toBe(3);
    expect(wordScore('aaaa')).toBe(Math.round(4 * 1.25));
    expect(wordScore('aaaaa')).toBe(8); // 5 × 1.6
    expect(wordScore('aaaaaa')).toBe(12);
    expect(wordScore('aaaaaaa')).toBe(Math.round(7 * 2.5));
    expect(wordScore('aaaaaaaa')).toBe(Math.round(8 * 3.2));
  });

  it('is case-insensitive', () => {
    expect(wordScore('QUIZ')).toBe(28);
  });

  it('returns 0 outside the playable 3-8 range', () => {
    expect(wordScore('')).toBe(0);
    expect(wordScore('at')).toBe(0);
    expect(wordScore('aaaaaaaaa')).toBe(0); // 9 letters
  });
});

describe('wordEconomyMult', () => {
  it('matches the spec table incl. boundaries', () => {
    expect(wordEconomyMult(3)).toBe(1.75);
    expect(wordEconomyMult(4)).toBe(1.75);
    expect(wordEconomyMult(5)).toBe(1.6);
    expect(wordEconomyMult(7)).toBe(1.3);
    expect(wordEconomyMult(10)).toBe(1.05);
    expect(wordEconomyMult(11)).toBe(1.0);
    expect(wordEconomyMult(20)).toBe(1.0);
  });
});

describe('stockEconomyMult', () => {
  it('keeps the full Purist 1.5 on a clean clear', () => {
    expect(stockEconomyMult(0, 0, 0)).toBe(1.5);
  });
  it('charges per reserve letter, park, and recycle', () => {
    expect(stockEconomyMult(3, 1, 0)).toBeCloseTo(1.21); // worked example
    expect(stockEconomyMult(1, 0, 0)).toBeCloseTo(1.42);
    expect(stockEconomyMult(0, 1, 0)).toBeCloseTo(1.45);
    expect(stockEconomyMult(0, 0, 1)).toBeCloseTo(1.42);
  });
  it('floors at 1.0 no matter how heavy the usage', () => {
    expect(stockEconomyMult(20, 3, 2)).toBe(1.0);
  });
});

describe('dealBaseScore (Encore)', () => {
  it('doubles the final word only', () => {
    expect(dealBaseScore(['cat', 'quiz'])).toBe(5 + 28 + 28);
    expect(dealBaseScore(['quiz', 'cat'])).toBe(28 + 5 + 5);
    expect(dealBaseScore(['cat'])).toBe(10);
    expect(dealBaseScore([])).toBe(0);
  });
});

describe('configMult (difficulty knobs, DB-131)', () => {
  it('is 1.0 at the defaults (2 recycles, 3 bays)', () => {
    expect(configMult(DEFAULT_CONFIG)).toBeCloseTo(1.0);
  });
  it('is 1.4 at maximum hardness (0 recycles, 1 bay)', () => {
    expect(configMult({ recycles: 0, parkBays: 1 })).toBeCloseTo(1.4);
  });
  it('adds 0.10 per step below each default', () => {
    expect(configMult({ recycles: 1, parkBays: 3 })).toBeCloseTo(1.1);
    expect(configMult({ recycles: 2, parkBays: 2 })).toBeCloseTo(1.1);
    expect(configMult({ recycles: 0, parkBays: 3 })).toBeCloseTo(1.2);
  });
});

describe('sanitizeConfig', () => {
  it('accepts valid configs and clamps out-of-range/garbage per field', () => {
    expect(sanitizeConfig({ recycles: 1, parkBays: 2 })).toEqual({ recycles: 1, parkBays: 2 });
    expect(sanitizeConfig({ recycles: 5, parkBays: 0 })).toEqual({ recycles: 2, parkBays: 1 });
    expect(sanitizeConfig({ recycles: -3, parkBays: 9 })).toEqual({ recycles: 0, parkBays: 3 });
    expect(sanitizeConfig({ recycles: 1.5, parkBays: 'x' })).toEqual(DEFAULT_CONFIG);
    expect(sanitizeConfig(null)).toEqual(DEFAULT_CONFIG);
    expect(sanitizeConfig('nope')).toEqual(DEFAULT_CONFIG);
  });
});

describe('dealScore', () => {
  it('reproduces the spec worked example (base 240, 7 words, 3 reserve, 1 park, max hardness ×1.4)', () => {
    // hardest config: 0 recycles, 1 bay → configMult 1.4
    expect(
      Math.round(240 * wordEconomyMult(7) * stockEconomyMult(3, 1, 0) * configMult({ recycles: 0, parkBays: 1 })),
    ).toBe(529);
  });
  it('composes all multipliers end to end at default config', () => {
    const outcome = {
      words: ['cat', 'quiz'], // base 61 with Encore
      reserveLettersPlayed: 0,
      parksUsed: 0,
      recyclesUsed: 0,
      config: DEFAULT_CONFIG,
    };
    expect(dealScore(outcome)).toBe(Math.round(61 * 1.75 * 1.5 * 1.0)); // 160
  });
});
