import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import History from './History.svelte';
import type { Session } from '../../domain/session';

// History's list and empty states are covered through the whole app in
// src/app/App.integration.test.ts; what that seam can't hold still is the
// in-flight read, so the loading state gets this one controllable-promise
// test.
describe('History', () => {
  it('shows the loading line until the list resolves', async () => {
    let resolveList!: (sessions: Session[]) => void;
    const list = vi
      .fn()
      .mockReturnValue(new Promise<Session[]>((resolve) => (resolveList = resolve)));
    render(History, { history: { list } });

    expect(screen.getByText('Loading…')).toBeTruthy();

    resolveList([]);
    await vi.waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());
    expect(screen.getByText('No sessions yet. Finish a drill to see it here.')).toBeTruthy();
  });
});
