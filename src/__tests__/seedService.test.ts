import { dailySeed, localSeedSource, playDayOf, SEED_SALT } from '../seedService';

describe('seed service (DB-176)', () => {
  it('playDayOf formats a UTC ISO date', () => {
    expect(playDayOf(Date.UTC(2026, 6, 19, 3, 0, 0))).toBe('2026-07-19');
    expect(playDayOf(Date.UTC(2026, 0, 1, 23, 59, 0))).toBe('2026-01-01');
  });

  it('dailySeed is deterministic for the same inputs', () => {
    expect(dailySeed('2026-07-19', 0)).toBe(dailySeed('2026-07-19', 0));
    expect(dailySeed('2026-07-19', 3, 42)).toBe(dailySeed('2026-07-19', 3, 42));
  });

  it('different day / game / salt give different seeds', () => {
    const a = dailySeed('2026-07-19', 0);
    expect(a).not.toBe(dailySeed('2026-07-20', 0));
    expect(a).not.toBe(dailySeed('2026-07-19', 1));
    expect(a).not.toBe(dailySeed('2026-07-19', 0, 999));
  });

  it('produces distinct seeds across a 5-game day (no collisions)', () => {
    const seeds = [0, 1, 2, 3, 4].map((i) => dailySeed('2026-07-19', i));
    expect(new Set(seeds).size).toBe(5);
    expect(seeds.every((n) => Number.isInteger(n) && n >= 0)).toBe(true);
  });

  it('localSeedSource mirrors dailySeed', async () => {
    const src = localSeedSource();
    expect(await src.seedFor('2026-07-19', 2)).toBe(dailySeed('2026-07-19', 2, SEED_SALT));
  });
});
