import { describe, expect, it } from 'vitest';
import { CARDS, type KanjiCard } from './cards';
import { KANJI_CARDS } from './kanji';

// Pins the generated catalog's output, not its generator
// (docs/agents/testing.md): regenerate with `mise run gen-kanji` and these
// hold the result to the spec -- Waller's five JLPT lists, the id shape, and
// the KANJIDIC2 extraction rules (first 3 meanings, dot-free readings).

const LEVEL_COUNTS: Record<KanjiCard['set'], number> = {
  n5: 79,
  n4: 166,
  n3: 367,
  n2: 367,
  n1: 1232,
};
const TOTAL = 2211;

describe('the generated N5-N1 kanji catalog', () => {
  it("holds Jonathan Waller's JLPT N5-N1 lists, in list order", () => {
    expect(KANJI_CARDS).toHaveLength(TOTAL);
    // Hand-copied from the source lists: each level block follows Waller's
    // order, first to last, and the blocks stack N5 to N1.
    expect(KANJI_CARDS[0]?.grapheme).toBe('日'); // first N5
    expect(KANJI_CARDS[78]?.grapheme).toBe('雨'); // last N5
    expect(KANJI_CARDS[2210]?.grapheme).toBe('捷'); // last N1
  });

  it('holds the pinned count per level', () => {
    for (const [set, count] of Object.entries(LEVEL_COUNTS)) {
      expect(KANJI_CARDS.filter((card) => card.set === set)).toHaveLength(count);
    }
  });

  it('keys every card by `${grapheme}:kanji`, merged and unique across the whole catalog', () => {
    const ids = new Set(CARDS.map((card) => card.cardId));
    expect(ids.size).toBe(CARDS.length);
    for (const card of KANJI_CARDS) {
      expect(card.cardId).toBe(`${card.grapheme}:kanji`);
      expect(ids.has(card.cardId)).toBe(true);
    }
  });

  it('merges into CARDS with the kana catalog intact', () => {
    expect(CARDS).toHaveLength(208 + TOTAL);
    expect(CARDS.filter((card) => card.script === 'kanji')).toHaveLength(TOTAL);
    expect(CARDS.filter((card) => card.script !== 'kanji')).toHaveLength(208);
  });

  it('keeps 1 to 3 non-empty meanings per card', () => {
    for (const card of KANJI_CARDS) {
      expect(card.meanings.length).toBeGreaterThanOrEqual(1);
      expect(card.meanings.length).toBeLessThanOrEqual(3);
      for (const meaning of card.meanings) {
        expect(meaning.length).toBeGreaterThan(0);
      }
    }
  });

  it('carries no okurigana dot in any reading', () => {
    // KANJIDIC2 writes a kun'yomi as まな.ぶ; the catalog stores まなぶ.
    for (const card of KANJI_CARDS) {
      for (const reading of [...card.onyomi, ...card.kunyomi]) {
        expect(reading.includes('.')).toBe(false);
        expect(reading.length).toBeGreaterThan(0);
      }
    }
  });

  it("extracts 日's KANJIDIC2 entry exactly, readings dot-free", () => {
    // A worked example, hand-checked against the source XML: what the
    // prompt shows for the first card in the list.
    const hi = KANJI_CARDS.find((card) => card.grapheme === '日') as KanjiCard | undefined;
    expect(hi?.meanings).toEqual(['day', 'sun', 'Japan']);
    expect(hi?.onyomi).toEqual(['ニチ', 'ジツ']);
    // Only the dot is stripped -- the hyphen notation (readings that only
    // appear with okurigana) survives, exactly as KANJIDIC2 publishes it.
    expect(hi?.kunyomi).toEqual(['ひ', '-び', '-か']);
  });
});
