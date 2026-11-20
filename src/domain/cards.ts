// Pure domain data -- no DOM/IndexedDB/Svelte import ever appears here
// (docs/adr/0001-hexagonal-boundary.md).
//
// The static 208-card kana catalog: compiled into the bundle, never an
// IndexedDB store. `cardId` is the natural key `"<grapheme>:<script>"` -- a
// yoon card's grapheme is always the full two-character combination (e.g.
// "きゃ"), never decomposed into its base kana + small-ya/yu/yo parts, so a
// yoon card can never collide with its base-row counterpart's id.

export type Script = 'hiragana' | 'katakana';
export type CardSet = 'base' | 'yoon';

export interface Card {
  cardId: string;
  grapheme: string;
  script: Script;
  set: CardSet;
  /** Hepburn reading, shared across scripts (あ and ア are both "a"). The
   * drill prompt shows this plus the script name -- never a
   * mnemonic or example word. */
  romaji: string;
  /** Written-form disambiguator, set only on the 4 cards whose
   * Hepburn `romaji` collapses onto another card's (ぢ/づ/ヂ/ヅ share "ji"/"zu"
   * with じ/ず/ジ/ズ). The prompt renders it as "<romaji> (<writtenRomaji>)"
   * so a bare "ji"/"zu" prompt is unambiguous by elimination -- disambiguating
   * data intrinsic to the card, not a mnemonic. */
  writtenRomaji?: string;
}

// NFC-normalized so a `cardId` built here always matches one built from any
// externally-sourced grapheme/lookup key (persisted `Attempt.cardId`, an
// import) that happens to use a differently-composed but visually identical
// encoding of the same kana.
function cardId(grapheme: string, script: Script): string {
  return `${grapheme.normalize('NFC')}:${script}`;
}

// Base gojuon order, hiragana. 46 seion entries followed by the 25
// dakuten/handakuten entries (が/ざ/だ/ば/ぱ-rows, in that consonant order,
// each in a/i/u/e/o vowel order) -- 71 base cards per script.
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
  'が', 'ぎ', 'ぐ', 'げ', 'ご',
  'ざ', 'じ', 'ず', 'ぜ', 'ぞ',
  'だ', 'ぢ', 'づ', 'で', 'ど',
  'ば', 'び', 'ぶ', 'べ', 'ぼ',
  'ぱ', 'ぴ', 'ぷ', 'ぺ', 'ぽ',
] as const;

// Same order, katakana: 46 seion + 25 dakuten/handakuten (ガ/ザ/ダ/バ/パ-rows) = 71.
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
  'ガ', 'ギ', 'グ', 'ゲ', 'ゴ',
  'ザ', 'ジ', 'ズ', 'ゼ', 'ゾ',
  'ダ', 'ヂ', 'ヅ', 'デ', 'ド',
  'バ', 'ビ', 'ブ', 'ベ', 'ボ',
  'パ', 'ピ', 'プ', 'ペ', 'ポ',
] as const;

// Hepburn readings, index-parallel to HIRAGANA_BASE/KATAKANA_BASE (both
// scripts share one reading per position: あ and ア are both "a"). Hepburn,
// not Nihon-shiki: し `shi`, ち `chi`, つ `tsu`, ふ `fu`. ぢ/づ deliberately
// duplicate じ/ず's readings (`ji`/`zu`) -- standard Hepburn, not a bug. The
// resulting drill-prompt ambiguity (which of the two a bare "ji"/"zu" prompt
// means) is resolved separately by `writtenRomaji` below, not
// by changing these Hepburn readings.
const HIRAGANA_ROMAJI = [
  'a', 'i', 'u', 'e', 'o',
  'ka', 'ki', 'ku', 'ke', 'ko',
  'sa', 'shi', 'su', 'se', 'so',
  'ta', 'chi', 'tsu', 'te', 'to',
  'na', 'ni', 'nu', 'ne', 'no',
  'ha', 'hi', 'fu', 'he', 'ho',
  'ma', 'mi', 'mu', 'me', 'mo',
  'ya', 'yu', 'yo',
  'ra', 'ri', 'ru', 're', 'ro',
  'wa', 'wo',
  'n',
  'ga', 'gi', 'gu', 'ge', 'go',
  'za', 'ji', 'zu', 'ze', 'zo',
  'da', 'ji', 'zu', 'de', 'do',
  'ba', 'bi', 'bu', 'be', 'bo',
  'pa', 'pi', 'pu', 'pe', 'po',
] as const;

// Standard yoon rows -- 11 consonant rows (7 seion + 4 voiced/semi-voiced:
// ぎ/じ/び/ぴ), each combining with small ゃ/ゅ/ょ. 11 * 3 = 33 per script.
// No extended/loanword yoon rows (e.g. ふぁ, ゔぁ).
const HIRAGANA_YOON_ROWS = ['き', 'し', 'ち', 'に', 'ひ', 'み', 'り', 'ぎ', 'じ', 'び', 'ぴ'] as const;
const KATAKANA_YOON_ROWS = ['キ', 'シ', 'チ', 'ニ', 'ヒ', 'ミ', 'リ', 'ギ', 'ジ', 'ビ', 'ピ'] as const;
const YOON_SMALL_SUFFIXES = ['ゃ', 'ゅ', 'ょ'] as const;
const YOON_SMALL_SUFFIXES_KATAKANA = ['ャ', 'ュ', 'ョ'] as const;

// Hepburn stems, index-parallel to the yoon rows above and shared across
// scripts, combined with the vowel parallel to the small-kana suffixes:
// きゃ `kya`, しゃ `sha`, ちゃ `cha`, じゃ `ja`. `shi`/`chi`/`ji` collapse
// rather than doubling their i (never `shya`/`chya`/`jya`), which is why
// this is a separate parallel array and not derived from HIRAGANA_ROMAJI.
const YOON_ROMAJI_STEMS = ['ky', 'sh', 'ch', 'ny', 'hy', 'my', 'ry', 'gy', 'j', 'by', 'py'] as const;
const YOON_ROMAJI_VOWELS = ['a', 'u', 'o'] as const;

// Written-form disambiguator: only the da-row's ぢ/づ (and their
// katakana counterparts ヂ/ヅ) need one -- their Hepburn romaji ("ji"/"zu")
// collapses onto じ/ず's, so the prompt shows both: "ji (di)" / "zu (du)".
// Keyed by grapheme, not index, since the disambiguation is identical across
// scripts and this way it can't drift out of step with either BASE array.
const WRITTEN_ROMAJI_BY_GRAPHEME: Readonly<Record<string, string>> = {
  ぢ: 'di',
  づ: 'du',
  ヂ: 'di',
  ヅ: 'du',
};

function baseCards(graphemes: readonly string[], script: Script): Card[] {
  return graphemes.map((grapheme, index) => {
    const romaji = HIRAGANA_ROMAJI[index];
    // Parallel-array indexing under `noUncheckedIndexedAccess`: a missing
    // reading means the arrays drifted out of step, which is a build-time
    // authoring bug, not a runtime condition to degrade around.
    if (romaji === undefined) {
      throw new Error(`No romaji for base card at index ${index}`);
    }
    const writtenRomaji = WRITTEN_ROMAJI_BY_GRAPHEME[grapheme];
    return {
      cardId: cardId(grapheme, script),
      grapheme,
      script,
      set: 'base',
      romaji,
      ...(writtenRomaji === undefined ? {} : { writtenRomaji }),
    };
  });
}

function yoonCards(
  rows: readonly string[],
  suffixes: readonly string[],
  script: Script,
): Card[] {
  return rows.flatMap((row, rowIndex) =>
    suffixes.map((suffix, suffixIndex) => {
      const grapheme = `${row}${suffix}`;
      const stem = YOON_ROMAJI_STEMS[rowIndex];
      const vowel = YOON_ROMAJI_VOWELS[suffixIndex];
      if (stem === undefined || vowel === undefined) {
        throw new Error(`No romaji for yoon card at row ${rowIndex}, suffix ${suffixIndex}`);
      }
      return {
        cardId: cardId(grapheme, script),
        grapheme,
        script,
        set: 'yoon' as const,
        romaji: `${stem}${vowel}`,
      };
    }),
  );
}

/** The full 208-card static catalog: 71 base hiragana (46 seion + 25
 * dakuten/handakuten) + 71 base katakana + 33 hiragana yoon + 33 katakana
 * yoon.
 *
 * Every card and the array itself are frozen -- `CARDS` is shared module
 * state, so a caller that got a reference to it (or to one of its cards, e.g.
 * via `getById`) must not be able to corrupt it for every other reader. */
export const CARDS: Card[] = Object.freeze(
  [
    ...baseCards(HIRAGANA_BASE, 'hiragana'),
    ...baseCards(KATAKANA_BASE, 'katakana'),
    ...yoonCards(HIRAGANA_YOON_ROWS, YOON_SMALL_SUFFIXES, 'hiragana'),
    ...yoonCards(KATAKANA_YOON_ROWS, YOON_SMALL_SUFFIXES_KATAKANA, 'katakana'),
  ].map((card) => Object.freeze(card)),
) as Card[];
