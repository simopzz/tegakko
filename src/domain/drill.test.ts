import { describe, expect, it } from 'vitest';
import { pickRandomCard } from './drill';
import { CARDS } from './cards';
import { cardsInScope } from './scope';
import type { Card } from './cards';

function scoped(): Card[] {
  return cardsInScope([...CARDS], { scripts: ['hiragana'], units: ['base'] });
}

describe('pickRandomCard', () => {
  it('picks the card the injected RNG points at', () => {
    const cards = scoped();
    // 0.0 -> first candidate, just under 1.0 -> last.
    expect(pickRandomCard(cards, undefined, () => 0)).toBe(cards[0]);
    expect(pickRandomCard(cards, undefined, () => 0.999999)).toBe(cards[cards.length - 1]);
  });

  it('clamps a degenerate RNG returning exactly 1 to the last candidate', () => {
    // `Math.random()` never returns 1, but an injected RNG might -- an
    // out-of-range index would otherwise be `undefined`.
    const cards = scoped();
    expect(pickRandomCard(cards, undefined, () => 1)).toBe(cards[cards.length - 1]);
  });

  it('only ever returns a card from the list it was given', () => {
    const cards = scoped();
    const ids = new Set(cards.map((card) => card.cardId));
    for (let i = 0; i < 500; i++) {
      expect(ids.has(pickRandomCard(cards).cardId)).toBe(true);
    }
  });

  it('never draws the previous card again, over many draws', () => {
    // Selection is with replacement, so a card can repeat *later* in a
    // session -- but never back-to-back, so a grade always visibly advances.
    const cards = scoped();
    let previous = cards[0]!;
    for (let i = 0; i < 1000; i++) {
      const next = pickRandomCard(cards, previous);
      expect(next.cardId).not.toBe(previous.cardId);
      previous = next;
    }
  });

  it('still excludes the previous card when the RNG points straight at it', () => {
    const cards = scoped();
    const previous = cards[0]!;
    // With `previous` filtered out, index 0 is the *second* catalog card.
    expect(pickRandomCard(cards, previous, () => 0)).toBe(cards[1]);
  });

  it('repeats the only card in a one-card scope rather than failing', () => {
    const cards = scoped().slice(0, 1);
    const only = cards[0]!;
    expect(pickRandomCard(cards, only)).toBe(only);
  });

  it('throws on an empty scope rather than inventing a prompt', () => {
    expect(() => pickRandomCard([])).toThrow(/no cards in scope/);
  });

  it('can repeat a card later in a session (selection is with replacement)', () => {
    const cards = scoped().slice(0, 3);
    const seen = new Set<string>();
    let previous: Card | undefined;
    for (let i = 0; i < 200; i++) {
      previous = pickRandomCard(cards, previous);
      seen.add(previous.cardId);
    }
    // 200 draws over 3 cards: every card comes up more than once, which is
    // only possible with replacement (a queue would have exhausted).
    expect(seen.size).toBe(3);
  });
});
