// Shared `resetDb()` test helper for the IndexedDB-backed persistence test
// suites (attempt/settings/tally/session-repository.test.ts). Extracted
// because each of those files previously defined a byte-for-byte identical
// helper whose `onblocked` handler resolved instead of retrying -- a leaked
// connection from a prior failing test would silently "succeed" without
// actually deleting the database, letting the next test run against stale
// data instead of surfacing a clear failure.
//
// Named without a `.test.ts` suffix so vitest.config.ts's
// `include: ['src/**/*.test.ts', '*.test.ts']` does not pick this up as its
// own (empty) test file.
import { DB_NAME } from './db';

export const MAX_ATTEMPTS = 5;
const RETRY_DELAY_MS = 20;

export function resetDb(): Promise<void> {
  return new Promise((resolve, reject) => {
    let attemptsLeft = MAX_ATTEMPTS;
    let settled = false;

    // NOTE: a single `deleteDatabase()` request is kept alive across
    // retries rather than re-issuing a fresh request per attempt. Per the
    // IndexedDB spec, once a delete request is queued for a database, a
    // second `deleteDatabase()` call against the same name is enqueued
    // *behind* the first and never begins its own "wait for connections to
    // close" phase (so its own `onblocked` never fires) until the first one
    // has actually finished -- which, for a still-open connection, is
    // exactly the stuck state this helper exists to catch. Re-issuing the
    // call would therefore make retries never observably fire `onblocked`
    // again and the promise would hang instead of rejecting. Retrying here
    // means: keep waiting on the one outstanding request, but only budget it
    // a bounded number of `RETRY_DELAY_MS` windows (logging each) before
    // giving up and rejecting -- the original request is left to settle in
    // the background, harmlessly, since this promise has already settled.
    function scheduleRetry(): void {
      if (settled) return;
      if (attemptsLeft <= 0) {
        settled = true;
        reject(
          new Error(`resetDb(): deleteDatabase("${DB_NAME}") still blocked after checking ${MAX_ATTEMPTS} times`),
        );
        return;
      }
      attemptsLeft -= 1;
      console.warn(
        `resetDb(): deleteDatabase("${DB_NAME}") still blocked, waiting again (${attemptsLeft} checks left)`,
      );
      setTimeout(scheduleRetry, RETRY_DELAY_MS);
    }

    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => {
      settled = true;
      resolve();
    };
    req.onerror = () => {
      settled = true;
      reject(req.error as DOMException);
    };
    req.onblocked = () => {
      scheduleRetry();
    };
  });
}
