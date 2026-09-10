import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IdbSettingsRepository } from './settings-repository';
import { resetDb } from './test-reset-db';
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
});
