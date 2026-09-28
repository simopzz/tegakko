import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IdbProgressReplacer } from './progress-replacer';
import { IdbAttemptRepository } from './attempt-repository';
import { IdbSessionRepository } from './session-repository';
import { IdbTallyRepository } from './tally-repository';
import { IdbSettingsRepository } from './settings-repository';
import { resetDb } from './test-reset-db';
import type { Attempt } from '../../domain/attempt';
import type { Session } from '../../domain/session';
import type { Settings } from '../../domain/settings';
import type { ImportData } from '../../domain/import';

function attempt(id: string, overrides: Partial<Attempt> = {}): Attempt {
  return {
    id,
    sessionId: 's-old',
    cardId: 'あ:hiragana',
    timestamp: '2026-09-20T10:00:00.000Z',
    timeToFirstStrokeMs: 500,
    totalTimeMs: 1500,
    strokeCount: 1,
    revealUsed: false,
    selfGrade: 'incorrect',
    strokes: [{ widthPreset: 'expressive', points: [{ x: 0.1, y: 0.2, pressure: 0.5 }] }],
    ...overrides,
  };
}

function session(id: string): Session {
  return {
    id,
    date: '2026-09-20T10:05:00.000Z',
    scope: { scripts: ['hiragana'], units: ['base'] },
    cardsAttempted: 1,
    accuracy: 0,
    closureReason: 'explicit',
  };
}

const SETTINGS: Settings = { widthPreset: 'calligraphy', idleTimeoutMs: 120_000, penCheckShown: true };

async function seed(): Promise<void> {
  await new IdbTallyRepository().increment('い:hiragana');
  await new IdbAttemptRepository().add(attempt('a-old'));
  await new IdbSessionRepository().add(session('s-old'));
  await new IdbSettingsRepository().save(SETTINGS);
}

async function snapshot() {
  const [tallies, attempts, sessions, settings] = await Promise.all([
    new IdbTallyRepository().getAll(),
    new IdbAttemptRepository().listAll(),
    new IdbSessionRepository().list(),
    new IdbSettingsRepository().get(),
  ]);
  return { tallies, attempts, sessions, settings };
}

describe('IdbProgressReplacer', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('replaces every tally, attempt, and session with exactly the given records', async () => {
    await seed();
    const data: ImportData = {
      tallies: [{ cardId: 'ア:katakana', missCount: 4 }],
      attempts: [attempt('a-new-1', { sessionId: 's-new' }), attempt('a-new-2', { sessionId: 's-new' })],
      sessions: [session('s-new')],
    };

    const result = await new IdbProgressReplacer().replaceAll(data);

    expect(result).toEqual({ ok: true, value: undefined });
    const after = await snapshot();
    expect(after.tallies).toEqual({ ok: true, value: data.tallies });
    expect(after.attempts.ok && [...after.attempts.value].sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      data.attempts,
    );
    expect(after.sessions).toEqual({ ok: true, value: data.sessions });
    // Settings are never part of an import.
    expect(after.settings).toEqual({ ok: true, value: SETTINGS });
  });

  it('empties all three stores for empty data', async () => {
    await seed();

    const result = await new IdbProgressReplacer().replaceAll({ tallies: [], attempts: [], sessions: [] });

    expect(result.ok).toBe(true);
    const after = await snapshot();
    expect(after.tallies).toEqual({ ok: true, value: [] });
    expect(after.attempts).toEqual({ ok: true, value: [] });
    expect(after.sessions).toEqual({ ok: true, value: [] });
  });

  it('is all-or-nothing: a failing put leaves every seeded record intact', async () => {
    await seed();
    const before = await snapshot();
    const broken = attempt('ignored') as Partial<Attempt>;
    delete broken.id;

    const result = await new IdbProgressReplacer().replaceAll({
      tallies: [{ cardId: 'ア:katakana', missCount: 4 }],
      attempts: [attempt('a-new'), broken as Attempt],
      sessions: [session('s-new')],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error.message).toContain('Failed to replace progress data');
    }
    const after = await snapshot();
    expect(after).toEqual(before);
    expect(after.tallies).toEqual({ ok: true, value: [{ cardId: 'い:hiragana', missCount: 1 }] });
    expect(after.attempts).toEqual({ ok: true, value: [attempt('a-old')] });
    expect(after.sessions).toEqual({ ok: true, value: [session('s-old')] });
  });
});
