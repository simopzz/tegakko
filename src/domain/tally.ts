// Pure domain type + function -- no DOM/IndexedDB/Svelte import ever appears
// here (AD-1).
//
// The `tallies` IndexedDB store's record shape (AD-4/AD-11, Story 1.6).
// Exactly two fields, ever -- no per-card metadata beyond the running miss
// count. Story 1.7 reads this for weak-spot weighting; Story 1.8 decrements
// it on undo.

import type { Card } from './cards';

/** Per-card running count of self-graded misses. */
export interface Tally {
  cardId: string;
  missCount: number;
}

/** Count of in-scope cards whose miss tally exceeds the in-scope running
 * average -- the Scope picker's "N shaky" badge (Story 1.7). Informational
 * only: it never feeds `selectNext`'s weighting.
 *
 * `average = totalMiss / cardsInScope.length` (0 for an empty scope); a card
 * exactly at the average does not count (strict `>`), so an all-zero scope
 * -- and a tie -- both read as "0 shaky", never a false positive. */
export function countShaky(cardsInScope: Card[], tallies: Tally[]): number {
  const missByCardId = new Map<string, number>(tallies.map((t) => [t.cardId, t.missCount]));
  if (cardsInScope.length === 0) return 0;
  const totalMiss = cardsInScope.reduce(
    (sum, card) => sum + (missByCardId.get(card.cardId) ?? 0),
    0,
  );
  const average = totalMiss / cardsInScope.length;
  return cardsInScope.filter((card) => (missByCardId.get(card.cardId) ?? 0) > average).length;
}
