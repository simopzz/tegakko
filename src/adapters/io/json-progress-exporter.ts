// FR-13 export adapter (Story 2.1, AD-5). Reads only through repository
// ports -- never `adapters/persistence` directly (AD-1: adapters don't import
// siblings); the composition root hands in the concrete repos.

import { buildExportEnvelope, exportFileName } from '../../domain/export';
import { err, ok, type Result } from '../../domain/result';
import type { AttemptRepository } from '../../ports/attempt-repository';
import type { ProgressExporter } from '../../ports/progress-exporter';
import type { SessionRepository } from '../../ports/session-repository';
import type { TallyRepository } from '../../ports/tally-repository';

export type DownloadFn = (fileName: string, json: string) => void;

export interface JsonProgressExporterDeps {
  attempts: Pick<AttemptRepository, 'listAll'>;
  tallies: Pick<TallyRepository, 'getAll'>;
  sessions: Pick<SessionRepository, 'list'>;
  /** Test seam; defaults to a Blob + transient `<a download>` click. */
  download?: DownloadFn;
  /** Test seam; defaults to `new Date()`. */
  now?: () => Date;
}

function browserDownload(fileName: string, json: string): void {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoked on the next task rather than synchronously: revoking in the same
  // tick as `click()` can cancel the download before the browser has started
  // reading the blob.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export class JsonProgressExporter implements ProgressExporter {
  private readonly deps: JsonProgressExporterDeps;
  private readonly download: DownloadFn;
  private readonly now: () => Date;

  constructor(deps: JsonProgressExporterDeps) {
    this.deps = deps;
    this.download = deps.download ?? browserDownload;
    this.now = deps.now ?? (() => new Date());
  }

  async export(): Promise<Result<void>> {
    try {
      const [tallies, attempts, sessions] = await Promise.all([
        this.deps.tallies.getAll(),
        this.deps.attempts.listAll(),
        this.deps.sessions.list(),
      ]);
      if (!tallies.ok) return err(tallies.error);
      if (!attempts.ok) return err(attempts.error);
      if (!sessions.ok) return err(sessions.error);

      const now = this.now();
      const envelope = buildExportEnvelope(tallies.value, attempts.value, sessions.value, now);
      // Compact on purpose: indenting would put every triple element on its
      // own deeply-indented line, making the file ~4-5x bigger.
      this.download(exportFileName(now), JSON.stringify(envelope));
      return ok(undefined);
    } catch (error) {
      return err(toError(error));
    }
  }
}
