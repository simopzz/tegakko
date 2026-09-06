// Shared IndexedDB opener for every persistence adapter (Story 1.5).
//
// `settings` and `attempts` are one `tegakko` database at one shared version
// -- two independently-versioned `openDB` calls against the same DB name
// would risk a `VersionError` the instant either repository bumps its own
// version, so this file is the one place the schema and the version number
// are declared, and every repository opens through `openTegakkoDb()` rather
// than keeping its own copy.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Settings } from '../../domain/settings';
import type { Attempt } from '../../domain/attempt';

export const DB_NAME = 'tegakko';
// v2: adds the `attempts` store (Story 1.5). `upgrade()` only re-runs when
// the requested version exceeds a database's *stored* version -- a
// pre-existing v1 database (the previously-shipped settings-only schema)
// would otherwise open at v1==1 forever and never grow `attempts`, so this
// bump is required, not cosmetic.
export const DB_VERSION = 2;

export const SETTINGS_STORE = 'settings';
export const ATTEMPTS_STORE = 'attempts';
export const ATTEMPTS_SESSION_INDEX = 'sessionId';

export interface TegakkoDb extends DBSchema {
  settings: {
    key: string;
    value: Settings;
  };
  attempts: {
    key: string;
    value: Attempt;
    indexes: { sessionId: string };
  };
}

export function openTegakkoDb(): Promise<IDBPDatabase<TegakkoDb>> {
  return openDB<TegakkoDb>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        // Out-of-line key: `settings` is a singleton written under one
        // caller-chosen key (`SETTINGS_KEY` in settings-repository.ts), not a
        // record carrying its own key field.
        db.createObjectStore(SETTINGS_STORE);
      }
      if (!db.objectStoreNames.contains(ATTEMPTS_STORE)) {
        const store = db.createObjectStore(ATTEMPTS_STORE, { keyPath: 'id' });
        store.createIndex(ATTEMPTS_SESSION_INDEX, 'sessionId');
      }
    },
  });
}

/** Never let a raw `DOMException` (or any other thrown value) cross the
 * adapter boundary -- callers resolve failures as a typed `Result` instead
 * (Consistency Conventions). */
export function toError(cause: unknown, message: string): Error {
  return cause instanceof Error ? new Error(`${message}: ${cause.message}`) : new Error(message);
}
