import { describe, expect, it } from 'vitest';
import {
  isSessionIdle,
  isScopeComplete,
  computeAccuracy,
  buildSummary,
  buildSessionRecord,
} from './session';
import { CARDS } from './cards';
import { cardsInScope } from './scope';
import type { Scope } from './scope';
import type { Attempt } from './attempt';

const HIRAGANA_BASE_SCOPE: Scope = { scripts: ['hiragana'], units: ['base'] }; // 46 cards
const cardsInHiraganaBase = cardsInScope(CARDS, HIRAGANA_BASE_SCOPE);

function attempt(overrides: Partial<Attempt> = {}): Attempt {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    sessionId: 'session-1',
    cardId: overrides.cardId ?? cardsInHiraganaBase[0]!.cardId,
    timestamp: overrides.timestamp ?? new Date().toISOString(),
    timeToFirstStrokeMs: overrides.timeToFirstStrokeMs ?? 100,
    totalTimeMs: overrides.totalTimeMs ?? 200,
    strokeCount: overrides.strokeCount ?? 1,
    revealUsed: overrides.revealUsed ?? false,
    selfGrade: overrides.selfGrade ?? 'correct',
    strokes: overrides.strokes ?? [],
  };
}

describe('isSessionIdle', () => {
  it('is false when elapsed time is under the threshold', () => {
    expect(isSessionIdle(1000, 5000, 1000 + 4999)).toBe(false);
  });

  it('is true at exactly the threshold (inclusive boundary)', () => {
    expect(isSessionIdle(1000, 5000, 1000 + 5000)).toBe(true);
  });

  it('is true past the threshold', () => {
    expect(isSessionIdle(1000, 5000, 1000 + 5001)).toBe(true);
  });

  it('defaults `now` to Date.now() when omitted', () => {
    const lastInteractionAt = Date.now() - 10_000;
    expect(isSessionIdle(lastInteractionAt, 5000)).toBe(true);
  });

  it('is false (never idle) when the clock moved backward past the last interaction', () => {
    // Elapsed time clamps at 0 -- a backward system-clock adjustment must
    // not report idle early or throw; detection simply waits for the clock
    // to catch up (offline client, no server clock authority).
    expect(isSessionIdle(2000, 1000, 1000)).toBe(false);
  });
});

describe('isScopeComplete', () => {
  it('is false for an empty scope, never vacuously true', () => {
    const emptyScope: Scope = { scripts: [], units: [] };
    expect(isScopeComplete([], emptyScope)).toBe(false);
    expect(isScopeComplete([attempt()], emptyScope)).toBe(false);
  });

  it('is false when only some in-scope cards have an attempt', () => {
    const partial = cardsInHiraganaBase
      .slice(0, cardsInHiraganaBase.length - 1)
      .map((c) => attempt({ cardId: c.cardId }));
    expect(isScopeComplete(partial, HIRAGANA_BASE_SCOPE)).toBe(false);
  });

  it('is true once every in-scope card has at least one attempt', () => {
    const full = cardsInHiraganaBase.map((c) => attempt({ cardId: c.cardId }));
    expect(isScopeComplete(full, HIRAGANA_BASE_SCOPE)).toBe(true);
  });

  it('is true even with repeated attempts on the same cards, as long as every card is covered', () => {
    const full = cardsInHiraganaBase.map((c) => attempt({ cardId: c.cardId }));
    const withRepeats = [...full, ...full];
    expect(isScopeComplete(withRepeats, HIRAGANA_BASE_SCOPE)).toBe(true);
  });
});

describe('computeAccuracy', () => {
  it('is 0, never NaN, for zero attempts', () => {
    expect(computeAccuracy([])).toBe(0);
  });

  it('is 1 when every attempt was graded correct', () => {
    expect(computeAccuracy([attempt({ selfGrade: 'correct' }), attempt({ selfGrade: 'correct' })])).toBe(1);
  });

  it('is 0 when every attempt was graded incorrect', () => {
    expect(computeAccuracy([attempt({ selfGrade: 'incorrect' })])).toBe(0);
  });

  it('computes correct / total for a mixed set', () => {
    const attempts = [
      attempt({ selfGrade: 'correct' }),
      attempt({ selfGrade: 'correct' }),
      attempt({ selfGrade: 'incorrect' }),
      attempt({ selfGrade: 'incorrect' }),
    ];
    expect(computeAccuracy(attempts)).toBe(0.5);
  });
});

describe('buildSummary', () => {
  it('dedupes repeated misses on the same card into one chip with the final tally', () => {
    const card = cardsInHiraganaBase[0]!;
    const attempts = [
      attempt({ cardId: card.cardId, selfGrade: 'incorrect' }),
      attempt({ cardId: card.cardId, selfGrade: 'incorrect' }),
    ];
    const tallies = new Map([[card.cardId, 5]]);

    const summary = buildSummary(attempts, tallies, 'explicit', 60_000);

    expect(summary.missed).toEqual([
      { cardId: card.cardId, grapheme: card.grapheme, script: card.script, tallyCount: 5 },
    ]);
  });

  it('never includes a card that was only ever graded correct', () => {
    const card = cardsInHiraganaBase[0]!;
    const attempts = [attempt({ cardId: card.cardId, selfGrade: 'correct' })];

    const summary = buildSummary(attempts, new Map(), 'explicit', 0);

    expect(summary.missed).toEqual([]);
  });

  it('counts revealCount from revealUsed across all attempts', () => {
    const attempts = [
      attempt({ revealUsed: true }),
      attempt({ revealUsed: false }),
      attempt({ revealUsed: true }),
    ];

    const summary = buildSummary(attempts, new Map(), 'explicit', 0);

    expect(summary.revealCount).toBe(2);
  });

  it('carries closureReason and timeMs through unchanged', () => {
    const summary = buildSummary([], new Map(), 'inactivity', 12_345);

    expect(summary.closureReason).toBe('inactivity');
    expect(summary.timeMs).toBe(12_345);
  });

  it('computes accuracy from the given attempts, 0 when there were none', () => {
    const summary = buildSummary([], new Map(), 'explicit', 0);

    expect(summary.accuracy).toBe(0);
  });
});

describe('buildSessionRecord', () => {
  it('builds the epic-fixed schema, with cardsAttempted as attempt count (not distinct cards)', () => {
    const card = cardsInHiraganaBase[0]!;
    const attempts = [
      attempt({ cardId: card.cardId, selfGrade: 'correct' }),
      attempt({ cardId: card.cardId, selfGrade: 'incorrect' }),
    ];

    const record = buildSessionRecord('session-1', HIRAGANA_BASE_SCOPE, attempts, 'full-scope', '2026-09-08T00:00:00.000Z');

    expect(record).toEqual({
      id: 'session-1',
      date: '2026-09-08T00:00:00.000Z',
      scope: HIRAGANA_BASE_SCOPE,
      cardsAttempted: 2,
      accuracy: 0.5,
      closureReason: 'full-scope',
    });
  });

  it('has cardsAttempted 0 and accuracy 0 for a zero-attempt closure', () => {
    const record = buildSessionRecord('session-2', HIRAGANA_BASE_SCOPE, [], 'explicit', '2026-09-08T00:00:00.000Z');

    expect(record.cardsAttempted).toBe(0);
    expect(record.accuracy).toBe(0);
  });
});
