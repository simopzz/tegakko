// Pure domain type + function -- no DOM/IndexedDB/Svelte import ever appears
// here (docs/adr/0001-hexagonal-boundary.md).
//
// The `tallies` IndexedDB store's record shape. Exactly two fields, ever --
// no per-card metadata beyond the running miss count
// (docs/adr/0004-session-sampled-once-by-weakness.md). Undo decrements it.

import type { Card } from './cards';

/** Per-card running count of self-graded misses. */
export interface Tally {
  cardId: string;
  missCount: number;
}

/** Count of in-scope cards whose miss count exceeds the in-scope running
 * average -- the Scope picker's "N shaky" badge. Informational
 * only: `Tally` never feeds `sampleSessionCards`' weighting -- that
 * reads `Attempt` history directly, since the count of incorrect attempts
 * for a card already equals `Tally.missCount` by construction.
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
