import { deals, isValidWord } from './dict';
import type { Action, GameState, SessionStats } from './types';

export const MAX_WORD = 8;
export const RECYCLES_PER_DEAL = 2;
/** Only the first three columns can hold a parked reserve card. */
export const PARK_COLS = 3;

export function makeDealState(dealIndex: number, stats: SessionStats): GameState {
  const safeIndex =
    deals.length > 0 ? ((dealIndex % deals.length) + deals.length) % deals.length : 0;
  const deal = deals[safeIndex];
  return {
    dealIndex: safeIndex,
    columns: deal
      ? deal.columns.map((c) =>
          c
            .toLowerCase()
            .split('')
            .map((letter) => ({ letter, fromStock: false })),
        )
      : [],
    stock: deal ? deal.stock.toLowerCase().split('') : [],
    reserve: [],
    recyclesLeft: RECYCLES_PER_DEAL,
    tray: [],
    played: [],
    movesMade: 0,
    won: false,
    stats,
  };
}

/** Random deal, avoiding an immediate repeat of `current`. */
export function randomDealIndex(current = -1): number {
  if (deals.length <= 1) return 0;
  let next = Math.floor(Math.random() * deals.length);
  if (next === current) next = (next + 1) % deals.length;
  return next;
}

/** Native cards remaining — parked stock cards never count toward the win. */
export function tableauCount(state: GameState): number {
  return countNative(state.columns);
}

function countNative(columns: GameState['columns']): number {
  return columns.reduce((n, c) => n + c.filter((card) => !card.fromStock).length, 0);
}

export function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'draw': {
      if (state.won) return state;
      // A trayed reserve card is auto-returned first so the trayed reserve entry
      // is always the current reserve top (keeps recycle/play invariants).
      const tray = state.tray.filter((e) => e.source !== 'reserve');
      if (state.stock.length > 0) {
        const drawn = state.stock[0];
        return {
          ...state,
          tray,
          stock: state.stock.slice(1),
          reserve: [...state.reserve, drawn],
          movesMade: state.movesMade + 1,
        };
      }
      // Recycle: the reserve pile (already in original draw order) becomes the stock.
      if (state.reserve.length > 0 && state.recyclesLeft > 0) {
        return {
          ...state,
          tray,
          stock: state.reserve.slice(),
          reserve: [],
          recyclesLeft: Math.max(0, state.recyclesLeft - 1),
          movesMade: state.movesMade + 1,
        };
      }
      return state; // inert: empty stock, nothing to recycle
    }

    case 'tapColumn': {
      if (state.won) return state;
      const column = state.columns[action.col];
      if (!column || column.length === 0) return state;
      // Tapping a card that is already trayed withdraws it (toggle).
      if (state.tray.some((e) => e.source === action.col)) {
        return { ...state, tray: state.tray.filter((e) => e.source !== action.col) };
      }
      if (state.tray.length >= MAX_WORD) return state;
      const top = column[column.length - 1];
      return {
        ...state,
        tray: [...state.tray, { letter: top.letter, source: action.col, fromStock: top.fromStock }],
      };
    }

    case 'tapReserve': {
      if (state.won) return state;
      if (state.reserve.length === 0) return state;
      // Tapping the reserve card while it is trayed withdraws it (toggle).
      if (state.tray.some((e) => e.source === 'reserve')) {
        return { ...state, tray: state.tray.filter((e) => e.source !== 'reserve') };
      }
      if (state.tray.length >= MAX_WORD) return state;
      const letter = state.reserve[state.reserve.length - 1];
      return { ...state, tray: [...state.tray, { letter, source: 'reserve', fromStock: true }] };
    }

    case 'parkReserve': {
      if (state.won) return state;
      if (state.reserve.length === 0) return state;
      if (action.col >= PARK_COLS) return state; // park bays are the first three columns
      const column = state.columns[action.col];
      if (!column || column.length > 0) return state; // only onto an empty space
      const letter = state.reserve[state.reserve.length - 1];
      const columns = state.columns.map((c, i) =>
        i === action.col ? [{ letter, fromStock: true }] : c,
      );
      return {
        ...state,
        columns,
        reserve: state.reserve.slice(0, -1),
        // A trayed reserve entry is always the reserve top — it's the card being parked.
        tray: state.tray.filter((e) => e.source !== 'reserve'),
        movesMade: state.movesMade + 1,
      };
    }

    case 'tapTray': {
      if (action.index < 0 || action.index >= state.tray.length) return state;
      return { ...state, tray: state.tray.filter((_, i) => i !== action.index) };
    }

    case 'swapTray': {
      const { a, b } = action;
      if (a === b) return state;
      if (a < 0 || b < 0 || a >= state.tray.length || b >= state.tray.length) return state;
      const tray = state.tray.slice();
      [tray[a], tray[b]] = [tray[b], tray[a]];
      return { ...state, tray };
    }

    case 'clearTray': {
      if (state.tray.length === 0) return state;
      return { ...state, tray: [] };
    }

    case 'play': {
      if (state.won) return state;
      const word = state.tray.map((e) => e.letter).join('');
      if (!isValidWord(word)) return state; // also guards double-fire: tray is emptied below
      const columns = state.columns.map((c) => c.slice());
      let reserve = state.reserve;
      for (const entry of state.tray) {
        if (entry.source === 'reserve') {
          reserve = reserve.slice(0, -1); // trayed reserve entry is always the reserve top
        } else {
          const col = columns[entry.source];
          if (col && col.length > 0) col.pop(); // next card is face-up automatically
        }
      }
      const won = countNative(columns) === 0;
      const stats = won
        ? {
            won: state.stats.won + 1,
            played: state.stats.played + 1,
            streak: state.stats.streak + 1,
          }
        : state.stats;
      return {
        ...state,
        columns,
        reserve,
        tray: [],
        played: [...state.played, word],
        movesMade: state.movesMade + 1,
        won,
        stats,
      };
    }

    case 'redeal': {
      // A deal counts as played only if it was won or the player made a move.
      const abandoned = !state.won && state.movesMade > 0;
      const stats: SessionStats = abandoned
        ? { ...state.stats, played: state.stats.played + 1, streak: 0 }
        : state.stats;
      return makeDealState(randomDealIndex(state.dealIndex), stats);
    }

    default:
      return state;
  }
}
