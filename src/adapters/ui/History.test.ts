import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import History from './History.svelte';
import { formatDate } from './format-date';
import type { SessionRepository } from '../../ports/session-repository';
import type { Session } from '../../domain/session';
import type { Result } from '../../domain/result';
import { rampColorForAccuracy } from '../../domain/history';

// A `ui` adapter must never import a sibling adapter's implementation module
// (docs/adr/0001-hexagonal-boundary.md) -- mirrors `ScopePicker.test.ts`'s
// fake-repository pattern rather than importing `adapters/persistence`.
function fakeSessionRepository(listResult: Result<Session[]>): SessionRepository {
  return {
    add: () => Promise.resolve({ ok: true, value: undefined }),
    list: () => Promise.resolve(listResult),
  };
}

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    date: overrides.date ?? '2026-09-01T00:00:00.000Z',
    scope: overrides.scope ?? { scripts: ['hiragana'], units: ['base'] },
    cardsAttempted: overrides.cardsAttempted ?? 10,
    accuracy: overrides.accuracy ?? 0.5,
    closureReason: overrides.closureReason ?? 'explicit',
  };
}

function rows(): HTMLElement[] {
  return [...document.querySelectorAll('.row')] as HTMLElement[];
}

function bars(): HTMLElement[] {
  return [...document.querySelectorAll('.bar')] as HTMLElement[];
}

describe('History', () => {
  it('renders reverse-chronological rows with correct chip/dimming for mixed closures', async () => {
    const idle = session({
      id: 'idle',
      date: '2026-09-01T00:00:00.000Z',
      closureReason: 'inactivity',
      accuracy: 0.6,
    });
    const fullScope = session({
      id: 'full-scope',
      date: '2026-09-03T00:00:00.000Z',
      closureReason: 'full-scope',
      accuracy: 0.9,
    });
    const explicit = session({
      id: 'explicit',
      date: '2026-09-02T00:00:00.000Z',
      closureReason: 'explicit',
      accuracy: 0.75,
    });

    render(History, {
      sessionRepository: fakeSessionRepository({ ok: true, value: [idle, fullScope, explicit] }),
      onBack: vi.fn(),
    });

    await screen.findByText(formatDate(fullScope.date));
    const rendered = rows();
    expect(rendered).toHaveLength(3);

    // Reverse-chronological: full-scope (09-03), explicit (09-02), idle (09-01).
    expect(within(rendered[0]!).getByText(formatDate(fullScope.date))).toBeTruthy();
    expect(within(rendered[1]!).getByText(formatDate(explicit.date))).toBeTruthy();
    expect(within(rendered[2]!).getByText(formatDate(idle.date))).toBeTruthy();

    // Full-scope: positive "Session complete" chip, no dimming.
    expect(within(rendered[0]!).getByText('Session complete').className).toContain('chip--positive');
    expect(within(rendered[0]!).getByText('90%').className).not.toContain('dimmed');

    // Explicit: no chip at all.
    expect(within(rendered[1]!).queryByText('Session complete')).toBeNull();
    expect(within(rendered[1]!).queryByText('Closed on idle')).toBeNull();
    expect(within(rendered[1]!).getByText('75%').className).not.toContain('dimmed');

    // Idle: neutral "Closed on idle" chip, dimmed accuracy.
    expect(within(rendered[2]!).getByText('Closed on idle').className).toContain('chip--neutral');
    expect(within(rendered[2]!).getByText('60%').className).toContain('dimmed');
  });

  it('renders one row with no sibling rows and a single accent sparkline bar for a single session', async () => {
    render(History, {
      sessionRepository: fakeSessionRepository({ ok: true, value: [session({ accuracy: 0.8 })] }),
      onBack: vi.fn(),
    });

    await screen.findByText('80%');
    expect(rows()).toHaveLength(1);
    const barsRendered = bars();
    expect(barsRendered).toHaveLength(1);
    expect(barsRendered[0]!.getAttribute('style')).toContain('background-color: var(--color-accent)');
  });

  it('shows all 15 rows but only the latest 10 in the sparkline, newest bar always accent', async () => {
    const all = Array.from({ length: 15 }, (_, i) =>
      session({
        id: `s${i}`,
        // i=0 is oldest (Jan 1), i=14 is newest (Jan 15).
        date: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
        accuracy: 0.5,
      }),
    );

    render(History, {
      sessionRepository: fakeSessionRepository({ ok: true, value: all }),
      onBack: vi.fn(),
    });

    await screen.findByText(formatDate(all[0]!.date));
    expect(rows()).toHaveLength(15);
    const barsRendered = bars();
    expect(barsRendered).toHaveLength(10);
    // The newest session (s14, Jan 15) is the rightmost/last bar, always accent.
    expect(barsRendered[9]!.getAttribute('style')).toContain('background-color: var(--color-accent)');
    // No other bar is the accent color.
    for (const bar of barsRendered.slice(0, 9)) {
      expect(bar.getAttribute('style')).not.toContain('var(--color-accent)');
    }
  });

  it('renders each sparkline bar with its own height percentage and ramp color for varying accuracies', async () => {
    // i=0 is oldest, i=9 is newest -- accuracies deliberately vary so each
    // bar's height/color can be checked against its own session, not a
    // single shared value.
    const accuracies = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
    const all = accuracies.map((accuracy, i) =>
      session({
        id: `s${i}`,
        date: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
        accuracy,
      }),
    );

    render(History, {
      sessionRepository: fakeSessionRepository({ ok: true, value: all }),
      onBack: vi.fn(),
    });

    await screen.findByText(formatDate(all[9]!.date));
    const barsRendered = bars();
    expect(barsRendered).toHaveLength(10);

    accuracies.forEach((accuracy, i) => {
      const style = barsRendered[i]!.getAttribute('style');
      expect(style).toContain(`height: ${Math.round(accuracy * 100)}%`);
      // The newest bar (last one, i=9) is always the accent color rather
      // than its ramp bucket -- checked separately above.
      if (i < accuracies.length - 1) {
        expect(style).toContain(`background-color: ${rampColorForAccuracy(accuracy)}`);
      }
    });
  });

  it('shows no sparkline markup and a centered empty-state line when there are no sessions', async () => {
    render(History, {
      sessionRepository: fakeSessionRepository({ ok: true, value: [] }),
      onBack: vi.fn(),
    });

    expect(await screen.findByText('No sessions yet. Finish a drill to see it here.')).toBeTruthy();
    expect(document.querySelector('.sparkline')).toBeNull();
    expect(bars()).toHaveLength(0);
    expect(rows()).toHaveLength(0);
  });

  it('fails open to the empty state and logs via console.error when list() resolves an err Result', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(History, {
      sessionRepository: fakeSessionRepository({ ok: false, error: new Error('IndexedDB blocked') }),
      onBack: vi.fn(),
    });

    expect(await screen.findByText('No sessions yet. Finish a drill to see it here.')).toBeTruthy();
    expect(document.querySelector('.sparkline')).toBeNull();
    expect(consoleError).toHaveBeenCalledWith('Failed to load sessions:', expect.any(Error));

    consoleError.mockRestore();
  });

  it('fails open to the empty state and logs via console.error when list() rejects instead of resolving a Result', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const sessionRepository: SessionRepository = {
      add: () => Promise.resolve({ ok: true, value: undefined }),
      list: () => Promise.reject(new Error('connection lost')),
    };

    render(History, { sessionRepository, onBack: vi.fn() });

    expect(await screen.findByText('No sessions yet. Finish a drill to see it here.')).toBeTruthy();
    expect(document.querySelector('.sparkline')).toBeNull();
    expect(consoleError).toHaveBeenCalledWith('Failed to load sessions:', expect.any(Error));

    consoleError.mockRestore();
  });

  it('moves focus onto the history heading on entry', async () => {
    render(History, {
      sessionRepository: fakeSessionRepository({ ok: true, value: [] }),
      onBack: vi.fn(),
    });
    await tick();

    expect(document.activeElement?.textContent).toBe('History');
  });

  it('calls onBack when "Back" is tapped', async () => {
    const onBack = vi.fn();
    render(History, {
      sessionRepository: fakeSessionRepository({ ok: true, value: [] }),
      onBack,
    });

    await screen.findByText('No sessions yet. Finish a drill to see it here.');
    await fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
