// Port types reference only `domain/` types (docs/adr/0001-hexagonal-boundary.md).
import type { Result } from '../domain/result';

/**
 * Export (docs/adr/0003-import-replaces-never-merges.md). The UI reaches the
 * `io` adapter only through this port -- adapters never import siblings,
 * exactly like `ui` -> `ink` via `InkSurface`.
 *
 * `export()` reads every persisted tally, attempt, and session, serializes
 * them into the domain's `ExportEnvelope`, and hands the JSON to the
 * browser as a file download. Async and `Result`-wrapped like the
 * repository ports: any read failure resolves as `err` with no download
 * started, never a raw `DOMException` crossing this boundary. Settings are
 * never part of the file.
 */
export interface ProgressExporter {
  export(): Promise<Result<void>>;
}
