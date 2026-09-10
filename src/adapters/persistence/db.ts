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

export async function openTegakkoDb(): Promise<IDBPDatabase<TegakkoDb>> {
  const connection = await openDB<TegakkoDb>(DB_NAME, DB_VERSION, {
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
    blocked(currentVersion, blockedVersion) {
      // This connection's own open is the one being stalled -- another tab
      // holds an older connection open with no handlers of its own. Purely
      // diagnostic: the request just waits until that other connection closes.
      console.warn(
        `openTegakkoDb() blocked: an existing connection at version ${currentVersion} is preventing the upgrade to version ${blockedVersion}`,
      );
    },
    blocking(currentVersion, blockedVersion) {
      // This connection is the one in the way of another tab's upgrade.
      // Close it so that tab's `blocked` open can proceed -- `blocked` alone
      // has nothing to close, only `blocking` holds the connection.
      // `blockedVersion` is `null` when another connection is deleting the
      // database (e.g. `indexedDB.deleteDatabase(DB_NAME)`) rather than
      // opening it at a higher version.
      const reason =
        blockedVersion === null
          ? 'another connection is requesting a database deletion'
          : `another connection is opening version ${blockedVersion}`;
      console.warn(`openTegakkoDb() closing this connection (version ${currentVersion}): ${reason}`);
      connection?.close();
    },
  });
  return connection;
}

/** Never let a raw `DOMException` (or any other thrown value) cross the
 * adapter boundary -- callers resolve failures as a typed `Result` instead
 * (Consistency Conventions). */
export function toError(cause: unknown, message: string): Error {
  return cause instanceof Error ? new Error(`${message}: ${cause.message}`) : new Error(message);
}
