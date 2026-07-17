// App-side binding of the storage core to AsyncStorage. Kept separate from
// storage.ts so the pure core stays importable in node tests.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { parseSavedGame, type SavedGame } from './game';
import { emptyHistory, type HistoryState } from './history';
import type { MissedWords } from './missedWords';
import { sanitizeSettings, type Settings } from './settings';
import { emptyStats, type LifetimeStats } from './stats';
import { createStore } from './storage';

export type { SavedGame } from './game';

/** Per-key migrations from older schema versions land here as they appear. */
export const store = createStore(AsyncStorage, {});

export const STATS_KEY = 'lifetimeStats';

/** Missing/corrupt data resolves to empty stats — storage never crashes the game. */
export function loadStats(): Promise<LifetimeStats> {
  return store.get(STATS_KEY, emptyStats());
}

export function saveStats(s: LifetimeStats): Promise<void> {
  return store.set(STATS_KEY, s);
}

// ---------------------------------------------------------------- resume (DB-122)

export const GAME_KEY = 'inProgressGame';

export function saveGame(snapshot: SavedGame): Promise<void> {
  return store.set(GAME_KEY, snapshot);
}

/**
 * The persisted in-progress deal, or null if there is none or the stored
 * shape fails validation (parseSavedGame) — a corrupt save never restores.
 */
export async function loadGame(): Promise<SavedGame | null> {
  const raw = await store.get<unknown>(GAME_KEY, null);
  return parseSavedGame(raw);
}

export function clearGame(): Promise<void> {
  return store.remove(GAME_KEY);
}

// ---------------------------------------------------------------- missed words (DB-203)

/**
 * Export = the stored JSON envelope under this key
 * (`{"v":1,"data":{"<word>":<count>,...}}` in AsyncStorage). Read it off a
 * dev device / simulator to inspect dictionary gaps; Supabase sync lands
 * with DB-186.
 */
export const MISSED_KEY = 'missedWords';

/** Missing/corrupt data resolves to an empty map — storage never crashes the game. */
export function loadMissedWords(): Promise<MissedWords> {
  return store.get(MISSED_KEY, {});
}

export function saveMissedWords(m: MissedWords): Promise<void> {
  return store.set(MISSED_KEY, m);
}

// ---------------------------------------------------------------- settings (DB-130)

export const SETTINGS_KEY = 'settings';

/**
 * Missing/corrupt data sanitizes to DEFAULT_SETTINGS (per-field for partial
 * corruption) — storage never crashes the game.
 */
export async function loadSettings(): Promise<Settings> {
  const raw = await store.get<unknown>(SETTINGS_KEY, null);
  return sanitizeSettings(raw);
}

export function saveSettings(s: Settings): Promise<void> {
  return store.set(SETTINGS_KEY, s);
}

// ---------------------------------------------------------------- history (DB-123)

export const HISTORY_KEY = 'gameHistory';

/** Missing/corrupt data resolves to empty history — storage never crashes the game. */
export function loadHistory(): Promise<HistoryState> {
  return store.get(HISTORY_KEY, emptyHistory());
}

export function saveHistory(h: HistoryState): Promise<void> {
  return store.set(HISTORY_KEY, h);
}
