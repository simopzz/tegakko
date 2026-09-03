import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { DEFAULT_SETTINGS } from '../domain/settings';
import { ok } from '../domain/result';

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

  it('skips First Run and shows the placeholder screen once penCheckShown is true', async () => {
    getMock.mockResolvedValue(ok({ ...DEFAULT_SETTINGS, penCheckShown: true }));

    render(App);

    expect(await screen.findByText(/tegakko is set up/)).toBeTruthy();
    expect(screen.queryByText('Check your stylus')).toBeNull();
  });
});
