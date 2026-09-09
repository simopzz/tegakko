import { describe, expect, it } from 'vitest';
import { CARDS } from './cards';

function bucket(script: 'hiragana' | 'katakana', kind: 'base' | 'yoon') {
  return CARDS.filter((card) => card.script === script && card.kind === kind);
}

describe('cards', () => {
  it('holds exactly 208 cards', () => {
    expect(CARDS).toHaveLength(208);
  });

  it('has exactly 71 base hiragana, 71 base katakana, 33 hiragana yoon, 33 katakana yoon', () => {
    expect(bucket('hiragana', 'base')).toHaveLength(71);
    expect(bucket('katakana', 'base')).toHaveLength(71);
    expect(bucket('hiragana', 'yoon')).toHaveLength(33);
    expect(bucket('katakana', 'yoon')).toHaveLength(33);
  });

  it('keys every card by a unique `${grapheme}:${script}` cardId', () => {
    const ids = CARDS.map((card) => card.cardId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const card of CARDS) {
      expect(card.cardId).toBe(`${card.grapheme}:${card.script}`);
    }
  });

  it('never collapses the same grapheme across script', () => {
    // あ (hiragana base) and ア (katakana base) are different graphemes, but
    // guard against any accidental script-blind id (e.g. keying only on a
    // shared romaji reading) by asserting every hiragana grapheme has a
    // distinctly-idd katakana counterpart that isn't string-equal.
    const hiraganaIds = new Set(bucket('hiragana', 'base').map((c) => c.cardId));
    const katakanaIds = new Set(bucket('katakana', 'base').map((c) => c.cardId));
    for (const id of hiraganaIds) {
      expect(katakanaIds.has(id)).toBe(false);
    }
  });

  it('never collapses a yoon card into its base-row counterpart', () => {
    // For every one of the 11 yoon consonant rows, in both scripts: each of
    // its 3 yoon cards (きゃ, きゅ, きょ) must carry `kind: 'yoon'` and a
    // cardId distinct from its siblings and from any same-row base card --
    // not just spot-checked on a single row, since the yoon cardId
    // construction is shared code and a row-specific bug could hide behind
    // one example. All 11 rows now have a standalone base card: the 7 seion
    // rows (き, し, ち, に, ひ, み, り) always did, and Story 1.11 added base
    // cards for the remaining 4 voiced/semi-voiced rows (ぎ, じ, び, ぴ) --
    // the guarded `if (baseCard)` below still runs harmlessly for every row.
    const yoonRows: Array<{ script: 'hiragana' | 'katakana'; base: string; suffixes: string[] }> = [
      { script: 'hiragana', base: 'き', suffixes: ['きゃ', 'きゅ', 'きょ'] },
      { script: 'hiragana', base: 'し', suffixes: ['しゃ', 'しゅ', 'しょ'] },
      { script: 'hiragana', base: 'ち', suffixes: ['ちゃ', 'ちゅ', 'ちょ'] },
      { script: 'hiragana', base: 'に', suffixes: ['にゃ', 'にゅ', 'にょ'] },
      { script: 'hiragana', base: 'ひ', suffixes: ['ひゃ', 'ひゅ', 'ひょ'] },
      { script: 'hiragana', base: 'み', suffixes: ['みゃ', 'みゅ', 'みょ'] },
      { script: 'hiragana', base: 'り', suffixes: ['りゃ', 'りゅ', 'りょ'] },
      { script: 'hiragana', base: 'ぎ', suffixes: ['ぎゃ', 'ぎゅ', 'ぎょ'] },
      { script: 'hiragana', base: 'じ', suffixes: ['じゃ', 'じゅ', 'じょ'] },
      { script: 'hiragana', base: 'び', suffixes: ['びゃ', 'びゅ', 'びょ'] },
      { script: 'hiragana', base: 'ぴ', suffixes: ['ぴゃ', 'ぴゅ', 'ぴょ'] },
      { script: 'katakana', base: 'キ', suffixes: ['キャ', 'キュ', 'キョ'] },
      { script: 'katakana', base: 'シ', suffixes: ['シャ', 'シュ', 'ショ'] },
      { script: 'katakana', base: 'チ', suffixes: ['チャ', 'チュ', 'チョ'] },
      { script: 'katakana', base: 'ニ', suffixes: ['ニャ', 'ニュ', 'ニョ'] },
      { script: 'katakana', base: 'ヒ', suffixes: ['ヒャ', 'ヒュ', 'ヒョ'] },
      { script: 'katakana', base: 'ミ', suffixes: ['ミャ', 'ミュ', 'ミョ'] },
      { script: 'katakana', base: 'リ', suffixes: ['リャ', 'リュ', 'リョ'] },
      { script: 'katakana', base: 'ギ', suffixes: ['ギャ', 'ギュ', 'ギョ'] },
      { script: 'katakana', base: 'ジ', suffixes: ['ジャ', 'ジュ', 'ジョ'] },
      { script: 'katakana', base: 'ビ', suffixes: ['ビャ', 'ビュ', 'ビョ'] },
      { script: 'katakana', base: 'ピ', suffixes: ['ピャ', 'ピュ', 'ピョ'] },
    ];

    for (const { script, base, suffixes } of yoonRows) {
      const baseCard = CARDS.find((c) => c.grapheme === base && c.script === script);
      // Unconditional since Story 1.11: all 11 rows now have a base card, so
      // an undefined lookup here must fail loudly, not silently skip.
      expect(baseCard).toBeDefined();
      expect(baseCard?.kind).toBe('base');

      const yoonCards = suffixes.map((yoonGrapheme) =>
        CARDS.find((c) => c.grapheme === yoonGrapheme && c.script === script),
      );
      const yoonIds = new Set<string>();
      for (const yoonCard of yoonCards) {
        expect(yoonCard).toBeDefined();
        expect(yoonCard?.kind).toBe('yoon');
        expect(yoonCard?.cardId).not.toBe(baseCard?.cardId);
        yoonIds.add(yoonCard!.cardId);
      }
      // The row's 3 yoon cards (…ゃ/…ゅ/…ょ) must also be distinct from
      // each other, not just from the base.
      expect(yoonIds.size).toBe(suffixes.length);
    }
  });

  it('includes no extended/loanword yoon graphemes (e.g. ふぁ, ゔぁ)', () => {
    const extendedYoonSample = ['ふぁ', 'ゔぁ', 'てぃ', 'うぃ'];
    for (const grapheme of extendedYoonSample) {
      expect(CARDS.some((c) => c.grapheme === grapheme)).toBe(false);
    }
  });

  // Story 1.2 deliberately shipped without `romaji` and asserted its absence,
  // deferring it to "a future prompt screen". Story 1.3 is that screen: the
  // drill prompt is romaji + script name, so the field now exists and the
  // absence assertion is replaced by these.
  it('gives every card a non-empty romaji reading', () => {
    for (const card of CARDS) {
      expect(card.romaji.length).toBeGreaterThan(0);
    }
  });

  it('uses Hepburn, not Nihon-shiki, for the readings that differ', () => {
    // Tied to graphemes, not to positions: katakana readings are generated
    // from the hiragana arrays by index, so a katakana grapheme reordered out
    // of gojuon order would otherwise ship a wrong prompt with a green suite.
    const expected: Record<string, string> = {
      し: 'shi',
      ち: 'chi',
      つ: 'tsu',
      ふ: 'fu',
      を: 'wo',
      ん: 'n',
      しゃ: 'sha',
      じゃ: 'ja',
      ちゃ: 'cha',
      きゃ: 'kya',
      シ: 'shi',
      チ: 'chi',
      ツ: 'tsu',
      フ: 'fu',
      ヲ: 'wo',
      ン: 'n',
      シャ: 'sha',
      ジャ: 'ja',
      キャ: 'kya',
    };
    for (const [grapheme, romaji] of Object.entries(expected)) {
      const card = CARDS.find((c) => c.grapheme === grapheme);
      expect(card?.romaji).toBe(romaji);
    }
  });

  it('maps every base grapheme to its correct Hepburn reading, by content not position', () => {
    // Hand-typed independently of `HIRAGANA_BASE`/`KATAKANA_BASE`/
    // `HIRAGANA_ROMAJI`'s declaration order in cards.ts: a transcription slip
    // that reorders or swaps entries in either grapheme array would still be
    // caught here, unlike a check that only compares hiragana and katakana
    // cards at the same array index (which stays green under a shared
    // reordering of both).
    const gojuon: Array<[hiragana: string, katakana: string, romaji: string]> = [
      ['あ', 'ア', 'a'], ['い', 'イ', 'i'], ['う', 'ウ', 'u'], ['え', 'エ', 'e'], ['お', 'オ', 'o'],
      ['か', 'カ', 'ka'], ['き', 'キ', 'ki'], ['く', 'ク', 'ku'], ['け', 'ケ', 'ke'], ['こ', 'コ', 'ko'],
      ['さ', 'サ', 'sa'], ['し', 'シ', 'shi'], ['す', 'ス', 'su'], ['せ', 'セ', 'se'], ['そ', 'ソ', 'so'],
      ['た', 'タ', 'ta'], ['ち', 'チ', 'chi'], ['つ', 'ツ', 'tsu'], ['て', 'テ', 'te'], ['と', 'ト', 'to'],
      ['な', 'ナ', 'na'], ['に', 'ニ', 'ni'], ['ぬ', 'ヌ', 'nu'], ['ね', 'ネ', 'ne'], ['の', 'ノ', 'no'],
      ['は', 'ハ', 'ha'], ['ひ', 'ヒ', 'hi'], ['ふ', 'フ', 'fu'], ['へ', 'ヘ', 'he'], ['ほ', 'ホ', 'ho'],
      ['ま', 'マ', 'ma'], ['み', 'ミ', 'mi'], ['む', 'ム', 'mu'], ['め', 'メ', 'me'], ['も', 'モ', 'mo'],
      ['や', 'ヤ', 'ya'], ['ゆ', 'ユ', 'yu'], ['よ', 'ヨ', 'yo'],
      ['ら', 'ラ', 'ra'], ['り', 'リ', 'ri'], ['る', 'ル', 'ru'], ['れ', 'レ', 're'], ['ろ', 'ロ', 'ro'],
      ['わ', 'ワ', 'wa'], ['を', 'ヲ', 'wo'],
      ['ん', 'ン', 'n'],
    ];
    expect(gojuon).toHaveLength(46);
    for (const [hiragana, katakana, romaji] of gojuon) {
      expect(CARDS.find((c) => c.grapheme === hiragana && c.script === 'hiragana')?.romaji).toBe(
        romaji,
      );
      expect(CARDS.find((c) => c.grapheme === katakana && c.script === 'katakana')?.romaji).toBe(
        romaji,
      );
    }
  });

  it('maps every dakuten/handakuten base grapheme to its correct Hepburn reading and `base` kind', () => {
    // Hand-typed independently of cards.ts's declaration order, mirroring the
    // seion gojuon fixture above. ぢ and づ deliberately duplicate じ/ず's
    // readings (`ji`/`zu`) -- standard Hepburn, not a bug (Story 1.11).
    const dakuten: Array<[hiragana: string, katakana: string, romaji: string]> = [
      ['が', 'ガ', 'ga'], ['ぎ', 'ギ', 'gi'], ['ぐ', 'グ', 'gu'], ['げ', 'ゲ', 'ge'], ['ご', 'ゴ', 'go'],
      ['ざ', 'ザ', 'za'], ['じ', 'ジ', 'ji'], ['ず', 'ズ', 'zu'], ['ぜ', 'ゼ', 'ze'], ['ぞ', 'ゾ', 'zo'],
      ['だ', 'ダ', 'da'], ['ぢ', 'ヂ', 'ji'], ['づ', 'ヅ', 'zu'], ['で', 'デ', 'de'], ['ど', 'ド', 'do'],
      ['ば', 'バ', 'ba'], ['び', 'ビ', 'bi'], ['ぶ', 'ブ', 'bu'], ['べ', 'ベ', 'be'], ['ぼ', 'ボ', 'bo'],
      ['ぱ', 'パ', 'pa'], ['ぴ', 'ピ', 'pi'], ['ぷ', 'プ', 'pu'], ['ぺ', 'ペ', 'pe'], ['ぽ', 'ポ', 'po'],
    ];
    expect(dakuten).toHaveLength(25);
    for (const [hiragana, katakana, romaji] of dakuten) {
      const hiraganaCard = CARDS.find((c) => c.grapheme === hiragana && c.script === 'hiragana');
      const katakanaCard = CARDS.find((c) => c.grapheme === katakana && c.script === 'katakana');
      expect(hiraganaCard?.romaji).toBe(romaji);
      expect(hiraganaCard?.kind).toBe('base');
      expect(katakanaCard?.romaji).toBe(romaji);
      expect(katakanaCard?.kind).toBe('base');
    }
  });

  it('never doubles the i of shi/chi/ji into a yoon reading', () => {
    // しゅ is `shu`, never `shyu`; じょ is `jo`, never `jyo`.
    const readings = new Set(CARDS.map((card) => card.romaji));
    for (const bad of ['shya', 'shyu', 'shyo', 'chya', 'chyu', 'chyo', 'jya', 'jyu', 'jyo']) {
      expect(readings.has(bad)).toBe(false);
    }
  });

  it('reads a hiragana card and its katakana counterpart identically', () => {
    // Same position in the gojuon order -> same sound, regardless of script:
    // あ/ア are both "a", きゃ/キャ both "kya".
    const hiragana = CARDS.filter((card) => card.script === 'hiragana');
    const katakana = CARDS.filter((card) => card.script === 'katakana');
    expect(hiragana).toHaveLength(katakana.length);
    for (const [index, card] of hiragana.entries()) {
      expect(katakana[index]?.romaji).toBe(card.romaji);
      expect(katakana[index]?.kind).toBe(card.kind);
    }
  });
});
