import { deals, isValidWord } from './dict';
import { makeRng } from './rng';
import { DEFAULT_CONFIG, sanitizeConfig, type GameConfig } from './scoring';
import type { Action, ColumnCard, Deal, GameState, SessionStats } from './types';

export const MAX_WORD = 8;

const FRESH_STATS: SessionStats = { won: 0, played: 0, streak: 0 };

/**
 * Builds a fresh GameState from a concrete `Deal` (DB-174 daily mode), instead
 * of an index into the static pool. Mirrors makeDealState's column/stock
 * construction — columns are native (fromStock:false), the stock is the deal's
 * draw order, `config` fixes the difficulty knobs, all counters start at zero.
 * `dealIndex` is -1: a provided deal has no place in the pool (redeal never
 * runs in daily mode, so the index is only a render key here).
 */
export function dealToState(
  deal: Deal,
  config: GameConfig = DEFAULT_CONFIG,
  stats: SessionStats = FRESH_STATS,
): GameState {
  const cfg = sanitizeConfig(config);
  return {
    dealIndex: -1,
    config: cfg,
    bays: pickBays(hashDeal(deal), cfg.parkBays),
    columns: deal.columns.map((c) =>
      c
        .toLowerCase()
        .split('')
        .map((letter) => ({ letter, fromStock: false })),
    ),
    stock: deal.stock.toLowerCase().split(''),
    reserve: [],
    recyclesLeft: cfg.recycles,
    tray: [],
    played: [],
    movesMade: 0,
    reserveLettersPlayed: 0,
    parksUsed: 0,
    recyclesUsed: 0,
    rerollsUsed: 0,
    won: false,
    stats,
  };
}

/**
 * Builds a fresh deal. `config` (DB-131) fixes this deal's difficulty knobs:
 * recycles allowed and park-bay count. It is sanitized here so every deal in
 * play carries a valid config.
 */
export function makeDealState(
  dealIndex: number,
  stats: SessionStats,
  config: GameConfig = DEFAULT_CONFIG,
): GameState {
  const safeIndex =
    deals.length > 0 ? ((dealIndex % deals.length) + deals.length) % deals.length : 0;
  const deal = deals[safeIndex];
  const cfg = sanitizeConfig(config);
  return {
    dealIndex: safeIndex,
    config: cfg,
    bays: pickBays(safeIndex, cfg.parkBays),
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
    recyclesLeft: cfg.recycles,
    tray: [],
    played: [],
    movesMade: 0,
    reserveLettersPlayed: 0,
    parksUsed: 0,
    recyclesUsed: 0,
    rerollsUsed: 0,
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

/** Parked stock cards currently on the board (DB-177 bay cap). */
export function parkedCount(columns: GameState['columns']): number {
  return columns.reduce((n, c) => n + c.filter((card) => card.fromStock).length, 0);
}

/**
 * The designated park bays for a deal (DB-179): `count` distinct column indices
 * (0–6), chosen deterministically from `seed` so the same deal always marks the
 * same columns (stable across replays and resume). Sorted for stable rendering.
 */
export function pickBays(seed: number, count: number): number[] {
  const n = Math.min(Math.max(0, count), COLUMN_COUNT);
  return makeRng(seed >>> 0)
    .sample([0, 1, 2, 3, 4, 5, 6], n)
    .sort((a, b) => a - b);
}

/** Stable 32-bit hash of a concrete deal — seeds bay selection in daily mode. */
function hashDeal(deal: Deal): number {
  const s = deal.columns.join('|') + '#' + deal.stock;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---------------------------------------------------------------- resume (DB-122)

const COLUMN_COUNT = 7;

function isLetter(x: unknown): x is string {
  return typeof x === 'string' && /^[a-z]$/.test(x);
}

function isCard(x: unknown): x is ColumnCard {
  if (typeof x !== 'object' || x === null) return false;
  const c = x as ColumnCard;
  return isLetter(c.letter) && typeof c.fromStock === 'boolean';
}

function isCount(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x) && x >= 0;
}

/**
 * Strict (non-clamping) config check for persisted snapshots. Old saves
 * (pre-DB-131) have no config at all — they fail here and the app starts a
 * fresh deal; that IS the migration.
 */
function isValidConfig(x: unknown): x is GameConfig {
  if (typeof x !== 'object' || x === null) return false;
  const { recycles, parkBays } = x as GameConfig;
  if (!Number.isInteger(recycles) || recycles < 0 || recycles > 2) return false;
  if (!Number.isInteger(parkBays) || parkBays < 1 || parkBays > 3) return false;
  return true;
}

/**
 * Structural guard for persisted snapshots (DB-122). Returns `x` typed as
 * GameState only if every field a resumed deal depends on checks out;
 * anything malformed (or an already-won deal) returns null. Never throws.
 */
export function sanitizeGameState(x: unknown): GameState | null {
  if (typeof x !== 'object' || x === null) return null;
  const s = x as GameState;
  if (s.won !== false) return null; // finished deals are never restored
  if (!Array.isArray(s.columns) || s.columns.length !== COLUMN_COUNT) return null;
  if (!s.columns.every((col) => Array.isArray(col) && col.every(isCard))) return null;
  if (!Array.isArray(s.stock) || !s.stock.every(isLetter)) return null;
  if (!Array.isArray(s.reserve) || !s.reserve.every(isLetter)) return null;
  if (!Array.isArray(s.tray) || s.tray.length > MAX_WORD) return null;
  for (const entry of s.tray) {
    if (typeof entry !== 'object' || entry === null) return null;
    if (!isLetter(entry.letter) || typeof entry.fromStock !== 'boolean') return null;
    const src: unknown = entry.source;
    const sourceOk =
      src === 'reserve' ||
      (typeof src === 'number' && Number.isInteger(src) && src >= 0 && src < COLUMN_COUNT);
    if (!sourceOk) return null;
  }
  if (!isValidConfig(s.config)) return null;
  if (!isCount(s.recyclesLeft) || s.recyclesLeft > s.config.recycles) return null;
  if (!isCount(s.movesMade) || !isCount(s.reserveLettersPlayed)) return null;
  if (!isCount(s.parksUsed) || !isCount(s.recyclesUsed)) return null;
  // rerollsUsed (DB-178) post-dates the snapshot format at SCHEMA_VERSION 2, so
  // an in-progress deal saved before this feature simply lacks it — coerce a
  // missing counter to 0 rather than discard the resume; reject only bad values.
  if (s.rerollsUsed === undefined) s.rerollsUsed = 0;
  else if (!isCount(s.rerollsUsed)) return null;
  if (!Array.isArray(s.played) || !s.played.every((w) => typeof w === 'string')) return null;
  if (!isCount(s.dealIndex) || !Number.isInteger(s.dealIndex)) return null;
  // bays (DB-179) post-date the snapshot format: a pre-DB-179 save simply lacks
  // them — derive from the deal index rather than discard the resume; reject a
  // present-but-malformed set (bad index, dupes, wrong count).
  if (s.bays === undefined) {
    s.bays = pickBays(s.dealIndex, s.config.parkBays);
  } else {
    const okBay = (b: unknown): b is number =>
      typeof b === 'number' && Number.isInteger(b) && b >= 0 && b < COLUMN_COUNT;
    if (
      !Array.isArray(s.bays) ||
      s.bays.length !== s.config.parkBays ||
      !s.bays.every(okBay) ||
      new Set(s.bays).size !== s.bays.length
    ) {
      return null;
    }
  }
  const stats: unknown = s.stats;
  if (typeof stats !== 'object' || stats === null) return null;
  const { won, played, streak } = stats as SessionStats;
  if (typeof won !== 'number' || typeof played !== 'number' || typeof streak !== 'number') {
    return null;
  }
  return s;
}

/** An in-progress deal as persisted: the state plus time already spent on it. */
export type SavedGame = { state: GameState; elapsedMs: number };

/** Validates a raw persisted value into a SavedGame (null if malformed). Never throws. */
export function parseSavedGame(raw: unknown): SavedGame | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { state, elapsedMs } = raw as SavedGame;
  const sanitized = sanitizeGameState(state);
  if (sanitized === null) return null;
  if (typeof elapsedMs !== 'number' || !Number.isFinite(elapsedMs) || elapsedMs < 0) return null;
  return { state: sanitized, elapsedMs };
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
          recyclesUsed: state.recyclesUsed + 1,
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
      // Designated bays (DB-179): park only onto one of this deal's marked
      // columns, and only once it's been cleared. There are exactly
      // `config.parkBays` bays, so how many can be parked at once is bounded by
      // how many bays you've emptied — clear a marked column to open a spot.
      if (!state.bays.includes(action.col)) return state;
      const column = state.columns[action.col];
      if (!column || column.length > 0) return state; // must be an emptied bay
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
        parksUsed: state.parksUsed + 1,
      };
    }

    case 'reroll': {
      // Opening reroll (DB-178): before play, exchange the selected columns'
      // face-up TOP cards with the stock — a mulligan for a bad-looking deal.
      // A deterministic rotation, not a shuffle: each picked top goes to the
      // BOTTOM of the stock, and the same number of cards evict off the FRONT
      // of the stock (the next draws) to take the vacated board spots. The
      // 48-card multiset is conserved — you relocate letters, never conjure
      // them — and a discarded top can resurface later through the stock.
      //
      // The rotated-in cards land as NATIVE (fromStock:false → green): a
      // straight letter swap. The rolled-in card must still be cleared to win
      // and the swapped-out top sinks into the stock, so the clear-count is
      // unchanged — you're trading a known letter for an unknown one, not
      // shedding cards.
      //
      // Deliberately a GAMBLE (owner call): the stock is face-down, so you
      // don't know what you'll get, and there's no solver check — a reroll can
      // strand the board. The deal AS DEALT keeps the every-deal-winnable
      // promise; only this voluntary swap is exempt. No cap on how many tops.
      // Pre-play only (nothing drawn, trayed, or played), native tops only
      // (parked/orange tops aren't rerollable). Free: no scoring effect.
      if (state.won) return state;
      if (state.played.length > 0 || state.reserve.length > 0 || state.tray.length > 0) return state;
      const eligible = Array.from(new Set(action.cols)).filter((c) => {
        const col = state.columns[c];
        return col && col.length > 0 && !col[col.length - 1].fromStock;
      });
      // Bounded only by how many cards the stock can cover the swap with.
      const k = Math.min(eligible.length, state.stock.length);
      if (k === 0) return state;
      const picks = eligible.slice(0, k);
      const evicted = state.stock.slice(0, k); // front of the stock — the next draws
      const pickedLetters = picks.map((c) => state.columns[c][state.columns[c].length - 1].letter);
      const columns = state.columns.map((col, i) => {
        const idx = picks.indexOf(i);
        if (idx === -1) return col;
        const next = col.slice();
        next[next.length - 1] = { letter: evicted[idx], fromStock: false }; // green, required
        return next;
      });
      return {
        ...state,
        columns,
        // Evicted cards leave the front; the swapped-out tops join the bottom.
        stock: [...state.stock.slice(k), ...pickedLetters],
        rerollsUsed: state.rerollsUsed + k,
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
      const reserveUsed = state.tray.filter((e) => e.source === 'reserve').length;
      return {
        ...state,
        columns,
        reserve,
        tray: [],
        played: [...state.played, word],
        movesMade: state.movesMade + 1,
        reserveLettersPlayed: state.reserveLettersPlayed + reserveUsed,
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
      // The action's config (the caller's current settings) applies to the NEW
      // deal; without one the current deal's config carries forward.
      return makeDealState(randomDealIndex(state.dealIndex), stats, action.config ?? state.config);
    }

    case 'restore': {
      // The caller sanitizes (sanitizeGameState) before dispatching.
      return action.state;
    }

    default:
      return state;
  }
}
