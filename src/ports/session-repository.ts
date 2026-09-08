// Port types reference only `domain/` types (AD-1).
import type { Session } from '../domain/session';
import type { Result } from '../domain/result';

/**
 * Adapted the same way `ports/attempt-repository.ts` adapts
 * `AttemptRepository`: async and `Result`-wrapped, since `idb` is
 * Promise-based and a raw `DOMException` must never cross this boundary
 * (Consistency Conventions). Every session closure persists exactly one
 * record via `add()` -- there is no update/delete, records are immutable
 * once written (Story 1.9).
 */
export interface SessionRepository {
  add(session: Session): Promise<Result<void>>;
  /** Order is not guaranteed chronological -- the store is keyed by `id`, not
   * `date`. Sort yourself if you need chronological order (Story 1.10's
   * concern). */
  list(): Promise<Result<Session[]>>;
}
