// App-side binding of the storage core to AsyncStorage. Kept separate from
// storage.ts so the pure core stays importable in node tests.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { parseSavedGame, type SavedGame } from './game';
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
