import { MISSED_LIMIT, recordMiss, topMisses, type MissedWords } from '../missedWords';
import { createStore, type KV } from '../storage';

/** Deterministic 3-letter word for index i: aaa, aab, aac, ... */
function wordAt(i: number): string {
  const a = 'a'.charCodeAt(0);
  return String.fromCharCode(
    a + (Math.floor(i / 676) % 26),
    a + (Math.floor(i / 26) % 26),
    a + (i % 26),
  );
}

function fill(words: string[], times = 1): MissedWords {
  let m: MissedWords = {};
  for (const w of words) for (let t = 0; t < times; t++) m = recordMiss(m, w);
  return m;
}

describe('recordMiss', () => {
  it('records a new word and increments repeats', () => {
    let m = recordMiss({}, 'zaxes');
    expect(m).toEqual({ zaxes: 1 });
    m = recordMiss(m, 'zaxes');
    m = recordMiss(m, 'qi');
    expect(m).toEqual({ zaxes: 2 });
  });

  it('lowercases input before recording', () => {
    let m = recordMiss({}, 'ZaXeS');
    m = recordMiss(m, 'ZAXES');
    expect(m).toEqual({ zaxes: 2 });
  });

  it('ignores words that are not 3-8 plain letters', () => {
    const m: MissedWords = { kept: 1 };
    expect(recordMiss(m, 'at')).toBe(m); // too short
    expect(recordMiss(m, 'abcdefghi')).toBe(m); // too long
    expect(recordMiss(m, "it's")).toBe(m); // punctuation
    expect(recordMiss(m, 'wo rd')).toBe(m); // whitespace
    expect(recordMiss(m, 'abc1')).toBe(m); // digit
    expect(recordMiss(m, 'café')).toBe(m); // non-ascii
    expect(recordMiss(m, '')).toBe(m);
  });

  it('accepts the 3- and 8-letter boundaries', () => {
    const m = recordMiss(recordMiss({}, 'cat'), 'aardvark');
    expect(m).toEqual({ cat: 1, aardvark: 1 });
  });

  it('updates immutably — the input map is untouched', () => {
    const m: MissedWords = { zaxes: 1 };
    const next = recordMiss(m, 'zaxes');
    expect(m).toEqual({ zaxes: 1 });
    expect(next).not.toBe(m);
    expect(next).toEqual({ zaxes: 2 });
  });
});

describe('recordMiss pruning at MISSED_LIMIT', () => {
  it('never grows past the limit and evicts the lowest count', () => {
    // 500 established words at count 2, then one newcomer at count 1.
    const words = Array.from({ length: MISSED_LIMIT }, (_, i) => wordAt(i));
    let m = fill(words, 2);
    expect(Object.keys(m)).toHaveLength(MISSED_LIMIT);

    m = recordMiss(m, 'zygote');
    expect(Object.keys(m)).toHaveLength(MISSED_LIMIT);
    // The count-1 newcomer is the lowest entry and falls straight off.
    expect(m.zygote).toBeUndefined();
    for (const w of words) expect(m[w]).toBe(2); // high counts all survive
  });

  it('breaks count ties by dropping the alphabetically last word', () => {
    // 499 early-alphabet words + zzz, all count 1; a new count-1 word tips
    // the map over the limit and the alphabetically last tie (zzz) drops.
    const words = Array.from({ length: MISSED_LIMIT - 1 }, (_, i) => wordAt(i));
    let m = fill([...words, 'zzz']);
    expect(Object.keys(m)).toHaveLength(MISSED_LIMIT);

    const newcomer = wordAt(MISSED_LIMIT - 1);
    m = recordMiss(m, newcomer);
    expect(Object.keys(m)).toHaveLength(MISSED_LIMIT);
    expect(m.zzz).toBeUndefined();
    expect(m[newcomer]).toBe(1);
  });

  it('a high-count entry survives a tie-heavy prune', () => {
    const words = Array.from({ length: MISSED_LIMIT - 1 }, (_, i) => wordAt(i));
    let m = fill(words);
    m = recordMiss(recordMiss(m, 'zzz'), 'zzz'); // zzz at count 2, map at limit
    m = recordMiss(m, wordAt(MISSED_LIMIT - 1)); // over the limit -> prune
    expect(Object.keys(m)).toHaveLength(MISSED_LIMIT);
    expect(m.zzz).toBe(2); // count beats alphabetical position
    // The alphabetically last count-1 word went instead.
    expect(m[wordAt(MISSED_LIMIT - 1)]).toBeUndefined();
  });
});

describe('topMisses', () => {
  it('sorts by count desc, then alphabetically', () => {
    const m: MissedWords = { bravo: 2, alpha: 1, zulu: 5, echo: 2 };
    expect(topMisses(m)).toEqual([
      { word: 'zulu', count: 5 },
      { word: 'bravo', count: 2 },
      { word: 'echo', count: 2 },
      { word: 'alpha', count: 1 },
    ]);
  });

  it('caps at n, defaulting to 20', () => {
    const m = fill(Array.from({ length: 25 }, (_, i) => wordAt(i)));
    expect(topMisses(m)).toHaveLength(20);
    expect(topMisses(m, 3)).toEqual([
      { word: 'aaa', count: 1 },
      { word: 'aab', count: 1 },
      { word: 'aac', count: 1 },
    ]);
  });

  it('returns everything when n exceeds the map size', () => {
    expect(topMisses({ cat: 1 }, 20)).toEqual([{ word: 'cat', count: 1 }]);
  });
});

describe('persistence roundtrip', () => {
  it('survives a save/load cycle through the versioned store', async () => {
    const map = new Map<string, string>();
    const kv: KV = {
      getItem: async (k) => map.get(k) ?? null,
      setItem: async (k, v) => void map.set(k, v),
      removeItem: async (k) => void map.delete(k),
    };
    const store = createStore(kv);

    const m = fill(['zaxes', 'zaxes', 'quire']);
    await store.set('missedWords', m);
    expect(await store.get<MissedWords>('missedWords', {})).toEqual({ zaxes: 2, quire: 1 });
    // Missing key resolves to the empty-map fallback.
    expect(await store.get<MissedWords>('nope', {})).toEqual({});
  });
});
