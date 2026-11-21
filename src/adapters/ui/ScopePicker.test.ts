import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import ScopePicker from './ScopePicker.svelte';
import type { Tally } from '../../domain/tally';

// The counts, onStart payloads, shaky badge and selection-restore behaviour
// this file used to own are driven through the whole app in
// src/app/App.integration.test.ts and src/app/App.test.ts, on the real
// adapters -- screen-level duplicates were removed rather than kept twice.

/** Fakes the composition root's preview use-case: the picker only needs
 * its `tallies()` promise, and this screen never sees a repository. */
function fakeScopePreview(): { tallies(): Promise<Tally[]> } {
  return { tallies: () => Promise.resolve([]) };
}

// Pill labels ("Hiragana", "Base", "Yoon", ...) intentionally repeat as chip
// text once selected -- role lookups disambiguate from the read-only `<span>`
// chips, which carry no interactive role. Script/Set are `role="radiogroup"`s
// of `role="radio"` pills (a true mutually-exclusive single-select, not
// independent toggle buttons); "Start writing" stays a plain button outside
// either group. Each group's two "Both" pills carry distinct accessible names
// ("Both scripts" / "Both sets") since a screen reader flattening all
// controls into one list can't otherwise tell them apart -- `groupLabel`
// additionally scopes the lookup to one `radiogroup` by its own accessible
// name ("Script" or "Set").
function pill(name: string, groupLabel?: string): HTMLElement {
  if (name === 'Start writing') {
    return screen.getByRole('button', { name });
  }
  if (groupLabel) {
    const group = screen.getByRole('radiogroup', { name: groupLabel });
    return within(group).getByRole('radio', { name });
  }
  return screen.getByRole('radio', { name });
}

function chips(): HTMLElement {
  const group = document.querySelector('.chips');
  if (!group) throw new Error('chips container not found');
  return group as HTMLElement;
}

function renderPicker(): void {
  render(ScopePicker, {
    scopePreview: fakeScopePreview(),
    onStart: vi.fn(),
  });
}

describe('ScopePicker', () => {
  it('renders the default selection as positive-variant script/set chip tags', () => {
    renderPicker();

    const group = chips();
    expect(within(group).getByText('Hiragana')).toBeTruthy();
    expect(within(group).getByText('Katakana')).toBeTruthy();
    expect(within(group).getByText('Base')).toBeTruthy();
    expect(within(group).getByText('Yoon')).toBeTruthy();
    // Every script/set chip is positive-variant -- the shaky chip is a
    // separate `chip--missed` sibling, not one of these.
    const scriptSetChips = [...group.children].filter(
      (chip) => !chip.className.includes('chip--missed'),
    );
    expect(scriptSetChips.length).toBeGreaterThan(0);
    for (const chip of scriptSetChips) {
      expect(chip.className).toContain('chip--positive');
    }
  });

  it('shrinks the rendered chips to match a narrowed Hiragana + Base selection', async () => {
    renderPicker();

    await fireEvent.click(pill('Hiragana'));
    await fireEvent.click(pill('Base'));

    const group = chips();
    expect(within(group).getByText('Hiragana')).toBeTruthy();
    expect(within(group).getByText('Base')).toBeTruthy();
    expect(within(group).queryByText('Katakana')).toBeNull();
    expect(within(group).queryByText('Yoon')).toBeNull();
  });

  it('keeps exactly one active segment per pill group after a tap', async () => {
    renderPicker();

    await fireEvent.click(pill('Hiragana'));

    expect(pill('Hiragana').className).toContain('pill--active');
    expect(pill('Both scripts').className).not.toContain('pill--active');
    expect(pill('Katakana').className).not.toContain('pill--active');
  });

  it('renders every script/set pill and the Start writing action as a real <button>', () => {
    // happy-dom doesn't resolve scoped-CSS `min-height` via getComputedStyle,
    // so the >=48dp tap-target requirement (component <style>: pills at
    // 56px, Start writing at 88px) is enforced by the CSS itself, not
    // measurable here -- this asserts every tap target is at least native
    // interactive-element markup, not a styled non-interactive <div>.
    renderPicker();

    for (const name of ['Both scripts', 'Hiragana', 'Katakana']) {
      expect(pill(name, 'Script').tagName).toBe('BUTTON');
    }
    for (const name of ['Both sets', 'Base', 'Yoon']) {
      expect(pill(name, 'Set').tagName).toBe('BUTTON');
    }
    expect(pill('Start writing').tagName).toBe('BUTTON');
  });

  it('leaves the session-size segment unchanged when a script/set pill is tapped, but recomputes its effective count against the new scope', async () => {
    renderPicker();

    await fireEvent.click(pill('50%', 'Session size'));
    expect(screen.getByText('104 cards this session')).toBeTruthy();

    // Narrow to the 33-card yoon-only scope.
    await fireEvent.click(pill('Katakana'));
    await fireEvent.click(pill('Yoon'));

    expect(screen.getByText('33 cards in scope')).toBeTruthy();
    expect(pill('50%', 'Session size').className).toContain('pill--active');
    expect(screen.getByText('17 cards this session')).toBeTruthy();

    // Widen back to the full 208-card scope.
    await fireEvent.click(pill('Both scripts', 'Script'));
    await fireEvent.click(pill('Both sets', 'Set'));

    expect(screen.getByText('208 cards in scope')).toBeTruthy();
    expect(pill('50%', 'Session size').className).toContain('pill--active');
    expect(screen.getByText('104 cards this session')).toBeTruthy();
  });
});
