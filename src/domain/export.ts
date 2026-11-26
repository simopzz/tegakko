// Pure domain types + functions -- no DOM/IndexedDB/Svelte import ever
// appears here (docs/adr/0001-hexagonal-boundary.md).
//
// The export envelope (docs/adr/0003-import-replaces-never-merges.md).
// Defined once here so import validates -- and restores -- exactly what
// export produces. Settings are
// deliberately out of scope: only tallies, attempts, and sessions travel.

import type { Attempt } from './attempt';
import type { Stroke } from './ink';
import type { Session } from './session';
import type { WidthPreset } from './settings';
import type { Tally } from './tally';

/** The envelope's schema version. Import rejects any other value. */
// v3: `scope` became one entry per script, that script's own Sets listed
// under it. Older backups are rejected by the version check, never
// partially reinterpreted.
export const EXPORT_VERSION = 3;

/** A stroke in compact form: each point is an `[x, y, pressure]` triple,
 * every number rounded to 4 decimals (~0.04px on a 400px cell, below visible
 * resolution). Stroke order and point order are preserved. */
export interface StrokeExport {
  widthPreset: WidthPreset;
  points: [number, number, number][];
}

/** Every `Attempt` field, with `strokes` in compact form. Derived from
 * `Attempt` so a new `Attempt` field makes `toAttemptExport`'s explicit
 * literal fail to type-check instead of silently dropping from backups. */
export type AttemptExport = Omit<Attempt, 'strokes'> & { strokes: StrokeExport[] };

/** Exhaustive over `keyof Attempt` -- `Omit` alone only catches new
 * *required* fields; a new optional one would drop silently. Adding any
 * `Attempt` field breaks this until it is listed here (and the test then
 * demands `toAttemptExport` copy it). */
export const ATTEMPT_EXPORT_KEYS = {
  id: true,
  sessionId: true,
  cardId: true,
  timestamp: true,
  timeToFirstStrokeMs: true,
  totalTimeMs: true,
  strokeCount: true,
  revealUsed: true,
  selfGrade: true,
  algorithmGrade: true,
  algorithmConfidence: true,
  overridden: true,
  strokes: true,
} as const satisfies Record<keyof Attempt, true>;

export interface ExportEnvelope {
  version: typeof EXPORT_VERSION;
  /** ISO-8601. Import shows this as the incoming file's date. */
  exportedAt: string;
  tallies: Tally[];
  attempts: AttemptExport[];
  sessions: Session[];
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export function toStrokeExport(stroke: Stroke): StrokeExport {
  return {
    widthPreset: stroke.widthPreset,
    points: stroke.points.map((point) => [round4(point.x), round4(point.y), round4(point.pressure)]),
  };
}

/** Explicit field-by-field copy (an allowlist) -- never a spread of the
 * stored record, so nothing unlisted can leak into the file. */
export function toAttemptExport(attempt: Attempt): AttemptExport {
  return {
    id: attempt.id,
    sessionId: attempt.sessionId,
    cardId: attempt.cardId,
    timestamp: attempt.timestamp,
    timeToFirstStrokeMs: attempt.timeToFirstStrokeMs,
    totalTimeMs: attempt.totalTimeMs,
    strokeCount: attempt.strokeCount,
    revealUsed: attempt.revealUsed,
    selfGrade: attempt.selfGrade,
    algorithmGrade: attempt.algorithmGrade,
    algorithmConfidence: attempt.algorithmConfidence,
    overridden: attempt.overridden,
    strokes: attempt.strokes.map(toStrokeExport),
  };
}

export function buildExportEnvelope(
  tallies: Tally[],
  attempts: Attempt[],
  sessions: Session[],
  now: Date,
): ExportEnvelope {
  return {
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    tallies,
    attempts: attempts.map(toAttemptExport),
    sessions,
  };
}

/** `tegakko-export-YYYY-MM-DD.json`, using the *local* date -- the date the
 * learner sees on their device, not UTC's. */
export function exportFileName(now: Date): string {
  const year = String(now.getFullYear()).padStart(4, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `tegakko-export-${year}-${month}-${day}.json`;
}
