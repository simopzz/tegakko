import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import SessionSummary from './SessionSummary.svelte';
import type { SessionSummaryView } from '../../domain/session';

function fixture(overrides: Partial<SessionSummaryView> = {}): SessionSummaryView {
  return {
    accuracy: 0.75,
    timeMs: 125_000, // 2:05
    revealCount: 3,
    cardsAttempted: 12,
    scope: { hiragana: ['base'] },
    closureReason: 'explicit',
    missed: [],
    ...overrides,
  };
}

describe('SessionSummary', () => {
  it('renders the accuracy hero as a rounded percentage', () => {
    render(SessionSummary, { summary: fixture({ accuracy: 0.754 }), onAgain: vi.fn() });

    expect(screen.getByText('75%')).toBeTruthy();
  });

  it('renders the time stat tile as M:SS', () => {
    render(SessionSummary, { summary: fixture({ timeMs: 125_000 }), onAgain: vi.fn() });

    expect(screen.getByText('2:05')).toBeTruthy();
    expect(screen.getByText('Time')).toBeTruthy();
  });

  it('pads seconds under 10 with a leading zero', () => {
    render(SessionSummary, { summary: fixture({ timeMs: 65_000 }), onAgain: vi.fn() });

    expect(screen.getByText('1:05')).toBeTruthy();
  });

  it('renders the reveal-count stat tile', () => {
    render(SessionSummary, { summary: fixture({ revealCount: 4 }), onAgain: vi.fn() });

    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('Reveals')).toBeTruthy();
  });

  it('shows the "You ended it" chip only for an explicit closure', () => {
    render(SessionSummary, { summary: fixture({ closureReason: 'explicit' }), onAgain: vi.fn() });

    expect(screen.getByText('You ended it')).toBeTruthy();
  });

  it('shows no chip for a complete closure', () => {
    render(SessionSummary, { summary: fixture({ closureReason: 'complete' }), onAgain: vi.fn() });

    expect(screen.queryByText('You ended it')).toBeNull();
  });

  it('shows no chip for an inactivity closure', () => {
    render(SessionSummary, { summary: fixture({ closureReason: 'inactivity' }), onAgain: vi.fn() });

    expect(screen.queryByText('You ended it')).toBeNull();
  });

  it('renders one missed chip per entry, with its missCount', () => {
    render(
      SessionSummary,
      {
        summary: fixture({
          missed: [
            { cardId: 'a:hiragana', grapheme: 'あ', script: 'hiragana', missCount: 3 },
            { cardId: 'i:hiragana', grapheme: 'い', script: 'hiragana', missCount: 1 },
          ],
        }),
        onAgain: vi.fn(),
      },
    );

    expect(screen.getByText('あ')).toBeTruthy();
    expect(screen.getByText('い')).toBeTruthy();
    // Script is visible text, not a hover-only `title` -- unreachable on the
    // app's touch-only target device.
    expect(screen.getByText(/Hiragana · missed 3/)).toBeTruthy();
    expect(screen.getByText(/Hiragana · missed 1/)).toBeTruthy();
  });

  it('renders no missed chips and no "Missed this time" group for an empty missed list', () => {
    render(SessionSummary, { summary: fixture({ missed: [] }), onAgain: vi.fn() });

    expect(screen.queryByText('Missed this time')).toBeNull();
  });

  it('calls onAgain when "Another round" is tapped', async () => {
    const onAgain = vi.fn();
    render(SessionSummary, { summary: fixture(), onAgain });

    await fireEvent.click(screen.getByRole('button', { name: 'Another round' }));

    expect(onAgain).toHaveBeenCalledTimes(1);
  });

  // The screen-level "calls onHistory" and "moves focus onto the summary
  // heading" tests went with the bar move: History is offered by the shared
  // top bar and entry focus lands on the bar title, both asserted at the
  // app seam now ("navigates from the Session summary's "History" link..."
  // and "...with focus on the bar title" in src/app/App.test.ts).

  it('renders accuracy 0% and no missed chips for a zero-attempt closure', () => {
    render(
      SessionSummary,
      { summary: fixture({ accuracy: 0, missed: [] }), onAgain: vi.fn() },
    );

    expect(screen.getByText('0%')).toBeTruthy();
    expect(screen.queryByText('Missed this time')).toBeNull();
  });

  it('renders the missed chips as a list so screen readers announce the group', () => {
    render(
      SessionSummary,
      {
        summary: fixture({
          missed: [
            { cardId: 'a:hiragana', grapheme: 'あ', script: 'hiragana', missCount: 3 },
            { cardId: 'i:hiragana', grapheme: 'い', script: 'hiragana', missCount: 1 },
          ],
        }),
        onAgain: vi.fn(),
      },
    );

    const list = screen.getByRole('list', { name: 'Missed cards' });
    expect(list).toBeTruthy();
    expect(list.querySelectorAll(':scope > li').length).toBe(2);
  });
});
