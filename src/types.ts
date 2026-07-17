// Shared types for DECKABET.

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
  /** Scoring counters (spec §3): reserve letters played into words, parks, recycles. */
  reserveLettersPlayed: number;
  parksUsed: number;
  recyclesUsed: number;
  won: boolean;
  stats: SessionStats;
}

export type Action =
  | { type: 'draw' }
  | { type: 'tapColumn'; col: number }
  | { type: 'tapReserve' }
  | { type: 'parkReserve'; col: number }
  | { type: 'tapTray'; index: number }
  | { type: 'swapTray'; a: number; b: number }
  | { type: 'clearTray' }
  | { type: 'play' }
  | { type: 'redeal' }
  /** Replace the whole state with a persisted snapshot (DB-122 resume). */
  | { type: 'restore'; state: GameState };
