// DB-175 — PAR estimation + word-length quality gates for the Living Deck.
//
// MEASUREMENT ONLY (docs/GENERATION.md pillar 6: "guarantee the deal, don't
// guide the play"). This module never touches live play; it exists so the
// generator can reason about a deal's *ceiling* — the score a strong player
// could reach — and reject deals whose ceiling falls outside a target band, so
// daily totals compare skill, not deal luck (pillar 2, "fair start, honest
// finish"). It also enforces the word-length quality gates (docs/GENERATION.md
// "Deal quality gates"): a 7-letter word must be discoverable by skilled play.
//
// PAR is a SOUND LOWER BOUND on the true optimum, not the optimum itself. It is
// the best `dealScore` found by a DETERMINISTIC bounded DFS over the deal's
// reachable winning lines, floored by the deal's own witness score (a
// guaranteed-achievable line). A bounded search may miss the very best line —
// that is fine and intended: par only needs to be achievable, so under-counting
// is safe. Over-counting would not be, so we never estimate above a real line.
//
// Scoring uses DEFAULT_CONFIG so par is config-independent: it reflects the
// deal's intrinsic ceiling, not the difficulty knobs a given player picked.
//
// Pure: no React, no I/O, never mutates its inputs.

import { wordsFromLetters } from './dict';
import {
  DEFAULT_CONFIG,
  dealScore,
  wordScore,
  type DealOutcome,
} from './scoring';
import type { Deal } from './types';

// ---------------------------------------------------------------- compact node

// Mirrors the DB-171 solver's encoding: inside a column string a parked stock
// card is UPPERCASE and a native card lowercase, so a column's native cards are
// exactly its lowercase chars and any top card is playable via its letter
// lowercased. A par search starts from an all-native board (no parks yet).
interface PNode {
  /** 7 columns, each bottom->top; lowercase = native, UPPERCASE = parked stock. */
  cols: string[];
  /** Remaining draw order; index 0 is drawn next. */
  stock: string;
  /** Draw order; last char is the face-up reserve top. */
  reserve: string;
  recyclesLeft: number;
}

/** Path-accumulated scoring state — the line of play taken to reach a node.
 * Unlike the solver (which memoizes on board state alone), par MUST track the
 * path, because the same board reached two ways can carry different scores. */
interface Acc {
  words: string[];
  reserveLettersPlayed: number;
  parksUsed: number;
  recyclesUsed: number;
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

function popcount(mask: number): number {
  let bits = 0;
  for (let m = mask; m > 0; m >>= 1) bits += m & 1;
  return bits;
}

/** All lexicon words that are an exact anagram of `letters`, resolved to a
 * single canonical (lexicographically smallest) word. Every anagram scores the
 * same (wordScore depends only on the letter multiset + length), so the choice
 * is cosmetic — we sort only to keep `bestWords` deterministic. Callers pass
 * only letter sets that already form a word, so the result is never empty. */
function canonicalWord(letters: string[]): string {
  const words = wordsFromLetters(letters);
  let best = words[0];
  for (const w of words) if (w < best) best = w;
  return best;
}

interface PlayChild {
  node: PNode;
  word: string;
  usedReserve: boolean;
  nativeRemoved: number;
}

/**
 * All PLAY children of `node`. Each play draws one letter from a distinct source
 * (a column top, or the reserve top), which automatically respects the
 * ≤1-per-column / ≤1-reserve rule since every source appears once. Ordered by
 * native cards removed (descending), then by wordScore (descending): both
 * favour long, high-value words first — which, because length multipliers are
 * super-linear, is exactly the direction of high par. The order is a fixed
 * function of the node, so the search is deterministic.
 */
function playChildren(node: PNode): PlayChild[] {
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

  const scored: { child: PlayChild; score: number }[] = [];
  const total = 1 << n;
  for (let mask = 1; mask < total; mask++) {
    const bits = popcount(mask);
    if (bits < 3 || bits > 8) continue;
    const letters: string[] = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) letters.push(srcLetter[i]);
    const words = wordsFromLetters(letters);
    if (words.length === 0) continue;

    const cols = node.cols.slice();
    let reserve = node.reserve;
    let usedReserve = false;
    let nativeRemoved = 0;
    for (let i = 0; i < n; i++) {
      if (!(mask & (1 << i))) continue;
      const c = srcCol[i];
      if (c === -1) {
        reserve = reserve.slice(0, -1);
        usedReserve = true;
      } else {
        const col = cols[c];
        if (!isUpper(col[col.length - 1])) nativeRemoved++;
        cols[c] = col.slice(0, -1);
      }
    }
    const word = canonicalWord(letters);
    scored.push({
      child: {
        node: { cols, stock: node.stock, reserve, recyclesLeft: node.recyclesLeft },
        word,
        usedReserve,
        nativeRemoved,
      },
      score: wordScore(word),
    });
  }

  scored.sort((a, b) => b.child.nativeRemoved - a.child.nativeRemoved || b.score - a.score);
  return scored.map((s) => s.child);
}

type OtherKind = 'draw' | 'recycle' | 'park';
interface OtherChild {
  node: PNode;
  kind: OtherKind;
}

/**
 * Non-play children: DRAW (or RECYCLE when the stock is empty), then PARK. These
 * make no immediate progress toward the win, so they are tried after every play.
 * Park onto an empty column is column-invariant, so one representative child
 * (the first empty column) covers all of them.
 */
function otherChildren(node: PNode, parkBays: number): OtherChild[] {
  const out: OtherChild[] = [];

  if (node.stock.length > 0) {
    out.push({
      node: {
        cols: node.cols,
        stock: node.stock.slice(1),
        reserve: node.reserve + node.stock[0],
        recyclesLeft: node.recyclesLeft,
      },
      kind: 'draw',
    });
  } else if (node.reserve.length > 0 && node.recyclesLeft > 0) {
    out.push({
      node: {
        cols: node.cols,
        stock: node.reserve, // reserve keeps original draw order — matches the reducer
        reserve: '',
        recyclesLeft: node.recyclesLeft - 1,
      },
      kind: 'recycle',
    });
  }

  if (node.reserve.length > 0 && parkedCount(node.cols) < parkBays) {
    const empty = node.cols.findIndex((col) => col.length === 0);
    if (empty !== -1) {
      const cols = node.cols.slice();
      cols[empty] = node.reserve[node.reserve.length - 1].toUpperCase();
      out.push({
        node: {
          cols,
          stock: node.stock,
          reserve: node.reserve.slice(0, -1),
          recyclesLeft: node.recyclesLeft,
        },
        kind: 'park',
      });
    }
  }

  return out;
}

// ---------------------------------------------------------------- witness floor

/** The witness score is the guaranteed-achievable floor. The generation-time
 * witness never parks or recycles; its only stock use is the letters it plays
 * off the reserve (one per word flagged usesStock). Scored under DEFAULT_CONFIG
 * so it matches the search's config-independent par. */
function witnessOutcome(deal: Deal): DealOutcome {
  let reserveLettersPlayed = 0;
  const words: string[] = [];
  for (const step of deal.witness) {
    words.push(step.word);
    for (const src of step.sources) if (src === 'reserve') reserveLettersPlayed++;
  }
  return { words, reserveLettersPlayed, parksUsed: 0, recyclesUsed: 0, config: DEFAULT_CONFIG };
}

// ---------------------------------------------------------------- public config

export interface EstimateParOptions {
  /** Node budget for the bounded DFS (default DEFAULT_PAR_MAX_NODES). Exhausting
   * it just stops the search — par is whatever best line was found by then. */
  maxNodes?: number;
}

/** A few thousand nodes: enough to explore the greedy long-word line and its
 * near neighbours on a 28-card board, fast enough to run in a generator accept
 * loop (~ single-digit ms per deal). */
export const DEFAULT_PAR_MAX_NODES = 8000;

export interface ParEstimate {
  /** Best dealScore (DEFAULT_CONFIG) over explored winning lines, ≥ witness. */
  par: number;
  /** The word list of the line that achieved `par`. */
  bestWords: string[];
}

interface Analysis extends ParEstimate {
  /** Longest word length in `bestWords`, floored by the longest witness word. */
  longest: number;
}

function maxLen(words: string[]): number {
  let m = 0;
  for (const w of words) if (w.length > m) m = w.length;
  return m;
}

function buildRoot(deal: Deal): PNode {
  return {
    cols: deal.columns.map((c) => c.toLowerCase()), // all-native board: lowercase
    stock: deal.stock.toLowerCase(),
    reserve: '',
    recyclesLeft: DEFAULT_CONFIG.recycles,
  };
}

/** Core: the bounded, deterministic best-score search, floored by the witness. */
function analyze(deal: Deal, maxNodes: number): Analysis {
  const parkBays = DEFAULT_CONFIG.parkBays;

  // Witness floor first, so par ≥ witnessScore even if the search finds nothing.
  const wOutcome = witnessOutcome(deal);
  let best: ParEstimate = { par: dealScore(wOutcome), bestWords: wOutcome.words.slice() };
  const witnessLongest = maxLen(wOutcome.words);

  let nodes = 0;

  function dfs(node: PNode, acc: Acc): void {
    if (nativeCount(node.cols) === 0) {
      // A winning line: score it and keep it if it strictly beats the best so
      // far. Strict '>' makes the retained line deterministic (first found at a
      // given score wins, and exploration order is fixed).
      const score = dealScore({
        words: acc.words,
        reserveLettersPlayed: acc.reserveLettersPlayed,
        parksUsed: acc.parksUsed,
        recyclesUsed: acc.recyclesUsed,
        config: DEFAULT_CONFIG,
      });
      if (score > best.par) best = { par: score, bestWords: acc.words.slice() };
      return;
    }
    if (nodes >= maxNodes) return; // budget exhausted — stop exploring
    nodes++;

    for (const child of playChildren(node)) {
      dfs(child.node, {
        words: [...acc.words, child.word],
        reserveLettersPlayed: acc.reserveLettersPlayed + (child.usedReserve ? 1 : 0),
        parksUsed: acc.parksUsed,
        recyclesUsed: acc.recyclesUsed,
      });
    }
    for (const child of otherChildren(node, parkBays)) {
      dfs(child.node, {
        words: acc.words,
        reserveLettersPlayed: acc.reserveLettersPlayed,
        parksUsed: acc.parksUsed + (child.kind === 'park' ? 1 : 0),
        recyclesUsed: acc.recyclesUsed + (child.kind === 'recycle' ? 1 : 0),
      });
    }
  }

  dfs(buildRoot(deal), { words: [], reserveLettersPlayed: 0, parksUsed: 0, recyclesUsed: 0 });

  return {
    par: best.par,
    bestWords: best.bestWords,
    longest: Math.max(maxLen(best.bestWords), witnessLongest),
  };
}

// A deal object is immutable input; caching the default-budget analysis on it
// keeps the four public helpers (and the generator's par + gate checks) from
// re-running the same search. Custom budgets bypass the cache.
const analysisCache = new WeakMap<Deal, Analysis>();

function analysisOf(deal: Deal, opts: EstimateParOptions = {}): Analysis {
  const maxNodes = opts.maxNodes ?? DEFAULT_PAR_MAX_NODES;
  if (maxNodes !== DEFAULT_PAR_MAX_NODES) return analyze(deal, maxNodes);
  const cached = analysisCache.get(deal);
  if (cached) return cached;
  const result = analyze(deal, maxNodes);
  analysisCache.set(deal, result);
  return result;
}

// ---------------------------------------------------------------- public API

/**
 * Estimate a deal's PAR — the best `dealScore` (under DEFAULT_CONFIG) reachable
 * on a winning line, as a sound LOWER BOUND on the true optimum. Deterministic:
 * the same deal always yields the same par. The deal's witness score is folded
 * in as a floor, so `par ≥ witnessScore` always. Pure; does not mutate `deal`.
 */
export function estimatePar(deal: Deal, opts: EstimateParOptions = {}): ParEstimate {
  const a = analysisOf(deal, opts);
  return { par: a.par, bestWords: a.bestWords };
}

/** Length of the longest word in the deal's best line (floored by the longest
 * witness word), for the word-length gate. */
export function longestWord(deal: Deal, opts: EstimateParOptions = {}): number {
  return analysisOf(deal, opts).longest;
}

/**
 * Target par band. Chosen by measuring `estimatePar` over 200 generated deals
 * (see src/__tests__/par.test.ts, which logs the distribution). Under the
 * shipping lexicon the ceiling clusters tightly: min ≈ 94, p5 ≈ 111,
 * median ≈ 138, p95 ≈ 183, max ≈ 236. The band [100, 190] keeps ≈ 96% of
 * deals, trimming only the flattest ≈ 2% (below 100) and the luckiest ≈ 4%
 * (above 190). The band is intentionally generous — its job is to exclude
 * outliers so daily totals reflect skill, not to hand-pick deals. Retune
 * against the logged distribution as the lexicon/steering/scoring evolve.
 */
export const PAR_BAND: { min: number; max: number } = { min: 100, max: 190 };

/** True if `par` sits within the target band (inclusive). */
export function inParBand(par: number): boolean {
  return par >= PAR_BAND.min && par <= PAR_BAND.max;
}

/**
 * Word-length gate: true if the deal's best line reaches a ≥7-letter word — the
 * "a 7 discoverable by skill" quality gate. (The "5 always reachable" gate is
 * implied by any winning line of a 28-card board; the "8s ≈10%" target is a
 * POOL-level rate, not a per-deal gate — see hasEightLetterWord.)
 */
export function meetsWordLengthGate(deal: Deal, opts: EstimateParOptions = {}): boolean {
  return longestWord(deal, opts) >= 7;
}

/**
 * True if the deal's best line reaches an 8-letter word. Exposed so a
 * generator/caller can MEASURE the 8-letter rate across a pool (target ≈10%);
 * single deals are NOT rejected for lacking an 8.
 */
export function hasEightLetterWord(deal: Deal, opts: EstimateParOptions = {}): boolean {
  return longestWord(deal, opts) >= 8;
}
