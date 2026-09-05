import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { DEFAULT_SETTINGS } from '../domain/settings';
import { err, ok } from '../domain/result';

const getMock = vi.fn();

// A plain class, not `vi.fn().mockImplementation(() => ({...}))` -- App.svelte
// invokes this with `new`, and an arrow function can never be used as a
// constructor (vitest surfaces that as "... is not a constructor" at
// runtime, not as a type error, since the mock factory returns `unknown`).
class StubSettingsRepository {
  get = getMock;
  // Resolves a real `Result`: Settings.svelte awaits this, so a bare
  // `vi.fn()` returning `undefined` surfaces as an unhandled rejection.
  save = vi.fn().mockResolvedValue(ok(undefined));
}

// App.svelte is the composition root: it constructs its own
// IdbSettingsRepository rather than taking one as a prop, so exercising its
// screen-gating logic (AD-1, AD-12) means stubbing the module it imports.
vi.mock('../adapters/persistence/settings-repository', () => ({
  IdbSettingsRepository: StubSettingsRepository,
}));

// Imported for its prototype only -- the composition root is the layer that
// constructs concrete adapters, so this is where that wiring is observable.
const { CanvasInkSurface } = await import('../adapters/ink/canvas-ink-surface');
const App = (await import('./App.svelte')).default;

describe('App', () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it('shows First Run on a fresh install (penCheckShown: false)', async () => {
    getMock.mockResolvedValue(ok({ ...DEFAULT_SETTINGS, penCheckShown: false }));

    render(App);

    expect(await screen.findByText('Check your stylus')).toBeTruthy();
  });

  it('skips First Run and shows the Scope picker once penCheckShown is true', async () => {
    getMock.mockResolvedValue(ok({ ...DEFAULT_SETTINGS, penCheckShown: true }));

    render(App);

    expect(await screen.findByText('What are we testing today?')).toBeTruthy();
    expect(screen.queryByText('Check your stylus')).toBeNull();
  });

  it('falls back to showing First Run when the settings read fails', async () => {
    getMock.mockResolvedValue(err(new Error('IndexedDB blocked')));

    render(App);

    expect(await screen.findByText('Check your stylus')).toBeTruthy();
  });

  it('carries the full scope forward into the drill when "Start writing" is tapped', async () => {
    getMock.mockResolvedValue(ok({ ...DEFAULT_SETTINGS, penCheckShown: true }));

    render(App);

    await screen.findByText('What are we testing today?');
    await fireEvent.click(screen.getByRole('button', { name: 'Start writing' }));

    // The counter's N *is* the scoped card list's length -- the whole
    // catalog here.
    expect(await screen.findByText('1 / 158')).toBeTruthy();
    // AD-2 / the black-canvas compositing bug: exactly one canvas, ever.
    expect(document.querySelectorAll('canvas')).toHaveLength(1);
  });

  it('carries a narrowed scope forward into the drill', async () => {
    getMock.mockResolvedValue(ok({ ...DEFAULT_SETTINGS, penCheckShown: true }));

    render(App);

    await screen.findByText('What are we testing today?');
    await fireEvent.click(screen.getByRole('radio', { name: 'Hiragana' }));
    await fireEvent.click(screen.getByRole('radio', { name: 'Base' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Start writing' }));

    expect(await screen.findByText('1 / 46')).toBeTruthy();
  });

  it('returns from the drill to the Scope picker with the selection intact', async () => {
    getMock.mockResolvedValue(ok({ ...DEFAULT_SETTINGS, penCheckShown: true }));

    render(App);

    await screen.findByText('What are we testing today?');
    await fireEvent.click(screen.getByRole('radio', { name: 'Katakana' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Start writing' }));
    await screen.findByText('1 / 79');
    await fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    await screen.findByText('What are we testing today?');
    expect(screen.getByText('79 cards in scope')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Katakana' }).className).toContain('pill--active');
    // The drill's canvas went with it -- the adapter was destroyed.
    expect(document.querySelectorAll('canvas')).toHaveLength(0);
  });

  it('reaches Settings from the Scope-picker header and back again, selection intact', async () => {
    getMock.mockResolvedValue(ok({ ...DEFAULT_SETTINGS, penCheckShown: true }));

    render(App);

    await screen.findByText('What are we testing today?');
    await fireEvent.click(screen.getByRole('radio', { name: 'Yoon' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    expect(await screen.findByRole('radiogroup', { name: 'Ink width' })).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    await screen.findByText('What are we testing today?');
    expect(screen.getByText('66 cards in scope')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Yoon' }).className).toContain('pill--active');
  });

  it('applies a preset chosen in Settings to the next drill entry', async () => {
    // The composition root holds `widthPreset` between screens: Settings
    // reports the change, and the *next* adapter is constructed with it.
    getMock.mockResolvedValue(
      ok({ ...DEFAULT_SETTINGS, penCheckShown: true, widthPreset: 'subtle' }),
    );
    const setWidthPreset = vi.spyOn(CanvasInkSurface.prototype, 'setWidthPreset');

    render(App);

    await screen.findByText('What are we testing today?');
    await fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await screen.findByRole('radiogroup', { name: 'Ink width' });
    await fireEvent.click(screen.getByRole('radio', { name: 'Calligraphy' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await screen.findByText('What are we testing today?');
    await fireEvent.click(screen.getByRole('button', { name: 'Start writing' }));
    await screen.findByText('1 / 158');

    expect(setWidthPreset).toHaveBeenLastCalledWith('calligraphy');
  });

  it('leaves exactly one canvas behind when the drill is re-entered', async () => {
    // A leaked adapter would append a second canvas -- two stacked canvases
    // are exactly the black-canvas compositing bug AD-2's one-canvas rule
    // exists to prevent.
    getMock.mockResolvedValue(ok({ ...DEFAULT_SETTINGS, penCheckShown: true }));

    render(App);

    await screen.findByText('What are we testing today?');
    await fireEvent.click(screen.getByRole('button', { name: 'Start writing' }));
    await screen.findByText('1 / 158');
    await fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await screen.findByText('What are we testing today?');
    await fireEvent.click(screen.getByRole('button', { name: 'Start writing' }));
    await screen.findByText('1 / 158');

    expect(document.querySelectorAll('canvas')).toHaveLength(1);
  });

  it('starts the drill at the persisted ink-width preset', async () => {
    // The composition root owns `widthPreset` -- it is read once on boot and
    // pushed into each freshly constructed ink adapter.
    getMock.mockResolvedValue(
      ok({ ...DEFAULT_SETTINGS, penCheckShown: true, widthPreset: 'calligraphy' }),
    );
    const setWidthPreset = vi.spyOn(CanvasInkSurface.prototype, 'setWidthPreset');

    render(App);

    await screen.findByText('What are we testing today?');
    await fireEvent.click(screen.getByRole('button', { name: 'Start writing' }));
    await screen.findByText('1 / 158');

    expect(setWidthPreset).toHaveBeenCalledWith('calligraphy');
  });
});
