import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import Settings from './Settings.svelte';
import { DEFAULT_SETTINGS, type Settings as SettingsRecord } from '../../domain/settings';
import { err, ok } from '../../domain/result';
import type { SettingsRepository } from '../../ports/settings-repository';
import type { ProgressExporter } from '../../ports/progress-exporter';
import type { Result } from '../../domain/result';

// Faked against the port, never `adapters/persistence` (AD-1's boundary
// rule) -- same approach as FirstRun.test.ts.
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
});
