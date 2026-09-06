import type { IDBPDatabase } from 'idb';
import type { SettingsRepository } from '../../ports/settings-repository';
import { DEFAULT_SETTINGS, type Settings } from '../../domain/settings';
import { err, ok, type Result } from '../../domain/result';
import { openTegakkoDb, toError, SETTINGS_STORE, type TegakkoDb } from './db';

// AD-11: `settings` is a singleton record -- one fixed key, not a list.
const SETTINGS_KEY = 'singleton';

/**
 * `idb`-backed `SettingsRepository`. Failures (a blocked/denied IndexedDB
 * open, a quota error, etc.) resolve as `Result<T>` -- never a thrown
 * `DOMException` past this boundary, so callers such as First Run's
 * "Just use it here" dismissal can surface a failure without crashing and
 * without hard-blocking the user out of the app.
 */
export class IdbSettingsRepository implements SettingsRepository {
  async get(): Promise<Result<Settings>> {
    let db: IDBPDatabase<TegakkoDb> | undefined;
    try {
      db = await openTegakkoDb();
      const stored = await db.get(SETTINGS_STORE, SETTINGS_KEY);
      return ok(stored ?? { ...DEFAULT_SETTINGS });
    } catch (cause) {
      return err(toError(cause, 'Failed to read settings'));
    } finally {
      db?.close();
    }
  }

  async save(settings: Settings): Promise<Result<void>> {
    let db: IDBPDatabase<TegakkoDb> | undefined;
    try {
      db = await openTegakkoDb();
      await db.put(SETTINGS_STORE, settings, SETTINGS_KEY);
      return ok(undefined);
    } catch (cause) {
      return err(toError(cause, 'Failed to save settings'));
    } finally {
      db?.close();
    }
  }
}
