import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { JsonProgressExporter, type JsonProgressExporterDeps } from './json-progress-exporter';
import { buildExportEnvelope } from '../../domain/export';
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
    strokes: [{ widthPreset: 'expressive', points: [{ x: 0.123456, y: 0.5, pressure: 0.99999 }] }],
  },
];
const SESSIONS: Session[] = [
  {
    id: 's1',
    date: '2026-09-23T10:05:00.000Z',
    scope: { scripts: ['hiragana'], sets: ['base'] },
    cardsAttempted: 1,
    accuracy: 0,
    closureReason: 'explicit',
  },
];
const NOW = new Date(2026, 8, 23, 12, 0, 0);

function exporter(overrides: Partial<JsonProgressExporterDeps> = {}) {
  const download = vi.fn();
  const deps: JsonProgressExporterDeps = {
    tallies: { getAll: vi.fn().mockResolvedValue(ok(TALLIES)) },
    attempts: { listAll: vi.fn().mockResolvedValue(ok(ATTEMPTS)) },
    sessions: { list: vi.fn().mockResolvedValue(ok(SESSIONS)) },
    download,
    now: () => NOW,
    ...overrides,
  };
  return { exporter: new JsonProgressExporter(deps), download };
}

describe('JsonProgressExporter', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('downloads the envelope JSON under the dated file name', async () => {
    const { exporter: subject, download } = exporter();

    const result = await subject.export();

    expect(result.ok).toBe(true);
    expect(download).toHaveBeenCalledTimes(1);
    const [fileName, json] = download.mock.calls[0] as [string, string];
    expect(fileName).toBe('tegakko-export-2026-09-23.json');
    expect(JSON.parse(json)).toEqual(buildExportEnvelope(TALLIES, ATTEMPTS, SESSIONS, NOW));
    expect(JSON.parse(json).attempts[0].strokes[0].points).toEqual([[0.1235, 0.5, 1]]);
  });

  it('serializes compactly, with no newlines', async () => {
    const { exporter: subject, download } = exporter();

    await subject.export();

    const json = download.mock.calls[0]?.[1] as string;
    expect(json).not.toContain('\n');
  });

  it('downloads empty arrays for empty stores', async () => {
    const { exporter: subject, download } = exporter({
      tallies: { getAll: vi.fn().mockResolvedValue(ok([])) },
      attempts: { listAll: vi.fn().mockResolvedValue(ok([])) },
      sessions: { list: vi.fn().mockResolvedValue(ok([])) },
    });

    expect((await subject.export()).ok).toBe(true);
    const envelope = JSON.parse(download.mock.calls[0]?.[1] as string);
    expect(envelope).toMatchObject({ version: 2, tallies: [], attempts: [], sessions: [] });
  });

  const failure = (): Promise<Result<never>> => Promise.resolve(err(new Error('blocked')));
  const rejection = (): Promise<never> => Promise.reject(new Error('boom'));
  const cases: Array<[string, Partial<JsonProgressExporterDeps>]> = [
    ['tallies resolves err', { tallies: { getAll: vi.fn(failure) } }],
    ['tallies rejects', { tallies: { getAll: vi.fn(rejection) } }],
    ['attempts resolves err', { attempts: { listAll: vi.fn(failure) } }],
    ['attempts rejects', { attempts: { listAll: vi.fn(rejection) } }],
    ['sessions resolves err', { sessions: { list: vi.fn(failure) } }],
    ['sessions rejects', { sessions: { list: vi.fn(rejection) } }],
  ];

  for (const [label, overrides] of cases) {
    it(`returns err and downloads nothing when ${label}`, async () => {
      const { exporter: subject, download } = exporter(overrides);

      const result = await subject.export();

      expect(result.ok).toBe(false);
      expect(download).not.toHaveBeenCalled();
    });
  }

  it('uses a transient <a download> and revokes the blob URL afterwards by default', async () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn().mockReturnValue('blob:tegakko/1');
    const revokeObjectURL = vi.fn();
    const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    onTestFinished(() => {
      URL.createObjectURL = original.create;
      URL.revokeObjectURL = original.revoke;
    });
    const clicks: Array<{ download: string; href: string; attached: boolean }> = [];
    const anchors: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      anchors.push(this);
      clicks.push({
        download: this.download,
        href: this.getAttribute('href') ?? '',
        attached: document.body.contains(this),
      });
    });

    const subject = new JsonProgressExporter({
      tallies: { getAll: vi.fn().mockResolvedValue(ok(TALLIES)) },
      attempts: { listAll: vi.fn().mockResolvedValue(ok(ATTEMPTS)) },
      sessions: { list: vi.fn().mockResolvedValue(ok(SESSIONS)) },
      now: () => NOW,
    });

    expect((await subject.export()).ok).toBe(true);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob: unknown = createObjectURL.mock.calls[0]?.[0];
    expect(blob).toBeInstanceOf(Blob);
    expect((blob as Blob).type).toBe('application/json');
    expect(await (blob as Blob).text()).toBe(
      JSON.stringify(buildExportEnvelope(TALLIES, ATTEMPTS, SESSIONS, NOW)),
    );
    expect(clicks).toEqual([
      { download: 'tegakko-export-2026-09-23.json', href: 'blob:tegakko/1', attached: true },
    ]);
    expect(anchors).toHaveLength(1);
    expect(document.body.contains(anchors[0] ?? null)).toBe(false);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    vi.runAllTimers();

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:tegakko/1');
  });
});
