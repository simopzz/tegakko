import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { DEFAULT_SETTINGS } from '../domain/settings';
import { err, ok } from '../domain/result';
import type { Result } from '../domain/result';
import type { Attempt } from '../domain/attempt';

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
const { IdbAttemptRepository } = await import('../adapters/persistence/attempt-repository');
const App = (await import('./App.svelte')).default;

describe('App', () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
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
    expect(await screen.findByText('1 / 208')).toBeTruthy();
    // AD-2 / the black-canvas compositing bug: exactly one canvas, ever.
    expect(document.querySelectorAll('canvas')).toHaveLength(1);
  });

  it('falls back to an empty attempt history and still starts the drill when listAll() fails', async () => {
    // Story 1.7: `handleStart` awaits `attemptRepository.listAll()` before
    // entering the drill. A real `IdbAttemptRepository` already fails closed
    // in this happy-dom environment (no `indexedDB` global), but that's
    // incidental -- this spy makes the fallback path deliberate and asserted,
    // the same way the settings-read fallback above is (mirrors that test's
    // `vi.spyOn(CanvasInkSurface.prototype, ...)` pattern for stubbing one
    // adapter method without mocking the whole module).
    getMock.mockResolvedValue(ok({ ...DEFAULT_SETTINGS, penCheckShown: true }));
    const listAll = vi
      .spyOn(IdbAttemptRepository.prototype, 'listAll')
      .mockResolvedValue(err(new Error('IndexedDB blocked')));

    render(App);

    await screen.findByText('What are we testing today?');
    await fireEvent.click(screen.getByRole('button', { name: 'Start writing' }));

    // The drill still starts -- `sampleSessionCards` falls back to its uniform floor
    // rather than the failed fetch blocking entry.
    expect(await screen.findByText('1 / 208')).toBeTruthy();

    listAll.mockRestore();
  });

  it('falls back to an empty attempt history and still starts the drill when listAll() rejects instead of resolving a Result', async () => {
    // The resolved-`{ok: false}` fallback is covered above -- this proves
    // the *other* failure path adapters can take (an outright rejected
    // promise) is also handled, mirroring `Drill.test.ts`'s
    // "...rejects instead of resolving a Result" tests for
    // `attemptRepository.add()`/`tallyRepository.increment()`.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    getMock.mockResolvedValue(ok({ ...DEFAULT_SETTINGS, penCheckShown: true }));
    const listAll = vi
      .spyOn(IdbAttemptRepository.prototype, 'listAll')
      .mockRejectedValue(new Error('connection lost'));

    render(App);

    await screen.findByText('What are we testing today?');
    await fireEvent.click(screen.getByRole('button', { name: 'Start writing' }));

    // The drill still starts -- a rejected `listAll()` never leaves
    // `handleStart` stuck on the Scope picker.
    expect(await screen.findByText('1 / 208')).toBeTruthy();
    expect(consoleError).toHaveBeenCalledWith('Failed to load attempt history:', expect.any(Error));

    listAll.mockRestore();
    consoleError.mockRestore();
  });

  it('ignores a second "Start writing" tap fired before the first listAll() resolves', async () => {
    // A double-tap (realistic on a stylus tablet) must not race two
    // `CanvasInkSurface`s into existence -- the `starting` guard makes the
    // second call a no-op while the first is still in flight.
    getMock.mockResolvedValue(ok({ ...DEFAULT_SETTINGS, penCheckShown: true }));
    let resolveListAll!: (value: Result<Attempt[]>) => void;
    const listAll = vi
      .spyOn(IdbAttemptRepository.prototype, 'listAll')
      .mockReturnValue(
        new Promise((resolve) => {
          resolveListAll = resolve;
        }),
      );

    render(App);

    await screen.findByText('What are we testing today?');
    const startButton = screen.getByRole('button', { name: 'Start writing' });
    await fireEvent.click(startButton);
    await fireEvent.click(startButton);

    resolveListAll(ok([]));
    await screen.findByText('1 / 208');

    // Exactly one `listAll()` call reached the repository, and exactly one
    // canvas exists -- the second tap's adapter was never constructed.
    expect(listAll).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('canvas')).toHaveLength(1);

    listAll.mockRestore();
  });

  it('resolves the chosen session size into the sampled drill queue', async () => {
    // Story 1.2's session-size pill group was fully wired in the UI but
    // never consumed until this rework -- `handleStart` now resolves it via
    // `resolveSessionSize` and threads it into `<Drill sessionSize={...}>`,
    // which samples exactly that many distinct cards (AD-10). 25% of the
    // full 208-card scope resolves to 52.
    getMock.mockResolvedValue(ok({ ...DEFAULT_SETTINGS, penCheckShown: true }));

    render(App);

    await screen.findByText('What are we testing today?');
    await fireEvent.click(screen.getByRole('radio', { name: '25%' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Start writing' }));

    expect(await screen.findByText('1 / 52')).toBeTruthy();
  });

  it('carries a narrowed scope forward into the drill', async () => {
    getMock.mockResolvedValue(ok({ ...DEFAULT_SETTINGS, penCheckShown: true }));

    render(App);

    await screen.findByText('What are we testing today?');
    await fireEvent.click(screen.getByRole('radio', { name: 'Hiragana' }));
    await fireEvent.click(screen.getByRole('radio', { name: 'Base' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Start writing' }));

    expect(await screen.findByText('1 / 71')).toBeTruthy();
  });

  it('closes the drill to the Session summary, then returns to the Scope picker with the selection intact', async () => {
    getMock.mockResolvedValue(ok({ ...DEFAULT_SETTINGS, penCheckShown: true }));

    render(App);

    await screen.findByText('What are we testing today?');
    await fireEvent.click(screen.getByRole('radio', { name: 'Katakana' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Start writing' }));
    await screen.findByText('1 / 104');
    // "I'm done" closes the session -- Story 1.9 -- and lands on the Session
    // summary, not directly back on the Scope picker.
    await fireEvent.click(screen.getByRole('button', { name: "I'm done" }));

    expect(await screen.findByRole('button', { name: 'Another round' })).toBeTruthy();
    // The drill's canvas went with it -- the adapter was destroyed.
    expect(document.querySelectorAll('canvas')).toHaveLength(0);

    await fireEvent.click(screen.getByRole('button', { name: 'Another round' }));

    await screen.findByText('What are we testing today?');
    expect(screen.getByText('104 cards in scope')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Katakana' }).className).toContain('pill--active');
  });

  it('navigates from the Session summary\'s "History" link to the History screen', async () => {
    getMock.mockResolvedValue(ok({ ...DEFAULT_SETTINGS, penCheckShown: true }));

    render(App);

    await screen.findByText('What are we testing today?');
    await fireEvent.click(screen.getByRole('radio', { name: 'Katakana' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Start writing' }));
    await screen.findByText('1 / 104');
    await fireEvent.click(screen.getByRole('button', { name: "I'm done" }));

    await screen.findByRole('button', { name: 'Another round' });
    await fireEvent.click(screen.getByRole('button', { name: 'History' }));

    expect(await screen.findByText('No sessions yet. Finish a drill to see it here.')).toBeTruthy();

    // "Back" from History always returns to the Scope picker, even when
    // History was opened from the Session summary.
    await fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    await screen.findByText('What are we testing today?');
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

  it('reaches Settings from the Scope-picker header and back again, session-size selection intact', async () => {
    getMock.mockResolvedValue(ok({ ...DEFAULT_SETTINGS, penCheckShown: true }));

    render(App);

    await screen.findByText('What are we testing today?');
    await fireEvent.click(screen.getByRole('radio', { name: '25%' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    expect(await screen.findByRole('radiogroup', { name: 'Ink width' })).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    await screen.findByText('What are we testing today?');
    expect(screen.getByRole('radio', { name: '25%' }).className).toContain('pill--active');
    expect(screen.getByText('52 cards this session')).toBeTruthy();
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
    await screen.findByText('1 / 208');

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
    await screen.findByText('1 / 208');
    await fireEvent.click(screen.getByRole('button', { name: "I'm done" }));
    await screen.findByRole('button', { name: 'Another round' });
    await fireEvent.click(screen.getByRole('button', { name: 'Another round' }));
    await screen.findByText('What are we testing today?');
    await fireEvent.click(screen.getByRole('button', { name: 'Start writing' }));
    await screen.findByText('1 / 208');

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
    await screen.findByText('1 / 208');

    expect(setWidthPreset).toHaveBeenCalledWith('calligraphy');
  });

  it('reaches History from the Scope-picker header, then returns to the Scope picker via Back', async () => {
    getMock.mockResolvedValue(ok({ ...DEFAULT_SETTINGS, penCheckShown: true }));

    render(App);

    await screen.findByText('What are we testing today?');
    await fireEvent.click(screen.getByRole('radio', { name: 'Yoon' }));
    await fireEvent.click(screen.getByRole('button', { name: 'History' }));

    expect(await screen.findByText('No sessions yet. Finish a drill to see it here.')).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    await screen.findByText('What are we testing today?');
    expect(screen.getByText('66 cards in scope')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Yoon' }).className).toContain('pill--active');
  });

  it('governs the live Drill session with the idleTimeoutMs persisted in Settings, not the default', async () => {
    // Mirrors `widthPreset` propagation above -- the composition root reads
    // `idleTimeoutMs` once on boot (App.svelte:82-85) and passes it into
    // `<Drill>`, which uses it (not `DEFAULT_SETTINGS.idleTimeoutMs`) to
    // govern idle closure.
    getMock.mockResolvedValue(
      ok({ ...DEFAULT_SETTINGS, penCheckShown: true, idleTimeoutMs: 120_000 }),
    );

    render(App);

    await screen.findByText('What are we testing today?');
    await fireEvent.click(screen.getByRole('button', { name: 'Start writing' }));
    await screen.findByText('1 / 208');

    vi.useFakeTimers();
    // Past the persisted 2-minute threshold but well under the 5-minute
    // `DEFAULT_SETTINGS.idleTimeoutMs` -- this only closes the session if
    // the loaded 120_000 value actually reached and governs the live Drill.
    vi.setSystemTime(Date.now() + 120_000);
    document.dispatchEvent(new Event('visibilitychange'));
    await tick();

    expect(screen.getByRole('button', { name: 'Another round' })).toBeTruthy();
  });
});
