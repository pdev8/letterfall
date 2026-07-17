// DB-171 — a bounded, pure "can this board still be finished?" solver.
//
// MEASUREMENT ONLY (docs/GENERATION.md pillar 6: "guarantee the deal, don't
// guide the play"). Its jobs are par estimation, the openness metric, and the
// post-game "a win was still possible until move N" insight. It is NEVER used
// for draw-time rescue — steering (DB-172) maintains its own escape plan.
//
// The stock in a GameState is CONCRETE (a fixed array), so draws are
// deterministic and the solver reasons over the exact remaining cards.
// Winnability is a pure function of (columns, stock, reserve, recyclesLeft,
// parkBays); the tray — a UI selection over cards still on the board — is
// irrelevant and ignored. The module is pure: no React, no I/O, and it never
// mutates its input state.

import { isWordFromLetters, wordsFromLetters } from './dict';
import type { GameState } from './types';

// Inside a column string a parked stock card is stored UPPERCASE and a native
// card lowercase. So a column's native cards are exactly its lowercase chars,
// and any top card is playable via its letter lowercased.
interface Node {
  /** 7 columns, each bottom->top; lowercase = native, UPPERCASE = parked stock. */
  cols: string[];
  /** Remaining draw order; index 0 is drawn next. */
  stock: string;
  /** Draw order; last char is the face-up reserve top. */
  reserve: string;
  recyclesLeft: number;
}

const isUpper = (ch: string): boolean => ch >= 'A' && ch <= 'Z';

function nativeCount(cols: string[]): number {
  let n = 0;
  for (const col of cols) for (const ch of col) if (!isUpper(ch)) n++;
  return n;
}

function parkedCount(cols: string[]): number {
  let n = 0;
  for (const col of cols) for (const ch of col) if (isUpper(ch)) n++;
  return n;
}

/** Build the solver's compact node from a GameState (read-only; no mutation). */
function toNode(state: GameState): Node {
  const cols = state.columns.map((col) =>
    col.map((card) => (card.fromStock ? card.letter.toUpperCase() : card.letter)).join(''),
  );
  return {
    cols,
    stock: state.stock.join(''),
    reserve: state.reserve.join(''),
    recyclesLeft: state.recyclesLeft,
  };
}

/**
 * Column-permutation-invariant memo key. Winnability doesn't depend on WHICH
 * column a card sits in — plays use any column top, and a park targets any empty
 * column capped only by the total parked count (DB-177) — so sorting the column
 * strings collapses transpositions and shrinks the search dramatically.
 */
function keyOf(node: Node): string {
  return `${node.cols.slice().sort().join('|')}#${node.stock}@${node.reserve}$${node.recyclesLeft}`;
}

/** Number of set bits in a small non-negative integer. */
function popcount(mask: number): number {
  let bits = 0;
  for (let m = mask; m > 0; m >>= 1) bits += m & 1;
  return bits;
}

/**
 * All PLAY children of `node`, ordered by native cards removed (descending) so
 * progress toward the win is tried first. A play draws each chosen letter from a
 * distinct source (a column top, or the reserve top), which automatically
 * respects the ≤1-per-column / ≤1-reserve rule since each source appears once.
 */
function playChildren(node: Node): Node[] {
  const srcLetter: string[] = [];
  const srcCol: number[] = []; // column index, or -1 for the reserve
  for (let c = 0; c < node.cols.length; c++) {
    const col = node.cols[c];
    if (col.length > 0) {
      srcLetter.push(col[col.length - 1].toLowerCase());
      srcCol.push(c);
    }
  }
  if (node.reserve.length > 0) {
    srcLetter.push(node.reserve[node.reserve.length - 1]); // reserve chars are lowercase
    srcCol.push(-1);
  }

  const n = srcLetter.length;
  if (n < 3) return [];

  const scored: { node: Node; nativeRemoved: number }[] = [];
  const total = 1 << n;
  for (let mask = 1; mask < total; mask++) {
    const bits = popcount(mask);
    if (bits < 3 || bits > 8) continue;
    const letters: string[] = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) letters.push(srcLetter[i]);
    if (!isWordFromLetters(letters)) continue;

    const cols = node.cols.slice();
    let reserve = node.reserve;
    let nativeRemoved = 0;
    for (let i = 0; i < n; i++) {
      if (!(mask & (1 << i))) continue;
      const c = srcCol[i];
      if (c === -1) {
        reserve = reserve.slice(0, -1);
      } else {
        const col = cols[c];
        if (!isUpper(col[col.length - 1])) nativeRemoved++;
        cols[c] = col.slice(0, -1);
      }
    }
    scored.push({
      node: { cols, stock: node.stock, reserve, recyclesLeft: node.recyclesLeft },
      nativeRemoved,
    });
  }

  scored.sort((a, b) => b.nativeRemoved - a.nativeRemoved);
  return scored.map((s) => s.node);
}

/**
 * Non-play children: DRAW (or RECYCLE when the stock is empty), then PARK. These
 * make no immediate progress toward the win, so they are tried after every play.
 * Park onto an empty column is column-invariant, so a single representative
 * child (the first empty column) covers all of them.
 */
function otherChildren(node: Node, parkBays: number): Node[] {
  const out: Node[] = [];

  if (node.stock.length > 0) {
    out.push({
      cols: node.cols,
      stock: node.stock.slice(1),
      reserve: node.reserve + node.stock[0],
      recyclesLeft: node.recyclesLeft,
    });
  } else if (node.reserve.length > 0 && node.recyclesLeft > 0) {
    out.push({
      cols: node.cols,
      stock: node.reserve, // reserve keeps original draw order — matches the reducer
      reserve: '',
      recyclesLeft: node.recyclesLeft - 1,
    });
  }

  if (node.reserve.length > 0 && parkedCount(node.cols) < parkBays) {
    const empty = node.cols.findIndex((col) => col.length === 0);
    if (empty !== -1) {
      const cols = node.cols.slice();
      cols[empty] = node.reserve[node.reserve.length - 1].toUpperCase();
      out.push({
        cols,
        stock: node.stock,
        reserve: node.reserve.slice(0, -1),
        recyclesLeft: node.recyclesLeft,
      });
    }
  }

  return out;
}

export interface CompletableOptions {
  /** Node budget for the bounded search (default 20000). Hitting it yields a
   * conservative `false` — "not provably completable within the budget". */
  maxNodes?: number;
}

export const DEFAULT_MAX_NODES = 20000;

/**
 * Can the player still clear every NATIVE card from this exact state, under the
 * shipping rules? A bounded, memoized DFS over the reachable moves (plays first,
 * then draw/recycle, then park). Returns `true` only when a genuine winning line
 * is found. Returns `false` when the state is provably dead OR when the node
 * budget is exhausted first — i.e. `false` means "not provably completable within
 * the budget", a conservative answer. Pure: never mutates `state`.
 */
export function isCompletable(state: GameState, opts: CompletableOptions = {}): boolean {
  const maxNodes = opts.maxNodes ?? DEFAULT_MAX_NODES;
  const parkBays = state.config.parkBays;
  const memo = new Map<string, boolean>();
  const onStack = new Set<string>();
  let nodes = 0;
  let boundHit = false;

  function solve(node: Node): boolean {
    if (nativeCount(node.cols) === 0) return true; // win — checked even past budget
    const key = keyOf(node);
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    if (onStack.has(key)) return false; // cycle — no new information on this path
    if (nodes >= maxNodes) {
      boundHit = true;
      return false;
    }
    nodes++;

    onStack.add(key);
    let result = false;
    for (const child of playChildren(node)) {
      if (solve(child)) {
        result = true;
        break;
      }
    }
    if (!result) {
      for (const child of otherChildren(node, parkBays)) {
        if (solve(child)) {
          result = true;
          break;
        }
      }
    }
    onStack.delete(key);

    // Cache only fully-resolved results. Once the budget is hit, `boundHit` is
    // set for the rest of the run, so no ancestor of a truncated subtree caches
    // its (possibly premature) `false`. A cached `true` is always a real win.
    if (!boundHit) memo.set(key, result);
    return result;
  }

  return solve(toNode(state));
}

/**
 * How many DISTINCT lexicon words can be played RIGHT NOW from the current column
 * tops plus the reserve top — a cheap "how many moves do I have" metric. Ignores
 * the tray (cards are still on the board until played). Parked stock cards on a
 * column top count, since they are playable. Pure.
 */
export function openness(state: GameState): number {
  const letters: string[] = [];
  for (const col of state.columns) {
    if (col.length > 0) letters.push(col[col.length - 1].letter.toLowerCase());
  }
  if (state.reserve.length > 0) {
    letters.push(state.reserve[state.reserve.length - 1].toLowerCase());
  }

  const n = letters.length;
  if (n < 3) return 0;

  const words = new Set<string>();
  const total = 1 << n;
  for (let mask = 1; mask < total; mask++) {
    const bits = popcount(mask);
    if (bits < 3 || bits > 8) continue;
    const picked: string[] = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) picked.push(letters[i]);
    for (const w of wordsFromLetters(picked)) words.add(w);
  }
  return words.size;
}

/** Convenience: both measurements for a state in one call. */
export function describeWinnability(state: GameState): { completable: boolean; openness: number } {
  return { completable: isCompletable(state), openness: openness(state) };
}
