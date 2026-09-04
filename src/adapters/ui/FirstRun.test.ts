import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import FirstRun from './FirstRun.svelte';
import { DEFAULT_SETTINGS } from '../../domain/settings';
import { err, ok, type Result } from '../../domain/result';
import type { Settings } from '../../domain/settings';
import type { SettingsRepository } from '../../ports/settings-repository';

function fakeRepository(overrides: Partial<SettingsRepository> = {}): SettingsRepository {
  return {
    get: vi.fn(async (): Promise<Result<Settings>> => ok({ ...DEFAULT_SETTINGS })),
    save: vi.fn(async (): Promise<Result<void>> => ok(undefined)),
    ...overrides,
  };
}

// `fireEvent` (re-exported from @testing-library/svelte, wrapping
// @testing-library/dom's) waits for Svelte to flush the resulting state
// change to the DOM before resolving -- a raw `target.dispatchEvent(...)`
// doesn't, so an assertion right after it can race Svelte's own scheduling.
function dispatchPointer(
  target: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  init: PointerEventInit,
): Promise<boolean> {
  return fireEvent(target, new PointerEvent(type, { bubbles: true, cancelable: true, ...init }));
}

describe('FirstRun', () => {
  it('updates the pressure readout across multiple pointermove events, not just the first', async () => {
    const settingsRepository = fakeRepository();
    render(FirstRun, { settingsRepository, onDismiss: vi.fn() });

    const pad = screen.getByText('touch here').parentElement as HTMLElement;

    await dispatchPointer(pad, 'pointermove', { pointerType: 'pen', pressure: 0.2 });
    expect(screen.getByText('0.20')).toBeTruthy();

    await dispatchPointer(pad, 'pointermove', { pointerType: 'pen', pressure: 0.55 });
    expect(screen.getByText('0.55')).toBeTruthy();

    await dispatchPointer(pad, 'pointermove', { pointerType: 'pen', pressure: 0.91 });
    expect(screen.getByText('0.91')).toBeTruthy();
  });

  it('transitions the chip from idle to pressure-detected on a pen pointer with pressure', async () => {
    const settingsRepository = fakeRepository();
    render(FirstRun, { settingsRepository, onDismiss: vi.fn() });

    expect(screen.getByText('Touch the pad with your stylus')).toBeTruthy();

    const pad = screen.getByText('touch here').parentElement as HTMLElement;
    await dispatchPointer(pad, 'pointermove', { pointerType: 'pen', pressure: 0.4 });

    expect(screen.getByText('Stylus found')).toBeTruthy();
  });

  it('transitions the chip from idle to no-pressure for a non-pen pointer', async () => {
    const settingsRepository = fakeRepository();
    render(FirstRun, { settingsRepository, onDismiss: vi.fn() });

    const pad = screen.getByText('touch here').parentElement as HTMLElement;
    await dispatchPointer(pad, 'pointermove', { pointerType: 'mouse', pressure: 0 });

    expect(screen.getByText('No pressure input detected')).toBeTruthy();
  });

  it('transitions to no-pressure only on pointerup, not on a zero-pressure pointermove', async () => {
    const settingsRepository = fakeRepository();
    render(FirstRun, { settingsRepository, onDismiss: vi.fn() });

    const pad = screen.getByText('touch here').parentElement as HTMLElement;
    await dispatchPointer(pad, 'pointerdown', { pointerType: 'pen', pressure: 0 });
    expect(screen.getByText('Touch the pad with your stylus')).toBeTruthy();

    await dispatchPointer(pad, 'pointerup', { pointerType: 'pen', pressure: 0 });
    expect(screen.getByText('No pressure input detected')).toBeTruthy();
  });

  it('does not confirm a pressure sensor on a lone 0.5 reading (the no-pressure-API default), but does once a differing reading arrives', async () => {
    const settingsRepository = fakeRepository();
    render(FirstRun, { settingsRepository, onDismiss: vi.fn() });

    const pad = screen.getByText('touch here').parentElement as HTMLElement;
    await dispatchPointer(pad, 'pointermove', { pointerType: 'pen', pressure: 0.5 });
    expect(screen.getByText('Touch the pad with your stylus')).toBeTruthy();

    await dispatchPointer(pad, 'pointermove', { pointerType: 'pen', pressure: 0.62 });
    expect(screen.getByText('Stylus found')).toBeTruthy();
  });

  it('stays undetected across repeated 0.5 readings and falls back to no-pressure on liftoff', async () => {
    const settingsRepository = fakeRepository();
    render(FirstRun, { settingsRepository, onDismiss: vi.fn() });

    const pad = screen.getByText('touch here').parentElement as HTMLElement;
    await dispatchPointer(pad, 'pointermove', { pointerType: 'pen', pressure: 0.5 });
    await dispatchPointer(pad, 'pointermove', { pointerType: 'pen', pressure: 0.5 });
    expect(screen.getByText('Touch the pad with your stylus')).toBeTruthy();

    await dispatchPointer(pad, 'pointerup', { pointerType: 'pen', pressure: 0.5 });
    expect(screen.getByText('No pressure input detected')).toBeTruthy();
  });

  it('keeps the readout live after confirmation even when a later reading is exactly 0.5', async () => {
    const settingsRepository = fakeRepository();
    render(FirstRun, { settingsRepository, onDismiss: vi.fn() });

    const pad = screen.getByText('touch here').parentElement as HTMLElement;
    await dispatchPointer(pad, 'pointermove', { pointerType: 'pen', pressure: 0.62 });
    expect(screen.getByText('0.62')).toBeTruthy();

    await dispatchPointer(pad, 'pointermove', { pointerType: 'pen', pressure: 0.5 });
    expect(screen.getByText('0.50')).toBeTruthy();
  });

  it('never hard-blocks: "Just use it here" dismisses the screen on a successful save', async () => {
    const onDismiss = vi.fn();
    const settingsRepository = fakeRepository();
    render(FirstRun, { settingsRepository, onDismiss });

    await fireEvent.click(screen.getByText('Just use it here'));
    await vi.waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1));
  });

  it('shows a generic error note (not the raw Error message) on a save failure, without dismissing', async () => {
    const onDismiss = vi.fn();
    const settingsRepository = fakeRepository({
      save: vi.fn(async (): Promise<Result<void>> => err(new Error('quota exceeded on put()'))),
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(FirstRun, { settingsRepository, onDismiss });

    await fireEvent.click(screen.getByText('Just use it here'));

    const errorNote = await screen.findByText(/Couldn't save that/);
    expect(errorNote.textContent).not.toContain('quota exceeded on put()');
    expect(onDismiss).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();

    // A follow-up tap still gets the learner past the screen -- the failure
    // is surfaced, never a hard block.
    await fireEvent.click(screen.getByText('Just use it here'));
    await vi.waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1));

    consoleError.mockRestore();
  });

  it('shows a generic error note and does not overwrite settings when the pre-save read fails', async () => {
    const onDismiss = vi.fn();
    const settingsRepository = fakeRepository({
      get: vi.fn(async (): Promise<Result<Settings>> => err(new Error('IndexedDB blocked'))),
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(FirstRun, { settingsRepository, onDismiss });

    await fireEvent.click(screen.getByText('Just use it here'));

    const errorNote = await screen.findByText(/Couldn't save that/);
    expect(errorNote.textContent).not.toContain('IndexedDB blocked');
    expect(settingsRepository.save).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });

  // `beforeinstallprompt` isn't in lib.dom's WindowEventMap (see the
  // component's own local declaration) -- construct a plain Event and
  // attach the two fields the component actually reads.
  function fireInstallPrompt(overrides: {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  }): void {
    const event = Object.assign(new Event('beforeinstallprompt'), overrides);
    window.dispatchEvent(event);
  }

  it('persists penCheckShown and dismisses when the install prompt is accepted', async () => {
    const onDismiss = vi.fn();
    const settingsRepository = fakeRepository();
    render(FirstRun, { settingsRepository, onDismiss });

    fireInstallPrompt({
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: 'accepted', platform: '' }),
    });

    const installButton = await screen.findByText('Install');
    await fireEvent.click(installButton);

    await vi.waitFor(() =>
      expect(settingsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ penCheckShown: true }),
      ),
    );
    await vi.waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1));
  });

  it('shows an error note and does not dismiss when the install prompt itself fails', async () => {
    const onDismiss = vi.fn();
    const settingsRepository = fakeRepository();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(FirstRun, { settingsRepository, onDismiss });

    fireInstallPrompt({
      prompt: vi.fn().mockRejectedValue(new Error('prompt already used')),
      userChoice: Promise.resolve({ outcome: 'dismissed', platform: '' }),
    });

    const installButton = await screen.findByText('Install');
    await fireEvent.click(installButton);

    await screen.findByText(/Couldn't open the install prompt/);
    expect(settingsRepository.save).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it('still persists penCheckShown via "Just use it here" after an earlier install-prompt failure', async () => {
    const onDismiss = vi.fn();
    const settingsRepository = fakeRepository();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(FirstRun, { settingsRepository, onDismiss });

    fireInstallPrompt({
      prompt: vi.fn().mockRejectedValue(new Error('prompt already used')),
      userChoice: Promise.resolve({ outcome: 'dismissed', platform: '' }),
    });
    const installButton = await screen.findByText('Install');
    await fireEvent.click(installButton);
    await screen.findByText(/Couldn't open the install prompt/);

    // The install prompt failing never attempted a save -- a follow-up
    // "Just use it here" tap must still actually persist penCheckShown,
    // not silently ride the install failure's error note through to
    // dismiss.
    await fireEvent.click(screen.getByText('Just use it here'));

    await vi.waitFor(() =>
      expect(settingsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ penCheckShown: true }),
      ),
    );
    await vi.waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1));

    consoleError.mockRestore();
  });
});
