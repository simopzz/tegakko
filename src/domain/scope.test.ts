import { describe, expect, it } from 'vitest';
import { CARDS } from './cards';
import { cardsInScope, FULL_SCOPE, type Scope } from './scope';

describe('cardsInScope', () => {
  it('returns the full 158-card catalog for the full-scope default', () => {
    expect(cardsInScope(CARDS, FULL_SCOPE)).toHaveLength(158);
  });

  it('narrows to hiragana + base only (46 cards)', () => {
    const scope: Scope = { scripts: ['hiragana'], units: ['base'] };
    const result = cardsInScope(CARDS, scope);
    expect(result).toHaveLength(46);
    expect(result.every((c) => c.script === 'hiragana' && c.kind === 'base')).toBe(true);
  });

  it('narrows to katakana + yoon only (33 cards)', () => {
    const scope: Scope = { scripts: ['katakana'], units: ['yoon'] };
    const result = cardsInScope(CARDS, scope);
    expect(result).toHaveLength(33);
    expect(result.every((c) => c.script === 'katakana' && c.kind === 'yoon')).toBe(true);
  });

  it('narrows to both scripts but base only (92 cards)', () => {
    const scope: Scope = { scripts: ['hiragana', 'katakana'], units: ['base'] };
    expect(cardsInScope(CARDS, scope)).toHaveLength(92);
  });

  it('narrows to hiragana only, both units (79 cards)', () => {
    const scope: Scope = { scripts: ['hiragana'], units: ['base', 'yoon'] };
    expect(cardsInScope(CARDS, scope)).toHaveLength(79);
  });

  it('returns no cards for an empty scripts array, never treating it as unrestricted', () => {
    const scope: Scope = { scripts: [], units: ['base', 'yoon'] };
    expect(cardsInScope(CARDS, scope)).toHaveLength(0);
  });

  it('returns no cards for an empty units array, never treating it as unrestricted', () => {
    const scope: Scope = { scripts: ['hiragana', 'katakana'], units: [] };
    expect(cardsInScope(CARDS, scope)).toHaveLength(0);
  });

  it('does not mutate the input cards array', () => {
    const before = [...CARDS];
    cardsInScope(CARDS, { scripts: ['hiragana'], units: ['base'] });
    expect(CARDS).toEqual(before);
  });
});
