// Import adapter (docs/adr/0003-import-replaces-never-merges.md). Reads and
// replaces only through ports -- never `adapters/persistence` directly
// (docs/adr/0001-hexagonal-boundary.md); the composition root hands in the
// concrete repos and replacer.

import { ImportError, latestActivity, validateImport } from '../../domain/import';
import { err, ok, type Result } from '../../domain/result';
import type { AttemptRepository } from '../../ports/attempt-repository';
import type { PendingImport, ProgressImporter } from '../../ports/progress-importer';
import type { ProgressReplacer } from '../../ports/progress-replacer';
import type { SessionRepository } from '../../ports/session-repository';

export interface JsonProgressImporterDeps {
  attempts: Pick<AttemptRepository, 'listAll'>;
  sessions: Pick<SessionRepository, 'list'>;
  replacer: ProgressReplacer;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function failed(error: unknown): ImportError {
  return new ImportError('failed', message(error));
}

export class JsonProgressImporter implements ProgressImporter {
  private readonly deps: JsonProgressImporterDeps;

  constructor(deps: JsonProgressImporterDeps) {
    this.deps = deps;
  }

  async prepare(json: string): Promise<Result<PendingImport>> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (error) {
      return err(new ImportError('invalid', `Not JSON: ${message(error)}`));
    }

    const validated = validateImport(parsed);
    if (!validated.ok) return err(new ImportError('invalid', validated.error.message));

    try {
      const [attempts, sessions] = await Promise.all([
        this.deps.attempts.listAll(),
        this.deps.sessions.list(),
      ]);
      if (!attempts.ok) return err(failed(attempts.error));
      if (!sessions.ok) return err(failed(sessions.error));

      return ok({
        fileDate: validated.value.exportedAt,
        localDate: latestActivity(attempts.value, sessions.value),
        data: validated.value.data,
      });
    } catch (error) {
      return err(failed(error));
    }
  }

  async apply(pending: PendingImport): Promise<Result<void>> {
    try {
      const result = await this.deps.replacer.replaceAll(pending.data);
      return result.ok ? ok(undefined) : err(failed(result.error));
    } catch (error) {
      return err(failed(error));
    }
  }
}
