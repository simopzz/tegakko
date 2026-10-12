// Port types reference only `domain/` types (AD-1).
import type { ImportData } from '../domain/import';
import type { Result } from '../domain/result';

/**
 * Story 2.2's wholesale-replace capability (AD-5). The existing repository
 * ports deliberately have no bulk delete/replace, so this is the one place
 * persistence exposes it.
 *
 * `replaceAll()` is all-or-nothing across `tallies`, `attempts`, and
 * `sessions`: every current record in all three is removed and exactly
 * `data`'s records are written, or -- on any failure -- nothing changes and
 * the old data survives intact. Callers never sequence per-store calls.
 * Settings are never touched. Async and `Result`-wrapped: a raw
 * `DOMException` never crosses this boundary.
 */
export interface ProgressReplacer {
  replaceAll(data: ImportData): Promise<Result<void>>;
}
