// App-side binding of the storage core to AsyncStorage. Kept separate from
// storage.ts so the pure core stays importable in node tests.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { emptyStats, type LifetimeStats } from './stats';
import { createStore } from './storage';

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
