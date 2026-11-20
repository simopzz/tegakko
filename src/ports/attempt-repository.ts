// Port types reference only `domain/` types (docs/adr/0001-hexagonal-boundary.md).
import type { Attempt } from '../domain/attempt';
import type { Result } from '../domain/result';

/**
 * Async and `Result`-wrapped, like `SettingsRepository`: `idb` is
 * Promise-based and a raw `DOMException` must never cross this boundary.
 * `listAll()` returns the complete, unpaginated history: session sampling
 * needs old-but-unresolved misses, not just recent ones.
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
   * no-op, not an error, when that session has no attempts. Backs undo. */
  deleteLast(sessionId: string): Promise<Result<void>>;
}
