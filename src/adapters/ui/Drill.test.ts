import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import Drill from './Drill.svelte';
import { CARDS, type Card } from '../../domain/cards';
import type { InkSurface } from '../../ports/ink-surface';
import type { Stroke } from '../../domain/ink';

// A `ui` adapter must never import a sibling adapter's implementation (AD-1),
// so the ink surface is faked against the port -- the same way
// ScopePicker.test.ts fakes `CardRepository`. Landing a stroke here means
// invoking the subscriber the component registered, which is exactly what
// the real adapter does once per completed stroke.
function fakeInkSurface(): InkSurface & {
  mounts: HTMLElement[];
  clears: number;
  destroys: number;
  landStroke: () => Promise<void>;
} {
  let cb: ((stroke: Stroke) => void) | null = null;
  const surface = {
    mounts: [] as HTMLElement[],
    clears: 0,
    destroys: 0,
    mount(node: HTMLElement) {
      surface.mounts.push(node);
    },
    destroy() {
      surface.destroys += 1;
    },
    clear() {
      surface.clears += 1;
    },
    onStrokeComplete(next: (stroke: Stroke) => void) {
      cb = next;
    },
    setWidthPreset: vi.fn(),
    async landStroke() {
      cb?.({ points: [{ x: 0.5, y: 0.5, pressure: 0.7 }] });
      await tick();
    },
  };
  return surface;
}

function card(grapheme: string): Card {
  const found = CARDS.find((c) => c.grapheme === grapheme);
  if (!found) throw new Error(`no card for ${grapheme}`);
  return found;
}

function grade(name: 'Missed' | 'Correct'): HTMLButtonElement {
  return screen.getByRole('button', { name }) as HTMLButtonElement;
}

describe('Drill', () => {
  it('prompts with romaji plus the script name, and no grapheme', () => {
    // The grapheme is the answer -- Story 1.4's Reveal owns showing it.
    render(Drill, { cards: [card('し')], inkSurface: fakeInkSurface(), onBack: vi.fn() });

    expect(screen.getByText('shi')).toBeTruthy();
    expect(screen.getByText('Hiragana')).toBeTruthy();
    expect(screen.queryByText('し')).toBeNull();
  });

  it('starts the counter at "1 / N" for a scope of N cards', () => {
    const cards = CARDS.filter((c) => c.script === 'hiragana' && c.kind === 'base');
    render(Drill, { cards, inkSurface: fakeInkSurface(), onBack: vi.fn() });

    expect(screen.getByText('1 / 46')).toBeTruthy();
  });

  it('pairs the counter with a progress bar, never a bar alone', () => {
    const cards = CARDS.filter((c) => c.script === 'hiragana' && c.kind === 'base');
    render(Drill, { cards, inkSurface: fakeInkSurface(), onBack: vi.fn() });

    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('1');
    expect(bar.getAttribute('aria-valuemax')).toBe('46');
    expect(screen.getByText('1 / 46')).toBeTruthy();
  });

  it('mounts the ink surface exactly once, into a node Svelte leaves empty', () => {
    const inkSurface = fakeInkSurface();
    render(Drill, { cards: [card('あ')], inkSurface, onBack: vi.fn() });

    expect(inkSurface.mounts).toHaveLength(1);
    // The adapter owns this node's contents (AD-2): Svelte renders nothing
    // inside it, so it is empty until the adapter appends its canvas.
    expect(inkSurface.mounts[0]?.childElementCount).toBe(0);
  });

  it('destroys the ink surface when the screen unmounts', () => {
    const inkSurface = fakeInkSurface();
    const { unmount } = render(Drill, {
      cards: [card('あ')],
      inkSurface,
      onBack: vi.fn(),
    });

    unmount();

    expect(inkSurface.destroys).toBe(1);
  });

  it('dims and disables Missed and Correct while the cell is blank', () => {
    render(Drill, { cards: [card('あ')], inkSurface: fakeInkSurface(), onBack: vi.fn() });

    for (const name of ['Missed', 'Correct'] as const) {
      expect(grade(name).disabled).toBe(true);
      expect(grade(name).className).toContain('btn--dimmed');
    }
  });

  it('activates Missed and Correct once a stroke lands', async () => {
    const inkSurface = fakeInkSurface();
    render(Drill, { cards: [card('あ')], inkSurface, onBack: vi.fn() });

    await inkSurface.landStroke();

    for (const name of ['Missed', 'Correct'] as const) {
      expect(grade(name).disabled).toBe(false);
      expect(grade(name).className).not.toContain('btn--dimmed');
    }
  });

  it('shows Clear only once ink exists, beside the self-grading line', async () => {
    const inkSurface = fakeInkSurface();
    render(Drill, { cards: [card('あ')], inkSurface, onBack: vi.fn() });

    expect(screen.getByText('Your call — nothing is checking the shape')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();

    await inkSurface.landStroke();

    expect(screen.getByRole('button', { name: 'Clear' })).toBeTruthy();
  });

  it('Clear empties the cell and re-dims the grades without advancing', async () => {
    const inkSurface = fakeInkSurface();
    render(Drill, { cards: [card('し')], inkSurface, onBack: vi.fn() });

    await inkSurface.landStroke();
    await fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(inkSurface.clears).toBe(1);
    expect(grade('Correct').disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
    // Same prompt, same position.
    expect(screen.getByText('shi')).toBeTruthy();
    expect(screen.getByText('1 / 1')).toBeTruthy();
  });

  for (const name of ['Missed', 'Correct'] as const) {
    it(`${name} advances the counter and moves to a different prompt`, async () => {
      const cards = [card('し'), card('つ')];
      const inkSurface = fakeInkSurface();
      render(Drill, { cards, inkSurface, onBack: vi.fn() });

      const first = screen.getByText(/^(shi|tsu)$/).textContent;
      await inkSurface.landStroke();
      await fireEvent.click(grade(name));

      expect(screen.getByText('2 / 2')).toBeTruthy();
      // Never the card just graded -- a grade always visibly advances.
      expect(screen.getByText(/^(shi|tsu)$/).textContent).not.toBe(first);
      // The cell is empty again and the grades are back to dimmed.
      expect(inkSurface.clears).toBe(1);
      expect(grade('Correct').disabled).toBe(true);
    });
  }

  it('keeps counting past the scope size, with the bar clamped at full', async () => {
    // Selection is with replacement and nothing closes the session until
    // Story 1.9 -- "3 / 2" is the intended behavior, not an overflow bug.
    const cards = [card('し'), card('つ')];
    const inkSurface = fakeInkSurface();
    render(Drill, { cards, inkSurface, onBack: vi.fn() });

    for (let i = 0; i < 2; i++) {
      await inkSurface.landStroke();
      await fireEvent.click(grade('Correct'));
    }

    expect(screen.getByText('3 / 2')).toBeTruthy();
    const fill = document.querySelector('.bar-fill') as HTMLElement;
    expect(fill.style.width).toBe('100%');
    // The visible counter overshoots, but the exposed progress value must
    // stay inside its own min/max or screen readers announce nonsense.
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('2');
  });

  it('calls onBack from the temporary Back control', async () => {
    const onBack = vi.fn();
    render(Drill, { cards: [card('あ')], inkSurface: fakeInkSurface(), onBack });

    await fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('shows no Reveal control and no post-grade toast or Undo', async () => {
    // Story 1.4 owns Reveal; Stories 1.6/1.8 own the tally toast and Undo.
    const inkSurface = fakeInkSurface();
    render(Drill, { cards: [card('し'), card('つ')], inkSurface, onBack: vi.fn() });

    expect(screen.queryByRole('button', { name: 'Reveal' })).toBeNull();

    await inkSurface.landStroke();
    await fireEvent.click(grade('Missed'));

    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Next character' })).toBeNull();
    // No cumulative tally readout either -- Story 1.6 introduces that.
    expect(screen.queryByText(/missed \d+/i)).toBeNull();
  });
});
