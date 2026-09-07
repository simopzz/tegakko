import type { IDBPDatabase } from 'idb';
import type { TallyRepository } from '../../ports/tally-repository';
import type { Tally } from '../../domain/tally';
import { err, ok, type Result } from '../../domain/result';
import { openTegakkoDb, toError, TALLIES_STORE, type TegakkoDb } from './db';

/**
 * `idb`-backed `TallyRepository`, mirroring `IdbAttemptRepository`'s
 * open/try/catch/finally shape: every failure resolves as `Result<T>`, never
 * a thrown `DOMException`, past this boundary. `increment`/`decrement` run
 * inside one `readwrite` transaction (get -> compute -> put -> `tx.done`) so
 * concurrent calls can't race a separate get-then-put into losing an update.
 */
export class IdbTallyRepository implements TallyRepository {
  async getAll(): Promise<Result<Tally[]>> {
    let db: IDBPDatabase<TegakkoDb> | undefined;
    try {
      db = await openTegakkoDb();
      const tallies = await db.getAll(TALLIES_STORE);
      return ok(tallies);
    } catch (cause) {
      return err(toError(cause, 'Failed to list tallies'));
    } finally {
      db?.close();
    }
  }

  async increment(cardId: string): Promise<Result<void>> {
    let db: IDBPDatabase<TegakkoDb> | undefined;
    try {
      db = await openTegakkoDb();
      const tx = db.transaction(TALLIES_STORE, 'readwrite');
      const store = tx.objectStore(TALLIES_STORE);
      const current = await store.get(cardId);
      const next: Tally = { cardId, missCount: (current?.missCount ?? 0) + 1 };
      await store.put(next);
      await tx.done;
      return ok(undefined);
    } catch (cause) {
      return err(toError(cause, 'Failed to increment tally'));
    } finally {
      db?.close();
    }
  }

  async decrement(cardId: string): Promise<Result<void>> {
    let db: IDBPDatabase<TegakkoDb> | undefined;
    try {
      db = await openTegakkoDb();
      const tx = db.transaction(TALLIES_STORE, 'readwrite');
      const store = tx.objectStore(TALLIES_STORE);
      const current = await store.get(cardId);
      // No-op, not a fabricated record, when no tally exists yet.
      if (current) {
        const next: Tally = { cardId, missCount: Math.max(0, current.missCount - 1) };
        await store.put(next);
      }
      await tx.done;
      return ok(undefined);
    } catch (cause) {
      return err(toError(cause, 'Failed to decrement tally'));
    } finally {
      db?.close();
    }
  }
}
