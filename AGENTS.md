# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.

# DECKABET

Word Klondike — solitaire where you clear a 7-column tableau by spelling words.
Expo 54 / React Native 0.81 / React 19 / TypeScript (strict). iOS-first, App
Store bound. **Every deal is winnable** — that promise is the product; never
ship a change that can break it.

## Commands

- `npm start` / `npm run ios` — Expo dev server (the user usually has it
  running with hot reload; don't restart it for them)
- `npx tsc --noEmit` — typecheck; run before every commit
- No test runner or linter yet (DB-100/DB-102 in the roadmap add Jest/ESLint).
  Until then, reducer changes are verified with ad-hoc `npx tsx` scripts that
  import `src/game.ts` directly.

## Workflow — non-negotiable

- **Everything merges via PR. Never commit or push to `main` directly.**
  Open the PR; the user merges.
- **Tests ship with the work.** Every PR that changes game logic, scoring,
  generation, or persistence includes tests for the important path AND the
  edge cases — empty piles, full tray (`MAX_WORD`), last card of a column,
  max parked, recycle exhaustion, won-state no-ops, out-of-range actions.
  Bug fixes start with a failing test that reproduces the bug. Never merge a
  behavior change without a test that would catch its regression. (Until
  DB-100 lands Jest, attach `npx tsx` test-script evidence to the PR.)
- Branches: `db-<ticket>/<slug>` for roadmap tickets, `docs/<slug>` for
  doc-only changes.
- **PR titles encode merge order:** `[<n>. <scope>] <title>`, where `n` is a
  global, monotonically increasing merge-order number (merge PRs in ascending
  `n`; never reuse a number) and scope is the epic (`E0`…`E9`) or `docs`.
  Ticket PRs include the ticket ID after the prefix
  (`[5. E0] DB-100: Jest test suite`). Stacked PRs append `(after #N)` and
  set their GitHub base to the PR they depend on.
- `docs/ROADMAP.md` is the canonical plan (epics DB-1xx tickets + specs for
  scoring, difficulty, leaderboards, achievements). `docs/GENERATION.md` is
  the canonical core-game design ("Living Deck"). If code and docs disagree,
  docs win — or PR a doc change.
- **The tracker is always current — the user never has to ask.**
  `docs/roadmap.html` is the live project tracker. Every working PR also
  updates it *in the same PR*: the ticket's status chip (todo → in review
  when the PR opens → done when merged), the PR log row, and the header
  stat counts — then the artifact is republished immediately, so the
  tracker URL reflects reality at any moment. At the start of any session,
  reconcile tracker statuses with actual PR states (things merged since the
  last update) before starting new work. The tracker mirrors ROADMAP.md for
  specs; keep both in sync in the same PR.

## Architecture

Two layers, strictly separated:

- **`src/game.ts`** — the entire rule set as a pure reducer
  `(GameState, Action) => GameState`. No React, no I/O. `MAX_WORD = 8` is the
  one hard constant; recycles-allowed and the park-bay count are per-deal
  difficulty knobs on `state.config` (DB-131; bays designated per DB-179).
  `makeDealState(dealIndex, stats, config)`
  builds a game from `assets/seeds.json`.
- **UI** — `App.tsx` is a thin shell (SafeAreaView + StatusBar) around
  `src/screens/GameScreen.tsx`, which owns the game UI: hooks, layout math,
  three PanResponder drag systems, reducer hookup, and screen-level styles.
  Presentational pieces live in `src/components/` (PopIn, LetterCard,
  CardBack, WordChip, BigButton, Overlay), each owning its own styles.
  `src/dict.ts` (lexicon + anagram-key index for dead-deal detection),
  `src/scoring.ts` (pure scoring math), `src/theme.ts`, `src/types.ts`.

### Vocabulary → code

| Game term | Meaning | In code |
|---|---|---|
| stock | face-down draw pile | `state.stock` |
| reserve | face-up drawn card (waste in classic solitaire) | `state.reserve`, `tapReserve` |
| tray | slots where the current word is built | `state.tray`, `TrayEntry` |
| park / bay | placing the reserve card on a **designated** cleared column; `config.parkBays` sets how many bays a deal has (`state.bays`, chosen at deal time) | `parkReserve`, `pickBays`, `parkedCount` |
| stock-origin | any card that came through stock (orange outline in UI) | `fromStock: true` |

### Rule invariants (tests must protect these)

- A word uses ≤1 card per column and ≤1 reserve card (`tray` source checks).
- Tapping a card whose source is already trayed *withdraws* it (toggle).
- Parked cards are playable but **never count toward the win**:
  win = `countNative(columns) === 0`, which filters `fromStock`. Parking is
  allowed **only onto this deal's designated bays** — `state.bays`, the
  `config.parkBays` column indices chosen randomly at deal time (`pickBays`) and
  marked in the UI — and only once that bay column has been cleared. One card
  per bay, so the number parked at once is bounded by the bays you've emptied —
  DB-179 (supersedes DB-177's "any empty column" rule).
- The trayed reserve entry is always the current reserve top — `draw` and
  `parkReserve` auto-return it first. Breaking this corrupts `play`.
- Deal validity: 7 columns of heights 1–7 (28 cards, bottom→top strings in
  seeds.json), 20-card stock, every deal has a witness solution (verified at
  generation; generator + witnesses currently live outside the repo — DB-105
  checks them in).

### UI conventions (learned the hard way)

- Card "lift"/shift effects are done with **layout (margins), not
  transforms** — transforms clipped/overlapped on device.
- Trayed cards ghost out but stay opaque; every pile/slot has a
  "ghost spot" placemat on its lowest z-layer, rendered as a separate
  underlay so moving cards never pass behind it.
- Drags use core `PanResponder` (no gesture libs): release with <6px
  movement = tap. Reserve card drags to park bays; tray cards drag to swap.
- Accent discipline: green = playable/CTA, orange = stock-origin only.

## Where the game is going

The static 290-deal pool in `assets/seeds.json` is interim. The target design
(docs/GENERATION.md) generates deals from seeds at play time and picks stock
cards at draw time under a solvability invariant. Scoring, daily 5-game
challenge sets, and the word-retirement ladder are specced in docs/ROADMAP.md.
When touching `src/game.ts` or `src/dict.ts`, prefer signatures that take the
lexicon/config as parameters — several roadmap tickets depend on them not
being globals.
