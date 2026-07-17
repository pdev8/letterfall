"""Generate winnable LETTERFALL deals by construction.

Method: pick a solution (a sequence of words), give each word at most one
letter from the stock and the rest to distinct columns, then stack the
column letters so earlier-played words sit nearer the top. Forward play of
that word sequence is then legal by the game rules:
  - each word uses <= 1 card per column and <= 1 waste card
  - a word's column letters are always the column tops when its turn comes
  - needed stock letters form a prefix of the stock in play order, so one
    draw per stock-using word brings the right letter to the waste top.
Deals are emitted with their witness so a separate script can replay them
through the real game reducer.
"""

import json
import random
from collections import Counter

LEXICON = 'assets/lexicon.json'
OUT = 'assets/seeds.json'

COL_CAPS = [1, 2, 3, 4, 5, 6, 7]  # column c holds exactly c+1 cards, 28 total
STOCK_LEN = 20
import argparse
_ap = argparse.ArgumentParser()
_ap.add_argument('--count', type=int, default=290)
_ap.add_argument('--seed', type=int, default=57)
_args = _ap.parse_args()
NUM_DEALS = _args.count

random.seed(_args.seed)

# Lexicon words are the keys of lexicon.json's words map (word -> tier),
# already lowercase 3-8 letters (built by scripts/build-lexicon.py, DB-201).
lexicon = list(json.load(open(LEXICON))['words'].keys())
lexset = set(lexicon)
by_len = {}
for w in lexicon:
    if 3 <= len(w) <= 8:
        by_len.setdefault(len(w), []).append(w)

# Letter distribution for filler stock cards, drawn from the lexicon itself.
freq = Counter(ch for w in lexicon for ch in w)
letters, weights = zip(*sorted(freq.items()))

LEN_CHOICES = [3, 4, 5, 6, 7, 8]
LEN_WEIGHTS = [6, 5, 3, 1.5, 0.7, 0.3]


def pick_lengths(k):
    """Word lengths summing to 28 + m, where m words (including every
    8-letter word, which needs the waste for its 8th letter) take one
    letter from the stock. Returns (lengths, stock_flags)."""
    for _ in range(2000):
        ls = random.choices(LEN_CHOICES, weights=LEN_WEIGHTS, k=k)
        m = sum(ls) - 28
        eights = sum(1 for l in ls if l == 8)
        if eights <= m <= k:
            flags = [l == 8 for l in ls]
            free = [i for i, f in enumerate(flags) if not f]
            for i in random.sample(free, m - eights):
                flags[i] = True
            return ls, flags
    return None, None


def assign_columns(counts):
    """Give word i `counts[i]` cells in distinct columns; greedy, biggest
    remaining capacity first. Returns cols per word or None."""
    caps = COL_CAPS[:]
    result = [None] * len(counts)
    for i in sorted(range(len(counts)), key=lambda i: -counts[i]):
        order = sorted(range(7), key=lambda c: (-caps[c], random.random()))
        cols = [c for c in order if caps[c] > 0][: counts[i]]
        if len(cols) < counts[i]:
            return None
        for c in cols:
            caps[c] -= 1
        result[i] = cols
    return result


def make_deal(used_words):
    k = random.choice([7, 8, 9, 9, 10])  # solution length, like existing deals
    ls, stock_flags = pick_lengths(k)
    if ls is None:
        return None
    words = []
    for l in ls:
        for _ in range(80):
            w = random.choice(by_len[l])
            if w not in words:
                words.append(w)
                break
        else:
            return None

    col_counts = [len(w) - (1 if s else 0) for w, s in zip(words, stock_flags)]
    cols_for = assign_columns(col_counts)
    if cols_for is None:
        return None

    # For each word, pick which letter position rides the stock and map the
    # rest onto its columns (any per-word arrangement is legal to tap out).
    col_cells = [[] for _ in range(7)]  # (play_index, letter)
    stock_needed = []  # in play order
    witness = []
    for i, (w, uses_stock) in enumerate(zip(words, stock_flags)):
        positions = list(range(len(w)))
        sources = [None] * len(w)
        if uses_stock:
            p = random.choice(positions)
            sources[p] = 'reserve'
            stock_needed.append(w[p])
            positions.remove(p)
        cols = cols_for[i][:]
        random.shuffle(cols)
        for p, c in zip(positions, cols):
            sources[p] = c
            col_cells[c].append((i, w[p]))
        witness.append({'word': w, 'sources': sources})

    # Bottom -> top: latest-played word at the bottom, earliest on top.
    columns = []
    for c in range(7):
        cells = sorted(col_cells[c], key=lambda t: -t[0])
        columns.append(''.join(letter for _, letter in cells))
    assert [len(c) for c in columns] == COL_CAPS

    m = len(stock_needed)
    fillers = random.choices(letters, weights=weights, k=STOCK_LEN - m)
    stock = ''.join(stock_needed) + ''.join(fillers)

    deal = {
        'columns': columns,
        'stock': stock,
        'label': 'smooth' if m <= 4 else 'tight',
        'solverWords': k,
        'witness': witness,
    }
    return deal, witness


def simulate(deal, witness):
    """Replay the witness under the game rules (python mirror). True iff won."""
    cols = [list(c) for c in deal['columns']]
    stock = list(deal['stock'])
    reserve = []
    for step in witness:
        word, sources = step['word'], step['sources']
        if word not in lexset or not (3 <= len(word) <= 8):
            return False
        if 'reserve' in sources:
            if not stock:
                return False
            reserve.append(stock.pop(0))  # one draw brings the needed letter up
        used_cols = set()
        for ch, src in zip(word, sources):
            if src == 'reserve':
                if not reserve or reserve[-1] != ch:
                    return False
                reserve.pop()
            else:
                if src in used_cols or not cols[src] or cols[src][-1] != ch:
                    return False
                used_cols.add(src)
                cols[src].pop()
    return all(len(c) == 0 for c in cols)


used_words = set()
out_deals, out_witnesses = [], []
attempts = 0
while len(out_deals) < NUM_DEALS and attempts < 100000:
    attempts += 1
    res = make_deal(used_words)
    if res is None:
        continue
    deal, witness = res
    if not simulate(deal, witness):
        print('simulation failed for', [w['word'] for w in witness])
        continue
    out_deals.append(deal)
    out_witnesses.append(witness)
    used_words.update(w['word'] for w in witness)

print(f'generated {len(out_deals)} deals in {attempts} attempts')
for i, (d, wit) in enumerate(zip(out_deals, out_witnesses)):
    print(f"  {i}: {d['label']:6s} k={d['solverWords']:2d} "
          f"stock-used={sum(1 for s in wit if 'reserve' in s['sources'])} "
          f"words={'/'.join(s['word'] for s in wit)}")

json.dump({'deals': out_deals}, open(OUT, 'w'), separators=(',', ':'))
print('wrote', OUT, 'with', len(out_deals), 'witnessed deals')
