import type { IDBPDatabase } from 'idb';
import type { ProgressReplacer } from '../../ports/progress-replacer';
import type { ImportData } from '../../domain/import';
import { err, ok, type Result } from '../../domain/result';
import {
  ATTEMPTS_STORE,
  openTegakkoDb,
  SESSIONS_STORE,
  TALLIES_STORE,
  toError,
  type TegakkoDb,
} from './db';

/**
 * `idb`-backed `ProgressReplacer`: one `readwrite` transaction
 * over `tallies`, `attempts`, and `sessions` -- clear all three, then put
 * every record. Any failure explicitly calls `tx.abort()`: a synchronous
 * throw from `put()` (`DataError`/`DataCloneError`) only rejects this
 * function, while the already-queued `clear()` requests would otherwise
 * auto-commit and lose the old data. Aborting rolls everything back.
 */
export class IdbProgressReplacer implements ProgressReplacer {
  async replaceAll(data: ImportData): Promise<Result<void>> {
    let db: IDBPDatabase<TegakkoDb> | undefined;
    try {
      db = await openTegakkoDb();
      const tx = db.transaction([TALLIES_STORE, ATTEMPTS_STORE, SESSIONS_STORE], 'readwrite');
      // Every request promise gets a handler the moment it exists, so an
      // abort's cascade of rejections is never reported as unhandled.
      const pending: Promise<unknown>[] = [];
      const track = (request: Promise<unknown>): void => {
        request.catch(() => {});
        pending.push(request);
      };
      tx.done.catch(() => {});

      try {
        const tallies = tx.objectStore(TALLIES_STORE);
        const attempts = tx.objectStore(ATTEMPTS_STORE);
        const sessions = tx.objectStore(SESSIONS_STORE);
        track(tallies.clear());
        track(attempts.clear());
        track(sessions.clear());
        for (const tally of data.tallies) track(tallies.put(tally));
        for (const attempt of data.attempts) track(attempts.put(attempt));
        for (const session of data.sessions) track(sessions.put(session));
        await Promise.all(pending);
        await tx.done;
      } catch (cause) {
        try {
          tx.abort();
        } catch {
          // Already finished or aborting on its own (a failed request
          // aborts the transaction by default) -- nothing left to undo.
        }
        throw cause;
      }
      return ok(undefined);
    } catch (cause) {
      return err(toError(cause, 'Failed to replace progress data'));
    } finally {
      db?.close();
    }
  }
}
