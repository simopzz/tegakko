import { describe, expect, it } from 'vitest';
import { buildExportEnvelope, EXPORT_VERSION } from './export';
import { ImportError, isInvalidImportError, latestActivity, validateImport } from './import';
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
          { x: 0.1234, y: 0.5, pressure: 1 },
          { x: 0.2, y: 0.3333, pressure: 0.5 },
          { x: -0.05, y: 1.2, pressure: 0.25 },
        ],
      },
      { widthPreset: 'calligraphy', points: [{ x: 0.9, y: 0.1, pressure: 0.25 }] },
    ],
    ...overrides,
  };
}

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: 's1',
    date: '2026-09-23T10:05:00.000Z',
    scope: { scripts: ['hiragana', 'katakana'], sets: ['base', 'yoon'] },
    cardsAttempted: 1,
    accuracy: 1,
    closureReason: 'explicit',
    ...overrides,
  };
}

const TALLIES: Tally[] = [
  { cardId: 'あ:hiragana', missCount: 3 },
  { cardId: 'ア:katakana', missCount: 0 },
];

/** A JSON round-tripped 2.1 envelope, as a file would actually parse. */
function envelope(): Record<string, unknown> {
  const built = buildExportEnvelope(
    TALLIES,
    [attempt(), attempt({ id: 'a2', cardId: 'きゃ:hiragana', selfGrade: 'incorrect', strokes: [] })],
    [session(), session({ id: 's2', closureReason: 'inactivity', accuracy: 0.5 })],
    new Date('2026-09-24T08:00:00.000Z'),
  );
  return JSON.parse(JSON.stringify(built)) as Record<string, unknown>;
}

function attempts(env: Record<string, unknown>): Record<string, unknown>[] {
  return env.attempts as Record<string, unknown>[];
}

function sessions(env: Record<string, unknown>): Record<string, unknown>[] {
  return env.sessions as Record<string, unknown>[];
}

function expectRejected(input: unknown, pathFragment: string): void {
  const result = validateImport(input);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.message).toContain(pathFragment);
}

describe('validateImport', () => {
  it('round-trips buildExportEnvelope output back into the persisted records', () => {
    const original = [attempt(), attempt({ id: 'a2', cardId: 'きゃ:hiragana', selfGrade: 'incorrect', strokes: [] })];
    const result = validateImport(envelope());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.exportedAt).toBe('2026-09-24T08:00:00.000Z');
    expect(result.value.data.tallies).toEqual(TALLIES);
    expect(result.value.data.attempts).toEqual(original);
    expect(result.value.data.sessions).toEqual([
      session(),
      session({ id: 's2', closureReason: 'inactivity', accuracy: 0.5 }),
    ]);
    // And re-exporting the imported data yields the same file body.
    const again = buildExportEnvelope(
      result.value.data.tallies,
      result.value.data.attempts,
      result.value.data.sessions,
      new Date('2026-09-24T08:00:00.000Z'),
    );
    expect(JSON.parse(JSON.stringify(again))).toEqual(envelope());
  });

  it('preserves stroke order and point order while expanding triples', () => {
    const result = validateImport(envelope());
    if (!result.ok) throw result.error;

    const strokes = result.value.data.attempts[0]?.strokes ?? [];
    expect(strokes.map((s) => s.widthPreset)).toEqual(['subtle', 'calligraphy']);
    expect(strokes[0]?.points).toEqual([
      { x: 0.1234, y: 0.5, pressure: 1 },
      { x: 0.2, y: 0.3333, pressure: 0.5 },
      { x: -0.05, y: 1.2, pressure: 0.25 },
    ]);
  });

  it('accepts an envelope with empty arrays', () => {
    const result = validateImport({
      version: EXPORT_VERSION,
      exportedAt: '2026-09-24T08:00:00.000Z',
      tallies: [],
      attempts: [],
      sessions: [],
    });
    expect(result).toEqual({
      ok: true,
      value: {
        exportedAt: '2026-09-24T08:00:00.000Z',
        data: { tallies: [], attempts: [], sessions: [] },
      },
    });
  });

  it('strips unknown extra fields at every level', () => {
    const env = envelope();
    env.extra = 'top';
    (env.tallies as Record<string, unknown>[])[0]!.extra = 1;
    const first = attempts(env)[0]!;
    first.extra = { nested: true };
    (first.strokes as Record<string, unknown>[])[0]!.extra = 'stroke';
    sessions(env)[0]!.extra = 'session';
    (sessions(env)[0]!.scope as Record<string, unknown>).extra = 'scope';

    const result = validateImport(env);
    if (!result.ok) throw result.error;

    expect(Object.keys(result.value.data.tallies[0]!).sort()).toEqual(['cardId', 'missCount']);
    expect(Object.keys(result.value.data.attempts[0]!)).not.toContain('extra');
    expect(Object.keys(result.value.data.attempts[0]!.strokes[0]!).sort()).toEqual([
      'points',
      'widthPreset',
    ]);
    expect(Object.keys(result.value.data.sessions[0]!)).not.toContain('extra');
    expect(Object.keys(result.value.data.sessions[0]!.scope).sort()).toEqual(['scripts', 'sets']);
  });

  it('accepts a decomposed (NFD) cardId and stores the NFC id', () => {
    const nfd = 'が'.normalize('NFD') + ':hiragana';
    expect(nfd).not.toBe('が:hiragana');
    const env = envelope();
    attempts(env)[0]!.cardId = nfd;
    (env.tallies as Record<string, unknown>[])[0]!.cardId = nfd;

    const result = validateImport(env);
    if (!result.ok) throw result.error;

    expect(result.value.data.attempts[0]!.cardId).toBe('が:hiragana');
    expect(result.value.data.tallies[0]!.cardId).toBe('が:hiragana');
  });

  describe('rejects', () => {
    it('a non-object', () => {
      expectRejected(null, 'file');
      expectRejected([], 'file');
      expectRejected('hello', 'file');
    });

    it('a wrong or missing version', () => {
      const wrong = envelope();
      wrong.version = 99;
      expectRejected(wrong, 'version');
      const oldVersion = envelope();
      oldVersion.version = 1;
      expectRejected(oldVersion, 'version');
      const asString = envelope();
      asString.version = '1';
      expectRejected(asString, 'version');
      const missing = envelope();
      delete missing.version;
      expectRejected(missing, 'version');
    });

    it.each(['tallies', 'attempts', 'sessions'])('a missing or non-array %s', (key) => {
      const missing = envelope();
      delete missing[key];
      expectRejected(missing, key);
      const notArray = envelope();
      notArray[key] = {};
      expectRejected(notArray, key);
    });

    it('a wrong primitive type', () => {
      const env = envelope();
      attempts(env)[0]!.revealUsed = 'no';
      expectRejected(env, 'attempts[0].revealUsed');

      const env2 = envelope();
      attempts(env2)[1]!.id = 7;
      expectRejected(env2, 'attempts[1].id');

      const env3 = envelope();
      (env3.tallies as Record<string, unknown>[])[0]!.missCount = '3';
      expectRejected(env3, 'tallies[0].missCount');
    });

    it('a non-finite number', () => {
      const env = envelope();
      sessions(env)[0]!.accuracy = Infinity;
      expectRejected(env, 'sessions[0].accuracy');
      const env2 = envelope();
      attempts(env2)[0]!.totalTimeMs = NaN;
      expectRejected(env2, 'attempts[0].totalTimeMs');
    });

    it('out-of-union values', () => {
      const grade = envelope();
      attempts(grade)[0]!.selfGrade = 'maybe';
      expectRejected(grade, 'attempts[0].selfGrade');

      const reason = envelope();
      sessions(reason)[0]!.closureReason = 'crash';
      expectRejected(reason, 'sessions[0].closureReason');

      const width = envelope();
      (attempts(width)[0]!.strokes as Record<string, unknown>[])[1]!.widthPreset = 'huge';
      expectRejected(width, 'attempts[0].strokes[1].widthPreset');

      const scripts = envelope();
      sessions(scripts)[0]!.scope = { scripts: ['hiragana', 'kanji'], sets: ['base'] };
      expectRejected(scripts, 'sessions[0].scope.scripts[1]');

      const sets = envelope();
      sessions(sets)[0]!.scope = { scripts: ['hiragana'], sets: ['sokuon'] };
      expectRejected(sets, 'sessions[0].scope.sets[0]');

      const scopeString = envelope();
      sessions(scopeString)[0]!.scope = 'hiragana';
      expectRejected(scopeString, 'sessions[0].scope');
    });

    it('an unknown cardId', () => {
      const env = envelope();
      attempts(env)[0]!.cardId = 'x:hiragana';
      expectRejected(env, 'attempts[0].cardId');
      const env2 = envelope();
      (env2.tallies as Record<string, unknown>[])[1]!.cardId = 'ア:hiragana';
      expectRejected(env2, 'tallies[1].cardId');
    });

    it('unparseable dates', () => {
      const exported = envelope();
      exported.exportedAt = 'yesterday';
      expectRejected(exported, 'exportedAt');
      const timestamp = envelope();
      attempts(timestamp)[0]!.timestamp = 'not a date';
      expectRejected(timestamp, 'attempts[0].timestamp');
      const date = envelope();
      sessions(date)[1]!.date = '';
      expectRejected(date, 'sessions[1].date');
    });

    it('a parseable but non-ISO date', () => {
      for (const value of ['2026', 'Sep 1 2026', '2026-09-23T10:00:00Z']) {
        const env = envelope();
        attempts(env)[0]!.timestamp = value;
        expectRejected(env, 'attempts[0].timestamp');
      }
      const exported = envelope();
      exported.exportedAt = 'Sep 24 2026';
      expectRejected(exported, 'exportedAt');
    });

    it('a point that is not a 3-number array', () => {
      const cases: unknown[] = [[0.1, 0.2], [0.1, 0.2, 0.3, 0.4], { x: 0.1, y: 0.2, pressure: 1 }, [0.1, '0.2', 1], [0.1, 0.2, null]];
      for (const point of cases) {
        const env = envelope();
        const stroke = (attempts(env)[0]!.strokes as Record<string, unknown>[])[0]!;
        (stroke.points as unknown[])[1] = point;
        expectRejected(env, 'attempts[0].strokes[0].points[1]');
      }
    });

    it('duplicate ids', () => {
      const attemptDup = envelope();
      attempts(attemptDup)[1]!.id = 'a1';
      expectRejected(attemptDup, 'attempts[1].id');

      const sessionDup = envelope();
      sessions(sessionDup)[1]!.id = 's1';
      expectRejected(sessionDup, 'sessions[1].id');

      const tallyDup = envelope();
      (tallyDup.tallies as Record<string, unknown>[])[1]!.cardId = 'あ:hiragana';
      expectRejected(tallyDup, 'tallies[1].cardId');
    });
  });
});

describe('latestActivity', () => {
  it('returns null when there is no attempt and no session', () => {
    expect(latestActivity([], [])).toBeNull();
  });

  it('picks the newest of attempt timestamps and session dates', () => {
    expect(
      latestActivity(
        [attempt({ timestamp: '2026-09-20T10:00:00.000Z' }), attempt({ timestamp: '2026-09-25T10:00:00.000Z' })],
        [session({ date: '2026-09-22T10:00:00.000Z' })],
      ),
    ).toBe('2026-09-25T10:00:00.000Z');
    expect(
      latestActivity(
        [attempt({ timestamp: '2026-09-20T10:00:00.000Z' })],
        [session({ date: '2026-09-26T10:00:00.000Z' })],
      ),
    ).toBe('2026-09-26T10:00:00.000Z');
  });

  it('works with only sessions or only attempts', () => {
    expect(latestActivity([], [session()])).toBe('2026-09-23T10:05:00.000Z');
    expect(latestActivity([attempt()], [])).toBe('2026-09-23T10:00:00.000Z');
  });
});

describe('ImportError', () => {
  it('distinguishes invalid files from other failures', () => {
    expect(isInvalidImportError(new ImportError('invalid', 'x'))).toBe(true);
    expect(isInvalidImportError(new ImportError('failed', 'x'))).toBe(false);
    expect(isInvalidImportError(new Error('x'))).toBe(false);
  });
});
