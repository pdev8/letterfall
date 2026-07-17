import { wordScore } from '../scoring';
import {
  avgTimeMs,
  emptyStats,
  recordDeal,
  topWords,
  uniqueWords,
  type DealRecord,
  type LifetimeStats,
} from '../stats';
import { createStore, type KV } from '../storage';

function memoryKV(): KV {
  const m = new Map<string, string>();
  return {
    getItem: async (k) => m.get(k) ?? null,
    setItem: async (k, v) => void m.set(k, v),
    removeItem: async (k) => void m.delete(k),
  };
}

const win = (words: string[], dealScore: number, durationMs = 60_000): DealRecord => ({
  won: true,
  durationMs,
  words,
  dealScore,
});
const loss = (words: string[], durationMs = 30_000): DealRecord => ({
  won: false,
  durationMs,
  words,
  dealScore: 0,
});

describe('lifetime stats', () => {
  it('emptyStats starts both modes at zero, with independent objects', () => {
    const s = emptyStats();
    for (const mode of ['free', 'challenge'] as const) {
      expect(s[mode].gamesPlayed).toBe(0);
      expect(s[mode].gamesWon).toBe(0);
      expect(s[mode].bestWord).toBeNull();
      expect(s[mode].wordCounts).toEqual({});
    }
    s.free.wordCounts.cat = 1;
    expect(s.challenge.wordCounts).toEqual({}); // no shared references
  });

  it('a win bumps games, wins, time, words, letters, streak, and points', () => {
    const s = recordDeal(emptyStats(), 'free', win(['cat', 'stares'], 120, 45_000));
    const m = s.free;
    expect(m.gamesPlayed).toBe(1);
    expect(m.gamesWon).toBe(1);
    expect(m.timePlayedMs).toBe(45_000);
    expect(m.wordsPlayed).toBe(2);
    expect(m.lettersConstructed).toBe(9); // 3 + 6
    expect(m.wordCounts).toEqual({ cat: 1, stares: 1 });
    expect(m.currentStreak).toBe(1);
    expect(m.bestStreak).toBe(1);
    expect(m.totalPoints).toBe(120);
    expect(m.bestDealScore).toBe(120);
    // Only the recorded mode changes.
    expect(s.challenge).toEqual(emptyStats().challenge);
  });

  it('a loss counts the game, time, words, and letters — but banks nothing', () => {
    const s = recordDeal(emptyStats(), 'free', loss(['quiz'], 20_000));
    const m = s.free;
    expect(m.gamesPlayed).toBe(1);
    expect(m.gamesWon).toBe(0);
    expect(m.timePlayedMs).toBe(20_000);
    expect(m.wordsPlayed).toBe(1);
    expect(m.lettersConstructed).toBe(4);
    expect(m.wordCounts).toEqual({ quiz: 1 });
    expect(m.bestWord).toEqual({ word: 'quiz', score: wordScore('quiz') });
    expect(m.totalPoints).toBe(0);
    expect(m.bestDealScore).toBe(0);
    expect(m.currentStreak).toBe(0);
  });

  it('does not mutate the input stats', () => {
    const before = emptyStats();
    recordDeal(before, 'free', win(['cat'], 50));
    expect(before).toEqual(emptyStats());
  });

  it('streaks increment on wins, reset on losses, and bestStreak survives the reset', () => {
    let s = emptyStats();
    s = recordDeal(s, 'free', win([], 10));
    s = recordDeal(s, 'free', win([], 10));
    s = recordDeal(s, 'free', win([], 10));
    expect(s.free.currentStreak).toBe(3);
    expect(s.free.bestStreak).toBe(3);
    s = recordDeal(s, 'free', loss([]));
    expect(s.free.currentStreak).toBe(0);
    expect(s.free.bestStreak).toBe(3);
    s = recordDeal(s, 'free', win([], 10));
    expect(s.free.currentStreak).toBe(1);
    expect(s.free.bestStreak).toBe(3);
  });

  it('bestWord is picked by score, not length: QUIZ beats STARES', () => {
    expect(wordScore('quiz')).toBeGreaterThan(wordScore('stares'));
    let s = recordDeal(emptyStats(), 'free', win(['stares'], 10));
    s = recordDeal(s, 'free', win(['quiz'], 10));
    expect(s.free.bestWord).toEqual({ word: 'quiz', score: wordScore('quiz') });
    // A later lower-scoring word does not displace it (ties keep the incumbent).
    s = recordDeal(s, 'free', win(['stares', 'quiz'], 10));
    expect(s.free.bestWord).toEqual({ word: 'quiz', score: wordScore('quiz') });
  });

  it('bestDealScore keeps the max, and only wins can set it', () => {
    let s = recordDeal(emptyStats(), 'free', win([], 200));
    s = recordDeal(s, 'free', win([], 150));
    expect(s.free.bestDealScore).toBe(200);
    s = recordDeal(s, 'free', win([], 320));
    expect(s.free.bestDealScore).toBe(320);
    s = recordDeal(s, 'free', { won: false, durationMs: 0, words: [], dealScore: 999 });
    expect(s.free.bestDealScore).toBe(320);
  });

  it('totalPoints sums winning deal scores only', () => {
    let s = recordDeal(emptyStats(), 'free', win([], 100));
    s = recordDeal(s, 'free', { won: false, durationMs: 0, words: [], dealScore: 999 });
    s = recordDeal(s, 'free', win([], 40));
    expect(s.free.totalPoints).toBe(140);
  });

  it('wordCounts accumulate across deals; uniqueWords counts distinct words', () => {
    let s = recordDeal(emptyStats(), 'free', win(['cat', 'dog'], 10));
    s = recordDeal(s, 'free', loss(['cat']));
    s = recordDeal(s, 'free', win(['cat', 'dog', 'cat'], 10));
    expect(s.free.wordCounts).toEqual({ cat: 4, dog: 2 });
    expect(uniqueWords(s.free)).toBe(2);
    expect(uniqueWords(emptyStats().free)).toBe(0);
  });

  it('topWords sorts by count desc then alphabetically, capped at n (default 10)', () => {
    let s = emptyStats();
    // 12 distinct words: 'dog' x3; 'cat' and 'ace' tied at 2; nine singles.
    const singles = ['ivy', 'hen', 'gnu', 'fox', 'elk', 'doe', 'cub', 'bee', 'ant'];
    s = recordDeal(s, 'free', win(['dog', 'dog', 'cat', 'ace'], 10));
    s = recordDeal(s, 'free', win(['dog', 'ace', 'cat', ...singles], 10));
    const top = topWords(s.free);
    expect(top).toHaveLength(10);
    expect(top[0]).toEqual({ word: 'dog', count: 3 });
    expect(top[1]).toEqual({ word: 'ace', count: 2 }); // tie broken alphabetically
    expect(top[2]).toEqual({ word: 'cat', count: 2 });
    // The nine singles sort alphabetically; only the first seven fit.
    expect(top.slice(3).map((t) => t.word)).toEqual([...singles].sort().slice(0, 7));
    expect(topWords(s.free, 2)).toEqual([
      { word: 'dog', count: 3 },
      { word: 'ace', count: 2 },
    ]);
  });

  it('avgTimeMs averages across games and is 0 with no games', () => {
    expect(avgTimeMs(emptyStats().free)).toBe(0);
    let s = recordDeal(emptyStats(), 'free', win([], 10, 60_000));
    s = recordDeal(s, 'free', loss([], 30_000));
    expect(avgTimeMs(s.free)).toBe(45_000);
  });

  it('modes are independent: challenge records never touch free', () => {
    let s = recordDeal(emptyStats(), 'challenge', win(['jazz'], 77));
    s = recordDeal(s, 'free', loss(['cat']));
    expect(s.challenge.gamesWon).toBe(1);
    expect(s.challenge.totalPoints).toBe(77);
    expect(s.free.gamesWon).toBe(0);
    expect(s.free.wordCounts).toEqual({ cat: 1 });
    expect(s.challenge.wordCounts).toEqual({ jazz: 1 });
  });

  it('round-trips through the versioned store with a memory backend', async () => {
    const store = createStore(memoryKV());
    let s = recordDeal(emptyStats(), 'free', win(['quiz', 'stares'], 210, 90_000));
    s = recordDeal(s, 'free', loss(['cat']));
    await store.set('lifetimeStats', s);
    const loaded = await store.get<LifetimeStats>('lifetimeStats', emptyStats());
    expect(loaded).toEqual(s);
    // Records keep accumulating correctly on the loaded copy.
    const next = recordDeal(loaded, 'free', win(['dog'], 30));
    expect(next.free.gamesPlayed).toBe(3);
    expect(next.free.currentStreak).toBe(1);
    // A missing key resolves to empty stats.
    expect(await store.get<LifetimeStats>('nope', emptyStats())).toEqual(emptyStats());
  });
});
