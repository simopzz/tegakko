// Pure domain function -- no DOM/IndexedDB/Svelte import ever appears here
// (AD-1).
//
// Story 1.7 replaces Story 1.3's uniform-random `pickRandomCard` placeholder
// wholesale with `selectNext(attempts, scope)`: weak-spot-biased selection.
// Deliberately not a queue or a shuffle: selection is with replacement, so a
// card can repeat within a session (even back-to-back -- Story 1.3's
// never-repeats-the-previous-card behavior is gone) and the drill counter
// keeps climbing past the scope size until Story 1.9 adds closure.

import type { Card } from './cards';
import { CARDS } from './cards';
import type { Scope } from './scope';
import { cardsInScope } from './scope';
import type { Attempt } from './attempt';

const HALF_LIFE_DAYS = 7;
const MS_PER_DAY = 86_400_000;

/** Sum of `card`'s decayed incorrect-attempt weights since its last correct
 * attempt. A correct attempt zeroes every incorrect weight preceding it for
 * that card, regardless of elapsed time -- so only misses *after* the most
 * recent correct grade ever contribute. Decay is pure elapsed wall-clock
 * time from `attempt.timestamp`: `0.5 ** (elapsedDays / 7)`. */
function score(card: Card, attempts: Attempt[]): number {
  const cardAttempts = attempts
    .filter((a) => a.cardId === card.cardId)
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

  let total = 0;
  for (const attempt of cardAttempts) {
    if (attempt.selfGrade === 'correct') {
      total = 0;
      continue;
    }
    const parsed = Date.parse(attempt.timestamp);
    // A malformed `timestamp` parses to `NaN`, which would otherwise poison
    // this card's score (and, via the sum below, `totalWeight`) to `NaN` --
    // every `target < cumulative` comparison in `selectNext`'s walk then
    // evaluates false, silently falling through to always return the last
    // catalog candidate instead of sampling correctly. Skip it instead, the
    // same as if the attempt didn't exist.
    if (Number.isNaN(parsed)) continue;
    // Clamped at 0: a future-dated `timestamp` (device clock skew -- this is
    // an offline client with no server clock authority) would otherwise
    // yield a negative `elapsedDays`, and `0.5 ** (negative / 7)` grows
    // unbounded, letting one skewed attempt dominate the draw with no
    // ceiling. Clamping treats it as zero elapsed time (full weight, not
    // beyond it).
    const elapsedDays = Math.max(0, (Date.now() - parsed) / MS_PER_DAY);
    total += 0.5 ** (elapsedDays / HALF_LIFE_DAYS);
  }
  return total;
}

/** Pick the next prompt, biased toward weak spots.
 *
 * Candidates are `cardsInScope(CARDS, scope)` -- always the static catalog
 * filtered by `scope`, never a passed-in card list. Each candidate's
 * sampling weight is `1 + score` (a universal nonzero floor: even a
 * zero-miss card stays reachable, and the ratio between a heavily-missed
 * card and a clean one scales naturally with `score`). Every in-scope card
 * -- including the one just graded -- keeps a nonzero probability on every
 * draw; there is no previous-card exclusion.
 *
 * `random` is injectable purely so tests are deterministic; production
 * callers pass nothing and get `Math.random`.
 *
 * Throws on an empty-scope candidate list: an empty scope can't produce a
 * prompt, and silently returning a sentinel card would be worse than failing
 * loudly. The Scope picker is the guard -- it can only reach the drill via
 * its own pill groups, which always leave at least one script and one unit
 * selected. */
export function selectNext(
  attempts: Attempt[],
  scope: Scope,
  random: () => number = Math.random,
): Card {
  const candidates = cardsInScope(CARDS, scope);
  if (candidates.length === 0) {
    throw new Error('selectNext: no cards in scope');
  }

  const weights = candidates.map((card) => 1 + score(card, attempts));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const target = random() * totalWeight;

  let cumulative = 0;
  for (let i = 0; i < candidates.length; i++) {
    cumulative += weights[i]!;
    if (target < cumulative) {
      return candidates[i]!;
    }
  }
  // A degenerate `random() === 1` (or floating-point rounding) leaves
  // `target` at or past `totalWeight` -- clamp to the last candidate rather
  // than fall through to `undefined` (mirrors the old `pickRandomCard`'s
  // clamp).
  const last = candidates[candidates.length - 1];
  if (last === undefined) {
    throw new Error('selectNext: index out of range');
  }
  return last;
}
