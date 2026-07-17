// On-device deal generator (DB-170) — the foundation of the Living Deck (E7).
//
// Pure and deterministic: `generateDeal(seed)` builds a winnable Deal by
// SOLUTION-FIRST construction, a faithful TypeScript port of the v1 Python
// generator (scripts/generate-deals.py). The method: pick a sequence of words
// (the solution), give each word at most one letter from the stock and the
// rest to DISTINCT columns, then stack each column so earlier-played words sit
// nearer the top. Forward play of that sequence is then legal by the rules, so
// every generated deal ships with a witness that wins.
//
// Determinism: same seed ⇒ byte-identical Deal. Each accept/retry attempt runs
// on a sub-seed derived from (seed, attempt), so the loop itself is reproducible.
//
// Scope: this ticket lands ONLY the pure generator + the duplicate-cap
// distribution guard. The remaining E7 constraints — altitude guards,
// vowel/consonant window, rarity budget, par bands, openness threshold, and
// word-length quality gates — are DEFERRED to DB-171/172/175 and are NOT
// implemented here (docs/GENERATION.md "How a deal is born").

import lexiconJson from '../assets/lexicon.json';
import { reducer } from './game';
import { estimatePar, inParBand, meetsWordLengthGate } from './par';
import { makeRng, type Rng } from './rng';
import { DEFAULT_CONFIG } from './scoring';
import type { Deal, GameState } from './types';

const STOCK_LEN = 20;
const TABLEAU_LEN = 28;
const DEFAULT_HEIGHTS = [1, 2, 3, 4, 5, 6, 7];
const K_CHOICES = [7, 8, 9, 9, 10]; // solution length, matching the v1 pool
const LEN_CHOICES = [3, 4, 5, 6, 7, 8];
const LEN_WEIGHTS = [6, 5, 3, 1.5, 0.7, 0.3];

/** Distribution guard: no single letter may appear more than this many times
 * across the 28 tableau + 20 stock = 48 cards (docs/GENERATION.md "duplicate
 * caps"). Keeps deals from degenerating into "seven E's". */
const MAX_LETTER_COPIES = 6;

/** Hard cap on accept/retry attempts. A winnable deal is found in a handful of
 * tries in practice; exhaustion means something is badly wrong. */
const MAX_ATTEMPTS = 4000;

export interface GenerateOptions {
  /** Word pool (lowercase). Defaults to assets/lexicon.json, filtered to a-z 3–8. */
  lexicon?: string[];
  /** Board shape: 7 column heights (each ≥1) summing to 28. Defaults to the [1..7] staircase. */
  heights?: number[];
  /** DB-175: also reject candidates whose estimated par falls outside PAR_BAND
   * (keeps daily totals about skill, not deal luck). Default false — off by
   * default so existing generation behaviour and tests are unchanged. */
  requireParBand?: boolean;
  /** DB-175: also reject candidates whose best line reaches no ≥7-letter word
   * (the "a 7 discoverable by skill" quality gate). Default false. */
  requireSevenGate?: boolean;
}

interface Derived {
  byLen: Map<number, string[]>;
  letters: string[];
  weights: number[];
}

interface Candidate {
  columns: string[];
  stock: string;
  label: string;
  solverWords: number;
  witness: Deal['witness'];
}

// ---------------------------------------------------------------- lexicon prep

function isLexEntry(w: string): boolean {
  return w.length >= 3 && w.length <= 8 && /^[a-z]+$/.test(w);
}

let defaultWordsCache: string[] | null = null;
function defaultWords(): string[] {
  if (defaultWordsCache === null) {
    const map = (lexiconJson as unknown as { words: Record<string, number> }).words;
    defaultWordsCache = Object.keys(map).filter(isLexEntry);
  }
  return defaultWordsCache;
}

const derivedCache = new WeakMap<readonly string[], Derived>();
function deriveLexicon(words: string[]): Derived {
  const cached = derivedCache.get(words);
  if (cached) return cached;
  const byLen = new Map<number, string[]>();
  const counts: Record<string, number> = {};
  for (const w of words) {
    if (!isLexEntry(w)) continue;
    const bucket = byLen.get(w.length);
    if (bucket) bucket.push(w);
    else byLen.set(w.length, [w]);
    for (const ch of w) counts[ch] = (counts[ch] ?? 0) + 1;
  }
  const letters = Object.keys(counts).sort();
  const weights = letters.map((ch) => counts[ch]);
  const derived: Derived = { byLen, letters, weights };
  derivedCache.set(words, derived);
  return derived;
}

// ---------------------------------------------------------------- construction

/** Word lengths summing to 28 + m, where m words (including every 8-letter
 * word — its 8th letter must ride the stock) take one letter from the stock. */
function pickLengths(rng: Rng, k: number): { lengths: number[]; stockFlags: boolean[] } | null {
  for (let attempt = 0; attempt < 2000; attempt++) {
    const lengths: number[] = [];
    for (let i = 0; i < k; i++) lengths.push(rng.weighted(LEN_CHOICES, LEN_WEIGHTS));
    const sum = lengths.reduce((a, b) => a + b, 0);
    const m = sum - TABLEAU_LEN;
    const eights = lengths.filter((l) => l === 8).length;
    if (eights <= m && m <= k) {
      const flags = lengths.map((l) => l === 8);
      const free: number[] = [];
      flags.forEach((f, i) => {
        if (!f) free.push(i);
      });
      for (const i of rng.sample(free, m - eights)) flags[i] = true;
      return { lengths, stockFlags: flags };
    }
  }
  return null;
}

/** Give word i `counts[i]` cells across DISTINCT columns; greedy, biggest
 * remaining capacity first (ties broken by the seed). Returns cols per word. */
function assignColumns(rng: Rng, counts: number[], caps: number[]): number[][] | null {
  const remaining = caps.slice();
  const n = counts.length;
  const ncols = caps.length;
  const result: number[][] = new Array(n);
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => counts[b] - counts[a]);
  for (const i of order) {
    const jitter = Array.from({ length: ncols }, () => rng.next());
    const colOrder = Array.from({ length: ncols }, (_, c) => c).sort(
      (x, y) => remaining[y] - remaining[x] || jitter[x] - jitter[y],
    );
    const cols = colOrder.filter((c) => remaining[c] > 0).slice(0, counts[i]);
    if (cols.length < counts[i]) return null;
    for (const c of cols) remaining[c] -= 1;
    result[i] = cols;
  }
  return result;
}

/** One construction attempt on a fresh sub-seed RNG. Null on a dead end. */
function makeDeal(rng: Rng, caps: number[], derived: Derived): Candidate | null {
  const k = rng.pick(K_CHOICES);
  const picked = pickLengths(rng, k);
  if (picked === null) return null;
  const { lengths, stockFlags } = picked;

  const words: string[] = [];
  for (const l of lengths) {
    const bucket = derived.byLen.get(l);
    if (!bucket || bucket.length === 0) return null;
    let chosen: string | null = null;
    for (let tries = 0; tries < 80; tries++) {
      const w = rng.pick(bucket);
      if (!words.includes(w)) {
        chosen = w;
        break;
      }
    }
    if (chosen === null) return null;
    words.push(chosen);
  }

  const colCounts = words.map((w, i) => w.length - (stockFlags[i] ? 1 : 0));
  const colsFor = assignColumns(rng, colCounts, caps);
  if (colsFor === null) return null;

  const ncols = caps.length;
  const colCells: { playIndex: number; letter: string }[][] = Array.from({ length: ncols }, () => []);
  const stockNeeded: string[] = []; // in play order
  const witness: Deal['witness'] = [];

  words.forEach((word, i) => {
    const usesStock = stockFlags[i];
    const positions = Array.from({ length: word.length }, (_, p) => p);
    const sources: (number | 'reserve')[] = new Array(word.length);
    if (usesStock) {
      const p = rng.pick(positions);
      sources[p] = 'reserve';
      stockNeeded.push(word[p]);
      positions.splice(positions.indexOf(p), 1);
    }
    const cols = rng.shuffle(colsFor[i]);
    positions.forEach((p, idx) => {
      const c = cols[idx];
      sources[p] = c;
      colCells[c].push({ playIndex: i, letter: word[p] });
    });
    witness.push({ word, sources });
  });

  // Bottom -> top: latest-played word at the bottom, earliest on top.
  const columns: string[] = [];
  for (let c = 0; c < ncols; c++) {
    const cells = colCells[c].slice().sort((x, y) => y.playIndex - x.playIndex);
    columns.push(cells.map((cell) => cell.letter).join(''));
  }

  const m = stockNeeded.length;
  const fillers: string[] = [];
  for (let i = 0; i < STOCK_LEN - m; i++) fillers.push(rng.weighted(derived.letters, derived.weights));
  const stock = stockNeeded.join('') + fillers.join('');

  return {
    columns,
    stock,
    label: m <= 4 ? 'smooth' : 'tight',
    solverWords: k,
    witness,
  };
}

// ---------------------------------------------------------------- verification

/** True if any letter appears more than MAX_LETTER_COPIES across the 48 cards. */
function exceedsDuplicateCap(candidate: Candidate): boolean {
  const counts: Record<string, number> = {};
  for (const ch of candidate.columns.join('') + candidate.stock) {
    counts[ch] = (counts[ch] ?? 0) + 1;
    if (counts[ch] > MAX_LETTER_COPIES) return true;
  }
  return false;
}

function buildState(candidate: Candidate): GameState {
  return {
    dealIndex: 0,
    config: DEFAULT_CONFIG,
    columns: candidate.columns.map((c) =>
      c.split('').map((letter) => ({ letter, fromStock: false })),
    ),
    stock: candidate.stock.split(''),
    reserve: [],
    recyclesLeft: DEFAULT_CONFIG.recycles,
    tray: [],
    played: [],
    movesMade: 0,
    reserveLettersPlayed: 0,
    parksUsed: 0,
    recyclesUsed: 0,
    won: false,
    stats: { won: 0, played: 0, streak: 0 },
  };
}

/** Replay the witness through the REAL reducer so winnability can never drift
 * from the shipping rules. True iff every step plays a word and the deal wins. */
function witnessWins(candidate: Candidate): boolean {
  let s = buildState(candidate);
  for (const step of candidate.witness) {
    if (step.sources.includes('reserve')) s = reducer(s, { type: 'draw' });
    for (const src of step.sources) {
      s =
        src === 'reserve'
          ? reducer(s, { type: 'tapReserve' })
          : reducer(s, { type: 'tapColumn', col: src });
    }
    const before = s.played.length;
    s = reducer(s, { type: 'play' });
    if (s.played.length !== before + 1) return false;
  }
  return s.won;
}

// ---------------------------------------------------------------- public API

/** Deterministic per-attempt sub-seed so the accept/retry loop is reproducible. */
function deriveSeed(seed: number, attempt: number): number {
  let h = (seed >>> 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ attempt, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function validateHeights(heights: number[]): void {
  // 7 columns, each ≥1 card, 28 total. Any such shape is legal — DB-173's
  // difficulty ramp uses flat [4×7], gentle [2,3,4,4,5,5,5], steep, etc., not
  // just the [1..7] staircase. Heights are position-shuffled by the caller.
  const ok =
    heights.length === 7 &&
    heights.every((h) => Number.isInteger(h) && h >= 1) &&
    heights.reduce((a, b) => a + b, 0) === 28;
  if (!ok) {
    throw new Error(
      `generateDeal: heights must be 7 positive integers summing to 28, got [${heights.join(',')}]`,
    );
  }
}

/**
 * Build a winnable Deal from `seed`. Deterministic — the same seed (and options)
 * always returns a byte-identical Deal. Loops on derived sub-seeds until a
 * candidate passes the duplicate-cap guard AND a witness replay through the real
 * reducer wins; throws only if attempts are exhausted (should never happen).
 */
export function generateDeal(seed: number, opts: GenerateOptions = {}): Deal {
  const caps = opts.heights ?? DEFAULT_HEIGHTS;
  validateHeights(caps);
  const derived = deriveLexicon(opts.lexicon ?? defaultWords());

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const rng = makeRng(deriveSeed(seed, attempt));
    const candidate = makeDeal(rng, caps, derived);
    if (candidate === null) continue;
    if (exceedsDuplicateCap(candidate)) continue;
    if (!witnessWins(candidate)) continue;
    const deal: Deal = {
      columns: candidate.columns,
      stock: candidate.stock,
      label: candidate.label,
      solverWords: candidate.solverWords,
      witness: candidate.witness,
    };
    // DB-175 quality gates (opt-in; both default off so baseline generation is
    // untouched). The par search is deterministic, so the accept loop stays
    // reproducible: same seed ⇒ same accepted deal.
    if (opts.requireParBand && !inParBand(estimatePar(deal).par)) continue;
    if (opts.requireSevenGate && !meetsWordLengthGate(deal)) continue;
    return deal;
  }
  throw new Error(`generateDeal: exhausted ${MAX_ATTEMPTS} attempts for seed ${seed}`);
}
