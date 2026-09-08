import { describe, expect, it } from 'vitest';
import {
  sortSessionsDescending,
  sparklineSessions,
  rampColorForAccuracy,
  closureChipVariant,
  RAMP_COLORS,
} from './history';
import type { Session } from './session';

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    date: overrides.date ?? '2026-09-01T00:00:00.000Z',
    scope: overrides.scope ?? { scripts: ['hiragana'], units: ['base'] },
    cardsAttempted: overrides.cardsAttempted ?? 10,
    accuracy: overrides.accuracy ?? 0.5,
    closureReason: overrides.closureReason ?? 'explicit',
  };
}

describe('sortSessionsDescending', () => {
  it('orders mixed dates newest first', () => {
    const oldest = session({ id: 'a', date: '2026-01-01T00:00:00.000Z' });
    const newest = session({ id: 'b', date: '2026-03-01T00:00:00.000Z' });
    const middle = session({ id: 'c', date: '2026-02-01T00:00:00.000Z' });

    const result = sortSessionsDescending([oldest, newest, middle]);

    expect(result.map((s) => s.id)).toEqual(['b', 'c', 'a']);
  });

  it('preserves relative order for equal dates (stable sort)', () => {
    const first = session({ id: 'first', date: '2026-05-01T00:00:00.000Z' });
    const second = session({ id: 'second', date: '2026-05-01T00:00:00.000Z' });

    const result = sortSessionsDescending([first, second]);

    expect(result.map((s) => s.id)).toEqual(['first', 'second']);
  });

  it('returns a new array, never mutating the input', () => {
    const input = [session({ id: 'a', date: '2026-01-01T00:00:00.000Z' })];
    const result = sortSessionsDescending(input);

    expect(result).not.toBe(input);
  });

  it('handles an empty list', () => {
    expect(sortSessionsDescending([])).toEqual([]);
  });
});

describe('sparklineSessions', () => {
  it('truncates to the latest 10, reordered oldest -> newest', () => {
    // Deliberately already-sorted descending (as `History.svelte` always
    // hands it), ids "0" (newest) .. "14" (oldest).
    const sortedDescending = Array.from({ length: 15 }, (_, i) =>
      session({ id: String(i), date: `2026-01-${String(15 - i).padStart(2, '0')}T00:00:00.000Z` }),
    );

    const result = sparklineSessions(sortedDescending);

    expect(result).toHaveLength(10);
    // Oldest of the kept 10 first, newest ("0") last.
    expect(result.map((s) => s.id)).toEqual(['9', '8', '7', '6', '5', '4', '3', '2', '1', '0']);
  });

  it('returns everything, reversed, when there are 10 or fewer sessions', () => {
    const sortedDescending = [
      session({ id: 'newer', date: '2026-02-01T00:00:00.000Z' }),
      session({ id: 'older', date: '2026-01-01T00:00:00.000Z' }),
    ];

    const result = sparklineSessions(sortedDescending);

    expect(result.map((s) => s.id)).toEqual(['older', 'newer']);
  });

  it('handles an empty list', () => {
    expect(sparklineSessions([])).toEqual([]);
  });
});

describe('rampColorForAccuracy', () => {
  it('maps 0 to the lowest ramp step', () => {
    expect(rampColorForAccuracy(0)).toBe(RAMP_COLORS[0]);
  });

  it('maps 0.2 to the second step (bucket boundary)', () => {
    expect(rampColorForAccuracy(0.2)).toBe(RAMP_COLORS[1]);
  });

  it('maps 0.4 to the third step (bucket boundary)', () => {
    expect(rampColorForAccuracy(0.4)).toBe(RAMP_COLORS[2]);
  });

  it('maps 0.6 to the fourth step (bucket boundary)', () => {
    expect(rampColorForAccuracy(0.6)).toBe(RAMP_COLORS[3]);
  });

  it('maps 0.8 to the fifth step (bucket boundary)', () => {
    expect(rampColorForAccuracy(0.8)).toBe(RAMP_COLORS[4]);
  });

  it('maps 1.0 to the fifth step, not overflowing past the array', () => {
    expect(rampColorForAccuracy(1.0)).toBe(RAMP_COLORS[4]);
  });
});

describe('closureChipVariant', () => {
  it('maps full-scope to positive', () => {
    expect(closureChipVariant('full-scope')).toBe('positive');
  });

  it('maps inactivity to neutral', () => {
    expect(closureChipVariant('inactivity')).toBe('neutral');
  });

  it('maps explicit to null (no chip)', () => {
    expect(closureChipVariant('explicit')).toBeNull();
  });
});
