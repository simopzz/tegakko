import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { SettingsRepository } from '../../ports/settings-repository';
import { DEFAULT_SETTINGS, type Settings } from '../../domain/settings';
import { err, ok, type Result } from '../../domain/result';

const DB_NAME = 'tegakko';
const DB_VERSION = 1;
const STORE_NAME = 'settings';
// AD-11: `settings` is a singleton record -- one fixed key, not a list.
const SETTINGS_KEY = 'singleton';

interface TegakkoDb extends DBSchema {
  settings: {
    key: string;
    value: Settings;
  };
}

function openSettingsDb(): Promise<IDBPDatabase<TegakkoDb>> {
  return openDB<TegakkoDb>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    },
  });
}

function toError(cause: unknown, message: string): Error {
  return cause instanceof Error ? new Error(`${message}: ${cause.message}`) : new Error(message);
}

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
      db = await openSettingsDb();
      const stored = await db.get(STORE_NAME, SETTINGS_KEY);
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
      db = await openSettingsDb();
      await db.put(STORE_NAME, settings, SETTINGS_KEY);
      return ok(undefined);
    } catch (cause) {
      return err(toError(cause, 'Failed to save settings'));
    } finally {
      db?.close();
    }
  }
}
