import {
  dailyDeal,
  dailyProgress,
  dailySetForDay,
  dailyTotal,
  isDailyComplete,
  msUntilNextDay,
  newDailySet,
  nextDailyGame,
  recordDailyGame,
} from '../daily';
import { DAILY_GAME_COUNT } from '../dailyRamp';
import { isValidWord } from '../dict';
import { dailySeed } from '../seedService';

const DAY = '2026-07-19';

describe('daily set (PL-174)', () => {
  it('builds 5 unplayed games with the shared daily seeds', () => {
    const set = newDailySet(DAY);
    expect(set.games).toHaveLength(DAILY_GAME_COUNT);
    set.games.forEach((g, i) => {
      expect(g.seed).toBe(dailySeed(DAY, i));
      expect(g).toMatchObject({ played: false, won: false, score: 0 });
    });
    // Same day → same set for everyone.
    expect(newDailySet(DAY)).toEqual(set);
  });

  it('dailyDeal builds a real winnable-schema deal per game, deterministically', () => {
    const set = newDailySet(DAY);
    const deal = dailyDeal(set, 0);
    expect(deal.columns).toHaveLength(7);
    expect(deal.columns.join('')).toHaveLength(28);
    expect(deal.stock).toMatch(/^[a-z]{20}$/);
    expect(deal.witness.every((w) => isValidWord(w.word))).toBe(true);
    expect(dailyDeal(set, 0)).toEqual(deal); // deterministic
    // Game 1 uses the flat board shape from the ramp.
    expect(deal.columns.map((c) => c.length)).toEqual([4, 4, 4, 4, 4, 4, 4]);
  });

  it('records wins (banked) and losses (0), immutably, once per game', () => {
    const set = newDailySet(DAY);
    const a = recordDailyGame(set, 0, { won: true, score: 120 });
    expect(a.games[0]).toMatchObject({ played: true, won: true, score: 120 });
    expect(set.games[0].played).toBe(false); // original untouched
    const b = recordDailyGame(a, 1, { won: false, score: 999 });
    expect(b.games[1]).toMatchObject({ played: true, won: false, score: 0 }); // loss banks nothing
    // Re-recording a played game is a no-op.
    expect(recordDailyGame(b, 0, { won: true, score: 500 })).toBe(b);
  });

  it('tracks total, progress, next game, and completion', () => {
    let set = newDailySet(DAY);
    expect(nextDailyGame(set)).toBe(0);
    expect(isDailyComplete(set)).toBe(false);
    set = recordDailyGame(set, 0, { won: true, score: 100 });
    set = recordDailyGame(set, 1, { won: true, score: 150 });
    expect(dailyTotal(set)).toBe(250);
    expect(dailyProgress(set)).toBe(2);
    expect(nextDailyGame(set)).toBe(2);
    for (let i = 2; i < DAILY_GAME_COUNT; i++) set = recordDailyGame(set, i, { won: false, score: 0 });
    expect(isDailyComplete(set)).toBe(true);
    expect(nextDailyGame(set)).toBe(-1);
  });

  it('dailySetForDay keeps the same-day set but resets on a new day', () => {
    const played = recordDailyGame(newDailySet(DAY), 0, { won: true, score: 90 });
    expect(dailySetForDay(played, DAY)).toBe(played); // same day: progress preserved
    const next = dailySetForDay(played, '2026-07-20');
    expect(next.day).toBe('2026-07-20');
    expect(next.games.every((g) => !g.played)).toBe(true); // fresh
  });

  it('rebuilds a malformed or stale-seed stored set', () => {
    expect(dailySetForDay(null, DAY)).toEqual(newDailySet(DAY));
    const wrongCount = { day: DAY, games: [{ seed: 1, played: false, won: false, score: 0 }] };
    expect(dailySetForDay(wrongCount, DAY)).toEqual(newDailySet(DAY));
    const wrongSeeds = {
      day: DAY,
      games: Array.from({ length: DAILY_GAME_COUNT }, () => ({ seed: 0, played: true, won: true, score: 9 })),
    };
    expect(dailySetForDay(wrongSeeds, DAY)).toEqual(newDailySet(DAY));
  });

  it('msUntilNextDay is within (0, 24h]', () => {
    const ms = msUntilNextDay(Date.UTC(2026, 6, 19, 6, 0, 0));
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(24 * 3600 * 1000);
    expect(msUntilNextDay(Date.UTC(2026, 6, 19, 0, 0, 0))).toBe(24 * 3600 * 1000);
  });
});
