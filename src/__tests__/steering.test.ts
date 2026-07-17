// DB-172 — draw-time steering tests.
//
// Tuning under test (from src/steering.ts):
//   DUPLICATE_CAP = 3   — a letter seen ≥3× (visible + recent) is dropped
//   RARE_BUDGET   = 2   — at most 2 rares (k,j,x,q,z) drawn per deal
//   VOWEL_MIN     = 2   — <2 visible vowels ⇒ candidates restricted to vowels
//   WARMTH_TAPER  = 0.6 — warmth → 0 by ~60% of the expected draws
//   WARMTH_BETA   = 4   — bias sharpness of the warm/cold usefulness preference
//
// The warmth assertion is statistical (a random-but-reproducible pick, not a
// greedy one), so it averages over many seeds.

import {
  DUPLICATE_CAP,
  RARE_BUDGET,
  isRareLetter,
  steerNextCard,
  usefulnessScore,
  visibleVowelCount,
  type SteerContext,
} from '../steering';

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);
const RARES = ['k', 'j', 'x', 'q', 'z'];

/** A neutral baseline context: plenty of visible vowels, no floods, no rares
 * drawn — so guards are inactive unless a test deliberately trips one. */
function ctx(overrides: Partial<SteerContext> = {}): SteerContext {
  return {
    seed: 1,
    drawIndex: 0,
    totalDrawsExpected: 20,
    visibleLetters: ['a', 'e', 'r', 's', 't', 'n'],
    recentDraws: [],
    generosity: 0.5,
    ...overrides,
  };
}

describe('helpers', () => {
  it('visibleVowelCount counts a,e,i,o,u case-insensitively', () => {
    expect(visibleVowelCount(['A', 'e', 'i', 'O', 'u', 'b', 'c'])).toBe(5);
    expect(visibleVowelCount(['b', 'c', 'd'])).toBe(0);
  });

  it('isRareLetter flags exactly the value≥5 letters', () => {
    for (const r of RARES) expect(isRareLetter(r)).toBe(true);
    for (const common of ['a', 'e', 's', 't', 'r', 'n', 'd', 'g', 'b', 'f', 'w']) {
      expect(isRareLetter(common)).toBe(false);
    }
  });

  it('usefulnessScore rewards letters that complete words with the visible tops', () => {
    // With tops that spell "ca_" families, adding 't' (cat) beats adding 'q'.
    const tops = ['c', 'a', 't', 'e', 's'];
    expect(usefulnessScore('r', tops)).toBeGreaterThan(usefulnessScore('q', tops));
  });

  it('usefulnessScore is 0 when fewer than 3 letters are in play', () => {
    expect(usefulnessScore('a', ['b'])).toBe(0);
    expect(usefulnessScore('a', [])).toBe(0);
  });
});

describe('determinism', () => {
  it('same context ⇒ same letter across many repeats', () => {
    for (let seed = 0; seed < 60; seed++) {
      const c = ctx({ seed, drawIndex: seed % 7 });
      const first = steerNextCard(c);
      for (let k = 0; k < 25; k++) expect(steerNextCard(c)).toBe(first);
    }
  });

  it('result is independent of the pool ordering (stable candidate order)', () => {
    const pool = ['t', 'a', 'r', 'e', 's', 'n', 'o', 'i'];
    const c = ctx({ seed: 42 });
    const a = steerNextCard(c, pool);
    const b = steerNextCard(c, pool.slice().reverse());
    const d = steerNextCard(c, [...pool, ...pool]); // duplicates collapse
    expect(a).toBe(b);
    expect(a).toBe(d);
  });

  it('different draw indices generally vary the pick', () => {
    const picks = new Set<string>();
    for (let i = 0; i < 30; i++) picks.add(steerNextCard(ctx({ seed: 5, drawIndex: i })));
    expect(picks.size).toBeGreaterThan(1); // not stuck on one letter
  });
});

describe('fairness guard — duplicate cap', () => {
  it('never returns a letter flooded to the cap (until forced)', () => {
    // 'e' appears 4× (≥2 visible vowels present, so the lifeline stays off).
    const c = ctx({
      visibleLetters: ['e', 'e', 'a', 'r', 's', 't'],
      recentDraws: ['e', 'e'],
    });
    expect(visibleVowelCount(c.visibleLetters)).toBeGreaterThanOrEqual(2);
    for (let seed = 0; seed < 200; seed++) {
      expect(steerNextCard(ctx({ ...c, seed }))).not.toBe('e');
    }
  });

  it('a letter just under the cap is still eligible', () => {
    // 'e' seen exactly DUPLICATE_CAP-1 times ⇒ not dropped; restrict the pool
    // to {e, z} and starve z via the rare budget so 'e' is the only pick.
    const c = ctx({
      visibleLetters: ['e', 'e', 'r', 's', 't', 'n'],
      recentDraws: ['q', 'x'], // rare budget spent ⇒ z dropped
      seed: 3,
    });
    expect((c.visibleLetters.filter((l) => l === 'e').length)).toBe(DUPLICATE_CAP - 1);
    expect(steerNextCard(c, ['e', 'z'])).toBe('e');
  });
});

describe('fairness guard — vowel lifeline', () => {
  it('returns a vowel whenever visible vowels < VOWEL_MIN', () => {
    for (let seed = 0; seed < 200; seed++) {
      const c = ctx({ seed, visibleLetters: ['b', 'c', 'd', 'f', 'g', 'h'] });
      expect(visibleVowelCount(c.visibleLetters)).toBeLessThan(2);
      expect(VOWELS.has(steerNextCard(c))).toBe(true);
    }
  });

  it('with exactly one visible vowel it still forces a vowel', () => {
    for (let seed = 0; seed < 100; seed++) {
      const c = ctx({ seed, visibleLetters: ['a', 'b', 'c', 'd', 'f', 'g'] });
      expect(VOWELS.has(steerNextCard(c))).toBe(true);
    }
  });

  it('does not force a vowel once VOWEL_MIN vowels are visible', () => {
    // Two vowels visible; over many seeds a consonant must appear.
    const picks = new Set<string>();
    for (let seed = 0; seed < 200; seed++) {
      picks.add(steerNextCard(ctx({ seed, visibleLetters: ['a', 'e', 'r', 's', 't', 'n'] })));
    }
    expect([...picks].some((l) => !VOWELS.has(l))).toBe(true);
  });
});

describe('fairness guard — rarity budget', () => {
  it('returns no rare letter once the budget is spent', () => {
    const recentDraws = RARES.slice(0, RARE_BUDGET); // budget exhausted
    for (let seed = 0; seed < 200; seed++) {
      const letter = steerNextCard(ctx({ seed, recentDraws }));
      expect(isRareLetter(letter)).toBe(false);
    }
  });

  it('a rare can still be chosen while budget remains', () => {
    // Budget not spent; restrict the pool to a single rare so it must surface.
    // Keep ≥2 visible vowels so the lifeline does not override the pool.
    const c = ctx({ recentDraws: [], seed: 9 });
    for (const rare of RARES) {
      expect(steerNextCard(c, [rare])).toBe(rare);
    }
  });
});

describe('warmth curve', () => {
  it('warm early draws are, on average, more useful than cold late draws', () => {
    const tops = ['c', 'a', 't', 'e', 'r', 's']; // a word-rich neighborhood
    let warmSum = 0;
    let coldSum = 0;
    const N = 300;
    for (let seed = 0; seed < N; seed++) {
      const warm = steerNextCard(
        ctx({ seed, drawIndex: 0, generosity: 1, visibleLetters: tops }),
      );
      const cold = steerNextCard(
        ctx({ seed, drawIndex: 18, generosity: 0, visibleLetters: tops }),
      );
      warmSum += usefulnessScore(warm, tops);
      coldSum += usefulnessScore(cold, tops);
    }
    expect(warmSum / N).toBeGreaterThan(coldSum / N);
  });

  it('cold-minimal picks tend toward the least useful legal letter', () => {
    // Deterministic pool of two: a useful letter vs a useless one. Cold should
    // favor the useless one across seeds.
    const tops = ['c', 'a', 't', 'e', 'r', 's'];
    let uselessPicked = 0;
    const N = 200;
    for (let seed = 0; seed < N; seed++) {
      const pick = steerNextCard(
        ctx({ seed, drawIndex: 18, generosity: 0, visibleLetters: tops }),
        ['n', 'q'], // 'n' completes many words here; 'q' almost none
      );
      if (pick === 'q') uselessPicked++;
    }
    expect(uselessPicked).toBeGreaterThan(N / 2);
  });
});

describe('graceful degradation', () => {
  it('a pathologically flooded context still returns a valid single letter', () => {
    // Every letter flooded past the cap AND the rare budget spent.
    const flood: string[] = [];
    for (const l of 'abcdefghijklmnopqrstuvwxyz') flood.push(l, l, l, l);
    const c = ctx({
      visibleLetters: flood,
      recentDraws: [...flood, 'q', 'z', 'x', 'j'],
    });
    for (let seed = 0; seed < 50; seed++) {
      const letter = steerNextCard(ctx({ ...c, seed }));
      expect(letter).toHaveLength(1);
      expect(letter >= 'a' && letter <= 'z').toBe(true);
    }
  });

  it('an empty candidate pool falls back to the full alphabet', () => {
    const letter = steerNextCard(ctx(), []);
    expect(letter).toHaveLength(1);
    expect(letter >= 'a' && letter <= 'z').toBe(true);
  });

  it('a single-letter pool returns that letter', () => {
    expect(steerNextCard(ctx(), ['w'])).toBe('w');
  });
});

describe('purity', () => {
  it('does not mutate the context or its arrays', () => {
    const visibleLetters = ['a', 'e', 'r', 's', 't', 'n'];
    const recentDraws = ['q', 'z'];
    const pool = ['t', 'a', 'r', 'e'];
    const c: SteerContext = {
      seed: 7,
      drawIndex: 3,
      totalDrawsExpected: 20,
      visibleLetters,
      recentDraws,
      generosity: 0.5,
    };
    const snapshot = JSON.parse(JSON.stringify(c));
    const poolCopy = pool.slice();
    steerNextCard(c, pool);
    expect(c).toEqual(snapshot);
    expect(visibleLetters).toEqual(snapshot.visibleLetters);
    expect(recentDraws).toEqual(snapshot.recentDraws);
    expect(pool).toEqual(poolCopy); // pool untouched
  });
});
