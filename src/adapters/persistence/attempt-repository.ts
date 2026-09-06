import type { IDBPDatabase } from 'idb';
import type { AttemptRepository } from '../../ports/attempt-repository';
import type { Attempt } from '../../domain/attempt';
import { err, ok, type Result } from '../../domain/result';
import {
  openTegakkoDb,
  toError,
  ATTEMPTS_STORE,
  ATTEMPTS_SESSION_INDEX,
  type TegakkoDb,
} from './db';

/**
 * `idb`-backed `AttemptRepository`, mirroring `IdbSettingsRepository`'s
 * open/try/catch/finally shape: every failure resolves as `Result<T>`, never
 * a thrown `DOMException`, past this boundary.
 */
export class IdbAttemptRepository implements AttemptRepository {
  async add(attempt: Attempt): Promise<Result<void>> {
    let db: IDBPDatabase<TegakkoDb> | undefined;
    try {
      db = await openTegakkoDb();
      await db.add(ATTEMPTS_STORE, attempt);
      return ok(undefined);
    } catch (cause) {
      return err(toError(cause, 'Failed to save attempt'));
    } finally {
      db?.close();
    }
  }

  async listBySession(sessionId: string): Promise<Result<Attempt[]>> {
    let db: IDBPDatabase<TegakkoDb> | undefined;
    try {
      db = await openTegakkoDb();
      const attempts = await db.getAllFromIndex(ATTEMPTS_STORE, ATTEMPTS_SESSION_INDEX, sessionId);
      return ok(attempts);
    } catch (cause) {
      return err(toError(cause, 'Failed to list attempts for session'));
    } finally {
      db?.close();
    }
  }

  async listAll(): Promise<Result<Attempt[]>> {
    let db: IDBPDatabase<TegakkoDb> | undefined;
    try {
      db = await openTegakkoDb();
      const attempts = await db.getAll(ATTEMPTS_STORE);
      return ok(attempts);
    } catch (cause) {
      return err(toError(cause, 'Failed to list attempts'));
    } finally {
      db?.close();
    }
  }

  async deleteLast(sessionId: string): Promise<Result<void>> {
    let db: IDBPDatabase<TegakkoDb> | undefined;
    try {
      db = await openTegakkoDb();
      const attempts = await db.getAllFromIndex(ATTEMPTS_STORE, ATTEMPTS_SESSION_INDEX, sessionId);
      // ISO-8601 sorts lexicographically, so the greatest `timestamp` string
      // is the most recent attempt -- no separate numeric field needed.
      // `>=`, not `>`: two attempts sharing the exact same ISO timestamp must
      // still resolve to a deterministic pick (the later one in iteration
      // order) rather than silently keeping whichever was seen first.
      let latest: Attempt | undefined;
      for (const attempt of attempts) {
        if (!latest || attempt.timestamp >= latest.timestamp) latest = attempt;
      }
      // No-op, not an error, when the session has no attempts yet.
      if (latest) await db.delete(ATTEMPTS_STORE, latest.id);
      return ok(undefined);
    } catch (cause) {
      return err(toError(cause, 'Failed to delete last attempt'));
    } finally {
      db?.close();
    }
  }
}
