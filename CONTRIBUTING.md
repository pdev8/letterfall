# Contributing to DECKABET ♠

The full operating guide lives in [AGENTS.md](AGENTS.md) — architecture, game
vocabulary, rule invariants, UI conventions. This is the short version.

## The loop

1. Pick the next ticket from the tracker (`docs/roadmap.html`, published as an
   artifact) — tickets and acceptance criteria live in
   [docs/ROADMAP.md](docs/ROADMAP.md).
2. Branch: `lf-<ticket>/<slug>` (docs-only: `docs/<slug>`).
3. Do the work **with tests** — important path and edge cases. Bug fixes start
   with a failing repro test.
4. Update the tracker in the same PR: status chip, PR log row, stat counts.
5. Open the PR titled `[<n>. <scope>] LF-xxx: summary`, where `n` is the next
   global merge-order number. Stacked PRs say `(after #N)` and set that PR's
   branch as base.
6. **Merge PRs in ascending `[n]` order.** Branch auto-delete is on, so
   GitHub retargets stacked PRs automatically after each merge.

## Hard rules

- Nothing merges to `main` without a PR. No direct pushes.
- No behavior change without a test that would catch its regression.
- `npx tsc --noEmit`, `npm run lint`, and `npm test` green before review.
- **Every deal is winnable** — never ship a change that can break that
  promise. The canonical designs (docs/ROADMAP.md, docs/GENERATION.md) win
  over code; PR a doc change if they must diverge.
