import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import ScopePicker from './ScopePicker.svelte';
import { CARDS } from '../../domain/cards';
import type { CardRepository } from '../../ports/card-repository';

// A `ui` adapter must never import a sibling adapter's implementation module
// (AD-1's boundary rule, enforced by eslint-plugin-import-x here) -- so this
// fakes `CardRepository` directly over the real static catalog, the same way
// FirstRun.test.ts fakes `SettingsRepository` rather than importing
// `adapters/persistence`.
function realRepository(): CardRepository {
  return {
    getAll: () => [...CARDS],
    getById: (cardId: string) => {
      const card = CARDS.find((c) => c.cardId === cardId);
      if (!card) throw new Error(`Unknown cardId: ${cardId}`);
      return card;
    },
  };
}

// Pill labels ("Hiragana", "Base", "Yoon", ...) intentionally repeat as chip
// text once selected -- `getByRole('button', ...)` disambiguates from the
// read-only `<span>` chips, which carry no button role. "Both" is the third
// option in *each* pill group (Script and Set), so an unscoped lookup is
// ambiguous once both groups are rendered -- pass `groupLabel` ("Script" or
// "Set") to disambiguate via that group's own `role="group"` accessible name.
function pill(name: string, groupLabel?: string): HTMLElement {
  if (groupLabel) {
    const group = screen.getByRole('group', { name: groupLabel });
    return within(group).getByRole('button', { name });
  }
  return screen.getByRole('button', { name });
}

function chips(): HTMLElement {
  const group = document.querySelector('.chips');
  if (!group) throw new Error('chips container not found');
  return group as HTMLElement;
}

describe('ScopePicker', () => {
  it('defaults to the full 158-card scope with a live "158 cards" count', () => {
    render(ScopePicker, { cardRepository: realRepository(), onStart: vi.fn() });

    expect(screen.getByText('158 cards in scope')).toBeTruthy();
  });

  it('renders the default selection as positive-variant script/set chip tags', () => {
    render(ScopePicker, { cardRepository: realRepository(), onStart: vi.fn() });

    const group = chips();
    expect(within(group).getByText('Hiragana')).toBeTruthy();
    expect(within(group).getByText('Katakana')).toBeTruthy();
    expect(within(group).getByText('Base')).toBeTruthy();
    expect(within(group).getByText('Yoon')).toBeTruthy();
    for (const chip of group.children) {
      expect(chip.className).toContain('chip--positive');
    }
  });

  it('recomputes the live count immediately when narrowing to Hiragana + Base (46 cards)', async () => {
    render(ScopePicker, { cardRepository: realRepository(), onStart: vi.fn() });

    await fireEvent.click(pill('Hiragana'));
    await fireEvent.click(pill('Base'));

    expect(screen.getByText('46 cards in scope')).toBeTruthy();
  });

  it('recomputes the live count when narrowing to Katakana only (79 cards)', async () => {
    render(ScopePicker, { cardRepository: realRepository(), onStart: vi.fn() });

    await fireEvent.click(pill('Katakana'));

    expect(screen.getByText('79 cards in scope')).toBeTruthy();
  });

  it('recomputes the live count when narrowing to Yoon only (66 cards)', async () => {
    render(ScopePicker, { cardRepository: realRepository(), onStart: vi.fn() });

    await fireEvent.click(pill('Yoon'));

    expect(screen.getByText('66 cards in scope')).toBeTruthy();
  });

  it('keeps exactly one active segment per pill group after a tap', async () => {
    render(ScopePicker, { cardRepository: realRepository(), onStart: vi.fn() });

    await fireEvent.click(pill('Hiragana'));

    expect(pill('Hiragana').className).toContain('pill--active');
    expect(pill('Both', 'Script').className).not.toContain('pill--active');
    expect(pill('Katakana').className).not.toContain('pill--active');
  });

  it('passes the exact narrowed {scripts, units} scope to onStart on "Start writing"', async () => {
    const onStart = vi.fn();
    render(ScopePicker, { cardRepository: realRepository(), onStart });

    await fireEvent.click(pill('Hiragana'));
    await fireEvent.click(pill('Base'));
    await fireEvent.click(pill('Start writing'));

    expect(onStart).toHaveBeenCalledWith({ scripts: ['hiragana'], units: ['base'] });
  });

  it('passes the full scope to onStart when nothing was narrowed', async () => {
    const onStart = vi.fn();
    render(ScopePicker, { cardRepository: realRepository(), onStart });

    await fireEvent.click(pill('Start writing'));

    expect(onStart).toHaveBeenCalledWith({
      scripts: ['hiragana', 'katakana'],
      units: ['base', 'yoon'],
    });
  });

  it('renders every script/set pill and the Start writing action as a real <button>', () => {
    // happy-dom doesn't resolve scoped-CSS `min-height` via getComputedStyle,
    // so the >=48dp tap-target requirement (component <style>: pills at
    // 56px, Start writing at 88px) is enforced by the CSS itself, not
    // measurable here -- this asserts every tap target is at least native
    // interactive-element markup, not a styled non-interactive <div>.
    render(ScopePicker, { cardRepository: realRepository(), onStart: vi.fn() });

    for (const name of ['Both', 'Hiragana', 'Katakana']) {
      expect(pill(name, 'Script').tagName).toBe('BUTTON');
    }
    for (const name of ['Both', 'Base', 'Yoon']) {
      expect(pill(name, 'Set').tagName).toBe('BUTTON');
    }
    expect(pill('Start writing').tagName).toBe('BUTTON');
  });

  it('shrinks the rendered chips to match a narrowed Hiragana + Base selection', async () => {
    render(ScopePicker, { cardRepository: realRepository(), onStart: vi.fn() });

    await fireEvent.click(pill('Hiragana'));
    await fireEvent.click(pill('Base'));

    const group = chips();
    expect(within(group).getByText('Hiragana')).toBeTruthy();
    expect(within(group).getByText('Base')).toBeTruthy();
    expect(within(group).queryByText('Katakana')).toBeNull();
    expect(within(group).queryByText('Yoon')).toBeNull();
  });
});
