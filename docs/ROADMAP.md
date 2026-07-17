# DECKABET — Roadmap to the App Store

> Word Klondike. Every deal winnable. This document is the **canonical roadmap**:
> epics, tickets, and the game-design specs (scoring, difficulty, leaderboards,
> achievements) that the tickets implement. The styled version lives at
> `docs/roadmap.html` (published as a Claude artifact); if they ever disagree,
> **this file wins**.

**Workflow:** one PR per ticket. Branch naming `lf-<ticket>/<slug>` (e.g.
`lf-110/scoring-module`). Every PR: typecheck + tests green, ticket ID in the
PR title. Tickets are sized S (≤half day), M (~1 day), L (multi-day).

**Where we are (v0, done):** core loop — 7-column tableau, stock → reserve
draw, 2 recycles, word tray (drag-to-swap, tap-to-return), park bays (first 3
columns), tap-to-withdraw toggles, 290 solver-verified deals, dark card-room
theme, win/dead-deal overlays, session stats.

---

## Milestones

| Milestone | Theme | Epics | Exit criteria |
|---|---|---|---|
| **M1 — Scored** | The game counts | E0, E1 | Every win produces a defensible score with a breakdown screen; CI runs on every PR |
| **M2 — Sticky** | The game remembers | E2, E3 | Stats/streaks survive relaunch; difficulty is player-controlled; game resumes mid-deal |
| **M3 — Social** | The game competes | E7, E4, E5 | Living deck generates the daily set; Game Center leaderboards live; badges unlock and display |
| **M4 — Shipped** | The game ships | E6 | App Store approval |
| **M5 — Alive** | The game evolves (post-launch) | E8, E7 phase 2 | Word ladder with community-driven retirement; server-issued seeds + replay validation |

---

## Epic E0 — Engineering Foundation

*The repo becomes a codebase: tests, CI, structure. Everything later depends on this.*

| ID | Ticket | Size | Acceptance criteria |
|---|---|---|---|
| LF-100 | Port reducer tests into repo with Jest | S | `npm test` runs the park/swap/withdraw/win suite + deal schema validation (28 cards, 20 stock, valid letters); scratchpad scripts retired |
| LF-101 | GitHub Actions CI | S | Typecheck + tests on every PR; red PRs can't merge |
| LF-102 | ESLint + Prettier | S | Config committed, codebase clean, CI enforces |
| LF-103 | Split App.tsx into components + screens scaffold | M | `src/components/` (Card, Tray, Tableau, Piles), `src/screens/`, App.tsx < 150 lines; no behavior change |
| LF-104 | PR template + CONTRIBUTING.md | S | Template asks for ticket ID, test evidence, screenshots for UI changes |
| LF-105 | Deal generator as repo script, witnesses stored | M | `scripts/generate-deals.py` checked in; `assets/seeds.json` deals carry witness solutions; Jest replays every witness through the reducer |

## Epic E1 — Scoring Engine

*Implements the scoring spec below. Pure functions, heavily tested, then wired into the UI.*

| ID | Ticket | Size | Acceptance criteria |
|---|---|---|---|
| LF-110 | `src/scoring.ts`: letter values + word score | S | Matches spec tables exactly; unit tests incl. QUIZ=28 example |
| LF-111 | Deal score: economy/stock/difficulty multipliers; reducer tracks counters | M | GameState carries reserveLettersPlayed, parksUsed, recyclesUsed; dealScore matches worked example; tests |
| LF-112 | Live word score preview in tray | S | Building a valid word shows its score on the PLAY button |
| LF-113 | Win screen score breakdown | M | Animated tally: per-word scores → multipliers → total; matches scoring module output |

## Epic E2 — Persistence & Stats

| ID | Ticket | Size | Acceptance criteria |
|---|---|---|---|
| LF-120 | Storage layer (AsyncStorage wrapper, schema version, migrations) | S | Typed get/set, versioned, unit-tested with mock storage |
| LF-121 | Lifetime stats + streaks persisted | M | Per mode (challenge/free): total time played, total games/wins, average time per game, letters constructed, words played, unique words, per-word usage counts (most-played top 10), best word, streaks, total points — all survive relaunch; deal timer plumbing included |
| LF-122 | Resume in-progress deal | M | Kill app mid-deal → relaunch restores exact state (incl. tray) |
| LF-123 | Game history (last 50 results, personal bests) | S | Best deal score, best word score, fastest clear recorded per difficulty |

## Epic E3 — Settings & Difficulty

| ID | Ticket | Size | Acceptance criteria |
|---|---|---|---|
| LF-130 | Settings screen + persisted settings store | S | Gear icon in top bar opens settings; values persist |
| LF-131 | Difficulty presets wired to game config | M | Casual/Standard/Expert change recycles + park bays per spec; new deals only (never mid-deal); score multiplier applied |
| LF-132 | Sound, haptics, reduce-motion toggles | M | expo-haptics on card taps/plays/wins; toggles respected everywhere incl. animations |
| LF-133 | How-to-play screen | M | Rules, park bays, scoring summary; linked from settings + first launch |

## Epic E4 — Leaderboards

| ID | Ticket | Size | Acceptance criteria |
|---|---|---|---|
| LF-140 | Local leaderboards | S | Top 20 deal scores per difficulty, stored locally, viewable in-app |
| LF-141 | Daily set leaderboard integration | M | Depends on E7 (LF-174): cumulative daily total submits to the daily board; practice replays unscored |
| LF-142 | Game Center: config plugin + authentication | M | expo config plugin sets GC entitlement; silent auth on launch; graceful offline fallback |
| LF-143 | Game Center: submit + fetch leaderboards | M | Challenge-mode boards only: Daily total (recurring) + All-time challenge points; submit on daily-set completion |
| LF-144 | Leaderboard + stats screen | M | Tabs: Daily / All-time / My stats (personal dashboard incl. free play); player rank; local fallback when GC unavailable |

## Epic E5 — Achievements

| ID | Ticket | Size | Acceptance criteria |
|---|---|---|---|
| LF-150 | Achievement engine | M | Declarative rules evaluated on game events; persisted unlock state; no game-logic coupling |
| LF-151 | Badge definitions (spec below) | S | All ~18 badges defined with id, name, tiers, criteria, artwork slot |
| LF-152 | Badge gallery + unlock toast | M | Grid with locked/unlocked/tier states; toast + haptic on unlock |
| LF-153 | Game Center achievements sync | S | Unlocks mirror to GC; idempotent resubmission |

## Epic E7 — The Living Deck (Generation v2) ★ core

*THE core of the game — full spec in `docs/GENERATION.md`. Infinite seeded
deals, solvability as a maintained invariant, draw-time stock steering,
5-game daily sets with rising difficulty, anti-lookahead by construction.
Retires the static deal pool. Gates the daily-set half of E4.*

| ID | Ticket | Size | Acceptance criteria |
|---|---|---|---|
| LF-170 | On-device deal generator (TS port, seeded PRNG) | M | Solution-first tableau construction from a seed; same seed ⇒ same deal; distribution guards (duplicate caps, vowel/consonant window, rarity budget); openness threshold; unit-tested |
| LF-171 | Solvability checker | L | Bounded memoized solver answers "is this state completable?" fast enough for draw time; escape-plan maintenance; property-tested against random play |
| LF-172 | Draw-time stock steering | L | Next card = f(seed, move history); invariant never broken; guards enforced; generosity knob (helpful ↔ least-helpful legal letter); deterministic replay verified in tests |
| LF-173 | Difficulty ramp parameters | M | Per-game (1–5) steering generosity + recycles + bays per GENERATION.md table; decide daily-set score multiplier |
| LF-174 | Daily set mode | M | 5 scored games/day, same for all players, cumulative daily total, reset countdown UX; free play unlimited/unscored |
| LF-175 | Par estimation + score bands | M | Generator estimates achievable score; deals outside the par band rejected; band documented and tested |
| LF-176 | Seed service: phase 1 + phase 2 stub | M | Launch: hash(date, gameIndex, salt) on device; documented server-issued-seed + move-log replay validation design for phase 2 |

## Epic E8 — Word Ladder & Living Meta (post-launch, M5)

*Ranked progression where the community's crutch words retire out of the
game. Climb the ladder via daily-challenge results; at higher tiers the
most-played words are banned. Retirement is driven by real challenge-mode
usage across all players and **resets each play day** — every day's ban
list is recomputed from the trailing week's most-used words and applies for
that day only, so the meta breathes daily instead of accumulating forever.*

| ID | Ticket | Size | Acceptance criteria |
|---|---|---|---|
| LF-180 | Ladder: tiers, promotion, persisted rank | M | Tiers (e.g. Bronze→Diamond) advanced by daily-challenge results; rank shown in profile; demotion rules decided and documented |
| LF-181 | Word retirement engine (phase 1: static lists) | M | Per-tier ban lists from static frequency data; retired words rejected with "retired at your rank" feedback; free play unaffected |
| LF-182 | Effective-lexicon integration with the living deck | M | Solvability checks and openness metric run against base lexicon minus the player's tier bans — deals stay winnable under bans; tested per tier |
| LF-183 | Retired-words gallery + tier UI | M | Ladder screen: current tier, next promotion, list of words retired at each tier |
| LF-184 | Phase 2: usage telemetry + daily-reset retirement | L | Challenge-mode word usage aggregated server-side over a trailing 7-day window; each play day publishes that day's retired list with the daily set (top-K, sliced per tier); yesterday's bans lift automatically — no permanent accumulation; K tuned and documented |
| LF-185 | Weekly meta surfaces | M | Community *most-used words of the week* displayed in-app (also the source pool for daily retirement); *best word of the week* — weekly recurring GC board + personal stat; both reset weekly |

## Epic E6 — App Store Readiness

| ID | Ticket | Size | Acceptance criteria |
|---|---|---|---|
| LF-160 | Branding: icon, splash, wordmark | M | Final art replaces Expo defaults; dark splash matches theme |
| LF-161 | Onboarding tutorial | M | First-launch guided deal teaching tap/drag/park; skippable; replayable from settings |
| LF-162 | Accessibility pass | M | VoiceOver labels on all interactive elements; dynamic type on text; honors reduce-motion |
| LF-163 | Sound design | M | Card slide/flip/play/win sounds; mute honors silent switch |
| LF-164 | Crash reporting + error boundary | S | Sentry wired via EAS; error boundary recovers to a fresh deal |
| LF-165 | EAS build + TestFlight pipeline | M | `eas build` profiles; internal TestFlight distribution documented |
| LF-166 | Privacy policy + App Store metadata | M | Privacy manifest (GC only, no tracking), screenshots, description, keywords |
| LF-167 | Submit + review fixes | M | App approved on the App Store |

---

# Design Specs

## Scoring (canonical)

Scoring rewards **hard letters, long words, word economy, and stock discipline**.
All scoring happens in `src/scoring.ts` (LF-110/111) as pure functions of the
finished deal's stats.

### 1. Letter values (Scrabble-derived)

| Value | Letters |
|---|---|
| 1 | a e i o u l n s t r |
| 2 | d g |
| 3 | b c m p |
| 4 | f h v w y |
| 5 | k |
| 8 | j x |
| 10 | q z |

### 2. Word score

```
wordScore = round( Σ letterValue × lengthMult )
```

| Length | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|
| lengthMult | 1.00 | 1.25 | 1.60 | 2.00 | 2.50 | 3.20 |

The multiplier is intentionally super-linear: one 6-letter word should beat
two 3-letter words made of the same letters. Example: **QUIZ** = (10+1+1+10) ×
1.25 = **28**. **CAT** = (3+1+1) × 1.0 = **5**.

### 3. Deal score (awarded only on a win)

```
dealScore = round( baseScore × wordEconomyMult × stockEconomyMult × difficultyMult )
baseScore = Σ wordScore over the winning deal's played words
```

**Word economy** — fewer, bigger words beat many small ones (28 native cards
must always be cleared, so fewer words ⇒ longer words):

| Words used | ≤4 | 5 | 6 | 7 | 8 | 9 | 10 | 11+ |
|---|---|---|---|---|---|---|---|---|
| wordEconomyMult | 1.75 | 1.60 | 1.45 | 1.30 | 1.20 | 1.10 | 1.05 | 1.00 |

**Stock economy** — start at 1.5 and pay for every lean on the stock; a
zero-stock, zero-park, zero-recycle clear keeps the full 1.5 (**Purist bonus**):

```
stockEconomyMult = clamp( 1.5
                          − 0.08 × reserveLettersPlayed   // stock cards used in words
                          − 0.05 × parksUsed              // bays filled with stock cards
                          − 0.08 × recyclesUsed,
                          1.0, 1.5 )
```

Draws themselves are free — browsing the stock is fine; *consuming* it costs.

**Difficulty** (see Settings spec): Casual ×1.00, Standard ×1.25, Expert ×1.60.

### 4. Worked example

Standard difficulty, cleared in 7 words, base Σ = 240, used 3 reserve letters,
1 park, 0 recycles:

```
stockEconomyMult = 1.5 − 0.24 − 0.05 − 0 = 1.21
dealScore = round(240 × 1.30 × 1.21 × 1.25) = 472
```

### 5. Edge rules

- Dead/abandoned deals bank **no points** (words still count toward achievements).
- Total points (leaderboard currency) = Σ of banked deal scores.
- **Daily total** = Σ of the daily set's five deal scores (see `docs/GENERATION.md`); recorded separately from the main total.
- All rounding is `Math.round`, applied once per formula line shown above.

## Difficulty presets (Settings)

| Preset | Recycles | Park bays | Score multiplier |
|---|---|---|---|
| Casual | 2 | 3 | ×1.00 |
| Standard | 1 | 2 | ×1.25 |
| Expert | 0 | 1 | ×1.60 |

Every shipped deal is solver-verified winnable **without any recycles or
parks** (witness solutions draw each needed stock letter exactly once, in
order), so all presets keep the "every deal winnable" promise. Changing
difficulty takes effect on the next deal.

## Modes & Leaderboards

- **Daily Challenge is the public game.** The 5-game daily set
  (`docs/GENERATION.md`) is the only mode that feeds global leaderboards.
  Game Center boards: *Daily total* (daily recurring), *Best word of the
  week* (weekly recurring, highest single word score), and *All-time
  challenge points*. Same seed chain for everyone, so ranks compare
  like-for-like.
- **Weekly meta.** Challenge mode surfaces the community's *most-used words
  of the week* (top-K, also the source pool for the ladder's daily-reset
  retirement) and *best word of the week*. Weekly aggregates roll over
  weekly; retired-word lists reset every play day (E8).
- **Free play is private.** Unlimited deals, player-picked difficulty
  preset, never on a public board. It feeds the personal stats dashboard
  and local bests (LF-140: top-20 per difficulty, on device).
- **Personal stats** (LF-121, shown in LF-144's My Stats tab): total time
  played, total games and wins, average time per game, letters constructed,
  words played, unique words, most-played words (top 10), best word, best
  deal, streaks — tracked per mode.
- **Ladder** (E8, post-launch): daily-challenge results advance a ranked
  tier; higher tiers retire the community's most-played words (see epic).
- Known limitation: scores are client-computed; Game Center offers no server
  validation. Acceptable at launch; server-issued seeds + move-log replay
  validation is the M5 hardening path.

## Achievements

Tiers: 🥉 bronze / 🥈 silver / 🥇 gold where noted. Engine is declarative
(LF-150); definitions in one file (LF-151); mirrored to Game Center (LF-153).

| Badge | Criteria |
|---|---|
| First Light | Win your first deal |
| Regular / Devotee / Century | Win 10 / 50 / 100 deals |
| Warm / Hot / Eternal | Win streak of 3 / 7 / 30 |
| Purist | Win with stockEconomyMult at full 1.5 (no stock letters, parks, or recycles) |
| Minimalist | Win in ≤5 words |
| Full Rack | Play an 8-letter word |
| High Roller | Single word worth ≥60 points |
| Big Board | Deal score ≥750 |
| Rare Bird 🥉🥈🥇 | Play 1 / 10 / 50 words containing J, Q, X, or Z |
| Valet | Win a deal that used all 3 park bays |
| Tightrope | Win on Expert |
| Daybreak | Play your first daily challenge |
| Dedicated | 7 daily challenges in a row |
| Wordsmith 🥉🥈🥇 | Play 100 / 500 / 2000 words lifetime |
| Millionaire's Club 🥉🥈🥇 | 10k / 100k / 1M total points |

## Open questions (decide before the relevant epic)

1. Timer: does clear-speed affect score or stay achievement-only? (default: stay out of score — thoughtful play > speed)
2. Android: Game Center is iOS-only; Play Games Services or backend leaderboard when Android ships.
3. Daily set score multiplier: per-game ramp multiplier vs. difficulty presets (decide in LF-173).
4. Free-play difficulty: player-picked preset (E3) vs. also offering the ramp — default: preset.
