import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DB_NAME, DB_VERSION, openTegakkoDb, SETTINGS_STORE } from './db';

function resetDb(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error as DOMException);
    req.onblocked = () => resolve();
  });
}

describe('openTegakkoDb() blocked/blocking guard', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('closes this connection in `blocking` so a newer cross-tab open is not blocked forever', async () => {
    // NOTE ON DEVIATION FROM SPEC'S LITERAL VERIFICATION TEXT:
    // The spec (spec-dw-2-20-indexeddb-blocked-versionchange-guard.md) asks this
    // test to additionally assert that the *second* connection's own `blocked`
    // callback fires. Empirically (and per the IndexedDB spec's own closing
    // steps, mirrored by fake-indexeddb's `closeConnection`), a connection that
    // closes itself *synchronously* inside its `versionchange`/`blocking`
    // handler sets its close-pending flag before the "is anything still open"
    // check that would fire `blocked` on the newer request ever runs -- so
    // `blocked` deterministically never fires in this scenario, in both
    // fake-indexeddb and real browsers. That is the entire point of the
    // `blocking` pattern: it prevents `blocked` from being needed. Requiring
    // `blocked` to fire here would only pass for a *broken* (delayed-close)
    // implementation, which would contradict this spec's own "Always" bullet
    // that `blocking` must close the connection so the other tab's upgrade can
    // proceed. Instead, this test proves the scenario is real (not vacuous) by
    // asserting `firstConnection` was actually closed by `blocking` (a
    // transaction against it throws) and that our `blocking` diagnostic logged,
    // while still asserting the core acceptance criterion: the newer open
    // resolves rather than hanging.
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
