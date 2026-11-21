import { describe, expect, it, vi } from 'vitest';
import { Backup, ScopePreview, SessionHistory, SettingsStore } from './use-cases';
import type { Settings } from '../domain/settings';
import type { Session } from '../domain/session';
import type { Tally } from '../domain/tally';
import { err, ok, type Result } from '../domain/result';
import type { PendingImport, ProgressImporter } from '../ports/progress-importer';
import type { ProgressExporter } from '../ports/progress-exporter';
import type { SessionRepository } from '../ports/session-repository';
import type { SettingsRepository } from '../ports/settings-repository';
import type { TallyRepository } from '../ports/tally-repository';

// Fakes against the ports, never concrete adapters
// (docs/adr/0001-hexagonal-boundary.md) -- these tests pin the fail-open
// behaviour the screens used to own, which the app-level seam can't drive
// with real IndexedDB.
function tallyRepository(getAll: () => Promise<Result<Tally[]>>): TallyRepository {
  return {
    getAll,
    increment: () => Promise.resolve(ok(undefined)),
    decrement: () => Promise.resolve(ok(undefined)),
  };
}

function sessionRepository(list: () => Promise<Result<Session[]>>): SessionRepository {
  return {
    add: () => Promise.resolve(ok(undefined)),
    list,
  };
}

describe('ScopePreview', () => {
  it("returns the repository's miss counts on success", async () => {
    const tallies: Tally[] = [{ cardId: 'あ:hiragana', missCount: 3 }];
    expect(await new ScopePreview(tallyRepository(async () => ok(tallies))).tallies()).toBe(
      tallies,
    );
  });

  it('fails open to an empty list and logs when getAll() resolves err', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const preview = new ScopePreview(tallyRepository(async () => err<Tally[]>(new Error('IndexedDB blocked'))));

    expect(await preview.tallies()).toEqual([]);
    expect(consoleError).toHaveBeenCalledWith('Failed to load tallies:', expect.any(Error));

    consoleError.mockRestore();
  });

  it('fails open to an empty list and logs when getAll() rejects', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const preview = new ScopePreview(
      tallyRepository(async () => Promise.reject(new Error('connection lost'))),
    );

    expect(await preview.tallies()).toEqual([]);
    expect(consoleError).toHaveBeenCalledWith('Failed to load tallies:', expect.any(Error));

    consoleError.mockRestore();
  });
});

describe('SessionHistory', () => {
  it("returns the repository's sessions on success", async () => {
    const sessions: Session[] = [
      {
        id: 's1',
        date: '2026-09-01T00:00:00.000Z',
        scope: { hiragana: ['base'] },
        cardsAttempted: 10,
        accuracy: 0.5,
        closureReason: 'explicit',
      },
    ];
    expect(await new SessionHistory(sessionRepository(async () => ok(sessions))).list()).toBe(
      sessions,
    );
  });

  it('fails open to an empty list and logs when list() resolves err', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const history = new SessionHistory(
      sessionRepository(async () => err<Session[]>(new Error('IndexedDB blocked'))),
    );

    expect(await history.list()).toEqual([]);
    expect(consoleError).toHaveBeenCalledWith('Failed to load sessions:', expect.any(Error));

    consoleError.mockRestore();
  });

  it('fails open to an empty list and logs when list() rejects', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const history = new SessionHistory(
      sessionRepository(async () => Promise.reject(new Error('connection lost'))),
    );

    expect(await history.list()).toEqual([]);
    expect(consoleError).toHaveBeenCalledWith('Failed to load sessions:', expect.any(Error));

    consoleError.mockRestore();
  });
});

describe('SettingsStore', () => {
  it('passes load and save straight through as Results', async () => {
    const record: Settings = { widthPreset: 'subtle', idleTimeoutMs: 300_000, penCheckShown: true };
    const repository: SettingsRepository = {
      get: vi.fn().mockResolvedValue(ok(record)),
      save: vi.fn().mockResolvedValue(ok(undefined)),
    };
    const store = new SettingsStore(repository);

    expect(await store.load()).toEqual(ok(record));
    await store.save(record);
    expect(repository.save).toHaveBeenCalledWith(record);
  });
});

describe('Backup', () => {
  const pending: PendingImport = {
    fileDate: '2026-09-24T08:00:00.000Z',
    localDate: null,
    data: { tallies: [], attempts: [], sessions: [] },
  };

  it('folds a rejected export into err so the note is the only failure surface', async () => {
    const exporter: ProgressExporter = {
      export: vi.fn().mockRejectedValue(new Error('connection lost')),
    };
    const progressImporter: ProgressImporter = {
      prepare: vi.fn(),
      apply: vi.fn(),
    };
    const backup = new Backup(exporter, progressImporter);

    expect(await backup.export()).toEqual({ ok: false, error: expect.any(Error) });
  });

  it('passes prepare and apply through unchanged', async () => {
    const progressImporter: ProgressImporter = {
      prepare: vi.fn().mockResolvedValue(ok(pending)),
      apply: vi.fn().mockResolvedValue(ok(undefined)),
    };
    const backup = new Backup({ export: vi.fn().mockResolvedValue(ok(undefined)) }, progressImporter);

    expect(await backup.prepare('{}')).toEqual(ok(pending));
    await backup.apply(pending);
  });
});
