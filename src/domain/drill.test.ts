import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleSessionCards, undoLastGrade } from './drill';
import { CARDS } from './cards';
import { cardsInScope } from './scope';
import type { Card } from './cards';
import type { Attempt } from './attempt';
import type { Scope } from './scope';
import type { AttemptRepository } from '../ports/attempt-repository';
import type { TallyRepository } from '../ports/tally-repository';
import type { Result } from './result';
import { ok, err } from './result';

const SCOPE: Scope = { scripts: ['hiragana'], units: ['base'] };

function scoped(): Card[] {
  return cardsInScope([...CARDS], SCOPE);
}

let attemptSeq = 0;

function attempt(overrides: Partial<Attempt> & { cardId: string }): Attempt {
  attemptSeq += 1;
  return {
    id: `attempt-${attemptSeq}`,
    sessionId: 'session-1',
    timestamp: new Date().toISOString(),
    timeToFirstStrokeMs: 100,
    totalTimeMs: 200,
    strokeCount: 1,
    revealUsed: false,
    selfGrade: 'incorrect',
    strokes: [],
    ...overrides,
  };
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

describe('sampleSessionCards', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-07T12:00:00.000Z'));
    attemptSeq = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Weighting behavior (decay and floor shape): each of these pins
  // `sessionSize: 1` so a single weighted draw's outcome is directly
  // observable -- a 1-element array's `shuffle` pass is a structural no-op,
  // isolating the underlying cumulative-weight walk's behavior.
  describe('single-draw weighting (sessionSize: 1)', () => {
    it('gives every candidate the same floor weight when there is no history (uniform)', () => {
      const cards = scoped();
      // With `attempts: []` every weight is `1`: 0.0 -> first candidate,
      // just under 1.0 -> last.
      expect(sampleSessionCards([], SCOPE, 1, () => 0)).toEqual([cards[0]]);
      expect(sampleSessionCards([], SCOPE, 1, () => 0.999999)).toEqual([cards[cards.length - 1]]);
    });

    it('clamps a degenerate RNG returning exactly 1 to the last candidate', () => {
      const cards = scoped();
      expect(sampleSessionCards([], SCOPE, 1, () => 1)).toEqual([cards[cards.length - 1]]);
    });

    it('throws on an empty scope rather than inventing a queue', () => {
      expect(() => sampleSessionCards([], { scripts: [], units: [] }, 1, () => 0)).toThrow(
        /no cards in scope/,
      );
    });

    it('scores a card missed today higher than one missed 10 days ago (decay favors recency)', () => {
      const cards = scoped();
      const cardA = cards[0]!;
      const cardB = cards[1]!;
      const attempts = [
        attempt({ cardId: cardA.cardId, timestamp: daysAgo(10), selfGrade: 'incorrect' }),
        attempt({ cardId: cardB.cardId, timestamp: daysAgo(0), selfGrade: 'incorrect' }),
      ];

      // Weight(A) = 1 + 0.5^(10/7); Weight(B) = 1 + 0.5^(0/7) = 2.
      // A random draw landing exactly between A's cumulative weight and the
      // combined total picks B, proving B's slice of the distribution is
      // larger -- i.e. B is favored.
      const weightA = 1 + 0.5 ** (10 / 7);
      const weightB = 2;
      const others = cards.length - 2;
      const total = weightA + weightB + others; // every other candidate is floor 1.
      const justPastA = (weightA + 0.0001) / total;
      expect(sampleSessionCards(attempts, SCOPE, 1, () => justPastA)).toEqual([cardB]);
    });

    it('resets a corrected card to the floor -- prior misses contribute nothing', () => {
      const cards = scoped();
      const card = cards[0]!;
      const attempts = [
        attempt({ cardId: card.cardId, timestamp: daysAgo(1), selfGrade: 'incorrect' }),
        attempt({ cardId: card.cardId, timestamp: daysAgo(0.5), selfGrade: 'incorrect' }),
        attempt({ cardId: card.cardId, timestamp: daysAgo(0.1), selfGrade: 'incorrect' }),
        attempt({ cardId: card.cardId, timestamp: daysAgo(0), selfGrade: 'correct' }),
      ];

      // Every candidate -- including the corrected one -- is back at floor
      // weight 1, so this behaves exactly like the uniform no-history case.
      expect(sampleSessionCards(attempts, SCOPE, 1, () => 0)).toEqual([cards[0]]);
      expect(sampleSessionCards(attempts, SCOPE, 1, () => 0.999999)).toEqual([
        cards[cards.length - 1],
      ]);
    });

    it('lets a chronic card (many old misses) outscore a card with one recent miss', () => {
      const cards = scoped();
      const chronic = cards[0]!;
      const single = cards[1]!;
      const attempts = [
        ...Array.from({ length: 5 }, () =>
          attempt({ cardId: chronic.cardId, timestamp: daysAgo(10), selfGrade: 'incorrect' }),
        ),
        attempt({ cardId: single.cardId, timestamp: daysAgo(0), selfGrade: 'incorrect' }),
      ];

      const chronicScore = 5 * 0.5 ** (10 / 7);
      const singleScore = 1;
      expect(chronicScore).toBeGreaterThan(singleScore);

      const weightChronic = 1 + chronicScore;
      const weightSingle = 1 + singleScore;
      const others = cards.length - 2;
      const total = weightChronic + weightSingle + others;
      const justBeforeChronicEnds = (weightChronic - 0.0001) / total;
      expect(sampleSessionCards(attempts, SCOPE, 1, () => justBeforeChronicEnds)).toEqual([
        chronic,
      ]);
    });

    it('skips an attempt with a malformed timestamp instead of poisoning the score to NaN', () => {
      const cards = scoped();
      const attempts = [
        attempt({ cardId: cards[0]!.cardId, timestamp: 'not-a-real-timestamp', selfGrade: 'incorrect' }),
      ];
      // An unguarded `Date.parse` would poison this card's score -- and, via
      // the sum, `totalWeight` -- to `NaN`. Every `target < cumulative`
      // comparison in the cumulative-weight walk would then evaluate
      // `false` (NaN comparisons are never true), silently collapsing every
      // draw to the last pool candidate regardless of `random()`. Assert
      // the low end of the distribution still works, proving the malformed
      // attempt was skipped rather than poisoning anything.
      expect(sampleSessionCards(attempts, SCOPE, 1, () => 0)).toEqual([cards[0]]);
      expect(sampleSessionCards(attempts, SCOPE, 1, () => 0.999999)).toEqual([
        cards[cards.length - 1],
      ]);
    });

    it('clamps a future-dated timestamp to elapsedDays 0, capping its weight rather than letting it explode', () => {
      const cards = scoped();
      const future = cards[0]!;
      const attempts = [
        attempt({ cardId: future.cardId, timestamp: daysAgo(-10), selfGrade: 'incorrect' }),
      ];

      // Clamped weight: 1 + 0.5^(0/7) = 2. If `elapsedDays` were left
      // negative instead of clamped at 0, the weight would grow past 2
      // (0.5^(-10/7) ~ 2.64), widening this card's slice enough to still
      // contain the target below -- a target placed just past the *clamped*
      // total must land on the next candidate, proving the clamp actually
      // caps the weight at 2 rather than letting a future timestamp explode
      // it.
      const clampedWeight = 2;
      const others = cards.length - 1;
      const total = clampedWeight + others;
      const justPastClampedSlice = (clampedWeight + 0.0001) / total;
      expect(sampleSessionCards(attempts, SCOPE, 1, () => justPastClampedSlice)).toEqual([
        cards[1],
      ]);
    });
  });

  it('samples exactly min(sessionSize, candidates.length) distinct cards, all from the given scope', () => {
    const cards = scoped();
    const ids = new Set(cards.map((c) => c.cardId));
    const result = sampleSessionCards([], SCOPE, 20);

    expect(result).toHaveLength(20);
    expect(new Set(result.map((c) => c.cardId)).size).toBe(20);
    for (const c of result) expect(ids.has(c.cardId)).toBe(true);
  });

  it("samples the full scope when sessionSize >= candidates.length (the 'all' case)", () => {
    const cards = scoped();
    const result = sampleSessionCards([], SCOPE, cards.length + 50);

    expect(result).toHaveLength(cards.length);
    expect(new Set(result.map((c) => c.cardId))).toEqual(new Set(cards.map((c) => c.cardId)));
  });

  it('never draws the same card twice, even when one candidate carries overwhelming weight', () => {
    const cards = scoped();
    const heavy = cards[5]!;
    const attempts = Array.from({ length: 50 }, () =>
      attempt({ cardId: heavy.cardId, timestamp: daysAgo(0), selfGrade: 'incorrect' }),
    );

    // Real `Math.random` across several trials: an invariant (no duplicates
    // regardless of draw), not a specific draw order.
    for (let trial = 0; trial < 20; trial++) {
      const result = sampleSessionCards(attempts, SCOPE, 10);
      expect(new Set(result.map((c) => c.cardId)).size).toBe(10);
    }
  });

  it('uniform-shuffles the sampled set so weighted draw order never becomes presentation order', () => {
    const cards = scoped();
    // No history: every weight is the uniform floor of 1. A constant
    // `random() => 0` always lands the cumulative-weight walk on the first
    // remaining pool candidate, so the *unshuffled* weighted-draw order
    // would exactly equal the scope's own catalog order (`cards`, from
    // `cardsInScope`).
    const result = sampleSessionCards([], SCOPE, cards.length, () => 0);

    // Same elements...
    expect(new Set(result.map((c) => c.cardId))).toEqual(new Set(cards.map((c) => c.cardId)));
    // ...but not in that unshuffled order -- proving the shuffle step
    // actually ran: weight must not leak into presentation order.
    expect(result).not.toEqual(cards);
  });
});

function fakeAttemptRepository(
  deleteLastResult: Result<void> = ok(undefined),
): AttemptRepository & { deleteLastCalls: string[] } {
  const deleteLastCalls: string[] = [];
  return {
    deleteLastCalls,
    add: () => Promise.resolve(ok(undefined)),
    listBySession: () => Promise.resolve(ok([])),
    listAll: () => Promise.resolve(ok([])),
    deleteLast: (sessionId: string) => {
      deleteLastCalls.push(sessionId);
      return Promise.resolve(deleteLastResult);
    },
  };
}

function fakeTallyRepository(
  decrementResult: Result<void> = ok(undefined),
): TallyRepository & { decrementCalls: string[] } {
  const decrementCalls: string[] = [];
  return {
    decrementCalls,
    getAll: () => Promise.resolve(ok([])),
    increment: () => Promise.resolve(ok(undefined)),
    decrement: (cardId: string) => {
      decrementCalls.push(cardId);
      return Promise.resolve(decrementResult);
    },
  };
}

describe('undoLastGrade', () => {
  it('deletes the last attempt and decrements the tally when the grade was incorrect', async () => {
    const attemptRepository = fakeAttemptRepository();
    const tallyRepository = fakeTallyRepository();

    const result = await undoLastGrade('session-1', 'card-1', true, attemptRepository, tallyRepository);

    expect(result.ok).toBe(true);
    expect(attemptRepository.deleteLastCalls).toEqual(['session-1']);
    expect(tallyRepository.decrementCalls).toEqual(['card-1']);
  });

  it('deletes only, without decrementing, when the grade was correct', async () => {
    const attemptRepository = fakeAttemptRepository();
    const tallyRepository = fakeTallyRepository();

    const result = await undoLastGrade('session-1', 'card-1', false, attemptRepository, tallyRepository);

    expect(result.ok).toBe(true);
    expect(attemptRepository.deleteLastCalls).toEqual(['session-1']);
    expect(tallyRepository.decrementCalls).toEqual([]);
  });

  it('propagates a deleteLast failure without ever calling decrement', async () => {
    const failure = err<void>(new Error('delete failed'));
    const attemptRepository = fakeAttemptRepository(failure);
    const tallyRepository = fakeTallyRepository();

    const result = await undoLastGrade('session-1', 'card-1', true, attemptRepository, tallyRepository);

    expect(result).toBe(failure);
    expect(tallyRepository.decrementCalls).toEqual([]);
  });

  it('propagates a decrement failure', async () => {
    const attemptRepository = fakeAttemptRepository();
    const failure = err<void>(new Error('decrement failed'));
    const tallyRepository = fakeTallyRepository(failure);

    const result = await undoLastGrade('session-1', 'card-1', true, attemptRepository, tallyRepository);

    expect(result).toBe(failure);
  });
});
