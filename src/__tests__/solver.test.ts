import { generateDeal } from '../generate';
import { describeWinnability, isCompletable, openness } from '../solver';
import type { ColumnCard, Deal, GameState, TrayEntry } from '../types';

/** Build a GameState from column letter-stacks (bottom->top), reserve and stock.
 * Columns are padded to 7. All column cards are native unless `parked` marks the
 * column index as holding a single parked stock card. */
function state(opts: {
  cols: string[][];
  reserve?: string[];
  stock?: string[];
  recyclesLeft?: number;
  parkBays?: number;
  parked?: Set<number>;
  tray?: TrayEntry[];
}): GameState {
  const parked = opts.parked ?? new Set<number>();
  const columns: ColumnCard[][] = opts.cols.map((c, i) =>
    c.map((letter) => ({ letter, fromStock: parked.has(i) })),
  );
  while (columns.length < 7) columns.push([]);
  return {
    dealIndex: 0,
    config: { recycles: 2, parkBays: opts.parkBays ?? 3 },
    bays: [],
    columns,
    stock: opts.stock ?? [],
    reserve: opts.reserve ?? [],
    recyclesLeft: opts.recyclesLeft ?? 2,
    tray: opts.tray ?? [],
    played: [],
    movesMade: 0,
    reserveLettersPlayed: 0,
    parksUsed: 0,
    recyclesUsed: 0,
    rerollsUsed: 0,
    won: false,
    stats: { won: 0, played: 0, streak: 0 },
  };
}

/** Fresh, unplayed GameState for a generated deal (mirrors makeDealState). */
function stateFromDeal(deal: Deal): GameState {
  return {
    dealIndex: 0,
    config: { recycles: 2, parkBays: 3 },
    bays: [],
    columns: deal.columns.map((c) => c.split('').map((letter) => ({ letter, fromStock: false }))),
    stock: deal.stock.split(''),
    reserve: [],
    recyclesLeft: 2,
    tray: [],
    played: [],
    movesMade: 0,
    reserveLettersPlayed: 0,
    parksUsed: 0,
    recyclesUsed: 0,
    rerollsUsed: 0,
    won: false,
    stats: { won: 0, played: 0, streak: 0 },
  };
}

describe('isCompletable — trivial states', () => {
  it('a state one play from winning is completable', () => {
    // tops c / a / t -> play "cat", clearing every native card.
    expect(isCompletable(state({ cols: [['c'], ['a'], ['t']] }))).toBe(true);
  });

  it('a state that needs a draw to win is completable (deterministic stock)', () => {
    // tops c / a only (no word yet); drawing the 't' off the stock enables "cat".
    expect(isCompletable(state({ cols: [['c'], ['a']], stock: ['t'] }))).toBe(true);
  });

  it('an already-cleared board (only parked cards) is completable', () => {
    expect(isCompletable(state({ cols: [['q']], parked: new Set([0]) }))).toBe(true);
  });

  it('a lone unformable native with no stock/reserve/recycle is NOT completable', () => {
    expect(isCompletable(state({ cols: [['q']], recyclesLeft: 0 }))).toBe(false);
  });

  it('natives that cannot form any word, with no resources, is NOT completable', () => {
    // tops b / k / q form no lexicon word; no draw, recycle, or park available.
    expect(isCompletable(state({ cols: [['b'], ['k'], ['q']], recyclesLeft: 0 }))).toBe(false);
  });
});

describe('isCompletable — a state mutated to be unwinnable', () => {
  it('removing the stock and leaving an unformable native yields false', () => {
    const deal = generateDeal(3);
    const s = stateFromDeal(deal);
    // Strip every resource and replace the board with a single dead native card.
    s.stock = [];
    s.reserve = [];
    s.recyclesLeft = 0;
    s.columns = s.columns.map(() => []);
    s.columns[0] = [{ letter: 'q', fromStock: false }];
    expect(isCompletable(s)).toBe(false);
  });
});

describe('isCompletable — purity & determinism', () => {
  it('does not mutate its input', () => {
    const s = stateFromDeal(generateDeal(11));
    const snapshot = JSON.stringify(s);
    isCompletable(s);
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it('returns the same answer when called twice', () => {
    const s = stateFromDeal(generateDeal(11));
    expect(isCompletable(s)).toBe(isCompletable(s));
  });

  it('a genuinely dead state stays false even at a large node budget', () => {
    const s = state({ cols: [['q']], recyclesLeft: 0 });
    expect(isCompletable(s, { maxNodes: 200000 })).toBe(false);
  });
});

describe('openness — distinct playable words right now', () => {
  it('is 0 when fewer than three sources are available', () => {
    expect(openness(state({ cols: [['a'], ['t']] }))).toBe(0);
  });

  it('is 0 when the available letters form no word', () => {
    expect(openness(state({ cols: [['j'], ['q'], ['x']] }))).toBe(0);
  });

  it('counts a single word (f/l/y -> "fly")', () => {
    expect(openness(state({ cols: [['f'], ['l'], ['y']] }))).toBe(1);
  });

  it('counts both anagrams of one letter set (c/a/t -> "cat","act")', () => {
    expect(openness(state({ cols: [['c'], ['a'], ['t']] }))).toBe(2);
  });

  it('counts many words for a rich set of tops', () => {
    const n = openness(state({ cols: [['a'], ['e'], ['r'], ['t'], ['s']] }));
    expect(n).toBeGreaterThan(10);
  });

  it('includes the reserve top as a source', () => {
    // c / a tops + reserve top t -> "cat"/"act"
    expect(openness(state({ cols: [['c'], ['a']], reserve: ['t'] }))).toBe(2);
  });

  it('ignores the tray (cards are still on the board until played)', () => {
    const tray: TrayEntry[] = [{ letter: 'c', source: 0, fromStock: false }];
    const withTray = openness(state({ cols: [['c'], ['a'], ['t']], tray }));
    const without = openness(state({ cols: [['c'], ['a'], ['t']] }));
    expect(withTray).toBe(without);
    expect(withTray).toBe(2);
  });

  it('counts a parked stock card on a column top (it is playable)', () => {
    // col0 parked "c", col1 native "a", col2 native "t" -> still "cat"/"act".
    expect(openness(state({ cols: [['c'], ['a'], ['t']], parked: new Set([0]) }))).toBe(2);
  });
});

describe('isCompletable — property vs the generator (winnable by construction)', () => {
  it('every generated deal is completable from its opening state', () => {
    for (let seed = 0; seed < 20; seed++) {
      const s = stateFromDeal(generateDeal(seed));
      expect(isCompletable(s)).toBe(true);
    }
  });
});

describe('describeWinnability', () => {
  it('bundles completability and openness consistently', () => {
    const s = state({ cols: [['c'], ['a'], ['t']] });
    const d = describeWinnability(s);
    expect(d.completable).toBe(isCompletable(s));
    expect(d.openness).toBe(openness(s));
    expect(d).toEqual({ completable: true, openness: 2 });
  });
});
