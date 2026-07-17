import {
  MAX_WORD,
  makeDealState,
  parkedCount,
  randomDealIndex,
  reducer,
  sanitizeGameState,
  tableauCount,
} from '../game';
import { deals } from '../dict';
import { DEFAULT_CONFIG } from '../scoring';
import type { ColumnCard, GameState } from '../types';

const RECYCLES_PER_DEAL = DEFAULT_CONFIG.recycles; // 2 — default knob value

const card = (letter: string, fromStock = false): ColumnCard => ({ letter, fromStock });

/** Hand-built state: "cat" spellable on cols 4-6, park bays (0-2) empty,
 *  col 3 empty but NOT a bay, reserve holds two cards ('q' on top). */
function base(overrides: Partial<GameState> = {}): GameState {
  return {
    ...makeDealState(0, { won: 0, played: 0, streak: 0 }),
    columns: [[], [], [], [], [card('c')], [card('a')], [card('t')]],
    stock: [],
    reserve: ['x', 'q'],
    tray: [],
    ...overrides,
  };
}

describe('makeDealState', () => {
  it('builds native columns and stock from the deal', () => {
    const s = makeDealState(0, { won: 0, played: 0, streak: 0 });
    expect(s.columns).toHaveLength(7);
    expect(s.columns.flat().every((c) => c.fromStock === false)).toBe(true);
    expect(s.stock.length).toBe(20);
    expect(s.reserve).toEqual([]);
    expect(s.recyclesLeft).toBe(RECYCLES_PER_DEAL);
    expect(s.won).toBe(false);
  });

  it('wraps out-of-range deal indexes safely', () => {
    expect(makeDealState(deals.length, { won: 0, played: 0, streak: 0 }).dealIndex).toBe(0);
    expect(makeDealState(-1, { won: 0, played: 0, streak: 0 }).dealIndex).toBe(deals.length - 1);
  });

  it('inits recyclesLeft from the config knob and sanitizes it (DB-131)', () => {
    const hard = makeDealState(0, { won: 0, played: 0, streak: 0 }, { recycles: 0, parkBays: 1 });
    expect(hard.config).toEqual({ recycles: 0, parkBays: 1 });
    expect(hard.recyclesLeft).toBe(0);
    const garbage = makeDealState(0, { won: 0, played: 0, streak: 0 }, { recycles: 9, parkBays: 0 } as never);
    expect(garbage.config).toEqual({ recycles: 2, parkBays: 1 }); // clamped
  });
});

describe('dynamic park bays — parkBays is a max-parked cap (DB-177)', () => {
  it('a 1-bay deal parks onto any empty column but refuses a second park (cap)', () => {
    const oneBay = base({ config: { recycles: 2, parkBays: 1 }, reserve: ['y', 'x', 'q'] });
    const parked = reducer(oneBay, { type: 'parkReserve', col: 2 }); // any empty column
    expect(parked.columns[2]).toEqual([{ letter: 'q', fromStock: true }]);
    // Cap reached: a second park is refused on any empty column.
    expect(reducer(parked, { type: 'parkReserve', col: 0 })).toBe(parked);
  });

  it('a 3-bay deal allows up to three parked cards across any empty columns', () => {
    let s = base({ config: { recycles: 2, parkBays: 3 }, reserve: ['w', 'z', 'y', 'q'] });
    s = reducer(s, { type: 'parkReserve', col: 0 });
    s = reducer(s, { type: 'parkReserve', col: 1 });
    s = reducer(s, { type: 'parkReserve', col: 3 });
    expect(parkedCount(s.columns)).toBe(3);
    // Fourth park refused at the cap even though col 2 is still empty.
    expect(reducer(s, { type: 'parkReserve', col: 2 })).toBe(s);
  });

  it('redeal carries the action config forward, falling back to the deal config', () => {
    const s = base({ movesMade: 1 });
    expect(reducer(s, { type: 'redeal', config: { recycles: 0, parkBays: 1 } }).config).toEqual({
      recycles: 0,
      parkBays: 1,
    });
    expect(reducer(s, { type: 'redeal' }).config).toEqual(s.config); // fallback
  });
});

describe('draw', () => {
  it('moves the top stock card to the reserve', () => {
    const s = base({ stock: ['a', 'b'] });
    const next = reducer(s, { type: 'draw' });
    expect(next.stock).toEqual(['b']);
    expect(next.reserve).toEqual(['x', 'q', 'a']);
    expect(next.movesMade).toBe(s.movesMade + 1);
  });

  it('auto-returns a trayed reserve card before drawing', () => {
    const s = reducer(base({ stock: ['a'] }), { type: 'tapReserve' });
    expect(s.tray).toHaveLength(1);
    const next = reducer(s, { type: 'draw' });
    expect(next.tray).toHaveLength(0);
  });

  it('recycles the reserve into the stock when the stock is empty', () => {
    const s = base(); // stock empty, reserve ['x','q'], 2 recycles
    const next = reducer(s, { type: 'draw' });
    expect(next.stock).toEqual(['x', 'q']); // original draw order preserved
    expect(next.reserve).toEqual([]);
    expect(next.recyclesLeft).toBe(RECYCLES_PER_DEAL - 1);
  });

  it('is inert with empty stock and no recycles left', () => {
    const s = base({ recyclesLeft: 0 });
    expect(reducer(s, { type: 'draw' })).toBe(s);
  });

  it('is inert with empty stock and empty reserve', () => {
    const s = base({ reserve: [] });
    expect(reducer(s, { type: 'draw' })).toBe(s);
  });
});

describe('tapColumn', () => {
  it('trays the top card of a column', () => {
    const next = reducer(base(), { type: 'tapColumn', col: 4 });
    expect(next.tray).toEqual([{ letter: 'c', source: 4, fromStock: false }]);
  });

  it('withdraws on second tap (toggle)', () => {
    let s = reducer(base(), { type: 'tapColumn', col: 4 });
    s = reducer(s, { type: 'tapColumn', col: 4 });
    expect(s.tray).toHaveLength(0);
  });

  it('ignores empty and out-of-range columns', () => {
    const s = base();
    expect(reducer(s, { type: 'tapColumn', col: 0 })).toBe(s);
    expect(reducer(s, { type: 'tapColumn', col: 99 })).toBe(s);
    expect(reducer(s, { type: 'tapColumn', col: -1 })).toBe(s);
  });

  it('blocks adds at MAX_WORD but still allows withdraw', () => {
    let s = reducer(base(), { type: 'tapColumn', col: 4 });
    const filler = Array.from({ length: MAX_WORD - 1 }, (_, i) => ({
      letter: 'z',
      source: 90 + i,
      fromStock: false,
    }));
    s = { ...s, tray: [...s.tray, ...filler] };
    expect(s.tray).toHaveLength(MAX_WORD);
    expect(reducer(s, { type: 'tapColumn', col: 5 })).toBe(s); // add blocked
    expect(reducer(s, { type: 'tapColumn', col: 4 }).tray).toHaveLength(MAX_WORD - 1); // withdraw allowed
  });
});

describe('tapReserve', () => {
  it('trays the reserve top as stock-origin', () => {
    const next = reducer(base(), { type: 'tapReserve' });
    expect(next.tray).toEqual([{ letter: 'q', source: 'reserve', fromStock: true }]);
  });

  it('withdraws on second tap (toggle)', () => {
    let s = reducer(base(), { type: 'tapReserve' });
    s = reducer(s, { type: 'tapReserve' });
    expect(s.tray).toHaveLength(0);
  });

  it('is inert when the reserve is empty', () => {
    const s = base({ reserve: [] });
    expect(reducer(s, { type: 'tapReserve' })).toBe(s);
  });
});

describe('parkReserve', () => {
  it('parks the reserve top onto an empty bay and exposes the next reserve card', () => {
    const next = reducer(base(), { type: 'parkReserve', col: 0 });
    expect(next.columns[0]).toEqual([{ letter: 'q', fromStock: true }]);
    expect(next.reserve).toEqual(['x']);
    expect(next.movesMade).toBe(base().movesMade + 1);
  });

  it('parks onto ANY empty column, not just the first few (DB-177)', () => {
    const s = base(); // cols 0-3 empty, 4-6 native
    const next = reducer(s, { type: 'parkReserve', col: 3 });
    expect(next.columns[3]).toEqual([{ letter: 'q', fromStock: true }]);
  });

  it('refuses occupied columns and empty reserve', () => {
    const s = base();
    expect(reducer(s, { type: 'parkReserve', col: 4 })).toBe(s); // native card there
    const parked = reducer(s, { type: 'parkReserve', col: 0 });
    expect(reducer(parked, { type: 'parkReserve', col: 0 })).toBe(parked); // now occupied
    const dry = base({ reserve: [] });
    expect(reducer(dry, { type: 'parkReserve', col: 0 })).toBe(dry);
  });

  it('removes a trayed reserve entry when its card is parked', () => {
    const trayed = reducer(base(), { type: 'tapReserve' });
    const next = reducer(trayed, { type: 'parkReserve', col: 1 });
    expect(next.tray).toHaveLength(0);
    expect(next.columns[1][0]).toEqual({ letter: 'q', fromStock: true });
  });

  it('parked cards do not count toward the tableau', () => {
    const next = reducer(base(), { type: 'parkReserve', col: 0 });
    expect(tableauCount(next)).toBe(3); // c, a, t only
  });
});

describe('reroll (DB-178 — opening card exchange with the stock)', () => {
  // A pristine, pre-play opening: 7 single-card native columns + a small stock,
  // nothing drawn/trayed/played. `card()` defaults fromStock:false.
  const opening = (o: Partial<GameState> = {}): GameState =>
    base({
      columns: [
        [card('a')],
        [card('b')],
        [card('c')],
        [card('d')],
        [card('e')],
        [card('f')],
        [card('g')],
      ],
      stock: ['h', 'i', 'j'],
      reserve: [],
      tray: [],
      played: [],
      ...o,
    });

  const multiset = (s: GameState): string =>
    [...s.columns.flat().map((c) => c.letter), ...s.stock].sort().join('');

  it('rotates picked tops to the stock bottom and evicts that many off the top onto the board', () => {
    // tops a,b picked; stock ['h','i','j'] evicts h,i off the FRONT.
    const s = opening();
    const next = reducer(s, { type: 'reroll', cols: [0, 1] });
    // Evicted stock cards take the vacated spots, arriving GREEN (native/required).
    expect(next.columns[0][0]).toEqual({ letter: 'h', fromStock: false });
    expect(next.columns[1][0]).toEqual({ letter: 'i', fromStock: false });
    // Unselected columns are untouched.
    expect(next.columns.slice(2).map((c) => c[c.length - 1].letter)).toEqual([
      'c',
      'd',
      'e',
      'f',
      'g',
    ]);
    // The remaining stock, then the swapped-out tops appended to the bottom.
    expect(next.stock).toEqual(['j', 'a', 'b']);
    // Nothing created or destroyed — a pure rotation of the 48-card multiset.
    expect(multiset(next)).toBe(multiset(s));
    expect(next.rerollsUsed).toBe(2); // two cards swapped
  });

  it('is a straight swap: rolled-in cards stay green and required, clear-count unchanged', () => {
    const s = opening(); // 7 native tops → tableauCount 7
    expect(tableauCount(s)).toBe(7);
    const next = reducer(s, { type: 'reroll', cols: [0, 1] });
    expect(tableauCount(next)).toBe(7); // still 7 required — a letter swap, not a shed
  });

  it('is deterministic: same state + same picks → identical result', () => {
    const s = opening();
    expect(reducer(s, { type: 'reroll', cols: [0, 1, 2] })).toEqual(
      reducer(s, { type: 'reroll', cols: [0, 1, 2] }),
    );
  });

  it('has no cap — swaps as many tops as the player picks (stock permitting)', () => {
    // 7 two-card columns so buried natives survive; a 7-card stock covers all.
    const wide = opening({
      columns: 'abcdefg'.split('').map((t, i) => [card(String.fromCharCode(111 + i)), card(t)]),
      stock: ['n', 'o', 'p', 'q', 'r', 's', 't'],
    });
    const next = reducer(wide, { type: 'reroll', cols: [0, 1, 2, 3, 4, 5, 6] });
    expect(next.rerollsUsed).toBe(7);
    expect(next.columns.every((c) => !c[c.length - 1].fromStock)).toBe(true); // rolled-in tops stay green
    expect(next.columns.map((c) => c[c.length - 1].letter)).toEqual(
      ['n', 'o', 'p', 'q', 'r', 's', 't'], // the 7 evicted stock cards, in order
    );
    expect(multiset(next)).toBe(multiset(wide));
  });

  it('is bounded by the stock size (can only evict what the stock has)', () => {
    const s = opening({ stock: ['h'] });
    const next = reducer(s, { type: 'reroll', cols: [0, 1, 2] });
    expect(next.rerollsUsed).toBe(1); // only one card could be covered
    expect(next.columns[0][0]).toEqual({ letter: 'h', fromStock: false });
    expect(next.columns[1][0].letter).toBe('b'); // untouched
    expect(next.stock).toEqual(['a']); // swapped-out top to the bottom
  });

  it('dedupes picks and ignores empty, out-of-range, and already-orange columns', () => {
    const s = opening({
      columns: [
        [{ letter: 'z', fromStock: true }], // already orange — not rerollable
        [card('b')],
        [], // empty
        [card('d')],
        [card('e')],
        [card('f')],
        [card('g')],
      ],
    });
    const next = reducer(s, { type: 'reroll', cols: [0, 0, 2, 99, 1] });
    expect(next.columns[0][0]).toEqual({ letter: 'z', fromStock: true }); // orange col untouched
    expect(next.columns[1][0]).toEqual({ letter: 'h', fromStock: false }); // only col 1 rerolled (green)
    expect(next.rerollsUsed).toBe(1);
    expect(multiset(next)).toBe(multiset(s));
  });

  it('is a no-op when nothing is eligible, no cols are given, or the stock is empty', () => {
    const noneEligible = opening({
      columns: [[{ letter: 'z', fromStock: true }], [], [], [], [], [], []],
    });
    expect(reducer(noneEligible, { type: 'reroll', cols: [0, 1] })).toBe(noneEligible);
    const clean = opening();
    expect(reducer(clean, { type: 'reroll', cols: [] })).toBe(clean);
    const dryStock = opening({ stock: [] });
    expect(reducer(dryStock, { type: 'reroll', cols: [0] })).toBe(dryStock);
  });

  it('refuses to reroll once play has begun (drawn, trayed, or played)', () => {
    const drawn = opening({ reserve: ['x'] });
    expect(reducer(drawn, { type: 'reroll', cols: [0] })).toBe(drawn);
    const trayed = opening({ tray: [{ letter: 'a', source: 0, fromStock: false }] });
    expect(reducer(trayed, { type: 'reroll', cols: [1] })).toBe(trayed);
    const midGame = opening({ played: ['cat'] });
    expect(reducer(midGame, { type: 'reroll', cols: [0] })).toBe(midGame);
  });

  it('is a no-op once the deal is won', () => {
    const won = opening({ won: true });
    expect(reducer(won, { type: 'reroll', cols: [0] })).toBe(won);
  });
});

describe('tray editing', () => {
  it('tapTray removes one entry; out-of-range is inert', () => {
    let s = reducer(base(), { type: 'tapColumn', col: 4 });
    s = reducer(s, { type: 'tapColumn', col: 5 });
    const next = reducer(s, { type: 'tapTray', index: 0 });
    expect(next.tray.map((e) => e.letter)).toEqual(['a']);
    expect(reducer(s, { type: 'tapTray', index: 5 })).toBe(s);
    expect(reducer(s, { type: 'tapTray', index: -1 })).toBe(s);
  });

  it('swapTray swaps entries with their sources; degenerate swaps are inert', () => {
    let s = reducer(base(), { type: 'tapColumn', col: 4 });
    s = reducer(s, { type: 'tapColumn', col: 5 });
    s = reducer(s, { type: 'tapColumn', col: 6 });
    const swapped = reducer(s, { type: 'swapTray', a: 0, b: 2 });
    expect(swapped.tray.map((e) => e.letter).join('')).toBe('tac');
    expect(swapped.tray[0].source).toBe(6);
    expect(swapped.tray[2].source).toBe(4);
    expect(reducer(s, { type: 'swapTray', a: 1, b: 1 })).toBe(s);
    expect(reducer(s, { type: 'swapTray', a: 0, b: 5 })).toBe(s);
  });

  it('clearTray empties a populated tray and is inert on an empty one', () => {
    const s = reducer(base(), { type: 'tapColumn', col: 4 });
    expect(reducer(s, { type: 'clearTray' }).tray).toHaveLength(0);
    const empty = base();
    expect(reducer(empty, { type: 'clearTray' })).toBe(empty);
  });
});

describe('play', () => {
  function spellCat(s: GameState): GameState {
    s = reducer(s, { type: 'tapColumn', col: 4 });
    s = reducer(s, { type: 'tapColumn', col: 5 });
    s = reducer(s, { type: 'tapColumn', col: 6 });
    return s;
  }

  it('rejects an invalid tray sequence', () => {
    let s = reducer(base(), { type: 'tapColumn', col: 6 }); // t
    s = reducer(s, { type: 'tapColumn', col: 4 }); // c — "tc..." not a word
    const before = s;
    expect(reducer(s, { type: 'play' })).toBe(before);
  });

  it('pops the played cards from their piles and banks the word', () => {
    const s = reducer(spellCat(base()), { type: 'play' });
    expect(s.played).toEqual(['cat']);
    expect(s.columns[4]).toHaveLength(0);
    expect(s.tray).toHaveLength(0);
  });

  it('consumes the reserve top when a reserve letter was used', () => {
    // "qat" is not guaranteed in the lexicon; use cat + verify reserve intact
    const s = reducer(spellCat(base()), { type: 'play' });
    expect(s.reserve).toEqual(['x', 'q']);
  });

  it('wins when all native cards are cleared, even with a parked card on board', () => {
    let s = reducer(base(), { type: 'parkReserve', col: 0 });
    s = reducer(spellCat(s), { type: 'play' });
    expect(s.won).toBe(true);
    expect(s.columns[0]).toHaveLength(1); // parked card remains
    expect(s.stats.won).toBe(1);
    expect(s.stats.streak).toBe(1);
  });
});

describe('won-state no-ops', () => {
  const won = base({ won: true });
  it.each([
    ['draw', { type: 'draw' } as const],
    ['tapColumn', { type: 'tapColumn', col: 4 } as const],
    ['tapReserve', { type: 'tapReserve' } as const],
    ['parkReserve', { type: 'parkReserve', col: 0 } as const],
    ['play', { type: 'play' } as const],
  ])('%s does nothing after a win', (_name, action) => {
    expect(reducer(won, action)).toBe(won);
  });
});

describe('redeal', () => {
  it('counts an abandoned deal (moves made, not won) and resets the streak', () => {
    const s = base({ movesMade: 3, stats: { won: 2, played: 4, streak: 2 } });
    const next = reducer(s, { type: 'redeal' });
    expect(next.stats).toEqual({ won: 2, played: 5, streak: 0 });
    expect(next.won).toBe(false);
    expect(next.tray).toHaveLength(0);
  });

  it('does not count an untouched deal', () => {
    const s = base({ movesMade: 0, stats: { won: 2, played: 4, streak: 2 } });
    expect(reducer(s, { type: 'redeal' }).stats).toEqual({ won: 2, played: 4, streak: 2 });
  });
});

describe('randomDealIndex', () => {
  afterEach(() => jest.restoreAllMocks());

  it('stays in range', () => {
    for (let i = 0; i < 50; i++) {
      const n = randomDealIndex();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(deals.length);
    }
  });

  it('avoids repeating the current deal', () => {
    jest.spyOn(Math, 'random').mockReturnValue(3 / deals.length); // would land on 3
    expect(randomDealIndex(3)).toBe(4);
  });
});

describe('scoring counters', () => {
  it('counts reserve letters played into words', () => {
    let s = base({ reserve: ['x', 't'] }); // 't' on top completes c-a-t
    s = reducer(s, { type: 'tapColumn', col: 4 });
    s = reducer(s, { type: 'tapColumn', col: 5 });
    s = reducer(s, { type: 'tapReserve' });
    s = reducer(s, { type: 'play' });
    expect(s.played).toEqual(['cat']);
    expect(s.reserveLettersPlayed).toBe(1);
    expect(s.reserve).toEqual(['x']);
  });

  it('counts parks and recycles; rejected actions never count', () => {
    let s = base();
    s = reducer(s, { type: 'parkReserve', col: 0 });
    expect(s.parksUsed).toBe(1);
    s = reducer(s, { type: 'parkReserve', col: 0 }); // occupied — rejected
    expect(s.parksUsed).toBe(1);
    s = reducer(s, { type: 'draw' }); // stock empty, reserve ['x'] -> recycle
    expect(s.recyclesUsed).toBe(1);
    expect(s.recyclesLeft).toBe(RECYCLES_PER_DEAL - 1);
  });

  it('resets all counters on a fresh deal', () => {
    const s = makeDealState(0, { won: 0, played: 0, streak: 0 });
    expect(s.reserveLettersPlayed).toBe(0);
    expect(s.parksUsed).toBe(0);
    expect(s.recyclesUsed).toBe(0);
  });
});

describe('sanitizeGameState (DB-122 resume guard)', () => {
  it('accepts a genuine fresh deal', () => {
    const s = makeDealState(0, { won: 0, played: 0, streak: 0 });
    expect(sanitizeGameState(s)).toBe(s);
  });

  it('accepts a mid-game state with tray entries and a parked stock card', () => {
    let s = reducer(base(), { type: 'parkReserve', col: 0 }); // fromStock card on the board
    s = reducer(s, { type: 'tapColumn', col: 4 });
    s = reducer(s, { type: 'tapReserve' }); // tray holds a column entry and a reserve entry
    expect(s.columns[0][0].fromStock).toBe(true);
    expect(s.tray).toHaveLength(2);
    expect(sanitizeGameState(s)).toBe(s);
  });

  it.each([
    ['null', null],
    ['a string', 'state'],
    ['a number', 42],
    ['an array', []],
    ['undefined', undefined],
  ])('rejects %s', (_name, value) => {
    expect(sanitizeGameState(value)).toBeNull();
  });

  it('rejects a wrong column count', () => {
    const s = base();
    expect(sanitizeGameState({ ...s, columns: s.columns.slice(0, 6) })).toBeNull();
    expect(sanitizeGameState({ ...s, columns: [...s.columns, []] })).toBeNull();
  });

  it('rejects malformed cards', () => {
    const s = base();
    expect(sanitizeGameState({ ...s, columns: [[{ letter: 'a' }], [], [], [], [], [], []] })).toBeNull(); // no fromStock
    expect(
      sanitizeGameState({ ...s, columns: [[{ letter: 'a', fromStock: 1 }], [], [], [], [], [], []] }),
    ).toBeNull(); // non-boolean fromStock
    expect(sanitizeGameState({ ...s, columns: [['a'], [], [], [], [], [], []] })).toBeNull(); // bare string
  });

  it('rejects uppercase and multi-char letters', () => {
    const s = base();
    expect(sanitizeGameState({ ...s, stock: ['A'] })).toBeNull();
    expect(sanitizeGameState({ ...s, reserve: ['ab'] })).toBeNull();
    expect(
      sanitizeGameState({ ...s, columns: [[card('Q')], [], [], [], [], [], []] }),
    ).toBeNull();
    expect(
      sanitizeGameState({ ...s, tray: [{ letter: 'xy', source: 4, fromStock: false }] }),
    ).toBeNull();
  });

  it('rejects a tray source out of range', () => {
    const s = base();
    expect(sanitizeGameState({ ...s, tray: [{ letter: 'c', source: 7, fromStock: false }] })).toBeNull();
    expect(sanitizeGameState({ ...s, tray: [{ letter: 'c', source: -1, fromStock: false }] })).toBeNull();
    expect(sanitizeGameState({ ...s, tray: [{ letter: 'c', source: 'waste', fromStock: true }] })).toBeNull();
  });

  it('rejects a tray longer than MAX_WORD', () => {
    const tray = Array.from({ length: MAX_WORD + 1 }, () => ({
      letter: 'a' as const,
      source: 'reserve' as const,
      fromStock: true,
    }));
    expect(sanitizeGameState({ ...base(), tray })).toBeNull();
  });

  it('rejects negative or non-finite counters', () => {
    expect(sanitizeGameState({ ...base(), movesMade: -1 })).toBeNull();
    expect(sanitizeGameState({ ...base(), reserveLettersPlayed: -2 })).toBeNull();
    expect(sanitizeGameState({ ...base(), parksUsed: NaN })).toBeNull();
    expect(sanitizeGameState({ ...base(), recyclesUsed: Infinity })).toBeNull();
    expect(sanitizeGameState({ ...base(), rerollsUsed: -1 })).toBeNull();
    expect(sanitizeGameState({ ...base(), rerollsUsed: NaN })).toBeNull();
    expect(sanitizeGameState({ ...base(), recyclesLeft: -1 })).toBeNull();
    expect(sanitizeGameState({ ...base(), dealIndex: -1 })).toBeNull();
  });

  it('coerces a missing rerollsUsed to 0 for pre-DB-178 snapshots (back-compat)', () => {
    const { rerollsUsed: _drop, ...legacy } = base();
    const out = sanitizeGameState(legacy);
    expect(out).not.toBeNull();
    expect(out?.rerollsUsed).toBe(0);
  });

  it('rejects recyclesLeft above RECYCLES_PER_DEAL', () => {
    expect(sanitizeGameState({ ...base(), recyclesLeft: RECYCLES_PER_DEAL + 1 })).toBeNull();
  });

  it('rejects won states — finished deals are never restored', () => {
    expect(sanitizeGameState({ ...base(), won: true })).toBeNull();
  });

  it('rejects missing or malformed stats', () => {
    const { stats: _stats, ...noStats } = base();
    expect(sanitizeGameState(noStats)).toBeNull();
    expect(sanitizeGameState({ ...base(), stats: { won: 1, played: 2 } })).toBeNull(); // no streak
    expect(sanitizeGameState({ ...base(), stats: { won: '1', played: 2, streak: 0 } })).toBeNull();
  });
});

describe('restore', () => {
  it('returns the given state identically', () => {
    const current = base({ movesMade: 9 });
    const snapshot = reducer(base(), { type: 'tapColumn', col: 4 });
    expect(reducer(current, { type: 'restore', state: snapshot })).toBe(snapshot);
  });
});
