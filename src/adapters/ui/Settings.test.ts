import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import Settings from './Settings.svelte';
import { type Settings as SettingsRecord } from '../../domain/settings';
import { err, ok } from '../../domain/result';
import type { PendingImport } from '../../ports/progress-importer';
import { ImportError } from '../../domain/import';
import type { Result } from '../../domain/result';
import { fakeInkSurface } from '../../test-utils/fake-ink-surface';

// Fakes of the composition root's use-case objects -- the screen's own
// structural prop types, never repositories
// (docs/adr/0001-hexagonal-boundary.md). The happy paths they used to prop
// up (preselect from the store, persist a choice, confirm an import) are
// driven through the whole app on the real adapters in
// src/app/App.integration.test.ts; what stays here is the failure and
// dialog mechanics that seam can't reach.

type FakeSettings = {
  load(): Promise<Result<SettingsRecord>>;
  save(record: SettingsRecord): Promise<Result<void>>;
} & {
  load: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
};

function fakeSettings(
  record: Result<SettingsRecord>,
  saveResult: Result<void> = ok(undefined),
): FakeSettings {
  return {
    load: vi.fn().mockResolvedValue(record),
    save: vi.fn().mockResolvedValue(saveResult),
  };
}

type FakeBackup = {
  export(): Promise<Result<void>>;
  prepare(json: string): Promise<Result<PendingImport>>;
  apply(pending: PendingImport): Promise<Result<void>>;
} & {
  export: ReturnType<typeof vi.fn>;
  prepare: ReturnType<typeof vi.fn>;
  apply: ReturnType<typeof vi.fn>;
};

const PENDING: PendingImport = {
  fileDate: '2026-09-24T08:00:00.000Z',
  localDate: '2026-09-27T09:00:00.000Z',
  data: { tallies: [], attempts: [], sessions: [] },
};

/** `prepared`/`applied` shape the importer port's two Results; `export`
 * defaults to success because the Backup use-case folds rejections
 * before they ever reach the screen. */
function fakeBackup(
  prepared: Result<PendingImport> = ok(PENDING),
  applied: Result<void> = ok(undefined),
): FakeBackup {
  return {
    export: vi.fn().mockResolvedValue(ok(undefined)),
    prepare: vi.fn().mockResolvedValue(prepared),
    apply: vi.fn().mockResolvedValue(applied),
  };
}

function preset(name: 'Subtle' | 'Expressive' | 'Calligraphy'): HTMLElement {
  return screen.getByRole('radio', { name });
}

function idlePreset(name: '2 min' | '5 min' | '10 min'): HTMLElement {
  return screen.getByRole('radio', { name });
}

// A settings record whose non-width fields are deliberately *not* the
// defaults -- a save that rebuilt the record from DEFAULT_SETTINGS instead of
// the last-read one would silently reset these, and re-show First Run.
const STORED: SettingsRecord = {
  widthPreset: 'subtle',
  idleTimeoutMs: 90_000,
  penCheckShown: true,
};

function renderSettings(settings: FakeSettings, backup: FakeBackup = fakeBackup()): void {
  render(Settings, {
    settings,
    backup,
    onPresetChange: vi.fn(),
    inkSurfaceFactory: () => fakeInkSurface(),
  });
}

describe('Settings', () => {
  it('keeps exactly one segment active after a tap', async () => {
    renderSettings(fakeSettings(ok(STORED)));

    await screen.findByRole('radiogroup', { name: 'Ink width' });
    await fireEvent.click(preset('Calligraphy'));

    expect(preset('Calligraphy').className).toContain('pill--active');
    expect(preset('Subtle').className).not.toContain('pill--active');
    expect(preset('Expressive').className).not.toContain('pill--active');
  });

  it('renders with the default preset and saves nothing when the read fails', async () => {
    const settings = fakeSettings(err(new Error('IndexedDB blocked')));
    const onPresetChange = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(Settings, {
      settings,
      backup: fakeBackup(),
      onPresetChange,
      inkSurfaceFactory: () => fakeInkSurface(),
    });

    await screen.findByRole('radiogroup', { name: 'Ink width' });
    expect(preset('Expressive').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText(/Couldn't load your settings/)).toBeTruthy();

    // Inert: with no known baseline, writing anything would overwrite real
    // settings with guesses.
    await fireEvent.click(preset('Calligraphy'));
    expect(settings.save).not.toHaveBeenCalled();
    expect(onPresetChange).not.toHaveBeenCalled();
    expect(preset('Expressive').getAttribute('aria-checked')).toBe('true');
  });

  it('keeps the tapped preset for this run when the save fails, with an inline note', async () => {
    const settings = fakeSettings(ok(STORED), err(new Error('quota exceeded')));
    const onPresetChange = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(Settings, {
      settings,
      backup: fakeBackup(),
      onPresetChange,
      inkSurfaceFactory: () => fakeInkSurface(),
    });

    await screen.findByRole('radiogroup', { name: 'Ink width' });
    await fireEvent.click(preset('Calligraphy'));
    await screen.findByText(/won't stick/);

    expect(preset('Calligraphy').getAttribute('aria-checked')).toBe('true');
    // The drill still picks it up for this run -- never a hard block.
    expect(onPresetChange).toHaveBeenCalledWith('calligraphy');
  });

  it('retries by re-tapping the active preset after its save failed', async () => {
    const settings = fakeSettings(ok(STORED), err(new Error('quota exceeded')));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderSettings(settings);

    await screen.findByRole('radiogroup', { name: 'Ink width' });
    await fireEvent.click(preset('Calligraphy'));
    await screen.findByText(/won't stick/);

    settings.save.mockResolvedValueOnce(ok(undefined));
    await fireEvent.click(preset('Calligraphy'));

    expect(settings.save).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/won't stick/)).toBeNull();
  });

  it('does not re-save when the already-active preset is tapped again', async () => {
    const settings = fakeSettings(ok(STORED));
    renderSettings(settings);

    await screen.findByRole('radiogroup', { name: 'Ink width' });
    await fireEvent.click(preset('Subtle'));

    expect(settings.save).not.toHaveBeenCalled();
  });

  it('shows the global read-failure note and leaves both pill groups inert', async () => {
    renderSettings(fakeSettings(err(new Error('IndexedDB blocked'))));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await screen.findByRole('radiogroup', { name: 'Ink width' });
    await screen.findByRole('radiogroup', { name: 'Idle close' });
    expect(screen.getByText(/Couldn't load your settings/)).toBeTruthy();

    // Neither toggle is usable without a known baseline -- both render
    // inert rather than persisting records assembled from guesses.
    for (const name of ['Subtle', 'Expressive', 'Calligraphy', '2 min', '5 min', '10 min'] as const) {
      const segment = screen.getByRole('radio', { name });
      expect(segment.getAttribute('aria-disabled')).toBe('true');
      expect(segment.className).toContain('pill--inert');
    }
  });

  it('still renders inert with the read-failure note when load() rejects outright', async () => {
    // The err path above is the store's contract; this covers the other
    // failure path -- a rejection must not leave the screen blank behind
    // `loaded`.
    const settings: FakeSettings = {
      load: vi.fn().mockRejectedValue(new Error('adapter bug')),
      save: vi.fn().mockResolvedValue(ok(undefined)),
    };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderSettings(settings);

    await screen.findByRole('radiogroup', { name: 'Ink width' });
    await screen.findByRole('radiogroup', { name: 'Idle close' });
    expect(screen.getByText(/Couldn't load your settings/)).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Subtle' }).getAttribute('aria-disabled')).toBe(
      'true',
    );
    consoleError.mockRestore();
  });

  it('keeps one control\'s failure note when the other control\'s active segment is tapped', async () => {
    // Per-control notes (never a shared one): a failed width save's note
    // must survive an unrelated tap on the idle toggle's active segment,
    // without firing a spurious re-save.
    const settings = fakeSettings(
      ok({ ...STORED, idleTimeoutMs: 120_000 }),
      err(new Error('quota exceeded')),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderSettings(settings);

    await screen.findByRole('radiogroup', { name: 'Ink width' });
    await fireEvent.click(preset('Calligraphy'));
    await screen.findByText(/won't stick/);
    expect(settings.save).toHaveBeenCalledTimes(1);

    await fireEvent.click(idlePreset('2 min'));

    expect(settings.save).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/won't stick/)).toBeTruthy();
  });

  it('serializes overlapping width and idle saves so neither change is lost', async () => {
    const settings = fakeSettings(ok({ ...STORED, idleTimeoutMs: 120_000 }));
    let releaseFirst!: (result: Result<void>) => void;
    const firstPending = new Promise<Result<void>>((resolve) => {
      releaseFirst = resolve;
    });
    settings.save = vi
      .fn<(record: SettingsRecord) => Promise<Result<void>>>()
      .mockReturnValueOnce(firstPending)
      .mockResolvedValue(ok(undefined));
    renderSettings(settings);

    await screen.findByRole('radiogroup', { name: 'Ink width' });
    // Two rapid taps across controls before either save resolves -- without
    // the queue, each would build its record from the same stale baseline
    // and whichever resolved last would silently revert the other's change.
    await fireEvent.click(preset('Calligraphy'));
    await fireEvent.click(idlePreset('10 min'));
    releaseFirst(ok(undefined));

    for (let i = 0; i < 50 && settings.save.mock.calls.length < 2; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    expect(settings.save).toHaveBeenCalledTimes(2);
    // The second payload accumulates onto the first's record instead of
    // reverting it.
    expect(settings.save).toHaveBeenNthCalledWith(2, {
      widthPreset: 'calligraphy',
      idleTimeoutMs: 600_000,
      penCheckShown: true,
    });
  });

  describe('idle-close threshold', () => {
    it('keeps exactly one segment active after a tap', async () => {
      renderSettings(fakeSettings(ok({ ...STORED, idleTimeoutMs: 120_000 })));

      await screen.findByRole('radiogroup', { name: 'Idle close' });
      await fireEvent.click(idlePreset('10 min'));

      expect(idlePreset('10 min').className).toContain('pill--active');
      expect(idlePreset('2 min').className).not.toContain('pill--active');
      expect(idlePreset('5 min').className).not.toContain('pill--active');
    });

    it('renders with the default idle preset and saves nothing when the read fails', async () => {
      const settings = fakeSettings(err(new Error('IndexedDB blocked')));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      renderSettings(settings);

      await screen.findByRole('radiogroup', { name: 'Idle close' });
      expect(idlePreset('5 min').getAttribute('aria-checked')).toBe('true');

      await fireEvent.click(idlePreset('10 min'));
      expect(settings.save).not.toHaveBeenCalled();
      expect(idlePreset('5 min').getAttribute('aria-checked')).toBe('true');
    });

    it('keeps the tapped idle preset for this run when the save fails, with an inline note', async () => {
      renderSettings(
        fakeSettings(
          ok({ ...STORED, idleTimeoutMs: 120_000 }),
          err(new Error('quota exceeded')),
        ),
      );
      vi.spyOn(console, 'error').mockImplementation(() => {});

      await screen.findByRole('radiogroup', { name: 'Idle close' });
      await fireEvent.click(idlePreset('10 min'));
      await screen.findByText(/won't stick/);

      expect(idlePreset('10 min').getAttribute('aria-checked')).toBe('true');
    });

    it('does not re-save when the already-active idle preset is tapped again', async () => {
      const settings = fakeSettings(ok({ ...STORED, idleTimeoutMs: 120_000 }));
      renderSettings(settings);

      await screen.findByRole('radiogroup', { name: 'Idle close' });
      await fireEvent.click(idlePreset('2 min'));

      expect(settings.save).not.toHaveBeenCalled();
    });
  });

  describe('export', () => {
    function renderWith(backup: FakeBackup): void {
      renderSettings(fakeSettings(ok(STORED)), backup);
    }

    it('ignores a second tap while an export is in flight', async () => {
      const backup = fakeBackup();
      let release!: (result: Result<void>) => void;
      backup.export.mockReturnValueOnce(
        new Promise<Result<void>>((resolve) => {
          release = resolve;
        }),
      );
      renderWith(backup);

      const button = screen.getByRole('button', { name: 'Download backup' });
      await fireEvent.click(button);
      await fireEvent.click(button);
      expect(backup.export).toHaveBeenCalledTimes(1);

      release(ok(undefined));
      await new Promise((resolve) => setTimeout(resolve, 0));
      await fireEvent.click(button);
      expect(backup.export).toHaveBeenCalledTimes(2);
    });

    it('shows an inline note on failure, and a retry clears it', async () => {
      const backup = fakeBackup();
      backup.export.mockResolvedValue(err(new Error('IndexedDB blocked')));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      renderWith(backup);

      await fireEvent.click(screen.getByRole('button', { name: 'Download backup' }));
      expect(await screen.findByText("Couldn't export -- try again.")).toBeTruthy();

      backup.export.mockResolvedValueOnce(ok(undefined));
      await fireEvent.click(screen.getByRole('button', { name: 'Download backup' }));
      // Let the second export() settle, so a success path that re-set the
      // note would be caught.
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(backup.export).toHaveBeenCalledTimes(2);
      expect(screen.queryByText("Couldn't export -- try again.")).toBeNull();
    });
  });

  describe('import', () => {
    const FAILED = "Couldn't import -- nothing was changed.";

    function renderWith(backup: FakeBackup): void {
      renderSettings(fakeSettings(ok(STORED)), backup);
    }

    function fileInput(): HTMLInputElement {
      return screen.getByTestId('import-file') as HTMLInputElement;
    }

    async function pick(contents = '{"version":2}'): Promise<void> {
      const input = fileInput();
      const file = new File([contents], 'backup.json', { type: 'application/json' });
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      await fireEvent.change(input);
    }

    function flush(): Promise<void> {
      return new Promise((resolve) => setTimeout(resolve, 0));
    }

    it('opens the hidden file picker from the Import button', async () => {
      renderWith(fakeBackup());
      const click = vi.spyOn(fileInput(), 'click').mockImplementation(() => {});

      await fireEvent.click(screen.getByRole('button', { name: 'Import' }));

      expect(click).toHaveBeenCalledTimes(1);
    });

    it('cancel closes the warning with no apply and no note', async () => {
      const backup = fakeBackup();
      renderWith(backup);
      await pick();
      await screen.findByRole('alertdialog');

      await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      await flush();

      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(backup.apply).not.toHaveBeenCalled();
      expect(screen.queryByRole('status')).toBeNull();

      // Picking again re-prepares.
      await pick();
      expect(await screen.findByRole('alertdialog')).toBeTruthy();
      expect(backup.prepare).toHaveBeenCalledTimes(2);
    });

    it('a double tap on Replace applies exactly once', async () => {
      const backup = fakeBackup();
      let release: (result: Result<void>) => void = () => {};
      backup.apply.mockReturnValueOnce(
        new Promise<Result<void>>((resolve) => {
          release = resolve;
        }),
      );
      renderWith(backup);
      await pick();
      await screen.findByRole('alertdialog');

      const replace = screen.getByRole('button', { name: 'Replace everything' });
      await fireEvent.click(replace);
      await fireEvent.click(replace);
      release(ok(undefined));

      expect(await screen.findByText('Imported. Your progress now matches the file.')).toBeTruthy();
      expect(backup.apply).toHaveBeenCalledTimes(1);
    });

    it('a local read failure shows the failed note and no warning', async () => {
      renderWith(fakeBackup(err(new ImportError('failed', 'IndexedDB blocked'))));
      vi.spyOn(console, 'error').mockImplementation(() => {});

      await pick();

      expect(await screen.findByText(FAILED)).toBeTruthy();
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('an apply failure closes the warning and shows the failed note', async () => {
      renderWith(fakeBackup(ok(PENDING), err(new ImportError('failed', 'aborted'))));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      await pick();
      await screen.findByRole('alertdialog');

      await fireEvent.click(screen.getByRole('button', { name: 'Replace everything' }));

      expect(await screen.findByText(FAILED)).toBeTruthy();
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(screen.queryByText('Imported. Your progress now matches the file.')).toBeNull();
    });

    it('Escape on the warning cancels with no apply', async () => {
      const backup = fakeBackup();
      renderWith(backup);
      await pick();
      const dialog = await screen.findByRole('alertdialog');

      await fireEvent.keyDown(dialog, { key: 'Escape' });
      await flush();

      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(backup.apply).not.toHaveBeenCalled();
    });

    it('makes main inert while the warning is open, and restores it after Cancel', async () => {
      renderWith(fakeBackup());
      const main = document.querySelector('main')!;
      expect(main.hasAttribute('inert')).toBe(false);

      await pick();
      await screen.findByRole('alertdialog');
      expect(main.hasAttribute('inert')).toBe(true);

      await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      await flush();
      expect(main.hasAttribute('inert')).toBe(false);
    });

    it('returns focus to the Import button after Cancel', async () => {
      renderWith(fakeBackup());
      await pick();
      await screen.findByRole('alertdialog');

      await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      await flush();

      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Import' }));
    });

    it('a file that cannot be read shows the failed note without preparing', async () => {
      const backup = fakeBackup();
      vi.spyOn(console, 'error').mockImplementation(() => {});
      renderWith(backup);
      const input = fileInput();
      const file = new File(['{}'], 'backup.json', { type: 'application/json' });
      Object.defineProperty(file, 'text', { value: () => Promise.reject(new Error('unreadable')) });
      Object.defineProperty(input, 'files', { value: [file], configurable: true });

      await fireEvent.change(input);

      expect(await screen.findByText(FAILED)).toBeTruthy();
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(backup.prepare).not.toHaveBeenCalled();
    });

    it('keeps only one Backup note: export and import clear each other', async () => {
      const backup = fakeBackup();
      backup.export.mockResolvedValue(err(new Error('IndexedDB blocked')));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      renderWith(backup);

      await fireEvent.click(screen.getByRole('button', { name: 'Download backup' }));
      expect(await screen.findByText("Couldn't export -- try again.")).toBeTruthy();

      await pick();
      await fireEvent.click(await screen.findByRole('button', { name: 'Replace everything' }));
      expect(await screen.findByText('Imported. Your progress now matches the file.')).toBeTruthy();
      expect(screen.queryByText("Couldn't export -- try again.")).toBeNull();

      await fireEvent.click(screen.getByRole('button', { name: 'Download backup' }));
      expect(await screen.findByText("Couldn't export -- try again.")).toBeTruthy();
      expect(screen.queryByText('Imported. Your progress now matches the file.')).toBeNull();
    });
  });
});
