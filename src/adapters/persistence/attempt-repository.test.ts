import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IdbAttemptRepository } from './attempt-repository';
import { DB_NAME } from './db';
import type { Attempt } from '../../domain/attempt';

function resetDb(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase('tegakko');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error as DOMException);
    req.onblocked = () => resolve();
  });
}

function attempt(overrides: Partial<Attempt> = {}): Attempt {
  return {
    id: crypto.randomUUID(),
    sessionId: 'session-1',
    cardId: 'あ:hiragana',
    timestamp: '2026-09-06T10:00:00.000Z',
    timeToFirstStrokeMs: 400,
    totalTimeMs: 1200,
    strokeCount: 1,
    revealUsed: false,
    selfGrade: 'correct',
    strokes: [
      {
        points: [{ x: 0.5, y: 0.5, pressure: 0.7 }],
        widthPreset: 'expressive',
      },
    ],
    ...overrides,
  };
}

describe('IdbAttemptRepository', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('round-trips an attempt, including its embedded strokes, via listAll()', async () => {
    const repo = new IdbAttemptRepository();
    const a = attempt();

    const addResult = await repo.add(a);
    expect(addResult).toEqual({ ok: true, value: undefined });

    const listResult = await repo.listAll();
    expect(listResult).toEqual({ ok: true, value: [a] });
  });

  it('listBySession returns only attempts for that session', async () => {
    const repo = new IdbAttemptRepository();
    const inSession = attempt({ id: crypto.randomUUID(), sessionId: 'session-1' });
    const otherSession = attempt({ id: crypto.randomUUID(), sessionId: 'session-2' });

    await repo.add(inSession);
    await repo.add(otherSession);

    const result = await repo.listBySession('session-1');
    expect(result).toEqual({ ok: true, value: [inSession] });
  });

  it('listAll() returns the complete, unpaginated history across sessions', async () => {
    const repo = new IdbAttemptRepository();
    const first = attempt({ id: crypto.randomUUID(), sessionId: 'session-1' });
    const second = attempt({ id: crypto.randomUUID(), sessionId: 'session-2' });

    await repo.add(first);
    await repo.add(second);

    const result = await repo.listAll();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
      expect(result.value).toEqual(expect.arrayContaining([first, second]));
    }
  });

  it('deleteLast removes the most recent attempt for that session, by timestamp', async () => {
    const repo = new IdbAttemptRepository();
    const earlier = attempt({
      id: crypto.randomUUID(),
      timestamp: '2026-09-06T09:00:00.000Z',
    });
    const later = attempt({
      id: crypto.randomUUID(),
      timestamp: '2026-09-06T11:00:00.000Z',
    });
    // Inserted out of timestamp order -- deleteLast must sort by timestamp,
    // not by insertion order.
    await repo.add(later);
    await repo.add(earlier);

    const deleteResult = await repo.deleteLast('session-1');
    expect(deleteResult).toEqual({ ok: true, value: undefined });

    const remaining = await repo.listBySession('session-1');
    expect(remaining).toEqual({ ok: true, value: [earlier] });
  });

  it('deleteLast only removes the most recent attempt for the given session, not other sessions', async () => {
    const repo = new IdbAttemptRepository();
    const thisSession = attempt({
      id: crypto.randomUUID(),
      sessionId: 'session-1',
      timestamp: '2026-09-06T09:00:00.000Z',
    });
    const otherSession = attempt({
      id: crypto.randomUUID(),
      sessionId: 'session-2',
      timestamp: '2026-09-06T12:00:00.000Z',
    });
    await repo.add(thisSession);
    await repo.add(otherSession);

    await repo.deleteLast('session-1');

    expect(await repo.listBySession('session-1')).toEqual({ ok: true, value: [] });
    expect(await repo.listBySession('session-2')).toEqual({ ok: true, value: [otherSession] });
  });

  it('no-ops when the session has no attempts', async () => {
    const repo = new IdbAttemptRepository();

    const result = await repo.deleteLast('no-such-session');

    expect(result).toEqual({ ok: true, value: undefined });
  });

  it('migrates a pre-existing v1 (settings-only) database so add() succeeds against attempts', async () => {
    // Simulate a device that already has the previously-shipped v1 schema --
    // `settings` only, no `attempts` store -- created and closed before
    // `attempts` (and DB_VERSION 2) existed.
    const legacyDb = await openDB(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore('settings');
      },
    });
    legacyDb.close();

    const repo = new IdbAttemptRepository();
    const result = await repo.add(attempt());

    // The v1->v2 upgrade must have fired and created `attempts`, or this
    // rejects/fails instead of succeeding.
    expect(result).toEqual({ ok: true, value: undefined });
  });
});

// I/O matrix edge case: "Persist failure surfaces via typed Result, not a
// thrown DOMException" -- mirrors settings-repository.persist-failure.test.ts.
// Unlike that repository's own dedicated file, this uses `vi.doMock` (not the
// hoisted `vi.mock`) plus a fresh dynamic import so the mock is scoped to
// this one test rather than shadowing `idb` for the fake-indexeddb round-trip
// tests above, which share this file.
describe('IdbAttemptRepository persist failure', () => {
  it('resolves add() failures as a typed Result rather than a rejected promise', async () => {
    const openDBMock = vi
      .fn()
      .mockRejectedValue(new DOMException('The database connection is closing', 'InvalidStateError'));
    vi.doMock('idb', () => ({ openDB: openDBMock }));
    vi.resetModules();
    try {
      const { IdbAttemptRepository: MockedRepo } = await import('./attempt-repository');
      const repo = new MockedRepo();

      const result = await repo.add(attempt());

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

  it('resolves listBySession() failures as a typed Result rather than a rejected promise', async () => {
    const openDBMock = vi
      .fn()
      .mockRejectedValue(new DOMException('The database connection is closing', 'InvalidStateError'));
    vi.doMock('idb', () => ({ openDB: openDBMock }));
    vi.resetModules();
    try {
      const { IdbAttemptRepository: MockedRepo } = await import('./attempt-repository');
      const repo = new MockedRepo();

      const result = await repo.listBySession('session-1');

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

  it('resolves listAll() failures as a typed Result rather than a rejected promise', async () => {
    const openDBMock = vi
      .fn()
      .mockRejectedValue(new DOMException('The database connection is closing', 'InvalidStateError'));
    vi.doMock('idb', () => ({ openDB: openDBMock }));
    vi.resetModules();
    try {
      const { IdbAttemptRepository: MockedRepo } = await import('./attempt-repository');
      const repo = new MockedRepo();

      const result = await repo.listAll();

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

  it('resolves deleteLast() failures as a typed Result rather than a rejected promise', async () => {
    const openDBMock = vi
      .fn()
      .mockRejectedValue(new DOMException('The database connection is closing', 'InvalidStateError'));
    vi.doMock('idb', () => ({ openDB: openDBMock }));
    vi.resetModules();
    try {
      const { IdbAttemptRepository: MockedRepo } = await import('./attempt-repository');
      const repo = new MockedRepo();

      const result = await repo.deleteLast('session-1');

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
