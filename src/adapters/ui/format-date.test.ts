import { describe, expect, it } from 'vitest';
import { formatDate } from './format-date';

describe('formatDate', () => {
  it('renders a short date with month name, day, and year', () => {
    // Noon UTC: renders Sep 3 in every timezone from UTC-12 to UTC+11, so
    // this literal stays green wherever `just check` runs.
    expect(formatDate('2026-09-03T12:00:00.000Z')).toBe('Sep 3, 2026');
  });

  it('never passes the ISO string through unchanged', () => {
    const iso = '2026-09-03T12:00:00.000Z';
    expect(formatDate(iso)).not.toBe(iso);
  });
});
