// Port types reference only `domain/` types (AD-1).
import type { Attempt } from '../domain/attempt';
import type { Result } from '../domain/result';

/**
 * AD-9's `AttemptRepository` signature, adapted for an IndexedDB-backed
 * implementation the same way `ports/settings-repository.ts` adapts
 * `SettingsRepository`: async and `Result`-wrapped, since `idb` is
 * Promise-based and a raw `DOMException` must never cross this boundary
 * (Consistency Conventions). `listAll()` returns the complete, unpaginated
 * history (Story 1.7 loads it once per session and appends in memory).
 */
export interface AttemptRepository {
  add(attempt: Attempt): Promise<Result<void>>;
  /** Order is not guaranteed chronological -- the store is keyed by random
   * UUID `id`, not `timestamp`. Sort yourself if you need chronological
   * order. */
  listBySession(sessionId: string): Promise<Result<Attempt[]>>;
  /** Order is not guaranteed chronological -- the store is keyed by random
   * UUID `id`, not `timestamp`. Sort yourself if you need chronological
   * order. */
  listAll(): Promise<Result<Attempt[]>>;
  /** Delete the most recent attempt (by `timestamp`) for `sessionId`. A
   * no-op, not an error, when that session has no attempts (Story 1.8's
   * undo). */
  deleteLast(sessionId: string): Promise<Result<void>>;
}
