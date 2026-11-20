import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import Settings from './Settings.svelte';
import { DEFAULT_SETTINGS, type Settings as SettingsRecord } from '../../domain/settings';
import { err, ok } from '../../domain/result';
import type { SettingsRepository } from '../../ports/settings-repository';
import type { ProgressExporter } from '../../ports/progress-exporter';
import type { PendingImport, ProgressImporter } from '../../ports/progress-importer';
import { ImportError } from '../../domain/import';
import type { Result } from '../../domain/result';
import { formatDate } from './format-date';

// Faked against the port, never `adapters/persistence`
// (docs/adr/0001-hexagonal-boundary.md) -- same approach as FirstRun.test.ts.
function repository(
  record: Result<SettingsRecord>,
  saveResult: Result<void> = ok(undefined),
): SettingsRepository & { save: ReturnType<typeof vi.fn> } {
  return {
    get: vi.fn().mockResolvedValue(record),
    save: vi.fn().mockResolvedValue(saveResult),
  };
}

function exporter(
  result: Result<void> = ok(undefined),
): ProgressExporter & { export: ReturnType<typeof vi.fn> } {
  return { export: vi.fn().mockResolvedValue(result) };
}

const PENDING: PendingImport = {
  fileDate: '2026-09-24T08:00:00.000Z',
  localDate: '2026-09-27T09:00:00.000Z',
  data: { tallies: [], attempts: [], sessions: [] },
};

function importer(
  prepared: Result<PendingImport> = ok(PENDING),
  applied: Result<void> = ok(undefined),
): ProgressImporter & { prepare: ReturnType<typeof vi.fn>; apply: ReturnType<typeof vi.fn> } {
  return {
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

describe('Settings', () => {
  it('preselects the preset the repository reports', async () => {
    render(Settings, {
      progressExporter: exporter(),
      progressImporter: importer(),
      settingsRepository: repository(ok(STORED)),
      onPresetChange: vi.fn(),
      onBack: vi.fn(),
    });

    await screen.findByRole('radiogroup', { name: 'Ink width' });
    expect(preset('Subtle').getAttribute('aria-checked')).toBe('true');
    expect(preset('Expressive').getAttribute('aria-checked')).toBe('false');
  });

  it('keeps exactly one segment active after a tap', async () => {
    render(Settings, {
      progressExporter: exporter(),
      progressImporter: importer(),
      settingsRepository: repository(ok(STORED)),
      onPresetChange: vi.fn(),
      onBack: vi.fn(),
    });

    await screen.findByRole('radiogroup', { name: 'Ink width' });
    await fireEvent.click(preset('Calligraphy'));

    expect(preset('Calligraphy').className).toContain('pill--active');
    expect(preset('Subtle').className).not.toContain('pill--active');
    expect(preset('Expressive').className).not.toContain('pill--active');
  });

  it('saves immediately, with no confirm step, and reports the change upward', async () => {
    const settingsRepository = repository(ok(STORED));
    const onPresetChange = vi.fn();
    render(Settings, {
      progressExporter: exporter(),
      progressImporter: importer(),
      settingsRepository,
      onPresetChange,
      onBack: vi.fn(),
    });

    await screen.findByRole('radiogroup', { name: 'Ink width' });
    await fireEvent.click(preset('Calligraphy'));

    expect(onPresetChange).toHaveBeenCalledWith('calligraphy');
    expect(settingsRepository.save).toHaveBeenCalledTimes(1);
  });

  it('saves the last-read record with only widthPreset changed', async () => {
    const settingsRepository = repository(ok(STORED));
    render(Settings, {
      settingsRepository,
      progressExporter: exporter(),
      progressImporter: importer(),
      onPresetChange: vi.fn(),
      onBack: vi.fn(),
    });

    await screen.findByRole('radiogroup', { name: 'Ink width' });
    await fireEvent.click(preset('Expressive'));

    // penCheckShown and idleTimeoutMs survive untouched -- a record rebuilt
    // from DEFAULT_SETTINGS would have clobbered both.
    expect(settingsRepository.save).toHaveBeenCalledWith({
      widthPreset: 'expressive',
      idleTimeoutMs: 90_000,
      penCheckShown: true,
    });
    expect(DEFAULT_SETTINGS.idleTimeoutMs).not.toBe(90_000);
  });

  it('renders with the default preset and saves nothing when the read fails', async () => {
    const settingsRepository = repository(err(new Error('IndexedDB blocked')));
    const onPresetChange = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(Settings, {
      progressExporter: exporter(),
      progressImporter: importer(),
      settingsRepository,
      onPresetChange,
      onBack: vi.fn(),
    });

    await screen.findByRole('radiogroup', { name: 'Ink width' });
    expect(preset('Expressive').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText(/Couldn't load your settings/)).toBeTruthy();

    // Inert: with no known baseline, writing anything would overwrite real
    // settings with guesses.
    await fireEvent.click(preset('Calligraphy'));
    expect(settingsRepository.save).not.toHaveBeenCalled();
    expect(onPresetChange).not.toHaveBeenCalled();
    expect(preset('Expressive').getAttribute('aria-checked')).toBe('true');
  });

  it('keeps the tapped preset for this run when the save fails, with an inline note', async () => {
    const settingsRepository = repository(ok(STORED), err(new Error('quota exceeded')));
    const onPresetChange = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(Settings, {
      progressExporter: exporter(),
      progressImporter: importer(),
      settingsRepository,
      onPresetChange,
      onBack: vi.fn(),
    });

    await screen.findByRole('radiogroup', { name: 'Ink width' });
    await fireEvent.click(preset('Calligraphy'));
    await screen.findByText(/won't stick/);

    expect(preset('Calligraphy').getAttribute('aria-checked')).toBe('true');
    // The drill still picks it up for this run -- never a hard block.
    expect(onPresetChange).toHaveBeenCalledWith('calligraphy');
  });

  it('retries by re-tapping the active preset after its save failed', async () => {
    const settingsRepository = repository(ok(STORED), err(new Error('quota exceeded')));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(Settings, {
      progressExporter: exporter(),
      progressImporter: importer(),
      settingsRepository,
      onPresetChange: vi.fn(),
      onBack: vi.fn(),
    });

    await screen.findByRole('radiogroup', { name: 'Ink width' });
    await fireEvent.click(preset('Calligraphy'));
    await screen.findByText(/won't stick/);

    settingsRepository.save.mockResolvedValueOnce(ok(undefined));
    await fireEvent.click(preset('Calligraphy'));

    expect(settingsRepository.save).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/won't stick/)).toBeNull();
  });

  it('does not re-save when the already-active preset is tapped again', async () => {
    const settingsRepository = repository(ok(STORED));
    render(Settings, {
      settingsRepository,
      progressExporter: exporter(),
      progressImporter: importer(),
      onPresetChange: vi.fn(),
      onBack: vi.fn(),
    });

    await screen.findByRole('radiogroup', { name: 'Ink width' });
    await fireEvent.click(preset('Subtle'));

    expect(settingsRepository.save).not.toHaveBeenCalled();
  });

  it('shows the global read-failure note and leaves both pill groups inert', async () => {
    const settingsRepository = repository(err(new Error('IndexedDB blocked')));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(Settings, {
      progressExporter: exporter(),
      progressImporter: importer(),
      settingsRepository,
      onPresetChange: vi.fn(),
      onBack: vi.fn(),
    });

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

  it('keeps one control\'s failure note when the other control\'s active segment is tapped', async () => {
    // Per-control notes (never a shared one): a failed width save's note
    // must survive an unrelated tap on the idle toggle's active segment,
    // without firing a spurious re-save.
    const settingsRepository = repository(
      ok({ ...STORED, idleTimeoutMs: 120_000 }),
      err(new Error('quota exceeded')),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(Settings, {
      progressExporter: exporter(),
      progressImporter: importer(),
      settingsRepository,
      onPresetChange: vi.fn(),
      onBack: vi.fn(),
    });

    await screen.findByRole('radiogroup', { name: 'Ink width' });
    await fireEvent.click(preset('Calligraphy'));
    await screen.findByText(/won't stick/);
    expect(settingsRepository.save).toHaveBeenCalledTimes(1);

    await fireEvent.click(idlePreset('2 min'));

    expect(settingsRepository.save).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/won't stick/)).toBeTruthy();
  });

  it('serializes overlapping width and idle saves so neither change is lost', async () => {
    const settingsRepository = repository(ok({ ...STORED, idleTimeoutMs: 120_000 }));
    let releaseFirst!: (result: Result<void>) => void;
    const firstPending = new Promise<Result<void>>((resolve) => {
      releaseFirst = resolve;
    });
    settingsRepository.save = vi
      .fn()
      .mockReturnValueOnce(firstPending)
      .mockResolvedValue(ok(undefined));
    render(Settings, {
      progressExporter: exporter(),
      progressImporter: importer(),
      settingsRepository,
      onPresetChange: vi.fn(),
      onBack: vi.fn(),
    });

    await screen.findByRole('radiogroup', { name: 'Ink width' });
    // Two rapid taps across controls before either save resolves -- without
    // the queue, each would build its record from the same stale baseline
    // and whichever resolved last would silently revert the other's change.
    await fireEvent.click(preset('Calligraphy'));
    await fireEvent.click(idlePreset('10 min'));
    releaseFirst(ok(undefined));

    for (let i = 0; i < 50 && settingsRepository.save.mock.calls.length < 2; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    expect(settingsRepository.save).toHaveBeenCalledTimes(2);
    // The second payload accumulates onto the first's record instead of
    // reverting it.
    expect(settingsRepository.save).toHaveBeenNthCalledWith(2, {
      widthPreset: 'calligraphy',
      idleTimeoutMs: 600_000,
      penCheckShown: true,
    });
  });

  it('calls onBack from the Back control', async () => {
    const onBack = vi.fn();
    render(Settings, {
      progressExporter: exporter(),
      progressImporter: importer(),
      settingsRepository: repository(ok(STORED)),
      onPresetChange: vi.fn(),
      onBack,
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  describe('idle-close threshold', () => {
    it('preselects the idle preset the repository reports', async () => {
      render(Settings, {
        progressExporter: exporter(),
        progressImporter: importer(),
        settingsRepository: repository(ok({ ...STORED, idleTimeoutMs: 120_000 })),
        onPresetChange: vi.fn(),
        onBack: vi.fn(),
      });

      await screen.findByRole('radiogroup', { name: 'Idle close' });
      expect(idlePreset('2 min').getAttribute('aria-checked')).toBe('true');
      expect(idlePreset('5 min').getAttribute('aria-checked')).toBe('false');
      expect(idlePreset('10 min').getAttribute('aria-checked')).toBe('false');
    });

    it('keeps exactly one segment active after a tap', async () => {
      render(Settings, {
        progressExporter: exporter(),
        progressImporter: importer(),
        settingsRepository: repository(ok({ ...STORED, idleTimeoutMs: 120_000 })),
        onPresetChange: vi.fn(),
        onBack: vi.fn(),
      });

      await screen.findByRole('radiogroup', { name: 'Idle close' });
      await fireEvent.click(idlePreset('10 min'));

      expect(idlePreset('10 min').className).toContain('pill--active');
      expect(idlePreset('2 min').className).not.toContain('pill--active');
      expect(idlePreset('5 min').className).not.toContain('pill--active');
    });

    it('saves immediately, with no confirm step', async () => {
      const settingsRepository = repository(ok({ ...STORED, idleTimeoutMs: 120_000 }));
      render(Settings, {
        progressExporter: exporter(),
        progressImporter: importer(),
        settingsRepository,
        onPresetChange: vi.fn(),
        onBack: vi.fn(),
      });

      await screen.findByRole('radiogroup', { name: 'Idle close' });
      await fireEvent.click(idlePreset('10 min'));

      expect(settingsRepository.save).toHaveBeenCalledTimes(1);
    });

    it('saves the last-read record with only idleTimeoutMs changed', async () => {
      const settingsRepository = repository(ok({ ...STORED, idleTimeoutMs: 120_000 }));
      render(Settings, {
        progressExporter: exporter(),
        progressImporter: importer(),
        settingsRepository,
        onPresetChange: vi.fn(),
        onBack: vi.fn(),
      });

      await screen.findByRole('radiogroup', { name: 'Idle close' });
      await fireEvent.click(idlePreset('10 min'));

      // widthPreset and penCheckShown survive untouched.
      expect(settingsRepository.save).toHaveBeenCalledWith({
        widthPreset: 'subtle',
        idleTimeoutMs: 600_000,
        penCheckShown: true,
      });
    });

    it('renders with the default idle preset and saves nothing when the read fails', async () => {
      const settingsRepository = repository(err(new Error('IndexedDB blocked')));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      render(Settings, {
        progressExporter: exporter(),
        progressImporter: importer(),
        settingsRepository,
        onPresetChange: vi.fn(),
        onBack: vi.fn(),
      });

      await screen.findByRole('radiogroup', { name: 'Idle close' });
      expect(idlePreset('5 min').getAttribute('aria-checked')).toBe('true');

      await fireEvent.click(idlePreset('10 min'));
      expect(settingsRepository.save).not.toHaveBeenCalled();
      expect(idlePreset('5 min').getAttribute('aria-checked')).toBe('true');
    });

    it('keeps the tapped idle preset for this run when the save fails, with an inline note', async () => {
      const settingsRepository = repository(
        ok({ ...STORED, idleTimeoutMs: 120_000 }),
        err(new Error('quota exceeded')),
      );
      vi.spyOn(console, 'error').mockImplementation(() => {});
      render(Settings, {
        progressExporter: exporter(),
        progressImporter: importer(),
        settingsRepository,
        onPresetChange: vi.fn(),
        onBack: vi.fn(),
      });

      await screen.findByRole('radiogroup', { name: 'Idle close' });
      await fireEvent.click(idlePreset('10 min'));
      await screen.findByText(/won't stick/);

      expect(idlePreset('10 min').getAttribute('aria-checked')).toBe('true');
    });

    it('does not re-save when the already-active idle preset is tapped again', async () => {
      const settingsRepository = repository(ok({ ...STORED, idleTimeoutMs: 120_000 }));
      render(Settings, {
        progressExporter: exporter(),
        progressImporter: importer(),
        settingsRepository,
        onPresetChange: vi.fn(),
        onBack: vi.fn(),
      });

      await screen.findByRole('radiogroup', { name: 'Idle close' });
      await fireEvent.click(idlePreset('2 min'));

      expect(settingsRepository.save).not.toHaveBeenCalled();
    });

    it('renders no segment active when the stored idleTimeoutMs matches none of the three presets', async () => {
      // STORED.idleTimeoutMs (90_000) is deliberately off-preset -- mirrors
      // the ink-width toggle's coverage of an unrecognized stored value.
      render(Settings, {
        progressExporter: exporter(),
        progressImporter: importer(),
        settingsRepository: repository(ok(STORED)),
        onPresetChange: vi.fn(),
        onBack: vi.fn(),
      });

      await screen.findByRole('radiogroup', { name: 'Idle close' });

      expect(idlePreset('2 min').getAttribute('aria-checked')).toBe('false');
      expect(idlePreset('5 min').getAttribute('aria-checked')).toBe('false');
      expect(idlePreset('10 min').getAttribute('aria-checked')).toBe('false');
      expect(idlePreset('2 min').className).not.toContain('pill--active');
      expect(idlePreset('5 min').className).not.toContain('pill--active');
      expect(idlePreset('10 min').className).not.toContain('pill--active');
    });
  });

  describe('export', () => {
    function renderWith(progressExporter: ProgressExporter): void {
      render(Settings, {
        settingsRepository: repository(ok(STORED)),
        progressExporter,
        progressImporter: importer(),
        onPresetChange: vi.fn(),
        onBack: vi.fn(),
      });
    }

    it('shows an Export button under a Backup heading', () => {
      renderWith(exporter());

      expect(screen.getByRole('heading', { name: 'Backup' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Export' })).toBeTruthy();
    });

    it('calls export() once per tap', async () => {
      const progressExporter = exporter();
      renderWith(progressExporter);

      await fireEvent.click(screen.getByRole('button', { name: 'Export' }));

      expect(progressExporter.export).toHaveBeenCalledTimes(1);
    });

    it('ignores a second tap while an export is in flight', async () => {
      const progressExporter = exporter();
      let release!: (result: Result<void>) => void;
      progressExporter.export.mockReturnValueOnce(
        new Promise<Result<void>>((resolve) => {
          release = resolve;
        }),
      );
      renderWith(progressExporter);

      const button = screen.getByRole('button', { name: 'Export' });
      await fireEvent.click(button);
      await fireEvent.click(button);
      expect(progressExporter.export).toHaveBeenCalledTimes(1);

      release(ok(undefined));
      await new Promise((resolve) => setTimeout(resolve, 0));
      await fireEvent.click(button);
      expect(progressExporter.export).toHaveBeenCalledTimes(2);
    });

    it('shows an inline note on failure, and a retry clears it', async () => {
      const progressExporter = exporter(err(new Error('IndexedDB blocked')));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      renderWith(progressExporter);

      await fireEvent.click(screen.getByRole('button', { name: 'Export' }));
      expect(await screen.findByText("Couldn't export -- try again.")).toBeTruthy();

      progressExporter.export.mockResolvedValueOnce(ok(undefined));
      await fireEvent.click(screen.getByRole('button', { name: 'Export' }));
      // Let the second export() settle, so a success path that re-set the
      // note would be caught.
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(progressExporter.export).toHaveBeenCalledTimes(2);
      expect(screen.queryByText("Couldn't export -- try again.")).toBeNull();
    });

    it('shows the note when export() rejects', async () => {
      const progressExporter = exporter();
      progressExporter.export.mockRejectedValueOnce(new Error('boom'));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      renderWith(progressExporter);

      await fireEvent.click(screen.getByRole('button', { name: 'Export' }));

      expect(await screen.findByText("Couldn't export -- try again.")).toBeTruthy();
    });
  });

  describe('import', () => {
    const INVALID = "That file isn't a tegakko backup -- nothing was changed.";
    const FAILED = "Couldn't import -- nothing was changed.";
    const IMPORTED = 'Imported. Your progress now matches the file.';

    function renderWith(progressImporter: ProgressImporter): void {
      render(Settings, {
        settingsRepository: repository(ok(STORED)),
        progressExporter: exporter(),
        progressImporter,
        onPresetChange: vi.fn(),
        onBack: vi.fn(),
      });
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

    it('shows an Import button under Backup, next to Export', () => {
      renderWith(importer());

      expect(screen.getByRole('button', { name: 'Import' })).toBeTruthy();
      expect(fileInput().accept).toBe('.json,application/json');
    });

    it('opens the hidden file picker from the Import button', async () => {
      renderWith(importer());
      const click = vi.spyOn(fileInput(), 'click').mockImplementation(() => {});

      await fireEvent.click(screen.getByRole('button', { name: 'Import' }));

      expect(click).toHaveBeenCalledTimes(1);
    });

    it('shows the warning with both dates for a valid file, and writes nothing yet', async () => {
      const progressImporter = importer();
      renderWith(progressImporter);

      await pick('{"file":true}');

      const dialog = await screen.findByRole('alertdialog');
      expect(dialog.getAttribute('aria-modal')).toBe('true');
      expect(progressImporter.prepare).toHaveBeenCalledWith('{"file":true}');
      expect(
        screen.getByText('Importing replaces everything here — miss counts, attempts, history.'),
      ).toBeTruthy();
      expect(
        screen.getByText(`On this device: last practiced ${formatDate(PENDING.localDate!)}`),
      ).toBeTruthy();
      expect(screen.getByText(`In the file: ${formatDate(PENDING.fileDate)}`)).toBeTruthy();
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
      expect(progressImporter.apply).not.toHaveBeenCalled();
      // Reset so the same file can be picked again.
      expect(fileInput().value).toBe('');
    });

    it('says "nothing yet" when there is no local activity', async () => {
      renderWith(importer(ok({ ...PENDING, localDate: null })));

      await pick();

      expect(await screen.findByText('On this device: nothing yet')).toBeTruthy();
    });

    it('cancel closes the warning with no apply and no note', async () => {
      const progressImporter = importer();
      renderWith(progressImporter);
      await pick();
      await screen.findByRole('alertdialog');

      await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      await flush();

      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(progressImporter.apply).not.toHaveBeenCalled();
      expect(screen.queryByRole('status')).toBeNull();

      // Picking again re-prepares.
      await pick();
      expect(await screen.findByRole('alertdialog')).toBeTruthy();
      expect(progressImporter.prepare).toHaveBeenCalledTimes(2);
    });

    it('confirm applies exactly the pending import once and shows the note', async () => {
      const progressImporter = importer();
      renderWith(progressImporter);
      await pick();
      await screen.findByRole('alertdialog');

      await fireEvent.click(screen.getByRole('button', { name: 'Replace everything' }));

      expect(await screen.findByText(IMPORTED)).toBeTruthy();
      expect(progressImporter.apply).toHaveBeenCalledTimes(1);
      expect(progressImporter.apply).toHaveBeenCalledWith(PENDING);
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('hands apply() plain, structured-cloneable data, never a reactive proxy', async () => {
      // IndexedDB structured-clones every record it stores, and a Svelte
      // `$state` proxy can't be cloned -- the real replacer would abort with
      // "could not be cloned" (found in manual testing on the tablet).
      const progressImporter = importer();
      progressImporter.apply.mockImplementation((pending: PendingImport) => {
        structuredClone(pending.data);
        return Promise.resolve(ok(undefined));
      });
      renderWith(progressImporter);
      await pick();
      await screen.findByRole('alertdialog');

      await fireEvent.click(screen.getByRole('button', { name: 'Replace everything' }));

      expect(await screen.findByText(IMPORTED)).toBeTruthy();
    });

    it('a double tap on Replace applies exactly once', async () => {
      const progressImporter = importer();
      let release: (result: Result<void>) => void = () => {};
      progressImporter.apply.mockReturnValueOnce(
        new Promise<Result<void>>((resolve) => {
          release = resolve;
        }),
      );
      renderWith(progressImporter);
      await pick();
      await screen.findByRole('alertdialog');

      const replace = screen.getByRole('button', { name: 'Replace everything' });
      await fireEvent.click(replace);
      await fireEvent.click(replace);
      release(ok(undefined));

      expect(await screen.findByText(IMPORTED)).toBeTruthy();
      expect(progressImporter.apply).toHaveBeenCalledTimes(1);
    });

    it('a rejected file shows the inline note and no warning', async () => {
      const progressImporter = importer(err(new ImportError('invalid', 'version: expected 2')));
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      renderWith(progressImporter);

      await pick('nope');

      expect(await screen.findByText(INVALID)).toBeTruthy();
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(progressImporter.apply).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalled();
    });

    it('a local read failure shows the failed note and no warning', async () => {
      const progressImporter = importer(err(new ImportError('failed', 'IndexedDB blocked')));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      renderWith(progressImporter);

      await pick();

      expect(await screen.findByText(FAILED)).toBeTruthy();
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('an apply failure closes the warning and shows the failed note', async () => {
      const progressImporter = importer(ok(PENDING), err(new ImportError('failed', 'aborted')));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      renderWith(progressImporter);
      await pick();
      await screen.findByRole('alertdialog');

      await fireEvent.click(screen.getByRole('button', { name: 'Replace everything' }));

      expect(await screen.findByText(FAILED)).toBeTruthy();
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(screen.queryByText(IMPORTED)).toBeNull();
    });

    it('Escape on the warning cancels with no apply', async () => {
      const progressImporter = importer();
      renderWith(progressImporter);
      await pick();
      const dialog = await screen.findByRole('alertdialog');

      await fireEvent.keyDown(dialog, { key: 'Escape' });
      await flush();

      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(progressImporter.apply).not.toHaveBeenCalled();
    });

    it('makes main inert while the warning is open, and restores it after Cancel', async () => {
      renderWith(importer());
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
      renderWith(importer());
      await pick();
      await screen.findByRole('alertdialog');

      await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      await flush();

      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Import' }));
    });

    it('a file that cannot be read shows the failed note without preparing', async () => {
      const progressImporter = importer();
      vi.spyOn(console, 'error').mockImplementation(() => {});
      renderWith(progressImporter);
      const input = fileInput();
      const file = new File(['{}'], 'backup.json', { type: 'application/json' });
      Object.defineProperty(file, 'text', { value: () => Promise.reject(new Error('unreadable')) });
      Object.defineProperty(input, 'files', { value: [file], configurable: true });

      await fireEvent.change(input);

      expect(await screen.findByText(FAILED)).toBeTruthy();
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(progressImporter.prepare).not.toHaveBeenCalled();
    });

    it('keeps only one Backup note: export and import clear each other', async () => {
      const progressExporter = exporter(err(new Error('IndexedDB blocked')));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      render(Settings, {
        settingsRepository: repository(ok(STORED)),
        progressExporter,
        progressImporter: importer(),
        onPresetChange: vi.fn(),
        onBack: vi.fn(),
      });

      await fireEvent.click(screen.getByRole('button', { name: 'Export' }));
      expect(await screen.findByText("Couldn't export -- try again.")).toBeTruthy();

      await pick();
      await fireEvent.click(await screen.findByRole('button', { name: 'Replace everything' }));
      expect(await screen.findByText(IMPORTED)).toBeTruthy();
      expect(screen.queryByText("Couldn't export -- try again.")).toBeNull();

      await fireEvent.click(screen.getByRole('button', { name: 'Export' }));
      expect(await screen.findByText("Couldn't export -- try again.")).toBeTruthy();
      expect(screen.queryByText(IMPORTED)).toBeNull();
    });

    it('an apply rejection also shows the failed note', async () => {
      const progressImporter = importer();
      progressImporter.apply.mockRejectedValueOnce(new Error('boom'));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      renderWith(progressImporter);
      await pick();
      await screen.findByRole('alertdialog');

      await fireEvent.click(screen.getByRole('button', { name: 'Replace everything' }));

      expect(await screen.findByText(FAILED)).toBeTruthy();
    });
  });
});
