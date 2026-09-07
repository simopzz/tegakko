// Port types reference only `domain/` types (AD-1).
import type { Tally } from '../domain/tally';
import type { Result } from '../domain/result';

/**
 * AD-9's `TallyRepository` signature, adapted for an IndexedDB-backed
 * implementation the same way `ports/attempt-repository.ts` adapts
 * `AttemptRepository`: async and `Result`-wrapped, since `idb` is
 * Promise-based and a raw `DOMException` must never cross this boundary
 * (Consistency Conventions). `increment`/`decrement` run atomically -- one
 * transaction, no separate get-then-put race -- and `decrement` clamps at
 * zero rather than ever going negative or fabricating a record.
 */
export interface TallyRepository {
  /** Order is not guaranteed -- the store is keyed by `cardId`, not insertion
   * or count order. Sort yourself if you need a particular order. */
  getAll(): Promise<Result<Tally[]>>;
  /** Creates a tally with `missCount` 1 for `cardId` if none exists yet;
   * otherwise increments its existing `missCount` by one. */
  increment(cardId: string): Promise<Result<void>>;
  /** No-op when no tally exists for `cardId`; otherwise clamps at zero
   * (Story 1.8's undo). */
  decrement(cardId: string): Promise<Result<void>>;
}
