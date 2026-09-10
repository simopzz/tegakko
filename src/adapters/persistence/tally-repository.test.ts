import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IdbTallyRepository } from './tally-repository';
import { ATTEMPTS_STORE, DB_NAME, openTegakkoDb, SETTINGS_STORE } from './db';
import { resetDb } from './test-reset-db';
import { DEFAULT_SETTINGS } from '../../domain/settings';

describe('IdbTallyRepository', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('creates a tally with missCount 1 on the first increment', async () => {
    const repo = new IdbTallyRepository();

    const result = await repo.increment('あ:hiragana');

    expect(result).toEqual({ ok: true, value: undefined });
    const all = await repo.getAll();
    expect(all).toEqual({ ok: true, value: [{ cardId: 'あ:hiragana', missCount: 1 }] });
  });

  it('increments an existing tally by exactly one on repeat misses', async () => {
    const repo = new IdbTallyRepository();

    await repo.increment('あ:hiragana');
    await repo.increment('あ:hiragana');
    await repo.increment('あ:hiragana');

    const all = await repo.getAll();
    expect(all).toEqual({ ok: true, value: [{ cardId: 'あ:hiragana', missCount: 3 }] });
  });

  it('getAll() survives a fresh repository instance -- the record persists across opens', async () => {
    const first = new IdbTallyRepository();
    await first.increment('し:hiragana');

    const second = new IdbTallyRepository();
    const all = await second.getAll();

    expect(all).toEqual({ ok: true, value: [{ cardId: 'し:hiragana', missCount: 1 }] });
  });

  it('tracks separate tallies per card independently', async () => {
    const repo = new IdbTallyRepository();

    await repo.increment('あ:hiragana');
    await repo.increment('つ:hiragana');
    await repo.increment('あ:hiragana');

    const all = await repo.getAll();
    expect(all.ok).toBe(true);
    if (all.ok) {
      expect(all.value).toEqual(
        expect.arrayContaining([
          { cardId: 'あ:hiragana', missCount: 2 },
          { cardId: 'つ:hiragana', missCount: 1 },
        ]),
      );
      expect(all.value).toHaveLength(2);
    }
  });

  it('decrement is a no-op, not a fabricated record, when no tally exists', async () => {
    const repo = new IdbTallyRepository();

    const result = await repo.decrement('あ:hiragana');

    expect(result).toEqual({ ok: true, value: undefined });
    const all = await repo.getAll();
    expect(all).toEqual({ ok: true, value: [] });
  });

  it('decrement clamps at zero rather than going negative', async () => {
    const repo = new IdbTallyRepository();
    await repo.increment('あ:hiragana');

    await repo.decrement('あ:hiragana');
    const result = await repo.decrement('あ:hiragana');

    expect(result).toEqual({ ok: true, value: undefined });
    const all = await repo.getAll();
    expect(all).toEqual({ ok: true, value: [{ cardId: 'あ:hiragana', missCount: 0 }] });
  });

  it('decrement reduces an existing tally by exactly one', async () => {
    const repo = new IdbTallyRepository();
    await repo.increment('あ:hiragana');
    await repo.increment('あ:hiragana');

    await repo.decrement('あ:hiragana');

    const all = await repo.getAll();
    expect(all).toEqual({ ok: true, value: [{ cardId: 'あ:hiragana', missCount: 1 }] });
  });

  it('migrates a pre-existing v2 (settings+attempts) database so increment() succeeds against tallies', async () => {
    // Simulate a device that already has the previously-shipped v2 schema --
    // `settings`+`attempts`, no `tallies` store -- created and closed before
    // `tallies` (and DB_VERSION 3) existed.
    const legacyDb = await openDB(DB_NAME, 2, {
      upgrade(db) {
        db.createObjectStore('settings');
        db.createObjectStore('attempts', { keyPath: 'id' });
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
    legacyDb.close();

    const repo = new IdbTallyRepository();
    const result = await repo.increment('あ:hiragana');

    // The v2->v3 upgrade must have fired and created `tallies`, or this
    // rejects/fails instead of succeeding.
    expect(result).toEqual({ ok: true, value: undefined });

    // The upgrade must not have disturbed the pre-existing stores' rows.
    const db = await openTegakkoDb();
    try {
      expect(await db.get(SETTINGS_STORE, 'singleton')).toMatchObject({ penCheckShown: true });
      expect((await db.get(ATTEMPTS_STORE, 'seed-attempt-1'))?.cardId).toBe('あ:hiragana');
    } finally {
      db.close();
    }
  });
});

// I/O matrix edge case: "IndexedDB fails -> `{ok: false, error}`, never a
// raw DOMException" -- mirrors attempt-repository.test.ts's persist-failure
// suite. `vi.doMock` (not the hoisted `vi.mock`) plus a fresh dynamic import
// scopes the mock to this one test rather than shadowing `idb` for the
// fake-indexeddb round-trip tests above, which share this file.
describe('IdbTallyRepository persist failure', () => {
  it('resolves getAll() failures as a typed Result rather than a rejected promise', async () => {
    const openDBMock = vi
      .fn()
      .mockRejectedValue(new DOMException('The database connection is closing', 'InvalidStateError'));
    vi.doMock('idb', () => ({ openDB: openDBMock }));
    vi.resetModules();
    try {
      const { IdbTallyRepository: MockedRepo } = await import('./tally-repository');
      const repo = new MockedRepo();

      const result = await repo.getAll();

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

  it('resolves increment() failures as a typed Result rather than a rejected promise', async () => {
    const openDBMock = vi
      .fn()
      .mockRejectedValue(new DOMException('The database connection is closing', 'InvalidStateError'));
    vi.doMock('idb', () => ({ openDB: openDBMock }));
    vi.resetModules();
    try {
      const { IdbTallyRepository: MockedRepo } = await import('./tally-repository');
      const repo = new MockedRepo();

      const result = await repo.increment('あ:hiragana');

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

  it('resolves decrement() failures as a typed Result rather than a rejected promise', async () => {
    const openDBMock = vi
      .fn()
      .mockRejectedValue(new DOMException('The database connection is closing', 'InvalidStateError'));
    vi.doMock('idb', () => ({ openDB: openDBMock }));
    vi.resetModules();
    try {
      const { IdbTallyRepository: MockedRepo } = await import('./tally-repository');
      const repo = new MockedRepo();

      const result = await repo.decrement('あ:hiragana');

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
