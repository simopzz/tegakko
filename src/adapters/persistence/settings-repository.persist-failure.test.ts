import { beforeEach, describe, expect, it, vi } from 'vitest';

// I/O matrix edge case: "Persist failure surfaces via typed Result, not a
// thrown DOMException." Force `idb`'s openDB to reject the way a blocked or
// denied IndexedDB open would, and assert the adapter never lets that
// rejection (or a raw DOMException) escape past the port boundary.
const openDBMock = vi.fn();

vi.mock('idb', () => ({
  openDB: (...args: unknown[]) => openDBMock(...args),
}));

import { IdbSettingsRepository } from './settings-repository';
import { DEFAULT_SETTINGS } from '../../domain/settings';

describe('IdbSettingsRepository persist failure', () => {
  beforeEach(() => {
    openDBMock.mockReset();
  });

  it('resolves save() failures as a typed Result rather than a rejected promise', async () => {
    openDBMock.mockRejectedValue(new DOMException('The database connection is closing', 'InvalidStateError'));
    const repo = new IdbSettingsRepository();

    await expect(
      repo.save({ ...DEFAULT_SETTINGS, penCheckShown: true }),
    ).resolves.toEqual({ ok: false, error: expect.any(Error) });
  });

  it('resolves get() failures as a typed Result rather than a rejected promise', async () => {
    openDBMock.mockRejectedValue(new DOMException('Access denied', 'AbortError'));
    const repo = new IdbSettingsRepository();

    const result = await repo.get();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error).not.toBeInstanceOf(DOMException);
    }
  });
});
