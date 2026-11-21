// Use-cases the composition root hands to the screens that don't own a
// session: the Scope picker's preview, History's list, Settings (shared by
// the Settings screen and First Run), and Backup. Screens receive these
// objects or the plain data they return, never a repository -- each screen
// declares its own structural prop type, so nothing under adapters/ imports
// this module. Like PracticeModule, these live in app/ because they wire
// concrete port implementations, which only the composition root may do
// (docs/adr/0001-hexagonal-boundary.md).

import type { Settings } from '../domain/settings';
import type { Session } from '../domain/session';
import type { Tally } from '../domain/tally';
import { err, type Result } from '../domain/result';
import type { PendingImport, ProgressImporter } from '../ports/progress-importer';
import type { ProgressExporter } from '../ports/progress-exporter';
import type { SessionRepository } from '../ports/session-repository';
import type { SettingsRepository } from '../ports/settings-repository';
import type { TallyRepository } from '../ports/tally-repository';

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/** The Scope picker's preview: the stored miss counts its "N shaky" badge
 * is computed from. Fail-open -- an unreadable store reads as no misses
 * rather than blocking the picker. */
export class ScopePreview {
  constructor(private readonly tallyRepository: TallyRepository) {}

  async tallies(): Promise<Tally[]> {
    const result = await this.tallyRepository.getAll().catch((error: unknown) =>
      err<Tally[]>(toError(error)),
    );
    if (!result.ok) {
      console.error('Failed to load tallies:', result.error);
      return [];
    }
    return result.value;
  }
}

/** History's list. Fail-open: an unreadable store lists nothing. Order is
 * unspecified here -- History imposes its own before rendering. */
export class SessionHistory {
  constructor(private readonly sessionRepository: SessionRepository) {}

  async list(): Promise<Session[]> {
    const result = await this.sessionRepository.list().catch((error: unknown) =>
      err<Session[]>(toError(error)),
    );
    if (!result.ok) {
      console.error('Failed to load sessions:', result.error);
      return [];
    }
    return result.value;
  }
}

/** Settings for the Settings screen and First Run: a read and a
 * whole-record save. Both screens merge their own patch onto the record
 * they read -- there is deliberately no merge here, so a caller can never
 * persist a record assembled from guesses. */
export class SettingsStore {
  constructor(private readonly settingsRepository: SettingsRepository) {}

  load(): Promise<Result<Settings>> {
    return this.settingsRepository.get();
  }

  save(record: Settings): Promise<Result<void>> {
    return this.settingsRepository.save(record);
  }
}

/** Backup from the Settings screen: export, and the prepare/apply pair of
 * the replace-everything import
 * (docs/adr/0003-import-replaces-never-merges.md). Like the importer port,
 * `export()` never rejects -- a rejection resolves as `err` so the screen's
 * note is the only failure surface. */
export class Backup {
  constructor(
    private readonly progressExporter: ProgressExporter,
    private readonly progressImporter: ProgressImporter,
  ) {}

  export(): Promise<Result<void>> {
    return this.progressExporter.export().catch((error: unknown) => err<void>(toError(error)));
  }

  prepare(json: string): Promise<Result<PendingImport>> {
    return this.progressImporter.prepare(json);
  }

  apply(pending: PendingImport): Promise<Result<void>> {
    return this.progressImporter.apply(pending);
  }
}
