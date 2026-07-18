import { createStore, SCHEMA_VERSION, type KV } from '../storage';

function memoryKV(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  const kv: KV = {
    getItem: async (k) => m.get(k) ?? null,
    setItem: async (k, v) => void m.set(k, v),
    removeItem: async (k) => void m.delete(k),
  };
  return { kv, m };
}

describe('storage core', () => {
  it('round-trips typed values in a version envelope', async () => {
    const { kv, m } = memoryKV();
    const store = createStore(kv);
    await store.set('stats', { won: 3, streak: 2 });
    expect(JSON.parse(m.get('stats')!)).toEqual({ v: SCHEMA_VERSION, data: { won: 3, streak: 2 } });
    expect(await store.get('stats', { won: 0, streak: 0 })).toEqual({ won: 3, streak: 2 });
  });

  it('returns the fallback for missing keys', async () => {
    const store = createStore(memoryKV().kv);
    expect(await store.get('nope', 42)).toBe(42);
  });

  it('returns the fallback for corrupt JSON and malformed envelopes', async () => {
    const { kv } = memoryKV({
      corrupt: '{not json',
      bare: JSON.stringify({ won: 3 }), // no envelope
      badv: JSON.stringify({ v: 'x', data: 1 }),
    });
    const store = createStore(kv);
    expect(await store.get('corrupt', 'fb')).toBe('fb');
    expect(await store.get('bare', 'fb')).toBe('fb');
    expect(await store.get('badv', 'fb')).toBe('fb');
  });

  it('migrates older versions and persists the upgrade', async () => {
    const { kv, m } = memoryKV({ stats: JSON.stringify({ v: 0, data: { wins: 5 } }) });
    const store = createStore(kv, {
      stats: (data) => ({ won: (data as { wins: number }).wins, streak: 0 }),
    });
    expect(await store.get('stats', { won: 0, streak: 0 })).toEqual({ won: 5, streak: 0 });
    expect(JSON.parse(m.get('stats')!).v).toBe(SCHEMA_VERSION); // upgraded on disk
  });

  it('falls back when an old version has no migration or a migration throws', async () => {
    const { kv } = memoryKV({
      a: JSON.stringify({ v: 0, data: 1 }),
      b: JSON.stringify({ v: 0, data: 1 }),
    });
    const store = createStore(kv, {
      b: () => {
        throw new Error('boom');
      },
    });
    expect(await store.get('a', 'fb')).toBe('fb');
    expect(await store.get('b', 'fb')).toBe('fb');
  });

  it('a pre-bump v1 envelope (old shape) falls back instead of loading a stale shape', async () => {
    // Regression: PL-131 reshaped history/stats without a version bump, so old
    // v1 data loaded with the wrong shape and crashed ("cannot read property
    // score"). Bumping SCHEMA_VERSION to 2 makes any v1 blob fall back.
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(2);
    const { kv } = memoryKV({
      gameHistory: JSON.stringify({ v: 1, data: { games: [], bests: { casual: {} } } }),
    });
    const store = createStore(kv);
    expect(await store.get('gameHistory', { games: [], bests: null })).toEqual({
      games: [],
      bests: null,
    });
  });

  it('remove deletes the key', async () => {
    const { kv, m } = memoryKV();
    const store = createStore(kv);
    await store.set('k', 1);
    await store.remove('k');
    expect(m.has('k')).toBe(false);
    expect(await store.get('k', 'gone')).toBe('gone');
  });

  it('a backend write failure propagates from set (callers decide)', async () => {
    const kv: KV = {
      getItem: async () => null,
      setItem: async () => {
        throw new Error('disk full');
      },
      removeItem: async () => {},
    };
    await expect(createStore(kv).set('k', 1)).rejects.toThrow('disk full');
  });
});
