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
- No test runner or linter yet (LF-100/LF-102 in the roadmap add Jest/ESLint).
  Until then, reducer changes are verified with ad-hoc `npx tsx` scripts that
  import `src/game.ts` directly.

## Workflow — non-negotiable

- **Everything merges via PR. Never commit or push to `main` directly.**
  Open the PR; the user merges.
- Branches: `lf-<ticket>/<slug>` for roadmap tickets, `docs/<slug>` for
  doc-only changes. Ticket ID in the PR title.
- `docs/ROADMAP.md` is the canonical plan (epics LF-1xx tickets + specs for
  scoring, difficulty, leaderboards, achievements). `docs/GENERATION.md` is
  the canonical core-game design ("Living Deck"). If code and docs disagree,
  docs win — or PR a doc change.
- `docs/roadmap.html` mirrors ROADMAP.md and is republished as a Claude
  artifact whenever the roadmap changes; keep all three in sync in the same PR.

## Architecture

Two layers, strictly separated:

- **`src/game.ts`** — the entire rule set as a pure reducer
  `(GameState, Action) => GameState`. No React, no I/O. All game constants
  live here: `MAX_WORD = 8`, `RECYCLES_PER_DEAL = 2`, `PARK_COLS = 3`.
  `makeDealState(dealIndex, stats)` builds a game from `assets/seeds.json`.
- **`App.tsx`** — all UI in one file (split is LF-103): components (PopIn,
  LetterCard, CardBack), layout math, three PanResponder-driven drag systems,
  and the reducer hookup. `src/dict.ts` (lexicon + anagram-key index for
  dead-deal detection), `src/theme.ts` (color tokens), `src/types.ts`.

### Vocabulary → code

| Game term | Meaning | In code |
|---|---|---|
| stock | face-down draw pile | `state.stock` |
| reserve | face-up drawn card (waste in classic solitaire) | `state.reserve`, `tapReserve` |
| tray | slots where the current word is built | `state.tray`, `TrayEntry` |
| park / bay | placing the reserve card on an empty column (first 3 only) | `parkReserve`, `PARK_COLS` |
| stock-origin | any card that came through stock (orange outline in UI) | `fromStock: true` |

### Rule invariants (tests must protect these)

- A word uses ≤1 card per column and ≤1 reserve card (`tray` source checks).
- Tapping a card whose source is already trayed *withdraws* it (toggle).
- Parked cards are playable but **never count toward the win**:
  win = `countNative(columns) === 0`, which filters `fromStock`.
- The trayed reserve entry is always the current reserve top — `draw` and
  `parkReserve` auto-return it first. Breaking this corrupts `play`.
- Deal validity: 7 columns of heights 1–7 (28 cards, bottom→top strings in
  seeds.json), 20-card stock, every deal has a witness solution (verified at
  generation; generator + witnesses currently live outside the repo — LF-105
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
