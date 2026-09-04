import { describe, expect, it } from 'vitest';
import { CARDS } from './cards';

function bucket(script: 'hiragana' | 'katakana', kind: 'base' | 'yoon') {
  return CARDS.filter((card) => card.script === script && card.kind === kind);
}

describe('cards', () => {
  it('holds exactly 158 cards', () => {
    expect(CARDS).toHaveLength(158);
  });

  it('has exactly 46 base hiragana, 46 base katakana, 33 hiragana yoon, 33 katakana yoon', () => {
    expect(bucket('hiragana', 'base')).toHaveLength(46);
    expect(bucket('katakana', 'base')).toHaveLength(46);
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
    // one example. 7 of the 11 rows are seion (き, し, ち, に, ひ, み, り) and
    // do have a standalone base card (e.g. き); the other 4 are voiced/
    // semi-voiced (ぎ, じ, び, ぴ) and, per this file's 46-base-per-script
    // seion-only rule, have no standalone base card of their own -- so the
    // base-card assertions below only run where one actually exists.
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
      if (baseCard) {
        expect(baseCard.kind).toBe('base');
      }

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

  it('never has a `romaji` field on a Card', () => {
    for (const card of CARDS) {
      expect('romaji' in card).toBe(false);
    }
  });
});
