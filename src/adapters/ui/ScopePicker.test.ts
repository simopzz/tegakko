import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import ScopePicker from './ScopePicker.svelte';
import { CARDS } from '../../domain/cards';
import type { CardRepository } from '../../ports/card-repository';
import type { TallyRepository } from '../../ports/tally-repository';
import type { Tally } from '../../domain/tally';
import type { Result } from '../../domain/result';

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

/** Fakes `TallyRepository` -- mirrors `Drill.test.ts`'s helper of the same
 * shape, against `ports/tally-repository.ts`. `getAll()`'s result is
 * configurable so tests can exercise both the happy path and the I/O
 * matrix's fetch-failure fallback. */
function fakeTallyRepository(
  getAllResult: Result<Tally[]> = { ok: true, value: [] },
): TallyRepository {
  return {
    getAll: () => Promise.resolve(getAllResult),
    increment: () => Promise.resolve({ ok: true, value: undefined }),
    decrement: () => Promise.resolve({ ok: true, value: undefined }),
  };
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

describe('ScopePicker', () => {
  it('defaults to the full 158-card scope with a live "158 cards" count', () => {
    render(ScopePicker, {
      cardRepository: realRepository(),
      tallyRepository: fakeTallyRepository(),
      onStart: vi.fn(),
      onSettings: vi.fn(),
      onHistory: vi.fn(),
    });

    expect(screen.getByText('158 cards in scope')).toBeTruthy();
  });

  it('renders the default selection as positive-variant script/set chip tags', () => {
    render(ScopePicker, {
      cardRepository: realRepository(),
      tallyRepository: fakeTallyRepository(),
      onStart: vi.fn(),
      onSettings: vi.fn(),
      onHistory: vi.fn(),
    });

    const group = chips();
    expect(within(group).getByText('Hiragana')).toBeTruthy();
    expect(within(group).getByText('Katakana')).toBeTruthy();
    expect(within(group).getByText('Base')).toBeTruthy();
    expect(within(group).getByText('Yoon')).toBeTruthy();
    // Every script/set chip is positive-variant -- the shaky chip (Story
    // 1.7) is a separate `chip--missed` sibling, not one of these.
    const scriptSetChips = [...group.children].filter(
      (chip) => !chip.className.includes('chip--missed'),
    );
    expect(scriptSetChips.length).toBeGreaterThan(0);
    for (const chip of scriptSetChips) {
      expect(chip.className).toContain('chip--positive');
    }
  });

  it('recomputes the live count immediately when narrowing to Hiragana + Base (46 cards)', async () => {
    render(ScopePicker, {
      cardRepository: realRepository(),
      tallyRepository: fakeTallyRepository(),
      onStart: vi.fn(),
      onSettings: vi.fn(),
      onHistory: vi.fn(),
    });

    await fireEvent.click(pill('Hiragana'));
    await fireEvent.click(pill('Base'));

    expect(screen.getByText('46 cards in scope')).toBeTruthy();
  });

  it('recomputes the live count when narrowing to Katakana only (79 cards)', async () => {
    render(ScopePicker, {
      cardRepository: realRepository(),
      tallyRepository: fakeTallyRepository(),
      onStart: vi.fn(),
      onSettings: vi.fn(),
      onHistory: vi.fn(),
    });

    await fireEvent.click(pill('Katakana'));

    expect(screen.getByText('79 cards in scope')).toBeTruthy();
  });

  it('recomputes the live count when narrowing to Yoon only (66 cards)', async () => {
    render(ScopePicker, {
      cardRepository: realRepository(),
      tallyRepository: fakeTallyRepository(),
      onStart: vi.fn(),
      onSettings: vi.fn(),
      onHistory: vi.fn(),
    });

    await fireEvent.click(pill('Yoon'));

    expect(screen.getByText('66 cards in scope')).toBeTruthy();
  });

  it('keeps exactly one active segment per pill group after a tap', async () => {
    render(ScopePicker, {
      cardRepository: realRepository(),
      tallyRepository: fakeTallyRepository(),
      onStart: vi.fn(),
      onSettings: vi.fn(),
      onHistory: vi.fn(),
    });

    await fireEvent.click(pill('Hiragana'));

    expect(pill('Hiragana').className).toContain('pill--active');
    expect(pill('Both scripts').className).not.toContain('pill--active');
    expect(pill('Katakana').className).not.toContain('pill--active');
  });

  it('passes the exact narrowed {scripts, units} scope to onStart on "Start writing"', async () => {
    const onStart = vi.fn();
    render(ScopePicker, {
      cardRepository: realRepository(),
      tallyRepository: fakeTallyRepository(),
      onStart,
      onSettings: vi.fn(),
      onHistory: vi.fn(),
    });

    await fireEvent.click(pill('Hiragana'));
    await fireEvent.click(pill('Base'));
    await fireEvent.click(pill('Start writing'));

    expect(onStart).toHaveBeenCalledWith({ scripts: ['hiragana'], units: ['base'] });
  });

  it('passes the full scope to onStart when nothing was narrowed', async () => {
    const onStart = vi.fn();
    render(ScopePicker, {
      cardRepository: realRepository(),
      tallyRepository: fakeTallyRepository(),
      onStart,
      onSettings: vi.fn(),
      onHistory: vi.fn(),
    });

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
    render(ScopePicker, {
      cardRepository: realRepository(),
      tallyRepository: fakeTallyRepository(),
      onStart: vi.fn(),
      onSettings: vi.fn(),
      onHistory: vi.fn(),
    });

    for (const name of ['Both scripts', 'Hiragana', 'Katakana']) {
      expect(pill(name, 'Script').tagName).toBe('BUTTON');
    }
    for (const name of ['Both sets', 'Base', 'Yoon']) {
      expect(pill(name, 'Set').tagName).toBe('BUTTON');
    }
    expect(pill('Start writing').tagName).toBe('BUTTON');
  });

  it('reaches Settings from the header link without touching the scope', async () => {
    const onSettings = vi.fn();
    const onStart = vi.fn();
    render(ScopePicker, {
      cardRepository: realRepository(),
      tallyRepository: fakeTallyRepository(),
      onStart,
      onSettings,
      onHistory: vi.fn(),
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    expect(onSettings).toHaveBeenCalledTimes(1);
    // Settings is a navigation link, not a second primary action: it never
    // starts a drill.
    expect(onStart).not.toHaveBeenCalled();
    expect(screen.getByText('158 cards in scope')).toBeTruthy();
  });

  it('reaches History from the header link without touching the scope', async () => {
    const onHistory = vi.fn();
    const onStart = vi.fn();
    render(ScopePicker, {
      cardRepository: realRepository(),
      tallyRepository: fakeTallyRepository(),
      onStart,
      onSettings: vi.fn(),
      onHistory,
    });

    await fireEvent.click(screen.getByRole('button', { name: 'History' }));

    expect(onHistory).toHaveBeenCalledTimes(1);
    // History is a navigation link, not a second primary action: it never
    // starts a drill.
    expect(onStart).not.toHaveBeenCalled();
    expect(screen.getByText('158 cards in scope')).toBeTruthy();
  });

  it('restores a previously chosen scope onto the pills when remounted', async () => {
    // Back from the drill or Settings unmounts and remounts this screen, so
    // the selection has to survive via `initialScope` from the composition
    // root -- otherwise Back silently resets the learner to the full scope.
    render(ScopePicker, {
      cardRepository: realRepository(),
      tallyRepository: fakeTallyRepository(),
      onStart: vi.fn(),
      onSettings: vi.fn(),
      onHistory: vi.fn(),
      initialScope: { scripts: ['katakana'], units: ['yoon'] },
    });

    expect(pill('Katakana').className).toContain('pill--active');
    expect(pill('Yoon').className).toContain('pill--active');
    expect(screen.getByText('33 cards in scope')).toBeTruthy();
  });

  it('reports every scope change upward, not just the one at "Start writing"', async () => {
    const onScopeChange = vi.fn();
    render(ScopePicker, {
      cardRepository: realRepository(),
      tallyRepository: fakeTallyRepository(),
      onStart: vi.fn(),
      onSettings: vi.fn(),
      onHistory: vi.fn(),
      onScopeChange,
    });

    await fireEvent.click(pill('Hiragana'));

    expect(onScopeChange).toHaveBeenLastCalledWith({
      scripts: ['hiragana'],
      units: ['base', 'yoon'],
    });
  });

  it('shrinks the rendered chips to match a narrowed Hiragana + Base selection', async () => {
    render(ScopePicker, {
      cardRepository: realRepository(),
      tallyRepository: fakeTallyRepository(),
      onStart: vi.fn(),
      onSettings: vi.fn(),
      onHistory: vi.fn(),
    });

    await fireEvent.click(pill('Hiragana'));
    await fireEvent.click(pill('Base'));

    const group = chips();
    expect(within(group).getByText('Hiragana')).toBeTruthy();
    expect(within(group).getByText('Base')).toBeTruthy();
    expect(within(group).queryByText('Katakana')).toBeNull();
    expect(within(group).queryByText('Yoon')).toBeNull();
  });

  // Story 1.7: the "N shaky" badge.
  describe('shaky badge', () => {
    it('shows "0 shaky" when no tallies exist', async () => {
      render(ScopePicker, {
        cardRepository: realRepository(),
        tallyRepository: fakeTallyRepository({ ok: true, value: [] }),
        onStart: vi.fn(),
        onSettings: vi.fn(),
        onHistory: vi.fn(),
      });

      expect(await screen.findByText('0 shaky')).toBeTruthy();
    });

    it('shows "0 shaky" and stays usable when the tally fetch fails', async () => {
      render(ScopePicker, {
        cardRepository: realRepository(),
        tallyRepository: fakeTallyRepository({ ok: false, error: new Error('IndexedDB blocked') }),
        onStart: vi.fn(),
        onSettings: vi.fn(),
        onHistory: vi.fn(),
      });

      expect(await screen.findByText('0 shaky')).toBeTruthy();
      expect(screen.getByText('158 cards in scope')).toBeTruthy();
    });

    it('shows "0 shaky" and logs via console.error when getAll() rejects instead of resolving a Result', async () => {
      // The resolved-`{ok: false}` fallback is covered above -- this proves
      // the *other* failure path adapters can take (an outright rejected
      // promise) is also handled, mirroring `Drill.test.ts`'s
      // "...rejects instead of resolving a Result" tests.
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const tallyRepository: TallyRepository = {
        getAll: () => Promise.reject(new Error('connection lost')),
        increment: () => Promise.resolve({ ok: true, value: undefined }),
        decrement: () => Promise.resolve({ ok: true, value: undefined }),
      };
      render(ScopePicker, {
        cardRepository: realRepository(),
        tallyRepository,
        onStart: vi.fn(),
        onSettings: vi.fn(),
        onHistory: vi.fn(),
      });

      expect(await screen.findByText('0 shaky')).toBeTruthy();
      expect(screen.getByText('158 cards in scope')).toBeTruthy();
      expect(consoleError).toHaveBeenCalledWith('Failed to load tallies:', expect.any(Error));

      consoleError.mockRestore();
    });

    it('counts an in-scope card whose tally exceeds the in-scope average once fetched', async () => {
      const heavy = CARDS.find((c) => c.script === 'hiragana' && c.kind === 'base')!;
      render(ScopePicker, {
        cardRepository: realRepository(),
        tallyRepository: fakeTallyRepository({
          ok: true,
          value: [{ cardId: heavy.cardId, missCount: 10 }],
        }),
        onStart: vi.fn(),
        onSettings: vi.fn(),
        onHistory: vi.fn(),
      });

      expect(await screen.findByText('1 shaky')).toBeTruthy();
    });

    it('recomputes on a script/set toggle -- only in-scope cards count toward the average', async () => {
      // A miss tally on a katakana card must not count toward -- or inflate
      // the average against -- a hiragana-only scope.
      const katakanaCard = CARDS.find((c) => c.script === 'katakana' && c.kind === 'base')!;
      const hiraganaCard = CARDS.find((c) => c.script === 'hiragana' && c.kind === 'base')!;
      render(ScopePicker, {
        cardRepository: realRepository(),
        tallyRepository: fakeTallyRepository({
          ok: true,
          value: [
            { cardId: katakanaCard.cardId, missCount: 10 },
            { cardId: hiraganaCard.cardId, missCount: 5 },
          ],
        }),
        onStart: vi.fn(),
        onSettings: vi.fn(),
        onHistory: vi.fn(),
      });

      await screen.findByText('158 cards in scope');
      // Full scope: both misses count toward the average -- neither
      // dominates enough to necessarily exceed it on its own, but assert
      // the narrowed case is what actually matters here.
      await fireEvent.click(pill('Hiragana'));

      // Narrowed to hiragana only: the katakana tally drops out entirely,
      // leaving one heavily-missed card in scope.
      expect(await screen.findByText('1 shaky')).toBeTruthy();
    });
  });
});
