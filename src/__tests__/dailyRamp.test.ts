import { DAILY_GAME_COUNT, DAILY_RAMP, rampFor } from '../dailyRamp';
import { configMult } from '../scoring';

describe('daily ramp (DB-173)', () => {
  it('has 5 games, each a valid board shape summing to 28', () => {
    expect(DAILY_GAME_COUNT).toBe(5);
    for (const g of DAILY_RAMP) {
      expect(g.heights).toHaveLength(7);
      expect(g.heights.every((h) => Number.isInteger(h) && h >= 1)).toBe(true);
      expect(g.heights.reduce((a, b) => a + b, 0)).toBe(28);
    }
  });

  it('generosity decreases monotonically from game 1 to game 5', () => {
    for (let i = 1; i < DAILY_RAMP.length; i++) {
      expect(DAILY_RAMP[i].generosity).toBeLessThan(DAILY_RAMP[i - 1].generosity);
    }
    expect(DAILY_RAMP[0].generosity).toBe(1.0);
    expect(DAILY_RAMP[4].generosity).toBe(0.0);
  });

  it('gets harder — the derived score multiplier never decreases across the ramp', () => {
    const mults = DAILY_RAMP.map((g) => configMult(g.config));
    for (let i = 1; i < mults.length; i++) {
      expect(mults[i]).toBeGreaterThanOrEqual(mults[i - 1]);
    }
    expect(mults[0]).toBeCloseTo(1.0); // game 1 defaults
    expect(mults[4]).toBeCloseTo(1.4); // game 5 max hardness
  });

  it('rampFor returns each game and throws out of range', () => {
    expect(rampFor(0)).toBe(DAILY_RAMP[0]);
    expect(rampFor(4)).toBe(DAILY_RAMP[4]);
    expect(() => rampFor(5)).toThrow();
    expect(() => rampFor(-1)).toThrow();
  });
});
