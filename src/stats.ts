// Lifetime stats + streaks (DB-121) — pure accounting, no React, no I/O.
// Persisted per mode via appStorage; surfaced in the My Stats tab (DB-144).
import { wordScore } from './scoring';

/** Challenge mode lands in E5; until then everything records under 'free'. */
export type StatsMode = 'free' | 'challenge';

export interface ModeStats {
  gamesPlayed: number;
  gamesWon: number;
  timePlayedMs: number;
  /** Sum of played word lengths. */
  lettersConstructed: number;
  wordsPlayed: number;
  /** Every word ever played -> times played. */
  wordCounts: Record<string, number>;
  /** Highest-scoring single word (by wordScore, not length). */
  bestWord: { word: string; score: number } | null;
  bestDealScore: number;
  currentStreak: number;
  bestStreak: number;
  /** Σ banked deal scores — wins only (spec §5: losses bank no points). */
  totalPoints: number;
}

export type LifetimeStats = Record<StatsMode, ModeStats>;

function emptyModeStats(): ModeStats {
  return {
    gamesPlayed: 0,
    gamesWon: 0,
    timePlayedMs: 0,
    lettersConstructed: 0,
    wordsPlayed: 0,
    wordCounts: {},
    bestWord: null,
    bestDealScore: 0,
    currentStreak: 0,
    bestStreak: 0,
    totalPoints: 0,
  };
}

export function emptyStats(): LifetimeStats {
  return { free: emptyModeStats(), challenge: emptyModeStats() };
}

export interface DealRecord {
  won: boolean;
  durationMs: number;
  words: string[];
  /** Final banked score; ignored for losses (they bank nothing). */
  dealScore: number;
}

/**
 * Folds one finished deal into the stats, immutably. Words count toward the
 * word-derived stats even on losses (spec §5 edge rules); only wins bank
 * points, bump the win counters, and extend the streak.
 */
export function recordDeal(
  stats: LifetimeStats,
  mode: StatsMode,
  outcome: DealRecord,
): LifetimeStats {
  const m = stats[mode];

  const wordCounts = { ...m.wordCounts };
  let bestWord = m.bestWord;
  let letters = 0;
  for (const word of outcome.words) {
    wordCounts[word] = (wordCounts[word] ?? 0) + 1;
    letters += word.length;
    const score = wordScore(word);
    if (bestWord === null || score > bestWord.score) bestWord = { word, score };
  }

  const won = outcome.won;
  const currentStreak = won ? m.currentStreak + 1 : 0;
  const next: ModeStats = {
    gamesPlayed: m.gamesPlayed + 1,
    gamesWon: m.gamesWon + (won ? 1 : 0),
    timePlayedMs: m.timePlayedMs + outcome.durationMs,
    lettersConstructed: m.lettersConstructed + letters,
    wordsPlayed: m.wordsPlayed + outcome.words.length,
    wordCounts,
    bestWord,
    bestDealScore: won ? Math.max(m.bestDealScore, outcome.dealScore) : m.bestDealScore,
    currentStreak,
    bestStreak: Math.max(m.bestStreak, currentStreak),
    totalPoints: m.totalPoints + (won ? outcome.dealScore : 0),
  };
  return { ...stats, [mode]: next };
}

// ---------------------------------------------------------------- derived

export function uniqueWords(m: ModeStats): number {
  return Object.keys(m.wordCounts).length;
}

/** Average time per game; 0 when no games have been played. */
export function avgTimeMs(m: ModeStats): number {
  return m.gamesPlayed === 0 ? 0 : m.timePlayedMs / m.gamesPlayed;
}

/** Most-played words: count desc, then alphabetical for determinism. */
export function topWords(m: ModeStats, n = 10): { word: string; count: number }[] {
  return Object.entries(m.wordCounts)
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || (a.word < b.word ? -1 : 1))
    .slice(0, n);
}
