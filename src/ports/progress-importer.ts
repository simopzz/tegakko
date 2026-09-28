// Port types reference only `domain/` types (AD-1).
import type { ImportData } from '../domain/import';
import type { Result } from '../domain/result';

/** A validated file, held in memory between the warning and the confirm.
 * Nothing has been written yet. */
export interface PendingImport {
  /** The file's `exportedAt` (ISO-8601). */
  fileDate: string;
  /** Newest local activity (ISO-8601), or `null` when nothing is stored. */
  localDate: string | null;
  data: ImportData;
}

/**
 * FR-13's import capability (Story 2.2, AD-5). The UI reaches the `io`
 * adapter only through this port, mirroring `ProgressExporter`.
 *
 * `prepare()` parses and validates the file's JSON and reads the current
 * local data's date -- it never writes. Its error is a domain `ImportError`:
 * `kind: 'invalid'` when the file isn't a tegakko backup, `kind: 'failed'`
 * when the local read failed.
 *
 * `apply()` replaces all tallies, attempts, and sessions with the pending
 * import's records, all-or-nothing (see `ProgressReplacer`).
 *
 * Neither method rejects: every failure resolves as `err`.
 */
export interface ProgressImporter {
  prepare(json: string): Promise<Result<PendingImport>>;
  apply(pending: PendingImport): Promise<Result<void>>;
}
