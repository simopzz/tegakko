import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import SessionSummary from './SessionSummary.svelte';
import type { SessionSummaryView } from '../../domain/session';

function fixture(overrides: Partial<SessionSummaryView> = {}): SessionSummaryView {
  return {
    accuracy: 0.75,
    timeMs: 125_000, // 2:05
    revealCount: 3,
    closureReason: 'explicit',
    missed: [],
    ...overrides,
  };
}

describe('SessionSummary', () => {
  it('renders the accuracy hero as a rounded percentage', () => {
    render(SessionSummary, { summary: fixture({ accuracy: 0.754 }), onAgain: vi.fn(), onHistory: vi.fn() });

    expect(screen.getByText('75%')).toBeTruthy();
  });

  it('renders the time stat tile as M:SS', () => {
    render(SessionSummary, { summary: fixture({ timeMs: 125_000 }), onAgain: vi.fn(), onHistory: vi.fn() });

    expect(screen.getByText('2:05')).toBeTruthy();
    expect(screen.getByText('Time')).toBeTruthy();
  });

  it('pads seconds under 10 with a leading zero', () => {
    render(SessionSummary, { summary: fixture({ timeMs: 65_000 }), onAgain: vi.fn(), onHistory: vi.fn() });

    expect(screen.getByText('1:05')).toBeTruthy();
  });

  it('renders the reveal-count stat tile', () => {
    render(SessionSummary, { summary: fixture({ revealCount: 4 }), onAgain: vi.fn(), onHistory: vi.fn() });

    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('Reveals')).toBeTruthy();
  });

  it('shows the "You ended it" chip only for an explicit closure', () => {
    render(SessionSummary, { summary: fixture({ closureReason: 'explicit' }), onAgain: vi.fn(), onHistory: vi.fn() });

    expect(screen.getByText('You ended it')).toBeTruthy();
  });

  it('shows no chip for a full-scope closure', () => {
    render(SessionSummary, { summary: fixture({ closureReason: 'full-scope' }), onAgain: vi.fn(), onHistory: vi.fn() });

    expect(screen.queryByText('You ended it')).toBeNull();
  });

  it('shows no chip for an inactivity closure', () => {
    render(SessionSummary, { summary: fixture({ closureReason: 'inactivity' }), onAgain: vi.fn(), onHistory: vi.fn() });

    expect(screen.queryByText('You ended it')).toBeNull();
  });

  it('renders one missed chip per entry, with its tallyCount', () => {
    render(
      SessionSummary,
      {
        summary: fixture({
          missed: [
            { cardId: 'a:hiragana', grapheme: 'あ', script: 'hiragana', tallyCount: 3 },
            { cardId: 'i:hiragana', grapheme: 'い', script: 'hiragana', tallyCount: 1 },
          ],
        }),
        onAgain: vi.fn(),
        onHistory: vi.fn(),
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
    render(SessionSummary, { summary: fixture({ missed: [] }), onAgain: vi.fn(), onHistory: vi.fn() });

    expect(screen.queryByText('Missed this time')).toBeNull();
  });

  it('calls onAgain when "Another round" is tapped', async () => {
    const onAgain = vi.fn();
    render(SessionSummary, { summary: fixture(), onAgain, onHistory: vi.fn() });

    await fireEvent.click(screen.getByRole('button', { name: 'Another round' }));

    expect(onAgain).toHaveBeenCalledTimes(1);
  });

  it('calls onHistory when "History" is tapped', async () => {
    const onHistory = vi.fn();
    render(SessionSummary, { summary: fixture(), onAgain: vi.fn(), onHistory });

    await fireEvent.click(screen.getByRole('button', { name: 'History' }));

    expect(onHistory).toHaveBeenCalledTimes(1);
  });

  it('renders accuracy 0% and no missed chips for a zero-attempt closure', () => {
    render(
      SessionSummary,
      { summary: fixture({ accuracy: 0, missed: [] }), onAgain: vi.fn(), onHistory: vi.fn() },
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
            { cardId: 'a:hiragana', grapheme: 'あ', script: 'hiragana', tallyCount: 3 },
            { cardId: 'i:hiragana', grapheme: 'い', script: 'hiragana', tallyCount: 1 },
          ],
        }),
        onAgain: vi.fn(),
        onHistory: vi.fn(),
      },
    );

    const list = screen.getByRole('list', { name: 'Missed cards' });
    expect(list).toBeTruthy();
    expect(list.querySelectorAll(':scope > li').length).toBe(2);
  });

  it('moves focus onto the summary heading on entry', async () => {
    render(SessionSummary, { summary: fixture(), onAgain: vi.fn(), onHistory: vi.fn() });
    await tick();

    expect(document.activeElement?.textContent).toBe('Session summary');
  });
});
