import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IdbSessionRepository } from './session-repository';
import { ATTEMPTS_STORE, DB_NAME, openTegakkoDb, SETTINGS_STORE, TALLIES_STORE } from './db';
import { resetDb } from './test-reset-db';
import { DEFAULT_SETTINGS } from '../../domain/settings';
import type { Session } from '../../domain/session';

const SESSION: Session = {
  id: 'session-1',
  date: '2026-09-08T09:00:00.000Z',
  scope: { hiragana: ['base'] },
  cardsAttempted: 12,
  accuracy: 0.75,
  closureReason: 'explicit',
};

describe('IdbSessionRepository', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('returns an empty list when IndexedDB is empty', async () => {
    const repo = new IdbSessionRepository();

    const result = await repo.list();

    expect(result).toEqual({ ok: true, value: [] });
  });

  it('add-then-list round-trips a record losslessly across repository instances (survives "reload")', async () => {
    const writer = new IdbSessionRepository();
    const addResult = await writer.add(SESSION);
    expect(addResult).toEqual({ ok: true, value: undefined });

    const reader = new IdbSessionRepository();
    const listResult = await reader.list();

    expect(listResult).toEqual({ ok: true, value: [SESSION] });
  });

  it('accumulates multiple sessions across separate add() calls', async () => {
    const repo = new IdbSessionRepository();
    const second: Session = { ...SESSION, id: 'session-2', closureReason: 'inactivity' };

    await repo.add(SESSION);
    await repo.add(second);
    const listResult = await repo.list();

    expect(listResult.ok).toBe(true);
    expect(listResult.ok && listResult.value).toHaveLength(2);
    expect(listResult.ok && listResult.value.map((s) => s.id).sort()).toEqual(['session-1', 'session-2']);
  });

  it('wipes every store when upgrading a pre-existing v3 database', async () => {
    // Simulate a device that already has the previously-shipped v3 schema --
    // `settings`+`attempts`+`tallies`, no `sessions` store. The v5 upgrade
    // deletes every store and recreates them, so old data is gone and First
    // Run shows again.
    const legacyDb = await openDB(DB_NAME, 3, {
      upgrade(db) {
        db.createObjectStore('settings');
        db.createObjectStore('attempts', { keyPath: 'id' });
        db.createObjectStore('tallies', { keyPath: 'cardId' });
      },
    });
    await legacyDb.put('settings', { ...DEFAULT_SETTINGS, penCheckShown: true }, 'singleton');
    await legacyDb.put('attempts', {
      id: 'seed-attempt-1',
      sessionId: 'seed-session-1',
      cardId: 'あ:hiragana',
      timestamp: new Date(0).toISOString(),
      timeToFirstStrokeMs: 100,
      totalTimeMs: 200,
      strokeCount: 0,
      revealUsed: false,
      selfGrade: 'incorrect',
      strokes: [],
    });
    await legacyDb.put('tallies', { cardId: 'あ:hiragana', missCount: 1 });
    legacyDb.close();

    const repo = new IdbSessionRepository();
    const result = await repo.add(SESSION);

    expect(result).toEqual({ ok: true, value: undefined });
    expect(await repo.list()).toEqual({ ok: true, value: [SESSION] });

    // The upgrade wiped all pre-existing stores, including settings.
    const db = await openTegakkoDb();
    try {
      expect(await db.get(SETTINGS_STORE, 'singleton')).toBeUndefined();
      expect(await db.get(ATTEMPTS_STORE, 'seed-attempt-1')).toBeUndefined();
      expect(await db.get(TALLIES_STORE, 'あ:hiragana')).toBeUndefined();
    } finally {
      db.close();
    }
  });
});

// I/O matrix edge case: "IndexedDB fails -> `{ok: false, error}`, never a
// raw DOMException" -- mirrors attempt-repository.test.ts's/
// tally-repository.test.ts's persist-failure suites. `vi.doMock` (not the
// hoisted `vi.mock`) plus a fresh dynamic import scopes the mock to this one
// test rather than shadowing `idb` for the fake-indexeddb round-trip tests
// above, which share this file.
describe('IdbSessionRepository persist failure', () => {
  it('resolves add() failures as a typed Result rather than a rejected promise', async () => {
    const openDBMock = vi
      .fn()
      .mockRejectedValue(new DOMException('The database connection is closing', 'InvalidStateError'));
    vi.doMock('idb', () => ({ openDB: openDBMock }));
    vi.resetModules();
    try {
      const { IdbSessionRepository: MockedRepo } = await import('./session-repository');
      const repo = new MockedRepo();

      const result = await repo.add(SESSION);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(Error);
        expect(result.error).not.toBeInstanceOf(DOMException);
      }
    } finally {
      vi.doUnmock('idb');
      vi.resetModules();
    }
  });

  it('resolves list() failures as a typed Result rather than a rejected promise', async () => {
    const openDBMock = vi
      .fn()
      .mockRejectedValue(new DOMException('The database connection is closing', 'InvalidStateError'));
    vi.doMock('idb', () => ({ openDB: openDBMock }));
    vi.resetModules();
    try {
      const { IdbSessionRepository: MockedRepo } = await import('./session-repository');
      const repo = new MockedRepo();

      const result = await repo.list();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(Error);
        expect(result.error).not.toBeInstanceOf(DOMException);
      }
    } finally {
      vi.doUnmock('idb');
      vi.resetModules();
    }
  });
});
