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
  save = vi.fn();
}

// App.svelte is the composition root: it constructs its own
// IdbSettingsRepository rather than taking one as a prop, so exercising its
// screen-gating logic (AD-1, AD-12) means stubbing the module it imports.
vi.mock('../adapters/persistence/settings-repository', () => ({
  IdbSettingsRepository: StubSettingsRepository,
}));

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

  it('carries the chosen scope forward to the drill placeholder when "Start writing" is tapped', async () => {
    getMock.mockResolvedValue(ok({ ...DEFAULT_SETTINGS, penCheckShown: true }));

    render(App);

    await screen.findByText('What are we testing today?');
    await fireEvent.click(screen.getByRole('button', { name: 'Start writing' }));

    expect(await screen.findByText(/tegakko is set up/)).toBeTruthy();
    expect(screen.getByText('scope: hiragana+katakana / base+yoon')).toBeTruthy();
  });

  it('carries a narrowed scope forward to the drill placeholder when narrowed before "Start writing"', async () => {
    getMock.mockResolvedValue(ok({ ...DEFAULT_SETTINGS, penCheckShown: true }));

    render(App);

    await screen.findByText('What are we testing today?');
    await fireEvent.click(screen.getByRole('radio', { name: 'Hiragana' }));
    await fireEvent.click(screen.getByRole('radio', { name: 'Base' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Start writing' }));

    expect(await screen.findByText(/tegakko is set up/)).toBeTruthy();
    expect(screen.getByText('scope: hiragana / base')).toBeTruthy();
  });
});
