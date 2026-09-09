import { describe, expect, it } from 'vitest';
import { CARDS } from './cards';
import { cardsInScope, FULL_SCOPE, resolveSessionSize, type Scope } from './scope';

describe('cardsInScope', () => {
  it('returns the full 208-card catalog for the full-scope default', () => {
    expect(cardsInScope(CARDS, FULL_SCOPE)).toHaveLength(208);
  });

  it('narrows to hiragana + base only (71 cards)', () => {
    const scope: Scope = { scripts: ['hiragana'], units: ['base'] };
    const result = cardsInScope(CARDS, scope);
    expect(result).toHaveLength(71);
    expect(result.every((c) => c.script === 'hiragana' && c.kind === 'base')).toBe(true);
  });

  it('narrows to katakana + yoon only (33 cards)', () => {
    const scope: Scope = { scripts: ['katakana'], units: ['yoon'] };
    const result = cardsInScope(CARDS, scope);
    expect(result).toHaveLength(33);
    expect(result.every((c) => c.script === 'katakana' && c.kind === 'yoon')).toBe(true);
  });

  it('narrows to both scripts but base only (142 cards)', () => {
    const scope: Scope = { scripts: ['hiragana', 'katakana'], units: ['base'] };
    expect(cardsInScope(CARDS, scope)).toHaveLength(142);
  });

  it('narrows to hiragana only, both units (104 cards)', () => {
    const scope: Scope = { scripts: ['hiragana'], units: ['base', 'yoon'] };
    expect(cardsInScope(CARDS, scope)).toHaveLength(104);
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

describe('resolveSessionSize', () => {
  it("returns the full scoped count unchanged for 'all', matching prior default behavior", () => {
    expect(resolveSessionSize('all', 208)).toBe(208);
    expect(resolveSessionSize('all', 1)).toBe(1);
  });

  it('rounds each percent preset against the given scoped count', () => {
    expect(resolveSessionSize(0.25, 208)).toBe(52);
    expect(resolveSessionSize(0.5, 208)).toBe(104);
    expect(resolveSessionSize(0.75, 208)).toBe(156);
  });

  it('rounds to a minimum of 1, never 0, at a tiny scoped count', () => {
    // The I/O matrix's exact edge case: Math.round(0.25 * 3) === 1 already,
    // but the floor is what guarantees this for any input that would
    // otherwise round to 0 (e.g. a 1-card scope at 25%).
    expect(resolveSessionSize(0.25, 3)).toBe(1);
    expect(resolveSessionSize(0.25, 1)).toBe(1);
  });

  it('rounds to the nearest whole card, not merely floors', () => {
    // Math.round(0.25 * 5) = Math.round(1.25) = 1; Math.round(0.75 * 5) =
    // Math.round(3.75) = 4 -- proves this rounds rather than always
    // flooring or ceiling.
    expect(resolveSessionSize(0.25, 5)).toBe(1);
    expect(resolveSessionSize(0.75, 5)).toBe(4);
  });
});
