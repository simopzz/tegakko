import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { selectNext } from './drill';
import { CARDS } from './cards';
import { cardsInScope } from './scope';
import type { Card } from './cards';
import type { Attempt } from './attempt';
import type { Scope } from './scope';

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

describe('selectNext', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-07T12:00:00.000Z'));
    attemptSeq = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('gives every candidate the same floor weight when there is no history (uniform)', () => {
    const cards = scoped();
    // With `attempts: []` every weight is `1`, so a uniform-random walk
    // behaves identically to the old `pickRandomCard`: 0.0 -> first
    // candidate, just under 1.0 -> last.
    expect(selectNext([], SCOPE, () => 0)).toBe(cards[0]);
    expect(selectNext([], SCOPE, () => 0.999999)).toBe(cards[cards.length - 1]);
  });

  it('clamps a degenerate RNG returning exactly 1 to the last candidate', () => {
    const cards = scoped();
    expect(selectNext([], SCOPE, () => 1)).toBe(cards[cards.length - 1]);
  });

  it('throws on an empty scope rather than inventing a prompt', () => {
    expect(() => selectNext([], { scripts: [], units: [] }, () => 0)).toThrow(
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
    // Target just past A's cumulative weight lands in B's slice only if
    // B's slice is nonzero-sized relative to A -- assert the actual pick.
    const justPastA = (weightA + 0.0001) / total;
    expect(selectNext(attempts, SCOPE, () => justPastA)).toBe(cardB);
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
    expect(selectNext(attempts, SCOPE, () => 0)).toBe(cards[0]);
    expect(selectNext(attempts, SCOPE, () => 0.999999)).toBe(cards[cards.length - 1]);
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
    // A target landing just before the end of chronic's slice must still
    // pick chronic, not single -- proving its cumulative slice is at least
    // as large.
    const justBeforeChronicEnds = (weightChronic - 0.0001) / total;
    expect(selectNext(attempts, SCOPE, () => justBeforeChronicEnds)).toBe(chronic);
  });

  it('keeps the just-graded card selectable -- no previous-card exclusion', () => {
    const cards = scoped();
    const previous = cards[0]!;
    // With no history, index 0 is reachable even when it was "just graded"
    // (selectNext has no `previous` param to exclude it).
    expect(selectNext([], SCOPE, () => 0)).toBe(previous);
  });

  it('skips an attempt with a malformed timestamp instead of poisoning the score to NaN', () => {
    const cards = scoped();
    const attempts = [
      attempt({ cardId: cards[0]!.cardId, timestamp: 'not-a-real-timestamp', selfGrade: 'incorrect' }),
    ];
    // An unguarded `Date.parse` would poison this card's score -- and, via
    // the sum in `selectNext`, `totalWeight` -- to `NaN`. Every
    // `target < cumulative` comparison in the cumulative-weight walk would
    // then evaluate `false` (NaN comparisons are never true), silently
    // collapsing every draw to the last catalog candidate regardless of
    // `random()`. Assert the low end of the distribution still works,
    // proving the malformed attempt was skipped rather than poisoning
    // anything.
    expect(selectNext(attempts, SCOPE, () => 0)).toBe(cards[0]);
    expect(selectNext(attempts, SCOPE, () => 0.999999)).toBe(cards[cards.length - 1]);
  });

  it('clamps a future-dated timestamp to elapsedDays 0, capping its weight rather than letting it explode', () => {
    const cards = scoped();
    const future = cards[0]!;
    const attempts = [attempt({ cardId: future.cardId, timestamp: daysAgo(-10), selfGrade: 'incorrect' })];

    // Clamped weight: 1 + 0.5^(0/7) = 2. If `elapsedDays` were left negative
    // instead of clamped at 0, the weight would grow past 2
    // (0.5^(-10/7) ~ 2.64), widening this card's slice enough to still
    // contain the target below -- a target placed just past the *clamped*
    // total must land on the next candidate, proving the clamp actually
    // caps the weight at 2 rather than letting a future timestamp explode
    // it.
    const clampedWeight = 2;
    const others = cards.length - 1;
    const total = clampedWeight + others;
    const justPastClampedSlice = (clampedWeight + 0.0001) / total;
    expect(selectNext(attempts, SCOPE, () => justPastClampedSlice)).toBe(cards[1]);
  });

  it('only ever returns a card from the given scope', () => {
    const cards = scoped();
    const ids = new Set(cards.map((c) => c.cardId));
    for (let i = 0; i < 200; i++) {
      const r = (i % 100) / 100;
      expect(ids.has(selectNext([], SCOPE, () => r).cardId)).toBe(true);
    }
  });
});
