// DB-122: SavedGame validation. loadGame/saveGame themselves are a thin
// store.get/set binding over AsyncStorage (untestable in node); the logic
// that decides whether a persisted snapshot restores lives in the pure
// parseSavedGame, tested here.
import { makeDealState, parseSavedGame, reducer, type SavedGame } from '../game';

function savedMidGame(): SavedGame {
  let state = makeDealState(0, { won: 0, played: 0, streak: 0 });
  state = reducer(state, { type: 'draw' });
  state = reducer(state, { type: 'tapColumn', col: 3 });
  return { state, elapsedMs: 42_500 };
}

describe('parseSavedGame', () => {
  it('accepts a valid snapshot and survives a JSON round-trip', () => {
    const saved = savedMidGame();
    expect(parseSavedGame(saved)).toEqual(saved);
    // What actually happens across an app kill: serialize, then parse back.
    const revived = parseSavedGame(JSON.parse(JSON.stringify(saved)));
    expect(revived).toEqual(saved);
  });

  it('rejects non-objects and missing fields', () => {
    expect(parseSavedGame(null)).toBeNull();
    expect(parseSavedGame(undefined)).toBeNull();
    expect(parseSavedGame('save')).toBeNull();
    expect(parseSavedGame({})).toBeNull();
    expect(parseSavedGame({ state: savedMidGame().state })).toBeNull(); // no elapsedMs
    expect(parseSavedGame({ elapsedMs: 1000 })).toBeNull(); // no state
  });

  it('rejects a corrupt state inside the envelope', () => {
    const saved = savedMidGame();
    expect(parseSavedGame({ ...saved, state: { columns: [] } })).toBeNull();
    expect(
      parseSavedGame({ ...saved, state: { ...saved.state, recyclesLeft: 99 } }),
    ).toBeNull();
    expect(parseSavedGame({ ...saved, state: { ...saved.state, won: true } })).toBeNull();
  });

  it('rejects negative, NaN, and non-numeric elapsedMs', () => {
    const saved = savedMidGame();
    expect(parseSavedGame({ ...saved, elapsedMs: -1 })).toBeNull();
    expect(parseSavedGame({ ...saved, elapsedMs: NaN })).toBeNull();
    expect(parseSavedGame({ ...saved, elapsedMs: Infinity })).toBeNull();
    expect(parseSavedGame({ ...saved, elapsedMs: '42500' })).toBeNull();
    expect(parseSavedGame({ ...saved, elapsedMs: 0 })).toEqual({ ...saved, elapsedMs: 0 }); // zero is fine
  });
});
