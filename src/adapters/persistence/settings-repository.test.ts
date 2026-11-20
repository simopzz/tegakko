import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { beforeEach, describe, expect, it } from 'vitest';
import { IdbSettingsRepository } from './settings-repository';
import { resetDb } from './test-reset-db';
import { DB_NAME } from './db';
import { DEFAULT_SETTINGS } from '../../domain/settings';

describe('IdbSettingsRepository', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('returns default settings (penCheckShown: false) when IndexedDB is empty', async () => {
    const repo = new IdbSettingsRepository();

    const result = await repo.get();

    expect(result).toEqual({ ok: true, value: DEFAULT_SETTINGS });
  });

  it('persists penCheckShown losslessly across repository instances (I/O matrix: dismiss first-run)', async () => {
    const writer = new IdbSettingsRepository();
    const saveResult = await writer.save({ ...DEFAULT_SETTINGS, penCheckShown: true });
    expect(saveResult).toEqual({ ok: true, value: undefined });

    const reader = new IdbSettingsRepository();
    const readResult = await reader.get();

    expect(readResult).toEqual({
      ok: true,
      value: { ...DEFAULT_SETTINGS, penCheckShown: true },
    });
  });

  it('returns defaults (penCheckShown: false) after an upgrade wipes the settings store', async () => {
    // A legacy v4 database with penCheckShown already dismissed: the v5
    // upgrade deletes every store, so First Run must show again.
    const legacyDb = await openDB(DB_NAME, 4, {
      upgrade(db) {
        db.createObjectStore('settings');
        db.createObjectStore('attempts', { keyPath: 'id' });
        db.createObjectStore('tallies', { keyPath: 'cardId' });
        db.createObjectStore('sessions', { keyPath: 'id' });
      },
    });
    await legacyDb.put('settings', { ...DEFAULT_SETTINGS, penCheckShown: true }, 'singleton');
    legacyDb.close();

    const result = await new IdbSettingsRepository().get();

    expect(result).toEqual({ ok: true, value: DEFAULT_SETTINGS });
  });
});
