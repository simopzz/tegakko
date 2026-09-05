// Pure domain function -- no DOM/IndexedDB/Svelte import ever appears here
// (AD-1).
//
// Story 1.3's *placeholder* selection: uniform random, with replacement.
// Story 1.7 replaces this wholesale with `selectNext(attempts, scope)`,
// weak-spot-biased. Deliberately not a queue or a shuffle: selection is with
// replacement, so a card can repeat within a session and the drill counter
// keeps climbing past the scope size until Story 1.9 adds closure.

import type { Card } from './cards';

/** Pick the next prompt uniformly at random from `cards`.
 *
 * `previous` (the card just graded) is excluded from the draw so a grade
 * always visibly advances the prompt -- unless the scope holds a single
 * card, where there is nothing else to pick and repeating it is correct.
 *
 * `random` is injectable purely so tests are deterministic; production
 * callers pass nothing and get `Math.random`.
 *
 * Throws on an empty `cards` array: an empty scope can't produce a prompt,
 * and silently returning a sentinel card would be worse than failing loudly.
 * The Scope picker is the guard -- it can only reach the drill via its own
 * pill groups, which always leave at least one script and one unit selected. */
export function pickRandomCard(
  cards: Card[],
  previous?: Card,
  random: () => number = Math.random,
): Card {
  if (cards.length === 0) {
    throw new Error('pickRandomCard: no cards in scope');
  }
  const candidates =
    previous === undefined ? cards : cards.filter((card) => card.cardId !== previous.cardId);
  // Every candidate was the previous card -- a one-card scope (or a scope of
  // duplicates of it). Repeat rather than fail.
  const pool = candidates.length > 0 ? candidates : cards;
  const index = Math.min(pool.length - 1, Math.max(0, Math.floor(random() * pool.length)));
  const picked = pool[index];
  if (picked === undefined) {
    // Unreachable given the clamp above; satisfies `noUncheckedIndexedAccess`
    // without an assertion that could hide a real bug later.
    throw new Error('pickRandomCard: index out of range');
  }
  return picked;
}
