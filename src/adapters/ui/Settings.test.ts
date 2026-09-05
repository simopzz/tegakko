import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import Settings from './Settings.svelte';
import { DEFAULT_SETTINGS, type Settings as SettingsRecord } from '../../domain/settings';
import { err, ok } from '../../domain/result';
import type { SettingsRepository } from '../../ports/settings-repository';
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

function preset(name: 'Subtle' | 'Expressive' | 'Calligraphy'): HTMLElement {
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
    render(Settings, { settingsRepository, onPresetChange, onBack: vi.fn() });

    await screen.findByRole('radiogroup', { name: 'Ink width' });
    await fireEvent.click(preset('Calligraphy'));

    expect(onPresetChange).toHaveBeenCalledWith('calligraphy');
    expect(settingsRepository.save).toHaveBeenCalledTimes(1);
  });

  it('saves the last-read record with only widthPreset changed', async () => {
    const settingsRepository = repository(ok(STORED));
    render(Settings, {
      settingsRepository,
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
    render(Settings, { settingsRepository, onPresetChange, onBack: vi.fn() });

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
    render(Settings, { settingsRepository, onPresetChange, onBack: vi.fn() });

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
    render(Settings, { settingsRepository, onPresetChange: vi.fn(), onBack: vi.fn() });

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
      onPresetChange: vi.fn(),
      onBack: vi.fn(),
    });

    await screen.findByRole('radiogroup', { name: 'Ink width' });
    await fireEvent.click(preset('Subtle'));

    expect(settingsRepository.save).not.toHaveBeenCalled();
  });

  it('calls onBack from the Back control', async () => {
    const onBack = vi.fn();
    render(Settings, {
      settingsRepository: repository(ok(STORED)),
      onPresetChange: vi.fn(),
      onBack,
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('shows no idle-timeout control -- Story 1.9 adds that', async () => {
    render(Settings, {
      settingsRepository: repository(ok(STORED)),
      onPresetChange: vi.fn(),
      onBack: vi.fn(),
    });

    await screen.findByRole('radiogroup', { name: 'Ink width' });
    expect(screen.queryByRole('radiogroup', { name: /idle/i })).toBeNull();
  });
});
