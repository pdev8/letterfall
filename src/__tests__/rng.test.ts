import { makeRng } from '../rng';

const seq = (seed: number, n: number): number[] => {
  const rng = makeRng(seed);
  return Array.from({ length: n }, () => rng.next());
};

describe('makeRng — determinism', () => {
  it('same seed produces an identical sequence', () => {
    expect(seq(12345, 20)).toEqual(seq(12345, 20));
  });

  it('different seeds produce different sequences', () => {
    expect(seq(1, 20)).not.toEqual(seq(2, 20));
  });

  it('is stable regardless of how many instances share the seed', () => {
    const a = makeRng(999);
    const first = a.next();
    const b = makeRng(999);
    expect(b.next()).toBe(first);
  });
});

describe('makeRng — ranges', () => {
  it('next() stays in [0, 1)', () => {
    const rng = makeRng(7);
    for (let i = 0; i < 1000; i++) {
      const x = rng.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('int(n) stays in [0, n) and hits both ends over many samples', () => {
    const rng = makeRng(42);
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const v = rng.int(6);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
      seen.add(v);
    }
    expect(seen).toEqual(new Set([0, 1, 2, 3, 4, 5]));
  });

  it('int(n) returns 0 for non-positive n', () => {
    const rng = makeRng(3);
    expect(rng.int(0)).toBe(0);
    expect(rng.int(-5)).toBe(0);
  });
});

describe('makeRng — helpers are stable under seed', () => {
  const items = ['a', 'b', 'c', 'd', 'e'];

  it('pick returns array members and is deterministic', () => {
    const r1 = makeRng(55);
    const r2 = makeRng(55);
    for (let i = 0; i < 50; i++) {
      const x = r1.pick(items);
      expect(items).toContain(x);
      expect(x).toBe(r2.pick(items));
    }
  });

  it('shuffle is a deterministic permutation', () => {
    const r1 = makeRng(88);
    const r2 = makeRng(88);
    const s1 = r1.shuffle(items);
    const s2 = r2.shuffle(items);
    expect(s1).toEqual(s2);
    expect(s1.slice().sort()).toEqual(items.slice().sort()); // same multiset
    expect(s1).not.toBe(items); // new array, input untouched
  });

  it('sample returns k distinct members and is deterministic', () => {
    const r1 = makeRng(101);
    const r2 = makeRng(101);
    const a = r1.sample(items, 3);
    const b = r2.sample(items, 3);
    expect(a).toEqual(b);
    expect(a).toHaveLength(3);
    expect(new Set(a).size).toBe(3);
    for (const x of a) expect(items).toContain(x);
  });

  it('sample caps k at the array length', () => {
    const rng = makeRng(1);
    const all = rng.sample(items, 99);
    expect(all).toHaveLength(items.length);
    expect(all.slice().sort()).toEqual(items.slice().sort());
  });

  it('weighted honors weights and is deterministic', () => {
    const r1 = makeRng(202);
    const r2 = makeRng(202);
    let heavy = 0;
    for (let i = 0; i < 1000; i++) {
      const x = r1.weighted(['rare', 'common'], [1, 99]);
      expect(r2.weighted(['rare', 'common'], [1, 99])).toBe(x);
      if (x === 'common') heavy++;
    }
    expect(heavy).toBeGreaterThan(900); // ~99% land on the heavy item
  });
});
