import type { IDBPDatabase } from 'idb';
import type { SessionRepository } from '../../ports/session-repository';
import type { Session } from '../../domain/session';
import { err, ok, type Result } from '../../domain/result';
import { openTegakkoDb, toError, SESSIONS_STORE, type TegakkoDb } from './db';

/**
 * `idb`-backed `SessionRepository`, mirroring `IdbAttemptRepository`'s
 * open/try/catch/finally shape: every failure resolves as `Result<T>`, never
 * a thrown `DOMException`, past this boundary.
 */
export class IdbSessionRepository implements SessionRepository {
  async add(session: Session): Promise<Result<void>> {
    let db: IDBPDatabase<TegakkoDb> | undefined;
    try {
      db = await openTegakkoDb();
      await db.add(SESSIONS_STORE, session);
      return ok(undefined);
    } catch (cause) {
      return err(toError(cause, 'Failed to save session'));
    } finally {
      db?.close();
    }
  }

  async list(): Promise<Result<Session[]>> {
    let db: IDBPDatabase<TegakkoDb> | undefined;
    try {
      db = await openTegakkoDb();
      const sessions = await db.getAll(SESSIONS_STORE);
      return ok(sessions);
    } catch (cause) {
      return err(toError(cause, 'Failed to list sessions'));
    } finally {
      db?.close();
    }
  }
}
