// Shared types for DECKABET.
import type { GameConfig } from './scoring';

export interface Deal {
  /** 7 columns, each column's cards BOTTOM -> TOP as dealt; TOP card = LAST character. */
  columns: string[];
  /** Draw order: index 0 is drawn first. */
  stock: string;
  label: string; // "smooth" | "tight"
  solverWords: number;
  /** Generation-time winning line: for each word, per-letter sources (column index or reserve). */
  witness: { word: string; sources: (number | 'reserve')[] }[];
}

export interface Seeds {
  deals: Deal[];
}

/** Where a tray letter came from: a column index, or the reserve (face-up draw). */
export type TraySource = number | 'reserve';

export interface TrayEntry {
  letter: string;
  source: TraySource;
  /** True for the reserve card and for parked stock cards tapped off a column. */
  fromStock: boolean;
}

/**
 * A single tableau card. Stock-origin cards were parked from the reserve onto an
 * empty column; they are playable but never have to be cleared to win.
 */
export interface ColumnCard {
  letter: string;
  fromStock: boolean;
}

export interface SessionStats {
  won: number;
  played: number;
  streak: number;
}

export interface GameState {
  dealIndex: number;
  /**
   * This deal's difficulty knobs (DB-131), fixed at deal time — settings
   * changes only apply from the NEXT deal, never mid-deal.
   */
  config: GameConfig;
  /**
   * Designated park bays (DB-179): the `config.parkBays` column indices (chosen
   * randomly at deal time) that accept a parked reserve card once cleared. Only
   * these columns are park targets — marked with an indicator so the player
   * knows which columns to prioritize clearing.
   */
  bays: number[];
  /** Each column bottom -> top. */
  columns: ColumnCard[][];
  /** Index 0 is drawn next. */
  stock: string[];
  /** In draw order; last element is the face-up reserve card. */
  reserve: string[];
  recyclesLeft: number;
  tray: TrayEntry[];
  /** Words played to the foundation, in order. */
  played: string[];
  /** Draws + plays this deal; used to decide if an abandoned deal counts as played. */
  movesMade: number;
  /** Scoring counters (spec §3): reserve letters played into words, parks, recycles, returns. */
  reserveLettersPlayed: number;
  parksUsed: number;
  recyclesUsed: number;
  /**
   * Opening reroll cards taken (DB-178): count of face-up tops the player
   * exchanged with the stock before play. Free (no scoring effect); records
   * that the opening was gambled (useful for stats / a future "as dealt" badge).
   */
  rerollsUsed: number;
  won: boolean;
  stats: SessionStats;
}

export type Action =
  | { type: 'draw' }
  | { type: 'tapColumn'; col: number }
  | { type: 'tapReserve' }
  | { type: 'parkReserve'; col: number }
  /** Opening reroll (DB-178): exchange the given columns' face-up top cards with the stock. */
  | { type: 'reroll'; cols: number[] }
  | { type: 'tapTray'; index: number }
  | { type: 'swapTray'; a: number; b: number }
  | { type: 'clearTray' }
  | { type: 'play' }
  /** New deal; `config` applies the caller's current knobs (falls back to the deal's own). */
  | { type: 'redeal'; config?: GameConfig }
  /** Replace the whole state with a persisted snapshot (DB-122 resume). */
  | { type: 'restore'; state: GameState };
