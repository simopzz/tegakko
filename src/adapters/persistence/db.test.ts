import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DB_NAME,
  DB_VERSION,
  openTegakkoDb,
  SETTINGS_STORE,
  ATTEMPTS_STORE,
  TALLIES_STORE,
  SESSIONS_STORE,
} from './db';
import { resetDb } from './test-reset-db';

describe('openTegakkoDb() upgrade wipe', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('deletes every existing store when upgrading from a previous version', async () => {
    // Seed a v(DB_VERSION-1)-shaped database with data in every store, then
    // open at the current version.
    const legacyDb = await openDB(DB_NAME, DB_VERSION - 1, {
      upgrade(db) {
        db.createObjectStore(SETTINGS_STORE);
        db.createObjectStore(ATTEMPTS_STORE, { keyPath: 'id' });
        db.createObjectStore(TALLIES_STORE, { keyPath: 'cardId' });
        db.createObjectStore(SESSIONS_STORE, { keyPath: 'id' });
      },
    });
    await legacyDb.put(SETTINGS_STORE, { penCheckShown: true }, 'singleton');
    await legacyDb.put(ATTEMPTS_STORE, { id: 'a1', cardId: 'あ:hiragana' });
    await legacyDb.put(TALLIES_STORE, { cardId: 'あ:hiragana', missCount: 1 });
    await legacyDb.put(SESSIONS_STORE, { id: 's1' });
    legacyDb.close();

    const db = await openTegakkoDb();
    try {
      expect(await db.get(SETTINGS_STORE, 'singleton')).toBeUndefined();
      expect(await db.get(ATTEMPTS_STORE, 'a1')).toBeUndefined();
      expect(await db.get(TALLIES_STORE, 'あ:hiragana')).toBeUndefined();
      expect(await db.get(SESSIONS_STORE, 's1')).toBeUndefined();
      // All four stores still exist for the new schema.
      for (const storeName of [SETTINGS_STORE, ATTEMPTS_STORE, TALLIES_STORE, SESSIONS_STORE] as const) {
        expect(db.objectStoreNames.contains(storeName)).toBe(true);
      }
    } finally {
      db.close();
    }
  });
});

describe('openTegakkoDb() blocked/blocking guard', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('closes this connection in `blocking` so a newer cross-tab open is not blocked forever', async () => {
    // Deliberately doesn't assert the second connection's `blocked` fires: per
    // the IndexedDB spec (mirrored by fake-indexeddb), a connection that closes
    // itself synchronously in `blocking` never lets `blocked` fire -- that is
    // the point of the pattern. Instead this proves the scenario is real:
    // `firstConnection` was actually closed (a transaction against it throws),
    // the `blocking` diagnostic logged, and the newer open resolves rather than
    // hanging.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    let firstConnection: Awaited<ReturnType<typeof openTegakkoDb>> | undefined;
    let secondConnection: Awaited<ReturnType<typeof openDB>> | undefined;
    try {
      firstConnection = await openTegakkoDb();

      secondConnection = await openDB(DB_NAME, DB_VERSION + 1, {
        upgrade() {
          // no-op: only exercising the blocked/blocking handshake, not a real schema change
        },
      });

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('closing this connection'));
      expect(() => firstConnection?.transaction(SETTINGS_STORE, 'readonly')).toThrow();
    } finally {
      secondConnection?.close();
      // `firstConnection` was already closed by its own `blocking` handler;
      // closing again is a no-op and keeps this test robust either way.
      firstConnection?.close();
    }
  });

  it('logs via `blocked` when this connection is the one waiting, and still resolves once unblocked', async () => {
    let olderConnection: Awaited<ReturnType<typeof openDB>> | undefined;
    let connection: Awaited<ReturnType<typeof openTegakkoDb>> | undefined;
    try {
      olderConnection = await openDB(DB_NAME, DB_VERSION - 1, {
        upgrade() {
          // no-op: an older, unmanaged connection with no handlers of its own
        },
      });

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const openPromise = openTegakkoDb();

      // `blocked` fires asynchronously (fake-indexeddb queues it via several
      // rounds of `setImmediate`); poll rather than assume a fixed number of
      // ticks so this isn't sensitive to scheduling changes or interleaving
      // with other test files' timers.
      await vi.waitFor(() => {
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('blocked'));
      });

      olderConnection.close();

      connection = await openPromise;
      expect(connection).toBeDefined();
    } finally {
      connection?.close();
      olderConnection?.close();
    }
  });
});
