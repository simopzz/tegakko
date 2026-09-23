import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ATTEMPT_EXPORT_KEYS,
  buildExportEnvelope,
  EXPORT_VERSION,
  exportFileName,
  toAttemptExport,
} from './export';
import type { Attempt } from './attempt';
import type { Session } from './session';
import type { Tally } from './tally';

function attempt(overrides: Partial<Attempt> = {}): Attempt {
  return {
    id: 'a1',
    sessionId: 's1',
    cardId: 'あ:hiragana',
    timestamp: '2026-09-23T10:00:00.000Z',
    timeToFirstStrokeMs: 800,
    totalTimeMs: 2400,
    strokeCount: 2,
    revealUsed: false,
    selfGrade: 'correct',
    strokes: [
      {
        widthPreset: 'subtle',
        points: [
          { x: 0.123456, y: 0.5, pressure: 0.99999 },
          { x: 0.2, y: 0.33333333, pressure: 0.5 },
        ],
      },
      {
        widthPreset: 'calligraphy',
        points: [{ x: 0.9, y: 0.1, pressure: 0.25 }],
      },
    ],
    ...overrides,
  };
}

describe('toAttemptExport', () => {
  it('keeps all 10 attempt fields and no others', () => {
    const exported = toAttemptExport(attempt());

    expect(Object.keys(exported).sort()).toEqual(
      [
        'id',
        'sessionId',
        'cardId',
        'timestamp',
        'timeToFirstStrokeMs',
        'totalTimeMs',
        'strokeCount',
        'revealUsed',
        'selfGrade',
        'strokes',
      ].sort(),
    );
    expect(exported).toMatchObject({
      id: 'a1',
      sessionId: 's1',
      cardId: 'あ:hiragana',
      timestamp: '2026-09-23T10:00:00.000Z',
      timeToFirstStrokeMs: 800,
      totalTimeMs: 2400,
      strokeCount: 2,
      revealUsed: false,
      selfGrade: 'correct',
    });
  });

  it('copies exactly the exhaustive Attempt key map', () => {
    expect(Object.keys(toAttemptExport(attempt())).sort()).toEqual(
      Object.keys(ATTEMPT_EXPORT_KEYS).sort(),
    );
  });

  it('drops a field that is not on the allowlist', () => {
    const withExtra = { ...attempt(), leaked: 'nope' } as Attempt;

    expect('leaked' in toAttemptExport(withExtra)).toBe(false);
  });

  it('turns points into 4-decimal [x, y, pressure] triples, order preserved', () => {
    const exported = toAttemptExport(attempt());

    expect(exported.strokes).toEqual([
      {
        widthPreset: 'subtle',
        points: [
          [0.1235, 0.5, 1],
          [0.2, 0.3333, 0.5],
        ],
      },
      { widthPreset: 'calligraphy', points: [[0.9, 0.1, 0.25]] },
    ]);
  });

  it('keeps a no-ink attempt as strokes: []', () => {
    const exported = toAttemptExport(
      attempt({ strokes: [], strokeCount: 0, revealUsed: true, selfGrade: 'incorrect' }),
    );

    expect(exported.strokes).toEqual([]);
  });
});

describe('buildExportEnvelope', () => {
  const tallies: Tally[] = [{ cardId: 'あ:hiragana', missCount: 2 }];
  const sessions: Session[] = [
    {
      id: 's1',
      date: '2026-09-23T10:05:00.000Z',
      scope: { scripts: ['hiragana'], units: ['base'] },
      cardsAttempted: 1,
      accuracy: 1,
      closureReason: 'explicit',
    },
  ];

  it('builds the versioned envelope with an ISO exportedAt', () => {
    const now = new Date('2026-09-23T12:34:56.789Z');
    const envelope = buildExportEnvelope(tallies, [attempt()], sessions, now);

    expect(envelope.version).toBe(EXPORT_VERSION);
    expect(EXPORT_VERSION).toBe(1);
    expect(envelope.exportedAt).toBe('2026-09-23T12:34:56.789Z');
    expect(Object.keys(envelope).sort()).toEqual(
      ['version', 'exportedAt', 'tallies', 'attempts', 'sessions'].sort(),
    );
    expect(envelope.tallies).toEqual(tallies);
    expect(envelope.sessions).toEqual(sessions);
    expect(envelope.attempts).toEqual([toAttemptExport(attempt())]);
  });

  it('produces empty arrays for empty stores', () => {
    const envelope = buildExportEnvelope([], [], [], new Date('2026-01-01T00:00:00.000Z'));

    expect(envelope.tallies).toEqual([]);
    expect(envelope.attempts).toEqual([]);
    expect(envelope.sessions).toEqual([]);
  });
});

describe('exportFileName', () => {
  // Pinned far from UTC (+14:00) so a regression to `toISOString()` (UTC)
  // fails here even when CI itself runs in UTC.
  let originalTz: string | undefined;
  beforeAll(() => {
    originalTz = process.env.TZ;
    process.env.TZ = 'Pacific/Kiritimati';
  });
  afterAll(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it('names the file by the local date just after local midnight', () => {
    // UTC is still 2025-12-31 here.
    expect(exportFileName(new Date(2026, 0, 1, 0, 30))).toBe('tegakko-export-2026-01-01.json');
  });

  it('zero-pads the local month and day', () => {
    expect(exportFileName(new Date(2026, 0, 5, 12))).toBe('tegakko-export-2026-01-05.json');
  });

  it('uses local date parts', () => {
    expect(exportFileName(new Date(2026, 11, 31, 23, 59))).toBe('tegakko-export-2026-12-31.json');
  });
});
