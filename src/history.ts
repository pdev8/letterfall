// Game history + personal bests (DB-123) — pure accounting, no React, no I/O.
// Persisted via appStorage; surfaced in the My Stats tab (DB-144).
// DB-131: difficulty presets are gone — free play is a SINGLE bests bucket
// (the deal score already reflects hardness via configMult); each record
// keeps the config it was played under.
import { wordScore, type GameConfig } from './scoring';
import type { StatsMode } from './stats';

/** Last-N results kept; older games fall off the end. */
export const HISTORY_LIMIT = 50;

export interface GameRecord {
  /** Epoch ms when the game finished. */
  at: number;
  mode: StatsMode;
  /** The knobs this game was played under (informational; bests are one bucket). */
  config: GameConfig;
  won: boolean;
  durationMs: number;
  wordCount: number;
  dealScore: number;
  /** Highest-scoring word of THIS game (by wordScore); null if none played. */
  bestWord: { word: string; score: number } | null;
}

export interface Bests {
  /** Best winning deal score; 0 until the first win. */
  bestDealScore: number;
  /** Highest-scoring single word ever played (wins or losses). */
  bestWord: { word: string; score: number } | null;
  /** Fastest winning clear; null until the first win. */
  fastestClearMs: number | null;
}

export interface HistoryState {
  /** Most recent first, capped at HISTORY_LIMIT. */
  games: GameRecord[];
  bests: Bests;
}

function emptyBests(): Bests {
  return { bestDealScore: 0, bestWord: null, fastestClearMs: null };
}

export function emptyHistory(): HistoryState {
  return { games: [], bests: emptyBests() };
}

export interface GameArgs {
  mode: StatsMode;
  config: GameConfig;
  won: boolean;
  durationMs: number;
  words: string[];
  /** Final banked score; pass 0 for losses (they bank nothing). */
  dealScore: number;
  at: number;
}

/**
 * Builds a GameRecord from a finished game, computing wordCount and the
 * game's best word (by wordScore; ties keep the first encountered).
 */
export function makeRecord(args: GameArgs): GameRecord {
  let bestWord: { word: string; score: number } | null = null;
  for (const word of args.words) {
    const score = wordScore(word);
    if (bestWord === null || score > bestWord.score) bestWord = { word, score };
  }
  return {
    at: args.at,
    mode: args.mode,
    config: args.config,
    won: args.won,
    durationMs: args.durationMs,
    wordCount: args.words.length,
    dealScore: args.dealScore,
    bestWord,
  };
}

/**
 * Folds one finished game into the history, immutably. The game is prepended
 * (most recent first) and the list capped at HISTORY_LIMIT. Bests (one
 * bucket): bestWord can improve on any game (strictly higher score);
 * bestDealScore and fastestClearMs only move on wins (strictly better —
 * ties keep the incumbent; the first win always sets both).
 */
export function recordGame(h: HistoryState, r: GameRecord): HistoryState {
  const games = [r, ...h.games].slice(0, HISTORY_LIMIT);

  const b = h.bests;
  const bestWord =
    r.bestWord !== null && (b.bestWord === null || r.bestWord.score > b.bestWord.score)
      ? r.bestWord
      : b.bestWord;
  const bests: Bests = {
    bestDealScore: r.won ? Math.max(b.bestDealScore, r.dealScore) : b.bestDealScore,
    bestWord,
    fastestClearMs:
      r.won && (b.fastestClearMs === null || r.durationMs < b.fastestClearMs)
        ? r.durationMs
        : b.fastestClearMs,
  };
  return { games, bests };
}

// ---------------------------------------------------------------- sanitize (DB-131)

function isScore(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x) && x >= 0;
}

function isBestWord(x: unknown): x is Bests['bestWord'] {
  if (x === null) return true;
  if (typeof x !== 'object') return false;
  const w = x as { word: unknown; score: unknown };
  return typeof w.word === 'string' && isScore(w.score);
}

function isValidConfig(x: unknown): boolean {
  if (typeof x !== 'object' || x === null) return false;
  const { recycles, parkBays } = x as GameConfig;
  if (!Number.isInteger(recycles) || recycles < 0 || recycles > 2) return false;
  if (!Number.isInteger(parkBays) || parkBays < 1 || parkBays > 3) return false;
  return true;
}

function isRecord(x: unknown): x is GameRecord {
  if (typeof x !== 'object' || x === null) return false;
  const r = x as GameRecord;
  return (
    isScore(r.at) &&
    (r.mode === 'free' || r.mode === 'challenge') &&
    isValidConfig(r.config) &&
    typeof r.won === 'boolean' &&
    isScore(r.durationMs) &&
    isScore(r.wordCount) &&
    isScore(r.dealScore) &&
    isBestWord(r.bestWord)
  );
}

/**
 * Whole-or-nothing structural guard for persisted history: anything
 * malformed resets to emptyHistory(). Pre-DB-131 data (per-difficulty bests,
 * records carrying `difficulty` instead of `config`) fails here and is
 * discarded — acceptable pre-launch; there is no migration.
 */
export function sanitizeHistory(x: unknown): HistoryState {
  if (typeof x !== 'object' || x === null) return emptyHistory();
  const h = x as HistoryState;
  if (!Array.isArray(h.games) || h.games.length > HISTORY_LIMIT) return emptyHistory();
  if (!h.games.every(isRecord)) return emptyHistory();
  const b: unknown = h.bests;
  if (typeof b !== 'object' || b === null) return emptyHistory();
  const { bestDealScore, bestWord, fastestClearMs } = b as Bests;
  if (!isScore(bestDealScore) || !isBestWord(bestWord)) return emptyHistory();
  if (fastestClearMs !== null && !isScore(fastestClearMs)) return emptyHistory();
  return { games: h.games, bests: { bestDealScore, bestWord, fastestClearMs } };
}
