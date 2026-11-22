// Pure domain types + functions -- no DOM/IndexedDB/Svelte import ever
// appears here (docs/adr/0001-hexagonal-boundary.md).
//
// The import schema: validates exactly what `buildExportEnvelope`
// produces (`domain/export.ts`) and expands it back
// into the persisted record shapes. Input is `unknown` and is only ever
// narrowed here, field by field -- every record is rebuilt fresh, so any
// unknown extra field is dropped rather than spread through into storage.

import type { Attempt, SelfGrade } from './attempt';
import { CARDS, type CardSet, type Script } from './cards';
import { EXPORT_VERSION } from './export';
import type { Stroke, StrokePoint } from './ink';
import { err, ok, type Result } from './result';
import type { ClosureReason, Session } from './session';
import type { Scope } from './scope';
import type { WidthPreset } from './settings';
import type { Tally } from './tally';

/** Everything an import replaces -- settings never travel. */
export interface ImportData {
  tallies: Tally[];
  attempts: Attempt[];
  sessions: Session[];
}

export interface ValidatedImport {
  /** The file's own `exportedAt` (ISO-8601) -- the "In the file" date. */
  exportedAt: string;
  data: ImportData;
}

/** `invalid`: the file isn't a tegakko backup (parse or schema failure).
 * `failed`: the file was fine but something else (a local read, the
 * replace) went wrong. The UI shows different copy for each. */
export type ImportErrorKind = 'invalid' | 'failed';

export class ImportError extends Error {
  readonly kind: ImportErrorKind;

  constructor(kind: ImportErrorKind, message: string) {
    super(message);
    this.name = 'ImportError';
    this.kind = kind;
  }
}

export function isInvalidImportError(error: unknown): boolean {
  return error instanceof ImportError && error.kind === 'invalid';
}

const SELF_GRADES: readonly SelfGrade[] = ['correct', 'incorrect'];
const CLOSURE_REASONS: readonly ClosureReason[] = ['explicit', 'complete', 'inactivity'];
const WIDTH_PRESETS: readonly WidthPreset[] = ['subtle', 'expressive', 'calligraphy'];
const SCRIPTS: readonly Script[] = ['hiragana', 'katakana', 'kanji'];
const CARD_SETS: readonly CardSet[] = ['base', 'yoon', 'n5', 'n4', 'n3', 'n2', 'n1'];
const CARD_IDS: ReadonlySet<string> = new Set(CARDS.map((card) => card.cardId));

/** Thrown only inside this module and caught by `validateImport` -- never
 * escapes it. Carries the first failing path. */
class SchemaError extends Error {}

function fail(path: string, expected: string): never {
  throw new SchemaError(`${path}: expected ${expected}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) fail(path, 'an object');
  return value;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, 'an array');
  return value;
}

function string(value: unknown, path: string): string {
  if (typeof value !== 'string') fail(path, 'a string');
  return value;
}

function finite(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'a finite number');
  return value;
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail(path, 'a boolean');
  return value;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    fail(path, `one of ${allowed.join(', ')}`);
  }
  return value as T;
}

function isoDate(value: unknown, path: string): string {
  const text = string(value, path);
  // Exact ISO-8601 round trip only: History sorts dates as raw strings, so
  // a merely parseable "2026" or "Sep 1 2026" would misorder.
  if (Number.isNaN(Date.parse(text)) || new Date(text).toISOString() !== text) {
    fail(path, 'an ISO-8601 date');
  }
  return text;
}

function cardId(value: unknown, path: string): string {
  // NFC, matching how `domain/cards.ts` builds every catalog id.
  const id = string(value, path).normalize('NFC');
  if (!CARD_IDS.has(id)) fail(path, 'a known card id');
  return id;
}

function unique(seen: Set<string>, key: string, path: string): void {
  if (seen.has(key)) fail(path, 'a unique value');
  seen.add(key);
}

function toTally(value: unknown, path: string): Tally {
  const source = record(value, path);
  return {
    cardId: cardId(source.cardId, `${path}.cardId`),
    missCount: finite(source.missCount, `${path}.missCount`),
  };
}

function toPoint(value: unknown, path: string): StrokePoint {
  const triple = array(value, path);
  if (triple.length !== 3) fail(path, 'an [x, y, pressure] triple');
  // No range check on x/y: live strokes can leave the cell.
  return {
    x: finite(triple[0], `${path}[0]`),
    y: finite(triple[1], `${path}[1]`),
    pressure: finite(triple[2], `${path}[2]`),
  };
}

function toStroke(value: unknown, path: string): Stroke {
  const source = record(value, path);
  return {
    points: array(source.points, `${path}.points`).map((point, index) =>
      toPoint(point, `${path}.points[${index}]`),
    ),
    widthPreset: oneOf(source.widthPreset, WIDTH_PRESETS, `${path}.widthPreset`),
  };
}

function toAttempt(value: unknown, path: string): Attempt {
  const source = record(value, path);
  return {
    id: string(source.id, `${path}.id`),
    sessionId: string(source.sessionId, `${path}.sessionId`),
    cardId: cardId(source.cardId, `${path}.cardId`),
    timestamp: isoDate(source.timestamp, `${path}.timestamp`),
    timeToFirstStrokeMs: finite(source.timeToFirstStrokeMs, `${path}.timeToFirstStrokeMs`),
    totalTimeMs: finite(source.totalTimeMs, `${path}.totalTimeMs`),
    strokeCount: finite(source.strokeCount, `${path}.strokeCount`),
    revealUsed: boolean(source.revealUsed, `${path}.revealUsed`),
    selfGrade: oneOf(source.selfGrade, SELF_GRADES, `${path}.selfGrade`),
    strokes: array(source.strokes, `${path}.strokes`).map((stroke, index) =>
      toStroke(stroke, `${path}.strokes[${index}]`),
    ),
  };
}

/** Parses a scope's per-script entries. Absent scripts are unselected;
 * unknown keys (a future script, a typo) are dropped rather than rejected
 * -- the same strip-extras contract every other level of the file follows.
 * A known script's Sets array is validated strictly. */
function toScope(source: Record<string, unknown>, path: string): Scope {
  const scope: Partial<Record<Script, CardSet[]>> = {};
  for (const script of SCRIPTS) {
    if (!(script in source)) continue;
    scope[script] = array(source[script], `${path}.${script}`).map((set, index) =>
      oneOf(set, CARD_SETS, `${path}.${script}[${index}]`),
    );
  }
  return scope;
}

function toSession(value: unknown, path: string): Session {
  const source = record(value, path);
  return {
    id: string(source.id, `${path}.id`),
    date: isoDate(source.date, `${path}.date`),
    scope: toScope(record(source.scope, `${path}.scope`), `${path}.scope`),
    cardsAttempted: finite(source.cardsAttempted, `${path}.cardsAttempted`),
    accuracy: finite(source.accuracy, `${path}.accuracy`),
    closureReason: oneOf(source.closureReason, CLOSURE_REASONS, `${path}.closureReason`),
  };
}

/** Validates a parsed export envelope (version 2) and expands it into
 * persisted record shapes (compact `[x, y, pressure]` triples back to
 * `StrokePoint`s, stroke and point order preserved). Pure, never throws: any
 * failure is an `err` whose message names the first failing path. */
export function validateImport(input: unknown): Result<ValidatedImport> {
  try {
    const envelope = record(input, 'file');
    if (envelope.version !== EXPORT_VERSION) fail('version', `${EXPORT_VERSION}`);
    const exportedAt = isoDate(envelope.exportedAt, 'exportedAt');

    const tallyIds = new Set<string>();
    const tallies = array(envelope.tallies, 'tallies').map((value, index) => {
      const tally = toTally(value, `tallies[${index}]`);
      unique(tallyIds, tally.cardId, `tallies[${index}].cardId`);
      return tally;
    });

    const attemptIds = new Set<string>();
    const attempts = array(envelope.attempts, 'attempts').map((value, index) => {
      const attempt = toAttempt(value, `attempts[${index}]`);
      unique(attemptIds, attempt.id, `attempts[${index}].id`);
      return attempt;
    });

    const sessionIds = new Set<string>();
    const sessions = array(envelope.sessions, 'sessions').map((value, index) => {
      const session = toSession(value, `sessions[${index}]`);
      unique(sessionIds, session.id, `sessions[${index}].id`);
      return session;
    });

    return ok({ exportedAt, data: { tallies, attempts, sessions } });
  } catch (error) {
    if (error instanceof SchemaError) return err(error);
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

/** The newest local activity -- the latest attempt `timestamp` or session
 * `date` -- or `null` when both are empty. Unparseable dates are ignored. */
export function latestActivity(attempts: Attempt[], sessions: Session[]): string | null {
  let latest: string | null = null;
  let latestMs = -Infinity;
  const candidates = [...attempts.map((a) => a.timestamp), ...sessions.map((s) => s.date)];
  for (const candidate of candidates) {
    const ms = Date.parse(candidate);
    if (!Number.isNaN(ms) && ms > latestMs) {
      latestMs = ms;
      latest = candidate;
    }
  }
  return latest;
}
