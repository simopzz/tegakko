// Shared IndexedDB opener for every persistence adapter (Story 1.5).
//
// `settings`, `attempts`, and `tallies` are one `tegakko` database at one shared version
// -- separately-versioned `openDB` calls against the same DB name
// would risk a `VersionError` the instant any repository bumps its own
// version, so this file is the one place the schema and the version number
// are declared, and every repository opens through `openTegakkoDb()` rather
// than keeping its own copy.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Settings } from '../../domain/settings';
import type { Attempt } from '../../domain/attempt';
import type { Tally } from '../../domain/tally';
import type { Session } from '../../domain/session';

export const DB_NAME = 'tegakko';
// v4: adds the `sessions` store (Story 1.9). `upgrade()` only re-runs when
// the requested version exceeds a database's *stored* version -- a
// pre-existing v3 database (settings+attempts+tallies only) would otherwise
// open at v3==3 forever and never grow `sessions`, so this bump is required,
// not cosmetic. Same reasoning as the prior 2->3 bump.
export const DB_VERSION = 4;

export const SETTINGS_STORE = 'settings';
export const ATTEMPTS_STORE = 'attempts';
export const ATTEMPTS_SESSION_INDEX = 'sessionId';
export const TALLIES_STORE = 'tallies';
export const SESSIONS_STORE = 'sessions';

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
  tallies: {
    key: string;
    value: Tally;
  };
  sessions: {
    key: string;
    value: Session;
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
      if (!db.objectStoreNames.contains(TALLIES_STORE)) {
        db.createObjectStore(TALLIES_STORE, { keyPath: 'cardId' });
      }
      if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
        db.createObjectStore(SESSIONS_STORE, { keyPath: 'id' });
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
