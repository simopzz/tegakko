import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DB_NAME, DB_VERSION, SETTINGS_STORE } from './db';
import { MAX_ATTEMPTS, resetDb } from './test-reset-db';

describe('resetDb()', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves with no retry/log when there is no competing connection', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(resetDb()).resolves.toBeUndefined();

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('retries through a transient block and resolves once the competing connection closes', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const blockingConnection = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore(SETTINGS_STORE);
      },
    });

    const resetPromise = resetDb();

    // `blocked` fires asynchronously (fake-indexeddb queues it via several
    // rounds of `setImmediate`); poll rather than assume a fixed number of
    // ticks, matching db.test.ts's rationale.
    await vi.waitFor(() => {
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('still blocked'));
    });

    blockingConnection.close();

    await expect(resetPromise).resolves.toBeUndefined();
  });

  it('rejects with a descriptive Error once retries are exhausted against a persistent block', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const blockingConnection = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore(SETTINGS_STORE);
      },
    });

    try {
      await expect(resetDb()).rejects.toThrow(
        `resetDb(): deleteDatabase("${DB_NAME}") still blocked after checking ${MAX_ATTEMPTS} times`,
      );

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('still blocked'));
    } finally {
      blockingConnection.close();
    }
  });
});
