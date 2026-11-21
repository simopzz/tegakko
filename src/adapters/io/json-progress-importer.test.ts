import { describe, expect, it, vi } from 'vitest';
import { JsonProgressImporter, type JsonProgressImporterDeps } from './json-progress-importer';
import { buildExportEnvelope } from '../../domain/export';
import { ImportError, type ImportData } from '../../domain/import';
import { err, ok, type Result } from '../../domain/result';
import type { Attempt } from '../../domain/attempt';
import type { Session } from '../../domain/session';
import type { Tally } from '../../domain/tally';

// Faked against the ports, never `adapters/persistence`
// (docs/adr/0001-hexagonal-boundary.md).
const TALLIES: Tally[] = [{ cardId: 'あ:hiragana', missCount: 3 }];
const ATTEMPTS: Attempt[] = [
  {
    id: 'a1',
    sessionId: 's1',
    cardId: 'あ:hiragana',
    timestamp: '2026-09-23T10:00:00.000Z',
    timeToFirstStrokeMs: 500,
    totalTimeMs: 1500,
    strokeCount: 1,
    revealUsed: false,
    selfGrade: 'incorrect',
    strokes: [{ widthPreset: 'expressive', points: [{ x: 0.1234, y: 0.5, pressure: 1 }] }],
  },
];
const SESSIONS: Session[] = [
  {
    id: 's1',
    date: '2026-09-23T10:05:00.000Z',
    scope: { hiragana: ['base'] },
    cardsAttempted: 1,
    accuracy: 0,
    closureReason: 'explicit',
  },
];
const FILE = JSON.stringify(
  buildExportEnvelope(TALLIES, ATTEMPTS, SESSIONS, new Date('2026-09-24T08:00:00.000Z')),
);
const DATA: ImportData = { tallies: TALLIES, attempts: ATTEMPTS, sessions: SESSIONS };

function importer(overrides: Partial<JsonProgressImporterDeps> = {}) {
  const replaceAll = vi.fn<(data: ImportData) => Promise<Result<void>>>().mockResolvedValue(ok(undefined));
  const deps: JsonProgressImporterDeps = {
    attempts: { listAll: vi.fn().mockResolvedValue(ok([{ ...ATTEMPTS[0]!, timestamp: '2026-09-27T09:00:00.000Z' }])) },
    sessions: { list: vi.fn().mockResolvedValue(ok(SESSIONS)) },
    replacer: { replaceAll },
    ...overrides,
  };
  return { subject: new JsonProgressImporter(deps), replaceAll };
}

function expectKind(result: Result<unknown>, kind: 'invalid' | 'failed'): void {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error).toBeInstanceOf(ImportError);
  expect((result.error as ImportError).kind).toBe(kind);
}

describe('JsonProgressImporter.prepare', () => {
  it('validates the file and reports both dates without writing', async () => {
    const { subject, replaceAll } = importer();

    const result = await subject.prepare(FILE);

    expect(result).toEqual({
      ok: true,
      value: { fileDate: '2026-09-24T08:00:00.000Z', localDate: '2026-09-27T09:00:00.000Z', data: DATA },
    });
    expect(replaceAll).not.toHaveBeenCalled();
  });

  it('reports a null local date when nothing is stored', async () => {
    const { subject } = importer({
      attempts: { listAll: vi.fn().mockResolvedValue(ok([])) },
      sessions: { list: vi.fn().mockResolvedValue(ok([])) },
    });

    const result = await subject.prepare(FILE);

    expect(result.ok && result.value.localDate).toBeNull();
  });

  it('rejects non-JSON as invalid', async () => {
    const { subject, replaceAll } = importer();

    expectKind(await subject.prepare('{not json'), 'invalid');
    expect(replaceAll).not.toHaveBeenCalled();
  });

  it('rejects a bad shape as invalid, naming the failing path', async () => {
    const { subject } = importer();
    const bad = JSON.parse(FILE) as Record<string, unknown>;
    bad.version = 99;

    const result = await subject.prepare(JSON.stringify(bad));

    expectKind(result, 'invalid');
    expect(!result.ok && result.error.message).toContain('version');
  });

  it('reports a local read err as failed, never calling the replacer', async () => {
    const { subject, replaceAll } = importer({
      sessions: { list: vi.fn().mockResolvedValue(err(new Error('IndexedDB blocked'))) },
    });

    expectKind(await subject.prepare(FILE), 'failed');
    expect(replaceAll).not.toHaveBeenCalled();
  });

  it('reports a local read rejection as failed', async () => {
    const { subject, replaceAll } = importer({
      attempts: { listAll: vi.fn().mockRejectedValue(new Error('boom')) },
    });

    expectKind(await subject.prepare(FILE), 'failed');
    expect(replaceAll).not.toHaveBeenCalled();
  });
});

describe('JsonProgressImporter.apply', () => {
  const pending = { fileDate: '2026-09-24T08:00:00.000Z', localDate: null, data: DATA };

  it('delegates to the replacer', async () => {
    const { subject, replaceAll } = importer();

    expect(await subject.apply(pending)).toEqual({ ok: true, value: undefined });
    expect(replaceAll).toHaveBeenCalledTimes(1);
    expect(replaceAll).toHaveBeenCalledWith(DATA);
  });

  it('resolves a replacer err as failed', async () => {
    const { subject, replaceAll } = importer();
    replaceAll.mockResolvedValueOnce(err(new Error('aborted')));

    expectKind(await subject.apply(pending), 'failed');
  });

  it('resolves a replacer rejection as failed', async () => {
    const { subject, replaceAll } = importer();
    replaceAll.mockRejectedValueOnce(new Error('boom'));

    expectKind(await subject.apply(pending), 'failed');
  });
});
