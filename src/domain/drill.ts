// Pure domain function -- no DOM/IndexedDB/Svelte import ever appears here
// (docs/adr/0001-hexagonal-boundary.md).
//
// Weak-spot bias governs **session sampling**, not per-draw reselection
// (docs/adr/0004-session-sampled-once-by-weakness.md). `sampleSessionCards(
// attempts, scope, sessionSize)` is called exactly once, at session start --
// it draws `min(sessionSize, candidates.length)` distinct cards via
// sequential weighted removal without replacement (`weightedPickIndex`),
// then uniform-shuffles the drawn set so sampling weight never leaks into
// presentation order. Drill advances through the resulting fixed queue;
// closure fires on queue exhaustion -- exact, never probabilistic.

import type { Card } from './cards';
import { CARDS } from './cards';
import type { Scope } from './scope';
import { cardsInScope } from './scope';
import type { Attempt } from './attempt';
import type { AttemptRepository } from '../ports/attempt-repository';
import type { TallyRepository } from '../ports/tally-repository';
import { ok, type Result } from './result';

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
    // every `target < cumulative` comparison in `weightedPickIndex`'s walk
    // (below) then evaluates false, silently falling through to always pick
    // the last candidate in the pool instead of sampling correctly. Skip it
    // instead, the same as if the attempt didn't exist.
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

/** Draws one index from `weights` via the cumulative-weight walk.
 * `sampleSessionCards` calls it in a loop against a shrinking pool -- simpler
 * than a dedicated weighted-sampling algorithm and fast enough at catalog
 * sizes. A degenerate `random() === 1` (or floating-point rounding) leaves
 * `target` at or past `totalWeight` -- clamp to the last index rather than
 * fall through to `undefined`. */
function weightedPickIndex(weights: number[], random: () => number): number {
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const target = random() * totalWeight;

  let cumulative = 0;
  for (let i = 0; i < weights.length; i++) {
    cumulative += weights[i]!;
    if (target < cumulative) {
      return i;
    }
  }
  return weights.length - 1;
}

/** In-place-free uniform (Fisher-Yates) shuffle -- returns a new array,
 * never mutates `items`. Decouples presentation order from the weighted
 * draw order above: weight decides *which* cards come up, never their order.
 * `random` shares the same injection
 * point as `weightedPickIndex`/`sampleSessionCards` for deterministic
 * tests. */
function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const temp = result[i]!;
    result[i] = result[j]!;
    result[j] = temp;
  }
  return result;
}

/** Sample this session's card queue, biased toward weak spots.
 *
 * Candidates are `cardsInScope(CARDS, scope)` -- always the static catalog
 * filtered by `scope`, never a passed-in card list. Draws
 * `min(sessionSize, candidates.length)` cards via **sequential weighted
 * removal without replacement**: each draw's weight is `1 + score` (a
 * universal nonzero floor -- even a zero-miss card stays reachable, and the
 * ratio between a heavily-missed card and a clean one scales naturally with
 * `score`), the drawn candidate is removed from the pool, and the pool's
 * total weight is recomputed before the next draw -- so the same card can
 * never be sampled twice into one session. The drawn set is then
 * **uniform-shuffled** (`shuffle`, above) before returning, so *which* cards
 * get sampled (weighted) is decoupled from *what order* they're presented in
 * (unweighted).
 *
 * Called exactly once, at session start -- never re-invoked mid-session:
 * a miss recorded mid-session affects only the *next* session's
 * sample, not this one's already-fixed queue.
 *
 * `random` is injectable purely so tests are deterministic; production
 * callers pass nothing and get `Math.random`.
 *
 * Throws on an empty-scope candidate list: an empty scope can't produce a
 * queue, and silently returning an empty/sentinel result would be worse than
 * failing loudly. The Scope picker is the guard -- it can only reach the
 * drill with at least one script selected, each selected script keeping at
 * least one Set. */
export function sampleSessionCards(
  attempts: Attempt[],
  scope: Scope,
  sessionSize: number,
  random: () => number = Math.random,
): Card[] {
  const candidates = cardsInScope(CARDS, scope);
  if (candidates.length === 0) {
    throw new Error('sampleSessionCards: no cards in scope');
  }

  const pool = [...candidates];
  // Each candidate's score depends only on `attempts` (fixed for the whole
  // call), never on which other candidates remain in the pool -- computed
  // once here, then kept in lockstep with `pool` (same index removed from
  // both per draw) rather than recomputed from scratch every iteration.
  const weights = pool.map((card) => 1 + score(card, attempts));
  const drawCount = Math.min(sessionSize, pool.length);
  const sampled: Card[] = [];
  for (let i = 0; i < drawCount; i++) {
    const index = weightedPickIndex(weights, random);
    sampled.push(pool[index]!);
    pool.splice(index, 1);
    weights.splice(index, 1);
  }

  return shuffle(sampled, random);
}

/** Reverse the just-graded attempt: atomically sequences
 * `attemptRepository.deleteLast(sessionId)` then, only when the grade being
 * undone was `'incorrect'`, `tallyRepository.decrement(cardId)`. A `'correct'`
 * grade never touched the tally, so undoing one never calls `decrement`
 * either. Returns early on a failed `deleteLast` -- never attempts the
 * decrement over a delete that didn't happen. */
export async function undoLastGrade(
  sessionId: string,
  cardId: string,
  wasIncorrect: boolean,
  attemptRepository: AttemptRepository,
  tallyRepository: TallyRepository,
): Promise<Result<void>> {
  const deleted = await attemptRepository.deleteLast(sessionId);
  if (!deleted.ok) return deleted;
  if (wasIncorrect) return tallyRepository.decrement(cardId);
  return ok(undefined);
}
