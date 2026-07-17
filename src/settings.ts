// Persisted user settings (DB-130). Pure: no React, no I/O — the storage
// binding lives in appStorage.ts. The game-config knobs (DB-131) flow into
// each NEW deal via GameScreen; the toggles are consumed by DB-132.
import { sanitizeConfig, type GameConfig, DEFAULT_CONFIG } from './scoring';

export type Settings = {
  config: GameConfig;
  haptics: boolean;
  sound: boolean;
  reduceMotion: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  config: { ...DEFAULT_CONFIG },
  haptics: true,
  sound: true,
  reduceMotion: false,
};

/**
 * Merges an unknown partial over DEFAULT_SETTINGS. Invalid fields fall back
 * to their default individually (the config knobs clamp per-field via
 * sanitizeConfig); non-objects yield the defaults wholesale. Never throws —
 * corrupt storage must not crash the game.
 */
export function sanitizeSettings(x: unknown): Settings {
  const p = (typeof x === 'object' && x !== null ? x : {}) as Record<string, unknown>;
  const out: Settings = { ...DEFAULT_SETTINGS, config: sanitizeConfig(p.config) };
  if (typeof p.haptics === 'boolean') out.haptics = p.haptics;
  if (typeof p.sound === 'boolean') out.sound = p.sound;
  if (typeof p.reduceMotion === 'boolean') out.reduceMotion = p.reduceMotion;
  return out;
}
