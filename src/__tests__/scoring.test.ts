import { LETTER_VALUES, letterValue, wordScore } from '../scoring';

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
