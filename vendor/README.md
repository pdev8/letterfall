# Vendored word lists

## enable1.txt — ENABLE2k

- **Source project:** ENABLE2k (Enhanced North American Benchmark LExicon),
  compiled by Alan Beale and M. Cooper. The de facto standard lexicon for
  digital word games (e.g. Words With Friends' official dictionary).
- **License:** Public domain. The ENABLE2k release states the list is
  "in the public domain" and free for any use — no attribution required.
- **Retrieved from:** https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt
- **Retrieved on:** 2026-07-17
- **sha256:** `3f16130220645692ed49c7134e24a18504c2ca55b3c012f7290e3e77c63b1a89`
- **Line count:** 172,823 words (one lowercase word per line, LF line endings)

Consumed by `scripts/build-lexicon.py` (PL-201), which filters to 3–8-letter
words, applies the overlays in `assets/lexicon-overlays/`, joins frequency
tiers, and emits `assets/lexicon.json`. See the PL-200 decision record in
`docs/ROADMAP.md` for the sourcing/licensing evaluation.
