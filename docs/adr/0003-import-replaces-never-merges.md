# Import replaces all progress, never merges

Importing a backup deletes every current miss count, attempt and session and writes the file's records in their place, in one IndexedDB transaction that aborts and keeps the old data if any write fails. Records are never merged. The file is validated against the export schema and its `version` before anything is touched; a malformed or unrecognised file is rejected with nothing written. Settings are not part of a backup and survive an import.

Export/import exists to back up and restore one learner's progress on one device, not to sync devices. Merging would mean deciding which of two attempt histories wins for each card, and would quietly double-count misses when a backup is restored over the data it was taken from. Replacing is predictable, so the UI makes it a deliberate two-step action: a warning that names both data dates, then an explicit confirm.

The file format is decoupled from the IndexedDB record shape: attempts are mapped field by field to a compact export form (stroke points as `[x, y, pressure]` rounded to 4 decimals), so a storage change doesn't silently change the backup format.
