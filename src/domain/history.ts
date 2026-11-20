// Pure domain type + functions -- no DOM/IndexedDB/Svelte import ever appears
// here (docs/adr/0001-hexagonal-boundary.md).
//
// The History screen: `sessionRepository.list()`'s order is
// unspecified (its port docstring), so History always imposes its own
// reverse-chronological order via `sortSessionsDescending` before rendering
// anything, and derives the sparkline's slice from that already-sorted list.

import type { ClosureReason, Session } from './session';

/** Reverse-chronological (newest first) by `date` string. A fresh array --
 * never mutates its input. Ties (equal `date`) keep their relative order
 * (`Array.prototype.sort` is a stable sort). */
export function sortSessionsDescending(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => {
    if (a.date > b.date) return -1;
    if (a.date < b.date) return 1;
    return 0;
  });
}

/** The sparkline's slice: at most the 10 most-recently-dated sessions,
 * reordered oldest -> newest (chronological ascending) so the last element
 * is always the newest -- the one bar always rendered in `--color-accent`. */
export function sparklineSessions(sortedDescending: Session[]): Session[] {
  return sortedDescending.slice(0, 10).reverse();
}

/** Five-step accuracy ramp, low -> high, linearly interpolating
 * `--color-grid-guide` (`#CCDBB2`) through `--color-positive-accent`
 * (`#56633F`) at t = 0, 0.25, 0.5, 0.75, 1.0 -- the design describes the
 * ramp only qualitatively, so these are the endpoints' own concrete
 * interpolation, not a new design decision. */
// `as const` tuple internally so indexing by the clamped `0 | 1 | 2 | 3 | 4`
// below is exhaustively typed (no `noUncheckedIndexedAccess` fallback
// needed) -- exported as a plain `readonly string[]`.
const RAMP_COLORS_TUPLE = ['#ccdbb2', '#afbd95', '#919f78', '#74815c', '#56633f'] as const;

export const RAMP_COLORS: readonly string[] = RAMP_COLORS_TUPLE;

/** Maps a `[0, 1]` accuracy onto one of `RAMP_COLORS`' five buckets.
 * `Math.min(4, ...)` keeps `accuracy === 1` inside the array -- otherwise
 * `Math.floor(1 * 5)` is `5`, one past the last valid index. */
export function rampColorForAccuracy(accuracy: number): string {
  const index = Math.min(4, Math.floor(accuracy * 5)) as 0 | 1 | 2 | 3 | 4;
  return RAMP_COLORS_TUPLE[index];
}

/** The chip variant a History row shows, driven purely by `closureReason`
 * (never by comparing `Session.scope`): `'complete'` reads as a positive
 * "Session complete" tag -- it means the sampled queue was exhausted, which
 * can be smaller than the whole scope -- `'inactivity'` as a neutral
 * "Closed on idle" tag, and `'explicit'` carries no chip at all. */
export type ClosureChipVariant = 'positive' | 'neutral' | null;

export function closureChipVariant(reason: ClosureReason): ClosureChipVariant {
  switch (reason) {
    case 'complete':
      return 'positive';
    case 'inactivity':
      return 'neutral';
    case 'explicit':
      return null;
  }
}
