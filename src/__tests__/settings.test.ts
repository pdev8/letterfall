import { DEFAULT_SETTINGS, sanitizeSettings, type Settings } from '../settings';
import { createStore, type KV } from '../storage';

function memoryKV(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  const kv: KV = {
    getItem: async (k) => m.get(k) ?? null,
    setItem: async (k, v) => void m.set(k, v),
    removeItem: async (k) => void m.delete(k),
  };
  return { kv, m };
}

const FULL: Settings = {
  config: { recycles: 0, parkBays: 1 },
  haptics: false,
  sound: false,
  reduceMotion: true,
};

describe('settings defaults', () => {
  it('DEFAULT_SETTINGS has the documented shape and values', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      config: { recycles: 2, parkBays: 3 },
      haptics: true,
      sound: true,
      reduceMotion: false,
    });
  });
});

describe('sanitizeSettings', () => {
  it('round-trips a fully valid settings object', () => {
    expect(sanitizeSettings(FULL)).toEqual(FULL);
    expect(sanitizeSettings(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  });

  it('returns a fresh object (never a shared defaults reference)', () => {
    const a = sanitizeSettings(null);
    a.haptics = false;
    a.config.recycles = 0;
    expect(DEFAULT_SETTINGS.haptics).toBe(true);
    expect(DEFAULT_SETTINGS.config.recycles).toBe(2);
    expect(sanitizeSettings(null).haptics).toBe(true);
  });

  it('merges partials over the defaults', () => {
    expect(sanitizeSettings({ config: { recycles: 1, parkBays: 2 } })).toEqual({
      ...DEFAULT_SETTINGS,
      config: { recycles: 1, parkBays: 2 },
    });
    expect(sanitizeSettings({ sound: false, reduceMotion: true })).toEqual({
      ...DEFAULT_SETTINGS,
      sound: false,
      reduceMotion: true,
    });
  });

  it('invalid fields fall back per-field, keeping valid siblings', () => {
    expect(
      sanitizeSettings({ config: { recycles: 9, parkBays: 0 }, haptics: false, sound: 'yes', reduceMotion: 1 }),
    ).toEqual({ ...DEFAULT_SETTINGS, config: { recycles: 2, parkBays: 1 }, haptics: false });
    expect(sanitizeSettings({ config: 42, reduceMotion: true })).toEqual({
      ...DEFAULT_SETTINGS,
      reduceMotion: true,
    });
  });

  it('ignores unknown extra keys', () => {
    expect(sanitizeSettings({ ...FULL, theme: 'light', volume: 11 })).toEqual(FULL);
  });

  it('non-objects yield the defaults wholesale', () => {
    for (const bad of [null, undefined, 42, 'settings', true, Symbol('s'), () => {}]) {
      expect(sanitizeSettings(bad)).toEqual(DEFAULT_SETTINGS);
    }
  });

  it('never throws on hostile shapes', () => {
    expect(() => sanitizeSettings([])).not.toThrow();
    expect(() => sanitizeSettings(new Date())).not.toThrow();
    expect(() => sanitizeSettings({ config: { nested: true }, haptics: [false] })).not.toThrow();
    expect(sanitizeSettings([])).toEqual(DEFAULT_SETTINGS);
  });
});

describe('settings persistence (createStore + memory KV)', () => {
  it('round-trips settings through the versioned store', async () => {
    const store = createStore(memoryKV().kv);
    await store.set('settings', FULL);
    const raw = await store.get<unknown>('settings', null);
    expect(sanitizeSettings(raw)).toEqual(FULL);
  });

  it('missing key sanitizes to defaults', async () => {
    const store = createStore(memoryKV().kv);
    expect(sanitizeSettings(await store.get<unknown>('settings', null))).toEqual(DEFAULT_SETTINGS);
  });

  it('corrupt stored data sanitizes to defaults instead of crashing', async () => {
    const { kv } = memoryKV({ settings: '{not json' });
    const store = createStore(kv);
    expect(sanitizeSettings(await store.get<unknown>('settings', null))).toEqual(DEFAULT_SETTINGS);
  });

  it('a partially corrupt stored object keeps its valid fields', async () => {
    const { kv } = memoryKV();
    const store = createStore(kv);
    await store.set('settings', { config: { recycles: 'bogus', parkBays: 2 }, sound: false });
    const loaded = sanitizeSettings(await store.get<unknown>('settings', null));
    expect(loaded).toEqual({ ...DEFAULT_SETTINGS, config: { recycles: 2, parkBays: 2 }, sound: false });
  });
});
