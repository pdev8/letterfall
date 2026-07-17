// Reactive settings store (DB-132) — one source of truth shared by the
// settings screen (writer) and the game screen (reader), so toggling a
// setting takes effect immediately without threading props through App.
// Loads once on first subscribe; writes persist through appStorage.
import { useSyncExternalStore } from 'react';

import { loadSettings, saveSettings } from './appStorage';
import { DEFAULT_SETTINGS, type Settings } from './settings';

let snapshot: Settings = DEFAULT_SETTINGS;
const listeners = new Set<() => void>();
let loadStarted = false;

function emit(): void {
  for (const l of listeners) l();
}

/** Replace settings and persist (fire-and-forget — storage never crashes the game). */
export function updateSettings(next: Settings): void {
  snapshot = next;
  emit();
  saveSettings(next).catch(() => {});
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  if (!loadStarted) {
    loadStarted = true;
    loadSettings()
      .then((s) => {
        snapshot = s;
        emit();
      })
      .catch(() => {});
  }
  return () => listeners.delete(cb);
}

/** Live settings; re-renders the caller when any setting changes. */
export function useSettings(): Settings {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  );
}
