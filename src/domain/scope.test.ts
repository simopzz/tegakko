import { describe, expect, it } from 'vitest';
import { CARDS } from './cards';
import { cardsInScope, describeScope, FULL_SCOPE, resolveSessionSize, type Scope } from './scope';

describe('cardsInScope', () => {
  it('returns the full 208-card catalog for the complete default', () => {
    expect(cardsInScope(CARDS, FULL_SCOPE)).toHaveLength(208);
  });

  it('narrows to hiragana + base only (71 cards)', () => {
    const scope: Scope = { hiragana: ['base'] };
    const result = cardsInScope(CARDS, scope);
    expect(result).toHaveLength(71);
    expect(result.every((c) => c.script === 'hiragana' && c.set === 'base')).toBe(true);
  });

  it('narrows to katakana + yoon only (33 cards)', () => {
    const scope: Scope = { katakana: ['yoon'] };
    const result = cardsInScope(CARDS, scope);
    expect(result).toHaveLength(33);
    expect(result.every((c) => c.script === 'katakana' && c.set === 'yoon')).toBe(true);
  });

  it('narrows both scripts to base only (142 cards)', () => {
    const scope: Scope = { hiragana: ['base'], katakana: ['base'] };
    expect(cardsInScope(CARDS, scope)).toHaveLength(142);
  });

  it('narrows to hiragana only, both sets (104 cards)', () => {
    const scope: Scope = { hiragana: ['base', 'yoon'] };
    expect(cardsInScope(CARDS, scope)).toHaveLength(104);
  });

  it('narrows each script on its own terms -- the case one flat sets array could not express', () => {
    // Hiragana base+yoon (104) but katakana base only (71): katakana's
    // yoon cards must stay out even though hiragana still draws its own.
    const scope: Scope = { hiragana: ['base', 'yoon'], katakana: ['base'] };
    const result = cardsInScope(CARDS, scope);
    expect(result).toHaveLength(175);
    expect(result.filter((c) => c.script === 'katakana').every((c) => c.set === 'base')).toBe(true);
  });

  it('returns no cards for a script absent from the scope, never treating it as unrestricted', () => {
    const scope: Scope = { hiragana: ['base', 'yoon'] };
    expect(cardsInScope(CARDS, scope).every((c) => c.script === 'hiragana')).toBe(true);
  });

  it('returns no cards for an empty sets array, never treating it as unrestricted', () => {
    const scope: Scope = { hiragana: [], katakana: ['base'] };
    expect(cardsInScope(CARDS, scope)).toHaveLength(71);
    expect(cardsInScope(CARDS, { hiragana: [] })).toHaveLength(0);
  });

  it('does not mutate the input cards array', () => {
    const before = [...CARDS];
    cardsInScope(CARDS, { hiragana: ['base'] });
    expect(CARDS).toEqual(before);
  });

  it('narrows to kanji N5 (79 cards) on the kanji script\'s own terms', () => {
    const scope: Scope = { kanji: ['n5'] };
    const result = cardsInScope(CARDS, scope);
    expect(result).toHaveLength(79);
    expect(result.every((c) => c.script === 'kanji' && c.set === 'n5')).toBe(true);
  });

  it('narrows to any level the picker can offer, including the whole N5-N1 range', () => {
    const n1 = cardsInScope(CARDS, { kanji: ['n1'] });
    expect(n1).toHaveLength(1232);
    expect(n1.every((c) => c.set === 'n1')).toBe(true);
    const all = cardsInScope(CARDS, { kanji: ['n5', 'n4', 'n3', 'n2', 'n1'] });
    expect(all).toHaveLength(2211);
  });

  it('mixes kanji into a kana scope without either widening the other', () => {
    // A kanji JLPT level never widens a kana scope: hiragana base only (71)
    // beside all 79 kanji, and no katakana card can slip in.
    const scope: Scope = { hiragana: ['base'], kanji: ['n5'] };
    const result = cardsInScope(CARDS, scope);
    expect(result).toHaveLength(71 + 79);
    expect(result.filter((c) => c.script === 'katakana')).toHaveLength(0);
  });

  it('keeps FULL_SCOPE the kana-only default: kanji is a picker opt-in', () => {
    // The default selection on a fresh app load never surprises a kana
    // learner with kanji; the Kanji pill turns them on.
    expect(cardsInScope(CARDS, FULL_SCOPE).every((c) => c.script !== 'kanji')).toBe(true);
  });
});

describe('resolveSessionSize', () => {
  it("returns the full scoped count unchanged for 'all'", () => {
    expect(resolveSessionSize('all', 208)).toBe(208);
    expect(resolveSessionSize('all', 1)).toBe(1);
  });

  it('passes each count preset through as itself against a large scope', () => {
    expect(resolveSessionSize(10, 208)).toBe(10);
    expect(resolveSessionSize(20, 208)).toBe(20);
    expect(resolveSessionSize(50, 208)).toBe(50);
  });

  it('clamps a preset larger than the scope down to the scope, never past it', () => {
    // "50" on a 33-card scope just means all of them.
    expect(resolveSessionSize(50, 33)).toBe(33);
    expect(resolveSessionSize(10, 8)).toBe(8);
    expect(resolveSessionSize(20, 1)).toBe(1);
  });
});

describe('describeScope', () => {
  it('reads each script as its name then its Sets joined with "+"', () => {
    expect(describeScope({ hiragana: ['base', 'yoon'], katakana: ['base'] })).toBe(
      'Hiragana Base+Yoon · Katakana Base',
    );
  });

  it('reads a single-Set script without a joiner and an empty scope as empty', () => {
    expect(describeScope({ katakana: ['yoon'] })).toBe('Katakana Yoon');
    expect(describeScope({})).toBe('');
  });

  it('reads a kanji scope as its JLPT level, multi-level scopes joined', () => {
    expect(describeScope({ kanji: ['n5'] })).toBe('Kanji N5');
    expect(describeScope({ kanji: ['n4', 'n3'] })).toBe('Kanji N4+N3');
    expect(describeScope({ hiragana: ['base'], kanji: ['n5'] })).toBe(
      'Hiragana Base · Kanji N5',
    );
  });
});
