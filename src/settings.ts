// Persisted user settings (DB-130). Pure: no React, no I/O — the storage
// binding lives in appStorage.ts. Difficulty is selectable now but only
// wires into game config with DB-131; the toggles are consumed by DB-132.
import type { Difficulty } from './scoring';

export type Settings = {
  difficulty: Difficulty;
  haptics: boolean;
  sound: boolean;
  reduceMotion: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  difficulty: 'casual',
  haptics: true,
  sound: true,
  reduceMotion: false,
};

/** Display order for the difficulty selector. */
export const DIFFICULTIES: readonly Difficulty[] = ['casual', 'standard', 'expert'];

function isDifficulty(x: unknown): x is Difficulty {
  return typeof x === 'string' && (DIFFICULTIES as readonly string[]).includes(x);
}

/**
 * Merges an unknown partial over DEFAULT_SETTINGS. Invalid fields fall back
 * to their default individually; non-objects yield the defaults wholesale.
 * Never throws — corrupt storage must not crash the game.
 */
export function sanitizeSettings(x: unknown): Settings {
  const out = { ...DEFAULT_SETTINGS };
  if (typeof x !== 'object' || x === null) return out;
  const p = x as Record<string, unknown>;
  if (isDifficulty(p.difficulty)) out.difficulty = p.difficulty;
  if (typeof p.haptics === 'boolean') out.haptics = p.haptics;
  if (typeof p.sound === 'boolean') out.sound = p.sound;
  if (typeof p.reduceMotion === 'boolean') out.reduceMotion = p.reduceMotion;
  return out;
}
