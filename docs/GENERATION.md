# The Living Deck — Deal Generation v2 (canonical)

> **This is the core of DECKABET.** Infinite deals, every one winnable, none
> predictable, none railroaded. Implemented by epic **E7** in `ROADMAP.md`.
> The static 290-deal pool in `assets/seeds.json` is interim scaffolding and
> retires when E7 lands.

## The six pillars

1. **Infinite replayability, low repeatability.** Deals are generated from a
   seed at play time — there is no pool to exhaust and no file of deals to
   memorize. Diversity constraints keep consecutive deals from feeling samey.

2. **Every game is solvable, and score ceilings sit in a narrow band.** A win
   is always reachable, and a *good* score is always reachable. Deals are
   generated into a target **par band** (estimated achievable score), so the
   spread between a lucky deal and an unlucky one stays medium-to-low. Daily
   totals then compare skill, not deal luck.

3. **Difficulty rises along the way.** Within a daily set, game 1 is generous
   and game 5 is tight. Difficulty is expressed through *steering generosity*
   (below) and rule tightening (recycles, park bays) — never by breaking the
   solvability guarantee.

4. **Five scored games a day, one daily total.** The scored mode is a daily
   set of 5 deals, same for every player, cumulative total on the leaderboard.
   Scarcity makes the total mean something. Free play is unlimited, seeded
   locally, and unscored.

5. **The undrawn stock does not exist yet.** Future cards are not pre-written
   anywhere — the next card is computed **at draw time** as a deterministic
   function of `(seed, move history)`. Steering guards the letter
   distribution (no more "seven E's"), keeps the solvability invariant, and
   defeats lookahead tooling: there is nothing stored to peek at.

6. **Guarantee, don't guide.** Solvability means *some* completion path
   exists — the game never hints toward it, weights UI toward it, or narrows
   play onto authored words. The possibility space stays open; players find
   their own words.

## How a deal is born

```
seed ──► tableau construction (28 cards, solution-first)
              │  guarantees: ≥1 completion path at deal time
              │  constraints: par band, letter-distribution guards,
              │               openness threshold (many playable words)
              ▼
        player plays freely
              │
        draw ──► steering picks the next stock letter, at draw time:
              │    1. INVARIANT: chosen letter keeps the game completable
              │       (fast solver check against current state)
              │    2. GUARDS: duplicate caps (max copies of a letter in
              │       sight), vowel/consonant window, rarity budget
              │       (Q/Z/X/J bounded per deal → scores stay in band)
              │    3. GENEROSITY: difficulty knob — early daily games pick
              │       *useful* letters from the legal set, late games pick
              │       the *least* helpful legal letter
              │    4. DETERMINISM: choice = f(seed, full move history);
              │       same moves ⇒ same draws, for fairness + replay
              ▼
        internal "escape plan" recomputed as the player deviates —
        maintained only to uphold the invariant, never surfaced
```

**Tableau construction** reuses the solution-first method proven by the v1
generator (words placed so a completion always exists, one column-cell per
word per column), ported to TypeScript with a seeded PRNG, plus the new
constraints: par-band check, distribution guards, and an **openness metric**
(count of distinct playable words at the opening state — reject deals below
threshold so players aren't funneled into the witness).

**Solvability checking at draw time** is the hard engineering problem
(LF-171): a bounded, memoized solver over ≤28 remaining cards. The escape-plan
approach makes it tractable — maintain one known completion; when the player's
move breaks it, search for a new one; steering only offers letters for which a
plan exists.

**Effective lexicon.** Every solvability and openness check runs against the
player's *effective lexicon* — the base word list minus the words retired
**today** at their ladder tier (roadmap **E8**). Retirement resets each play
day: the day's list is recomputed from the trailing week's most-used words
and ships with the daily set, so bans never accumulate across days. A
high-tier deal must be winnable *without* that day's banned words; free play
always uses the full lexicon. The solver, `isValidWord`, and the generator
all take the effective lexicon as a parameter, never a global.

## Daily set structure

| Game | Steering generosity | Recycles | Park bays |
|---|---|---|---|
| 1 | High (helpful legal letters) | 2 | 3 |
| 2 | Medium-high | 2 | 3 |
| 3 | Medium | 1 | 2 |
| 4 | Low | 1 | 2 |
| 5 | Minimal (least-helpful legal letters) | 0 | 1 |

Daily total = Σ of the five deal scores (scoring spec in `ROADMAP.md`).
A per-game difficulty multiplier may replace the preset multiplier for the
daily set — decide in LF-173.

The daily set is the **only publicly ranked mode**; free play is unlimited,
locally seeded, and feeds personal stats only (see "Modes & Leaderboards" in
`ROADMAP.md`).

## Anti-cheat phases

- **Phase 1 (launch, no backend):** scored seeds derived on device from
  `hash(date, gameIndex, salt)`. A determined cheater who reimplements the
  full steering algorithm could simulate draws — accepted at launch (equal to
  the risk every offline word game carries). Casual file-peeking is already
  impossible: there is no deal file.
- **Phase 2 (server):** seeds issued by a server per daily game; client
  submits the move log with the score; server replays moves through the same
  deterministic steering to validate both draws and score. This is the replay
  validator already noted in the leaderboard spec.

## Known issues this design retires

- **Letter floods** ("seven E's"): v1 fillers are sampled independently by
  frequency, so clumps happen. Steering guards cap duplicates in sight.
- **Fixed pool mining:** `assets/seeds.json` ships every deal and stock order
  in plaintext today.
- **Score variance between deals:** v1 has no par concept; deal luck shows up
  directly on the leaderboard.
