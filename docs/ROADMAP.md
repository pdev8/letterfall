# DECKABET — Roadmap to the App Store

> Word Klondike. Every deal winnable. This document is the **canonical roadmap**:
> epics, tickets, and the game-design specs (scoring, difficulty, leaderboards,
> achievements) that the tickets implement. The styled version lives at
> `docs/roadmap.html` (published as a Claude artifact); if they ever disagree,
> **this file wins**.

**Workflow:** one PR per ticket. Branch naming `db-<ticket>/<slug>` (e.g.
`db-110/scoring-module`). Every PR: typecheck + tests green, ticket ID in the
PR title. Tickets are sized S (≤half day), M (~1 day), L (multi-day).

**Progress tracking:** `docs/roadmap.html` (the published artifact) is the
live tracker — journey stepper, per-ticket status, shipped log. Update ticket
status there **in the same PR that completes the work**. Current position:
0/42 tickets shipped; next up DB-100; DB-177 is flagged ready-early.

**Where we are (v0, done):** core loop — 7-column tableau, stock → reserve
draw, 2 recycles, word tray (drag-to-swap, tap-to-return), park bays (first 3
columns), tap-to-withdraw toggles, 290 solver-verified deals, dark card-room
theme, win/dead-deal overlays, session stats.

---

## Milestones

| Milestone | Theme | Epics | Exit criteria |
|---|---|---|---|
| **M1 — Scored** | The game counts | E0, E1 | Every win produces a defensible score with a breakdown screen; CI runs on every PR |
| **M2 — Sticky** | The game remembers | E2, E10, E3 | Stats/streaks survive relaunch; the lexicon is a real dictionary; difficulty is player-controlled; game resumes mid-deal |
| **M3 — Social** | The game competes | E7, E4, E5 | Living deck generates the daily set; Game Center leaderboards live; badges unlock and display |
| **M4 — Shipped** | The game ships | E6 | App Store approval |
| **M5 — Alive** | The game evolves (post-launch) | E8, E9, E11, E7 phase 2 | Word ladder with community-driven retirement; Toolkit fun mechanics; server-issued seeds + replay validation |

---

## Epic E0 — Engineering Foundation

*The repo becomes a codebase: tests, CI, structure. Everything later depends on this.*

| ID | Ticket | Size | Acceptance criteria |
|---|---|---|---|
| DB-100 | Port reducer tests into repo with Jest | S | `npm test` runs the park/swap/withdraw/win suite + deal schema validation (28 cards, 20 stock, valid letters); scratchpad scripts retired |
| DB-101 | GitHub Actions CI | S | Typecheck + tests on every PR; red PRs can't merge |
| DB-102 | ESLint + Prettier | S | Config committed, codebase clean, CI enforces |
| DB-103 | Split App.tsx into components + screens scaffold | M | `src/components/` (Card, Tray, Tableau, Piles), `src/screens/`, App.tsx < 150 lines; no behavior change |
| DB-104 | PR template + CONTRIBUTING.md | S | Template asks for ticket ID, test evidence, screenshots for UI changes |
| DB-105 | Deal generator as repo script, witnesses stored | M | `scripts/generate-deals.py` checked in; `assets/seeds.json` deals carry witness solutions; Jest replays every witness through the reducer |

## Epic E1 — Scoring Engine

*Implements the scoring spec below. Pure functions, heavily tested, then wired into the UI.*

| ID | Ticket | Size | Acceptance criteria |
|---|---|---|---|
| DB-110 | `src/scoring.ts`: letter values + word score | S | Matches spec tables exactly; unit tests incl. QUIZ=28 example |
| DB-111 | Deal score: economy/stock/difficulty multipliers; reducer tracks counters | M | GameState carries reserveLettersPlayed, parksUsed, recyclesUsed; dealScore matches worked example; tests |
| DB-112 | Live word score preview in tray | S | Building a valid word shows its score on the PLAY button |
| DB-113 | Win screen score breakdown | M | Animated tally: per-word scores → named bonus chips (Word Economy +30%, Stock Discipline +21%, ENCORE ×2 — never raw multiplier math, spec §4c) → total; matches scoring module output |

## Epic E2 — Persistence & Stats

| ID | Ticket | Size | Acceptance criteria |
|---|---|---|---|
| DB-120 | Storage layer (AsyncStorage wrapper, schema version, migrations) | S | Typed get/set, versioned, unit-tested with mock storage |
| DB-121 | Lifetime stats + streaks persisted | M | Per mode (challenge/free): total time played, total games/wins, average time per game, letters constructed, words played, unique words, per-word usage counts (most-played top 10), best word, streaks, total points — all survive relaunch; deal timer plumbing included |
| DB-122 | Resume in-progress deal | M | Kill app mid-deal → relaunch restores exact state (incl. tray) |
| DB-123 | Game history (last 50 results, personal bests) | S | Best deal score, best word score, fastest clear recorded per difficulty |

## Epic E10 — Real Dictionary (M2, immediately after E2)

*The seed lexicon rejects legitimate English words (user-reported in play).
Replace it with a properly licensed real dictionary via a reproducible
pipeline, regenerate the deal pool, and keep a feedback loop so future
misses surface instead of silently frustrating players.*

| ID | Ticket | Size | Acceptance criteria |
|---|---|---|---|
| DB-200 | Dictionary sourcing + licensing decision | S | Open candidates evaluated (SCOWL, ENABLE2k, EOWL, wordfreq-filtered); choice + license terms documented here; target list size for 3–8-letter play decided |
| DB-201 | Lexicon build pipeline | M | `scripts/build-lexicon` deterministically generates the game lexicon from the chosen source: 3–8 letters, offensive-word policy applied, per-word frequency metadata retained (feeds E7 openness/steering and E8 retirement); committed with provenance header |
| DB-202 | Regenerate deals + witnesses on the new lexicon | S | `generate-deals` runs against the new lexicon; witness-replay + schema tests green; sim spot-check (win rates, openness) reported in the PR |
| DB-203 | Missed-word feedback loop | S | Valid-looking words the player attempts that the lexicon rejects are logged locally; top misses inspectable in dev; export documented (Supabase sync arrives with DB-186) |

### DB-200 decision record (2026-07-18)

**Validity lexicon: ENABLE2k (`enable1.txt`) — public domain.** 172k words,
the de facto standard for digital word games (it is Words With Friends'
official dictionary), placed in the public domain by Alan Beale — zero
licensing burden for App Store distribution. Filtered to 3–8 letters minus a
curated offensive-word exclusion list, this replaces today's 18,884-word seed
lexicon (~7× more words), which is the fix for legitimate words being
rejected in play.

**Commonality metadata: joined from a public word-frequency list** (Norvig
count_1w / wordfreq-class source, pinned by URL + checksum in the build
script). Each lexicon word gets a frequency tier; E7's steering/openness and
E8's retirement pool both consume it.

**Rejected:** NASPA/Collins tournament lists (licensed, unusable);
EOWL/UKACD (requires verbatim copyright text in the product; smaller than
ENABLE); SCOWL as the validity base (permissive but notice-bearing, and its
band structure is better used as optional metadata than as the source of
truth).

**Risks accepted:** ENABLE is US-flavored (some UK spellings absent) and
static (no new coinages since 2000) — DB-203's missed-word loop plus a small
committed `additions.txt`/`removals.txt` overlay in the pipeline handles
both over time.

## Epic E3 — Settings & Difficulty

| ID | Ticket | Size | Acceptance criteria |
|---|---|---|---|
| DB-130 | Settings screen + persisted settings store | S | Gear icon in top bar opens settings; values persist |
| DB-131 | Difficulty configurations wired to game config | M | Settings replaces the preset selector with knob rows (recycles 0–2, park bays 1–3); knobs flow into per-deal game config (constants become config; reducer reads the deal's own limits); configMult applied per scoring spec; Difficulty presets removed from settings/scoring/history |
| DB-132 | Sound, haptics, reduce-motion toggles | M | expo-haptics on card taps/plays/wins; toggles respected everywhere incl. animations |
| DB-133 | Rulebook screen | M | How to play (goal, tap/drag verbs, reserve, parking, recycles) in plain language with visuals; scoring as named bonuses with one worked example — **zero equations** (spec §4c); "fine print" link to exact tables; linked from settings + first launch |

## Epic E4 — Leaderboards

| ID | Ticket | Size | Acceptance criteria |
|---|---|---|---|
| DB-140 | Local leaderboards | S | Top 20 deal scores per difficulty, stored locally, viewable in-app |
| DB-141 | Daily set leaderboard integration | M | Depends on E7 (DB-174): cumulative daily total submits to the daily board; practice replays unscored |
| DB-142 | Game Center: config plugin + authentication | M | expo config plugin sets GC entitlement; silent auth on launch; graceful offline fallback |
| DB-143 | Game Center: submit + fetch leaderboards | M | Challenge-mode boards only: Daily total (recurring) + All-time challenge points; submit on daily-set completion |
| DB-144 | Leaderboard + stats screen | M | Tabs: Daily / All-time / My stats (personal dashboard incl. free play); player rank; local fallback when GC unavailable |

## Epic E5 — Achievements

| ID | Ticket | Size | Acceptance criteria |
|---|---|---|---|
| DB-150 | Achievement engine | M | Declarative rules evaluated on game events; persisted unlock state; no game-logic coupling |
| DB-151 | Badge definitions (spec below) | S | All ~18 badges defined with id, name, tiers, criteria, artwork slot |
| DB-152 | Badge gallery + unlock toast | M | Grid with locked/unlocked/tier states; toast + haptic on unlock |
| DB-153 | Game Center achievements sync | S | Unlocks mirror to GC; idempotent resubmission |

## Epic E7 — The Living Deck (Generation v2) ★ core

*THE core of the game — full spec in `docs/GENERATION.md`. Infinite seeded
deals, solvability as a maintained invariant, draw-time stock steering,
5-game daily sets with rising difficulty, anti-lookahead by construction.
Retires the static deal pool. Gates the daily-set half of E4.*

| ID | Ticket | Size | Acceptance criteria |
|---|---|---|---|
| DB-170 | On-device deal generator (TS port, seeded PRNG) | M | Solution-first tableau construction from a seed; same seed ⇒ same deal; distribution guards (duplicate caps, vowel/consonant window, rarity budget); board-shape parameter with position-shuffled heights; altitude guards (rares surface early, vowel-biased column bottoms); openness threshold; **word-length quality gates (5 always reachable, a 7 discoverable, 8s ≈10% of deals)**; unit-tested |
| DB-171 | Solvability measurement solver | L | Bounded memoized solver answers "is this state completable?" — used for par estimation, openness metrics, and the post-game "a win was possible until move N" insight; **never for draw-time rescue**; property-tested against random play |
| DB-172 | Draw-time stock steering | L | Next card = f(seed, move history); fairness guards enforced (duplicate caps, vowel lifeline) with a **warmth curve** (early draws kinder, neutral by mid-game — no win-path rescue, dead is dead); generosity knob scales the curve per daily game; deterministic replay verified in tests |
| DB-173 | Difficulty ramp parameters | M | `src/dailyRamp.ts`: per-game (1–5) board shape + steering generosity + recycles + max-parked per GENERATION.md; decided — no separate daily multiplier (configMult derives it from the knobs); tested |
| DB-174 | Daily set mode | M | **Engine done** (`src/daily.ts`): 5 shared-seed games/day (seed service + ramp + generator), cumulative daily total, day-reset, countdown data, persisted. **Remaining:** the Daily *screen* (mode picker, game slots, countdown) wiring the engine into the app — a thin follow-up needing on-device verification. |
| DB-175 | Par estimation + score bands | M | Generator estimates achievable score; deals outside the par band rejected; word-length gate rates tuned here (7-discoverable on every deal, 8s ≈10%); band documented and tested |
| DB-176 | Seed service: phase 1 + phase 2 stub | M | Launch: hash(date, gameIndex, salt) on device; documented server-issued-seed + move-log replay validation design for phase 2 |
| DB-186 | Backend foundation on Supabase | L | Supabase project + schema: daily seeds, score submissions, move logs, word-usage aggregates; anonymous device auth with optional Game Center identity link; RLS policies; DB-176 phase 2, DB-184, and DB-185 all build on this |
| DB-177 | Dynamic bays (rule change — ships before the rest of E7) | M | Park onto ANY empty column; parked cards capped at `config.parkBays` (unifies with the DB-131 knob; `parkedCount` enforces); dead-deal rescue + park-target UI updated; reducer tests cover the cap; full sim rerun lands with DB-172 steering |
| DB-178 | Opening reroll — exchange cards with the stock (rule change) | S | Before play a panel fans the deal's face-up column tops; tap to raise/lower, then **Swap** (one shot — closes the panel and shows the new board) or **Skip** (play as dealt). Swap is a deterministic **rotation**: each raised top goes to the BOTTOM of the stock and that many cards evict off the FRONT of the stock into the vacated spots, so the 48-card multiset is conserved. The rolled-in cards arrive **orange** (stock-origin — playable but, like parked cards, **not required to clear**), so each swap lowers the clear-count. No cap (bounded only by stock size); **free** (no scoring effect). Deliberately a **gamble**: the stock is face-down and there's no solver check, so a reroll may strand the board — the deal *as dealt* keeps the every-deal-winnable promise; only the voluntary reroll is exempt. Only the 7 face-up tops are shown (buried cards stay hidden). `reroll` action (pre-play only, native tops only); `rerollsUsed` counts cards swapped; reducer tests (rotation, orange/clear-count, no-cap, stock-bound, guards) + `RerollPanel` UI; pre-DB-178 resume snapshots coerce the missing counter to 0 |

## Epic E8 — Word Ladder & Living Meta (post-launch, M5)

*Ranked progression where the community's crutch words retire out of the
game. Climb the ladder via daily-challenge results; at higher tiers the
most-played words are banned. Retirement is driven by real challenge-mode
usage across all players and **resets each play day** — every day's ban
list is recomputed from the trailing week's most-used words and applies for
that day only, so the meta breathes daily instead of accumulating forever.*

| ID | Ticket | Size | Acceptance criteria |
|---|---|---|---|
| DB-180 | Ladder: tiers, promotion, persisted rank | M | Tiers (e.g. Bronze→Diamond) advanced by daily-challenge results; rank shown in profile; demotion rules decided and documented |
| DB-181 | Word retirement engine (phase 1: static lists) | M | Per-tier ban lists from static frequency data; retired words rejected with "retired at your rank" feedback; free play unaffected |
| DB-182 | Effective-lexicon integration with the living deck | M | Solvability checks and openness metric run against base lexicon minus the player's tier bans — deals stay winnable under bans; tested per tier |
| DB-183 | Retired-words gallery + tier UI | M | Ladder screen: current tier, next promotion, list of words retired at each tier |
| DB-184 | Phase 2: usage telemetry + daily-reset retirement | L | Challenge-mode word usage aggregated server-side over a trailing 7-day window; each play day publishes that day's retired list with the daily set (top-K, sliced per tier); yesterday's bans lift automatically — no permanent accumulation; K tuned and documented |
| DB-185 | Weekly meta surfaces | M | Community *most-used words of the week* displayed in-app (also the source pool for daily retirement); *best word of the week* — weekly recurring GC board + personal stat; both reset weekly |

## Epic E9 — The Toolkit (fun mechanics, post-launch M5)

*A slide-up panel of limited-use tools that spice up the dynamic — daily
charges, clearly gated so the competitive game stays pure. Ground rules:
tools are **never available in the daily challenge** (leaderboard integrity);
in free play they're a Settings toggle, on by default in Casual only.
Assisted wins count toward stats and most achievements but are marked
assisted and stay off the local high-score boards. Any tool that adds or
swaps letters draws through the Living Deck steering, so the solvability
invariant survives tool use.*

| ID | Ticket | Size | Acceptance criteria |
|---|---|---|---|
| DB-190 | Toolkit design finalization | S | Tool list + charge economy locked (proposal: 3 charges/day shared across tools); mode gating + assisted-win scoring policy decided and documented here |
| DB-191 | Slide-up Toolkit panel | M | Drawer slides up from the bottom edge (PanResponder, consistent with existing drag conventions); charge pips; disabled state in challenge mode with explanatory copy |
| DB-192 | Tool: Grab Bag | M | Swap any one visible card (column top or reserve) for a card from the grab bag; replacement letter chosen through steering so the deal stays winnable; animates the exchange |
| DB-193 | Tool: Scrap | M | Remove one visible letter card outright (native card removal counts toward clearing); solvability re-verified; satisfying destruction animation |
| DB-194 | Charges + gating persistence | M | Daily charge refresh at play-day rollover; per-mode gating (never in challenge, toggle in free play, default-on in Casual); assisted flag threads into stats/history |
| DB-195 | Wildcards — earned, banked, played as any letter | M | Earned at career-point milestones (thresholds configurable, e.g. every 500 banked points); balance persists via the storage layer and **accumulates with no daily reset** (unlike tool charges); played from the tray as a distinct ♠ blank that completes any word — counts toward word length, letter value 0 (Scrabble-blank rule), max one per word; validation supports the blank (any completing letter); shown distinctly in the win tally; follows Toolkit gating (never in the daily challenge; assisted marking applies) |

## Epic E11 — The Buy Round (post-launch, M5)

*Wheel-of-Fortune meets Counter-Strike: between games, points earned in the
LAST game buy letters for the NEXT one. Buy power never rolls over — spend it
or lose it — and below the minimum threshold there is no buy at all (the eco
round). Letters are tiered: bigger performances unlock better shelves. In the
daily set this is the connective tissue between games 1–5: everyone starts
game 1 clean, and because pricing is deterministic and identical for all
players, it stays leaderboard-fair — good plays literally fund the run.*

| ID | Ticket | Size | Acceptance criteria |
|---|---|---|---|
| DB-210 | Buy Round design finalization | S | Pricing/tier table locked (proposal: <150 pts = eco, no buy; 150+ = common shelf, 1 pick; 300+ = mid shelf incl. premium consonants, 2 picks; 500+ = top shelf incl. J/Q/X/Z + choice vowels, 3 picks); pocket cap; scoring interaction (bought letters pre-paid — no stock-economy tax); game 1 never has a buy; free-play variant decided |
| DB-211 | Buy screen | M | Between-games shop with tier shelves; locked shelves visible (aspiration); shows buy power and its expiry; skippable; fits the card-room aesthetic |
| DB-212 | Pocket letters gameplay | M | Purchased letters ride into the next deal as a pocket row — playable like parked cards, never count toward clearing, distinct visual; solvability unaffected (strictly additive); tests per the standard |
| DB-213 | Economy wiring | M | dealScore → buy-power conversion at set thresholds; **no rollover** (unspent power expires when the next game starts); daily-set integration between games; telemetry hooks for tuning |

## Epic E6 — App Store Readiness

| ID | Ticket | Size | Acceptance criteria |
|---|---|---|---|
| DB-160 | Branding: icon, splash, wordmark | M | Final art replaces Expo defaults; dark splash matches theme |
| DB-161 | Onboarding tutorial | M | First-launch guided deal teaching tap/drag/park; skippable; replayable from settings |
| DB-162 | Accessibility pass | M | VoiceOver labels on all interactive elements; dynamic type on text; honors reduce-motion |
| DB-163 | Sound design | M | Card slide/flip/play/win sounds; mute honors silent switch |
| DB-164 | Crash reporting + error boundary | S | Sentry wired via EAS; error boundary recovers to a fresh deal |
| DB-165 | EAS build + TestFlight pipeline | M | `eas build` profiles; internal TestFlight distribution documented |
| DB-166 | Privacy policy + App Store metadata | M | Privacy manifest (GC only, no tracking), screenshots, description, keywords |
| DB-167 | Submit + review fixes | M | App approved on the App Store |

---

# Design Specs

## Scoring (canonical)

Scoring rewards **hard letters, long words, word economy, and stock discipline**.
All scoring happens in `src/scoring.ts` (DB-110/111) as pure functions of the
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
The opening reroll (DB-178) has **no scoring effect** — it's a free pre-play
setup choice, not a stock lean.

**Difficulty** (see Configurations spec): no named presets — the multiplier
derives from how the player hardens the game:

```
configMult = 1.0 + 0.10 × (2 − recycles) + 0.10 × (3 − parkBays)
```

Defaults (2 recycles, 3 bays) = ×1.0; maximum hardness (0 recycles, 1 bay)
= ×1.4. The daily set ignores player knobs and uses its own per-game ramp.

### 4. Worked example

Standard difficulty, cleared in 7 words, base Σ = 240, used 3 reserve letters,
1 park, 0 recycles:

```
stockEconomyMult = 1.5 − 0.24 − 0.05 − 0 = 1.21
dealScore = round(240 × 1.30 × 1.21 × 1.25) = 472
```

### 4b. Encore — the closer scores double

The **final word of a winning deal earns 2× its wordScore** (applied inside
`baseScore`). Simulation showed word lengths structurally fade toward
3-letter scraps as columns empty; Encore (with dynamic bays, E7) turns the
ending into a planned climax — hold breadth, stage a long closer — instead
of a grind. Example: closing with PRIZED (3+1+1+10+1+2 = 18 × 2.0 = 36) banks
72.

### 4c. Player-facing presentation — no equations, ever

The math above is canonical for computation and leaderboards, but players
never see a formula. In-game, scoring is presented as **named bonuses**:

| Player sees | Internally |
|---|---|
| "Longer words score way more" | lengthMult |
| "Rare letters are worth more (like Scrabble)" | letter values |
| "Fewer words — bonus!" e.g. `Word Economy +30%` | wordEconomyMult |
| "Used little stock — bonus!" e.g. `Stock Discipline +21%`, full 1.5 shown as `PURIST ★` | stockEconomyMult |
| "Your last word counts double" `ENCORE ×2` | Encore |
| "Harder mode, bigger scores" `Expert ×1.6` | difficultyMult |

The win-screen tally (DB-113) shows these as chips that add up in front of
the player — teaching by showing. The rulebook (DB-133) explains them in
plain language with a worked visual example. Exact tables live behind an
optional "fine print" link for min-maxers. If playtesting still shows
confusion, simplification happens at the presentation layer first; the
underlying math changes only as a last resort (it feeds the leaderboards).

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
  and local bests (DB-140: top-20 per difficulty, on device).
- **Personal stats** (DB-121, shown in DB-144's My Stats tab): total time
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
(DB-150); definitions in one file (DB-151); mirrored to Game Center (DB-153).

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
| Tightrope | Win a max-hardness deal (0 recycles, 1 bay) |
| Daybreak | Play your first daily challenge |
| Dedicated | 7 daily challenges in a row |
| Wordsmith 🥉🥈🥇 | Play 100 / 500 / 2000 words lifetime |
| Millionaire's Club 🥉🥈🥇 | 10k / 100k / 1M total points |

## Open questions (decide before the relevant epic)

1. Timer: does clear-speed affect score or stay achievement-only? (default: stay out of score — thoughtful play > speed)
2. Android: Game Center is iOS-only; Play Games Services or backend leaderboard when Android ships.
3. Daily set score multiplier: per-game ramp multiplier vs. difficulty presets (decide in DB-173).
4. Free-play difficulty: player-picked preset (E3) vs. also offering the ramp — default: preset.
