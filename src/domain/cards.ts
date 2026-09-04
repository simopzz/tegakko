// Pure domain data -- no DOM/IndexedDB/Svelte import ever appears here (AD-1).
//
// The static 158-card kana catalog (AD-3): compiled into the bundle, never an
// IndexedDB store. `cardId` is the natural key `"<grapheme>:<script>"` -- a
// yoon card's grapheme is always the full two-character combination (e.g.
// "きゃ"), never decomposed into its base kana + small-ya/yu/yo parts, so a
// yoon card can never collide with its base-row counterpart's id.

export type Script = 'hiragana' | 'katakana';
export type CardKind = 'base' | 'yoon';

export interface Card {
  cardId: string;
  grapheme: string;
  script: Script;
  kind: CardKind;
}

function cardId(grapheme: string, script: Script): string {
  return `${grapheme}:${script}`;
}

// Base gojuon order, hiragana. Exactly 46 -- seion only, no dakuten/handakuten,
// matching AD-3's 46-base-per-script rule.
const HIRAGANA_BASE = [
  'あ', 'い', 'う', 'え', 'お',
  'か', 'き', 'く', 'け', 'こ',
  'さ', 'し', 'す', 'せ', 'そ',
  'た', 'ち', 'つ', 'て', 'と',
  'な', 'に', 'ぬ', 'ね', 'の',
  'は', 'ひ', 'ふ', 'へ', 'ほ',
  'ま', 'み', 'む', 'め', 'も',
  'や', 'ゆ', 'よ',
  'ら', 'り', 'る', 'れ', 'ろ',
  'わ', 'を',
  'ん',
] as const;

// Same order, katakana.
const KATAKANA_BASE = [
  'ア', 'イ', 'ウ', 'エ', 'オ',
  'カ', 'キ', 'ク', 'ケ', 'コ',
  'サ', 'シ', 'ス', 'セ', 'ソ',
  'タ', 'チ', 'ツ', 'テ', 'ト',
  'ナ', 'ニ', 'ヌ', 'ネ', 'ノ',
  'ハ', 'ヒ', 'フ', 'ヘ', 'ホ',
  'マ', 'ミ', 'ム', 'メ', 'モ',
  'ヤ', 'ユ', 'ヨ',
  'ラ', 'リ', 'ル', 'レ', 'ロ',
  'ワ', 'ヲ',
  'ン',
] as const;

// Standard yoon rows -- 11 consonant rows (7 seion + 4 voiced/semi-voiced:
// ぎ/じ/び/ぴ), each combining with small ゃ/ゅ/ょ. 11 * 3 = 33 per script,
// matching AD-3's 33-yoon-per-script rule. No extended/loanword yoon rows
// (e.g. ふぁ, ゔぁ) -- out of this story's frozen scope.
const HIRAGANA_YOON_ROWS = ['き', 'し', 'ち', 'に', 'ひ', 'み', 'り', 'ぎ', 'じ', 'び', 'ぴ'] as const;
const KATAKANA_YOON_ROWS = ['キ', 'シ', 'チ', 'ニ', 'ヒ', 'ミ', 'リ', 'ギ', 'ジ', 'ビ', 'ピ'] as const;
const YOON_SMALL_SUFFIXES = ['ゃ', 'ゅ', 'ょ'] as const;
const YOON_SMALL_SUFFIXES_KATAKANA = ['ャ', 'ュ', 'ョ'] as const;

function baseCards(graphemes: readonly string[], script: Script): Card[] {
  return graphemes.map((grapheme) => ({
    cardId: cardId(grapheme, script),
    grapheme,
    script,
    kind: 'base',
  }));
}

function yoonCards(
  rows: readonly string[],
  suffixes: readonly string[],
  script: Script,
): Card[] {
  return rows.flatMap((row) =>
    suffixes.map((suffix) => {
      const grapheme = `${row}${suffix}`;
      return {
        cardId: cardId(grapheme, script),
        grapheme,
        script,
        kind: 'yoon' as const,
      };
    }),
  );
}

/** The full 158-card static catalog (AD-3): 46 base hiragana + 46 base
 * katakana + 33 hiragana yoon + 33 katakana yoon. */
export const CARDS: Card[] = [
  ...baseCards(HIRAGANA_BASE, 'hiragana'),
  ...baseCards(KATAKANA_BASE, 'katakana'),
  ...yoonCards(HIRAGANA_YOON_ROWS, YOON_SMALL_SUFFIXES, 'hiragana'),
  ...yoonCards(KATAKANA_YOON_ROWS, YOON_SMALL_SUFFIXES_KATAKANA, 'katakana'),
];
