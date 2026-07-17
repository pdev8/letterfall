// DB-172 — draw-time stock steering (the Living Deck, docs/GENERATION.md
// pillars 2/5/6).
//
// The undrawn stock DOES NOT EXIST YET. The next drawn card is computed HERE,
// at draw time, as a deterministic function of (seed, move history). This
// module is pure — no React, no I/O, no mutation of its inputs — so a run can
// be replayed and verified (the phase-2 server replay validator, DB-186).
//
// What it does: over a LEGAL candidate set (letters that keep the deal
// completable — the caller supplies that set as `candidatePool`; see below),
// it enforces FAIRNESS (no letter floods, a vowel lifeline, a rare-letter
// budget) and a WARMTH CURVE (early draws kinder, tapering to neutral by
// ~60% through the expected draws). It STEERS; it never RESCUES — completability
// is the caller's invariant (this module only ever chooses among letters the
// caller already vetted). Dead is dead, on the player's line.
//
// Scope (DB-172): the algorithm + tests only. Wiring this into the live reducer
// / GameState — and computing the completability-preserving `candidatePool`
// from a full board via src/solver.ts — is DB-174 (daily mode). Landed pure,
// exactly as DB-170's generator did.

import { wordsFromLetters } from './dict';
import { makeRng } from './rng';
import { letterValue } from './scoring';

/** Everything steering needs to pick the next drawn letter. All fields are
 * read-only inputs; `steerNextCard` never mutates them. */
export interface SteerContext {
  /** Deal seed — the deterministic spine of the whole draw sequence. */
  seed: number;
  /** 0-based index of the draw being computed (the move-history position). */
  drawIndex: number;
  /** Roughly how many draws this deal is expected to take — sets the warmth
   * taper. Non-positive values are treated as "one draw" (fully warm). */
  totalDrawsExpected: number;
  /** Letters currently in sight — column tops + the reserve top — used by the
   * fairness guards and the warmth usefulness heuristic. */
  visibleLetters: string[];
  /** Letters already drawn this deal (move history), for the duplicate cap and
   * the rare-letter budget. */
  recentDraws: string[];
  /** Difficulty knob in [0,1]: 1 = kind (daily game 1), 0 = minimal (game 5).
   * Scales the whole warmth curve. */
  generosity: number;
}

const ALL_LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');
const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

// --- Tuning constants (see the header of steering.test.ts for the rationale) ---

/** Duplicate cap: a letter appearing this many times or more across
 * visibleLetters + recentDraws is dropped from the candidates (unless dropping
 * would empty the set). Kills "seven E's" floods. */
export const DUPLICATE_CAP = 3;
/** Rare-letter budget: at most this many rare letters (value ≥ 5 — k,j,x,q,z)
 * may be drawn per deal; once spent, rares are dropped. Keeps scores in band. */
export const RARE_BUDGET = 2;
/** Vowel lifeline: when fewer than this many vowels are visible, candidates are
 * restricted to vowels so one arrives soon (docs/GENERATION.md invariant). */
export const VOWEL_MIN = 2;
/** Warmth reaches ~0 by this fraction of the expected draws (the "neutral by
 * mid-game" taper). */
export const WARMTH_TAPER = 0.6;
/** Sharpness of the warmth bias: selection weight = exp(WARMTH_BETA · affinity).
 * Higher = more greedy toward the warm/cold preference, still not deterministic. */
export const WARMTH_BETA = 4;

/** Vowels currently in sight (a,e,i,o,u), case-insensitive. */
export function visibleVowelCount(visibleLetters: string[]): number {
  let n = 0;
  for (const c of visibleLetters) if (VOWELS.has(c.toLowerCase())) n++;
  return n;
}

/** A "rare" letter is a high-value one (Scrabble value ≥ 5): k,j,x,q,z. */
export function isRareLetter(letter: string): boolean {
  return letterValue(letter) >= 5;
}

/**
 * Cheap warmth heuristic: how many DISTINCT lexicon words become formable by
 * adding `letter` to the currently visible tops. Only words that actually use
 * the new letter are counted (that is what "adding this letter unlocks"). Work
 * is bounded — at most the last 8 visible letters are considered, so ≤ 2^9
 * subset masks. Pure. */
export function usefulnessScore(letter: string, visibleLetters: string[]): number {
  const added = letter.toLowerCase();
  // Column tops + reserve is at most 8 letters; bound defensively regardless.
  const base = visibleLetters.slice(-8).map((c) => c.toLowerCase());
  const pool = [...base, added];
  const n = pool.length;
  if (n < 3) return 0;
  const addedBit = 1 << (n - 1); // the appended letter is the last element

  const words = new Set<string>();
  const total = 1 << n;
  for (let mask = 1; mask < total; mask++) {
    if (!(mask & addedBit)) continue; // must use the newly added letter
    let bits = 0;
    for (let m = mask; m > 0; m >>= 1) bits += m & 1;
    if (bits < 3 || bits > 8) continue;
    const picked: string[] = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) picked.push(pool[i]);
    for (const w of wordsFromLetters(picked)) words.add(w);
  }
  return words.size;
}

/** Deterministic 32-bit mix of (seed, drawIndex) — the per-draw rng seed, so a
 * given move-history position always draws the same way. */
function mixSeed(seed: number, drawIndex: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (drawIndex + 0x165667b1), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Apply `filter`, but only commit the result if it leaves at least one
 * candidate — guards degrade gracefully, never emptying the set. */
function guard(candidates: string[], filter: (c: string) => boolean): string[] {
  const kept = candidates.filter(filter);
  return kept.length > 0 ? kept : candidates;
}

/**
 * The next drawn letter for this context. Deterministic: same `ctx` (and same
 * `candidatePool`) ⇒ same letter, always.
 *
 * `candidatePool` is the LEGAL set — in integration (DB-174) the caller passes
 * the letters that keep the deal completable; here it defaults to all 26.
 *
 * Algorithm (docs/GENERATION.md "How a deal is born"):
 *   1. candidates = distinct letters of the pool (or a–z).
 *   2. FAIRNESS GUARDS (hard, but graceful): duplicate cap, rare budget, then
 *      the vowel lifeline — each only commits if it leaves ≥1 candidate.
 *   3. WARMTH CURVE: warm ⇒ bias toward USEFUL letters; cold ⇒ toward the
 *      LEAST useful (tighten). The seeded rng adds reproducible randomness so
 *      it is not a pure greedy pick.
 */
export function steerNextCard(ctx: SteerContext, candidatePool?: string[]): string {
  const source = candidatePool ?? ALL_LETTERS;

  // Distinct, lowercased, alphabetical — a stable order so the result never
  // depends on how the pool happened to be ordered.
  let candidates = Array.from(new Set(source.map((c) => c.toLowerCase()))).sort();
  if (candidates.length === 0) candidates = ALL_LETTERS.slice();
  if (candidates.length === 1) return candidates[0];

  // --- 2. Fairness guards ---

  // Duplicate cap over visibleLetters + recentDraws.
  const seen = new Map<string, number>();
  for (const c of [...ctx.visibleLetters, ...ctx.recentDraws]) {
    const l = c.toLowerCase();
    seen.set(l, (seen.get(l) ?? 0) + 1);
  }
  candidates = guard(candidates, (c) => (seen.get(c) ?? 0) < DUPLICATE_CAP);

  // Rare-letter budget over the draws made so far.
  const raresDrawn = ctx.recentDraws.reduce((n, c) => n + (isRareLetter(c) ? 1 : 0), 0);
  if (raresDrawn >= RARE_BUDGET) {
    candidates = guard(candidates, (c) => !isRareLetter(c));
  }

  // Vowel lifeline — guarantee a vowel arrives soon when the board is starved.
  if (visibleVowelCount(ctx.visibleLetters) < VOWEL_MIN) {
    candidates = guard(candidates, (c) => VOWELS.has(c));
  }

  if (candidates.length === 1) return candidates[0];

  // --- 3. Warmth curve ---

  const generosity = Math.min(1, Math.max(0, ctx.generosity));
  const taperWindow = Math.max(1, ctx.totalDrawsExpected * WARMTH_TAPER);
  const warmth = generosity * Math.max(0, 1 - ctx.drawIndex / taperWindow);

  const scores = candidates.map((c) => usefulnessScore(c, ctx.visibleLetters));
  const lo = Math.min(...scores);
  const hi = Math.max(...scores);
  const span = hi - lo;

  const weights = candidates.map((_, i) => {
    // Normalized usefulness in [0,1]; flat 0.5 when every candidate ties.
    const norm = span > 0 ? (scores[i] - lo) / span : 0.5;
    // Warm favors high usefulness; cold favors low. Endpoints are exact.
    const affinity = warmth * norm + (1 - warmth) * (1 - norm);
    return Math.exp(WARMTH_BETA * affinity);
  });

  const rng = makeRng(mixSeed(ctx.seed, ctx.drawIndex));
  return rng.weighted(candidates, weights);
}
