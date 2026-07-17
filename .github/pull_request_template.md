<!-- Title format: [<n>. <scope>] DB-xxx: summary — n = merge-order number (merge PRs ascending) -->

## Ticket

DB-___ — <!-- link the roadmap ticket; docs/chore PRs: say so -->

## What & why

<!-- 2-4 sentences. What changed, and what breaks/improves for the player or the codebase. -->

## Test evidence

- [ ] `npm test` green (paste count: __ tests)
- [ ] New/changed behavior covered — **important path AND edge cases** (empty piles, full tray, last card, max parked, recycle exhaustion, won-state no-ops, out-of-range actions — whichever apply)
- [ ] Bug fix? Started with a failing repro test
- [ ] `npx tsc --noEmit` and `npm run lint` clean

## UI change?

- [ ] Screenshots / screen recording attached
- [ ] n/a — no UI change

## Tracker

- [ ] `docs/roadmap.html` updated in this PR (status chip, PR log, stat counts) and artifact republished
