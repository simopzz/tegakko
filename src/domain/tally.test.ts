import { describe, expect, it } from 'vitest';
import { countShaky } from './tally';
import { CARDS } from './cards';
import type { Card } from './cards';
import type { Tally } from './tally';

function scoped(count: number): Card[] {
  return CARDS.filter((c) => c.script === 'hiragana' && c.set === 'base').slice(0, count);
}

describe('countShaky', () => {
  it('returns 0 for an empty scope', () => {
    expect(countShaky([], [{ cardId: 'x', missCount: 5 }])).toBe(0);
  });

  it('returns 0 when every in-scope tally is 0 (no tallies at all)', () => {
    const cards = scoped(5);
    expect(countShaky(cards, [])).toBe(0);
  });

  it('counts a card whose miss tally exceeds the in-scope average', () => {
    const cards = scoped(3);
    const [a] = cards;
    // Misses: a=3, others=0 -- average = 1, only a exceeds it.
    const tallies: Tally[] = [{ cardId: a!.cardId, missCount: 3 }];
    expect(countShaky(cards, tallies)).toBe(1);
  });

  it('excludes a card sitting exactly at the average (strict greater-than)', () => {
    const cards = scoped(2);
    const [a, b] = cards;
    // Misses: a=2, b=2 -- average = 2, neither exceeds it.
    const tallies: Tally[] = [
      { cardId: a!.cardId, missCount: 2 },
      { cardId: b!.cardId, missCount: 2 },
    ];
    expect(countShaky(cards, tallies)).toBe(0);
  });

  it('ignores tallies for cards outside the given scope', () => {
    const cards = scoped(2);
    const outside = CARDS.find((c) => !cards.includes(c))!;
    const tallies: Tally[] = [{ cardId: outside.cardId, missCount: 50 }];
    expect(countShaky(cards, tallies)).toBe(0);
  });
});
