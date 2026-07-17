import * as fs from 'fs';
import * as path from 'path';

import lexiconJson from '../../assets/lexicon.json';

// Cast through unknown so we depend on the schema, not the literal JSON type.
const lexicon = lexiconJson as unknown as {
  source: string;
  builtFrom: { enable1_sha256: string; exclusions: string; count_1w_sha256: string };
  tiers: Record<string, string>;
  words: Record<string, number>;
};

const words = lexicon.words;
const entries = Object.entries(words);

describe('lexicon.json schema', () => {
  it('records its provenance', () => {
    expect(lexicon.source).toBe('ENABLE2k (public domain)');
    expect(lexicon.builtFrom.enable1_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(lexicon.builtFrom.count_1w_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is a substantial lexicon (ENABLE has 80,272 words of 3-8 letters)', () => {
    expect(entries.length).toBeGreaterThan(75000);
  });

  it('every word is 3-8 lowercase letters', () => {
    const bad = entries.filter(([w]) => !/^[a-z]{3,8}$/.test(w));
    expect(bad).toEqual([]);
  });

  it('every tier is an integer 1-5', () => {
    const bad = entries.filter(([, t]) => !Number.isInteger(t) || t < 1 || t > 5);
    expect(bad).toEqual([]);
  });
});

describe('lexicon.json contents', () => {
  it('contains ordinary English words', () => {
    for (const w of ['quiz', 'cat', 'prized', 'jukebox', 'queue']) {
      expect(words[w]).toBeDefined();
    }
  });

  it('drops words on the vendored exclusion list', () => {
    const raw = fs.readFileSync(
      path.join(__dirname, '../../assets/lexicon-overlays/exclusions.txt'),
      'utf8',
    );
    const excluded = raw
      .split('\n')
      .map((line) => line.split('#')[0].trim())
      .filter((w) => w.length > 0);
    expect(excluded.length).toBeGreaterThan(100);
    for (const w of excluded.slice(0, 3)) {
      expect(words[w]).toBeUndefined();
    }
  });

  it('has no proper nouns', () => {
    // ENABLE contains no proper nouns. The old seed lexicon's name-like words
    // ('abigail', 'john', 'china', ...) all turn out to be legitimate ENABLE
    // common nouns (an abigail is a lady's maid), so we assert on words that
    // exist only as proper nouns instead.
    expect(words['london']).toBeUndefined();
    expect(words['january']).toBeUndefined();
  });

  it('common words are common', () => {
    expect(words['the']).toBe(1);
    expect(words['cat']).toBeLessThanOrEqual(2);
  });
});
