// Versioned key-value storage layer (PL-120). Pure core: the backend is
// injected (AsyncStorage in the app, an in-memory mock in tests). Values are
// wrapped in a version envelope so future tickets can migrate old data.

export interface KV {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

// Bump this when any persisted value's SHAPE changes without a migration:
// old-version envelopes then fail the version check and fall back to defaults
// instead of loading a stale shape and crashing. (v1→v2: PL-131 reshaped
// lifetime stats + game history; no migration pre-launch, so stored data
// resets.) Post-launch shape changes must ship a real migration, not a bump.
export const SCHEMA_VERSION = 2;

/** Upgrades `data` written at `fromVersion` to the current schema. */
export type Migration = (data: unknown, fromVersion: number) => unknown;

interface Envelope {
  v: number;
  data: unknown;
}

function isEnvelope(x: unknown): x is Envelope {
  return typeof x === 'object' && x !== null && typeof (x as Envelope).v === 'number';
}

export interface Store {
  get<T>(key: string, fallback: T): Promise<T>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

/**
 * Rules: missing key, corrupt JSON, malformed envelope, or a throwing
 * migration all resolve to `fallback` — storage never crashes the game.
 * Reads of older versions run the key's migration (if any) and persist the
 * upgraded value.
 */
export function createStore(backend: KV, migrations: Record<string, Migration> = {}): Store {
  return {
    async get<T>(key: string, fallback: T): Promise<T> {
      try {
        const raw = await backend.getItem(key);
        if (raw === null) return fallback;
        const parsed: unknown = JSON.parse(raw);
        if (!isEnvelope(parsed)) return fallback;
        if (parsed.v === SCHEMA_VERSION) return parsed.data as T;
        const migrate = migrations[key];
        if (!migrate) return fallback;
        const upgraded = migrate(parsed.data, parsed.v) as T;
        await backend.setItem(key, JSON.stringify({ v: SCHEMA_VERSION, data: upgraded }));
        return upgraded;
      } catch {
        return fallback;
      }
    },

    async set<T>(key: string, value: T): Promise<void> {
      await backend.setItem(key, JSON.stringify({ v: SCHEMA_VERSION, data: value }));
    },

    async remove(key: string): Promise<void> {
      await backend.removeItem(key);
    },
  };
}
