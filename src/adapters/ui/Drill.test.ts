import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import Drill from './Drill.svelte';
import { CARDS, type Card } from '../../domain/cards';
import { cardsInScope, type Scope } from '../../domain/scope';
import type { InkSurface } from '../../ports/ink-surface';
import type { Stroke, StrokeTiming } from '../../domain/ink';
import type { WidthPreset } from '../../domain/settings';
import type { Attempt } from '../../domain/attempt';
import type { AttemptRepository } from '../../ports/attempt-repository';
import type { TallyRepository } from '../../ports/tally-repository';
import type { Result } from '../../domain/result';

// `selectNext` (Story 1.7) draws from the real `CARDS` catalog filtered by
// `scope` -- a `Scope` can only narrow to a full script+kind combination
// (minimum 33 cards), never to an arbitrary short list, so this file can no
// longer force a specific first prompt via a hand-picked `cards` array. Two
// fixed scopes stand in for the old ad hoc single/two-card fixtures; tests
// that used to assert an exact prompt now read whichever card actually
// rendered instead.
const HIRAGANA_BASE_SCOPE: Scope = { scripts: ['hiragana'], units: ['base'] }; // 46 cards
const HIRAGANA_YOON_SCOPE: Scope = { scripts: ['hiragana'], units: ['yoon'] }; // 33 cards

// A `ui` adapter must never import a sibling adapter's implementation (AD-1),
// so the ink surface is faked against the port -- the same way
// ScopePicker.test.ts fakes `CardRepository`. Landing a stroke here means
// invoking the subscriber the component registered, which is exactly what
// the real adapter does once per completed stroke.
function fakeInkSurface(): InkSurface & {
  mounts: HTMLElement[];
  clears: number;
  destroys: number;
  landStroke: (overrides?: {
    x?: number;
    y?: number;
    pressure?: number;
    widthPreset?: WidthPreset;
  }) => Promise<void>;
} {
  let cb: ((stroke: Stroke, timing: StrokeTiming) => void) | null = null;
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
    onStrokeComplete(next: (stroke: Stroke, timing: StrokeTiming) => void) {
      cb = next;
    },
    setWidthPreset: vi.fn(),
    async landStroke(overrides: { x?: number; y?: number; pressure?: number; widthPreset?: WidthPreset } = {}) {
      // Real `performance.now()` readings -- Drill's `promptShownAt` is set
      // from the same clock, so these must land after it rather than at an
      // arbitrary small fixture number.
      const startedAt = performance.now();
      const stroke: Stroke = {
        points: [{ x: overrides.x ?? 0.5, y: overrides.y ?? 0.5, pressure: overrides.pressure ?? 0.7 }],
        widthPreset: overrides.widthPreset ?? 'expressive',
      };
      const endedAt = performance.now();
      cb?.(stroke, { startedAt, endedAt });
      await tick();
    },
  };
  return surface;
}

/** Fakes `AttemptRepository`, recording every `add()` call -- the same
 * pattern as `fakeInkSurface` above, against `ports/attempt-repository.ts`. */
function fakeAttemptRepository(
  addResult: Result<void> = { ok: true, value: undefined },
): AttemptRepository & { adds: Attempt[] } {
  const adds: Attempt[] = [];
  return {
    adds,
    add(attempt: Attempt) {
      adds.push(attempt);
      return Promise.resolve(addResult);
    },
    listBySession() {
      return Promise.resolve({ ok: true, value: [] });
    },
    listAll() {
      return Promise.resolve({ ok: true, value: [] });
    },
    deleteLast() {
      return Promise.resolve({ ok: true, value: undefined });
    },
  };
}

/** Fakes `TallyRepository`, recording every `increment()`/`decrement()` call
 * -- mirrors `fakeAttemptRepository` above, against
 * `ports/tally-repository.ts`. */
function fakeTallyRepository(
  incrementResult: Result<void> = { ok: true, value: undefined },
): TallyRepository & { increments: string[]; decrements: string[] } {
  const increments: string[] = [];
  const decrements: string[] = [];
  return {
    increments,
    decrements,
    getAll() {
      return Promise.resolve({ ok: true, value: [] });
    },
    increment(cardId: string) {
      increments.push(cardId);
      return Promise.resolve(incrementResult);
    },
    decrement(cardId: string) {
      decrements.push(cardId);
      return Promise.resolve({ ok: true, value: undefined });
    },
  };
}

/** Reads the currently-rendered prompt's romaji, matched against `cards`
 * (every candidate `selectNext` could have drawn from). Within a single
 * script+kind scope every romaji is unique, so this unambiguously resolves
 * back to the exact `Card` on screen. Generalizes the file's prior
 * hardcoded `/^(shi|tsu)$/` idiom to an arbitrary scope. */
function currentCard(cards: Card[]): Card {
  const pattern = new RegExp(`^(${cards.map((c) => c.romaji).join('|')})$`);
  const romaji = screen.getByText(pattern).textContent ?? '';
  const found = cards.find((c) => c.romaji === romaji);
  if (!found) throw new Error(`no card matches displayed romaji "${romaji}"`);
  return found;
}

function grade(name: 'Missed' | 'Correct'): HTMLButtonElement {
  return screen.getByRole('button', { name }) as HTMLButtonElement;
}

/** `render(Drill, ...)` with both port fakes defaulted, so call sites that
 * don't care about ink/attempt persistence don't have to construct both
 * fakes every time -- pass an override to capture a reference when a test
 * does care. */
function renderDrill(
  overrides: {
    scope?: Scope;
    attempts?: Attempt[];
    inkSurface?: ReturnType<typeof fakeInkSurface>;
    attemptRepository?: ReturnType<typeof fakeAttemptRepository>;
    tallyRepository?: ReturnType<typeof fakeTallyRepository>;
    onBack?: () => void;
  } = {},
) {
  const scope = overrides.scope ?? HIRAGANA_BASE_SCOPE;
  const attempts = overrides.attempts ?? [];
  const inkSurface = overrides.inkSurface ?? fakeInkSurface();
  const attemptRepository = overrides.attemptRepository ?? fakeAttemptRepository();
  const tallyRepository = overrides.tallyRepository ?? fakeTallyRepository();
  const onBack = overrides.onBack ?? vi.fn();
  const result = render(Drill, {
    scope,
    attempts,
    inkSurface,
    attemptRepository,
    tallyRepository,
    onBack,
  });
  return { ...result, scope, attempts, inkSurface, attemptRepository, tallyRepository, onBack };
}

describe('Drill', () => {
  it('prompts with romaji plus the script name, and no grapheme', () => {
    // The grapheme is the answer -- Story 1.4's Reveal owns showing it.
    renderDrill();
    const cards = cardsInScope([...CARDS], HIRAGANA_BASE_SCOPE);
    const target = currentCard(cards);

    expect(screen.getByText(target.romaji)).toBeTruthy();
    expect(screen.getByText('Hiragana')).toBeTruthy();
    expect(screen.queryByText(target.grapheme)).toBeNull();
  });

  it('starts the counter at "1 / N" for a scope of N cards', () => {
    renderDrill({ scope: HIRAGANA_BASE_SCOPE });

    expect(screen.getByText('1 / 46')).toBeTruthy();
  });

  it('pairs the counter with a progress bar, never a bar alone', () => {
    renderDrill({ scope: HIRAGANA_BASE_SCOPE });

    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('1');
    expect(bar.getAttribute('aria-valuemax')).toBe('46');
    expect(screen.getByText('1 / 46')).toBeTruthy();
  });

  it('mounts the ink surface exactly once, into a node Svelte leaves empty', () => {
    const inkSurface = fakeInkSurface();
    renderDrill({ inkSurface });

    expect(inkSurface.mounts).toHaveLength(1);
    // The adapter owns this node's contents (AD-2): Svelte renders nothing
    // inside it, so it is empty until the adapter appends its canvas.
    expect(inkSurface.mounts[0]?.childElementCount).toBe(0);
  });

  it('destroys the ink surface when the screen unmounts', () => {
    const inkSurface = fakeInkSurface();
    const { unmount } = renderDrill({ inkSurface });

    unmount();

    expect(inkSurface.destroys).toBe(1);
  });

  it('dims and disables Missed and Correct while the cell is blank', () => {
    renderDrill();

    for (const name of ['Missed', 'Correct'] as const) {
      expect(grade(name).disabled).toBe(true);
      expect(grade(name).className).toContain('btn--dimmed');
    }
  });

  it('activates Missed and Correct once a stroke lands', async () => {
    const inkSurface = fakeInkSurface();
    renderDrill({ inkSurface });

    await inkSurface.landStroke();

    for (const name of ['Missed', 'Correct'] as const) {
      expect(grade(name).disabled).toBe(false);
      expect(grade(name).className).not.toContain('btn--dimmed');
    }
  });

  it('shows Clear only once ink exists, beside the self-grading line', async () => {
    const inkSurface = fakeInkSurface();
    renderDrill({ inkSurface });

    expect(screen.getByText('Your call — nothing is checking the shape')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();

    await inkSurface.landStroke();

    expect(screen.getByRole('button', { name: 'Clear' })).toBeTruthy();
  });

  it('Clear empties the cell and re-dims the grades without advancing', async () => {
    const cards = cardsInScope([...CARDS], HIRAGANA_BASE_SCOPE);
    const inkSurface = fakeInkSurface();
    renderDrill({ inkSurface });
    const before = currentCard(cards);

    await inkSurface.landStroke();
    await fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(inkSurface.clears).toBe(1);
    expect(grade('Correct').disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
    // Same prompt, same position.
    expect(currentCard(cards)).toBe(before);
    expect(screen.getByText('1 / 46')).toBeTruthy();
  });

  for (const name of ['Missed', 'Correct'] as const) {
    it(`${name} advances the counter and still shows a prompt from the scope`, async () => {
      const cards = cardsInScope([...CARDS], HIRAGANA_BASE_SCOPE);
      const inkSurface = fakeInkSurface();
      renderDrill({ inkSurface });

      await inkSurface.landStroke();
      await fireEvent.click(grade(name));

      expect(screen.getByText('2 / 46')).toBeTruthy();
      // Still a prompt from the scope -- selection may repeat the
      // just-graded card (no previous-card exclusion, Story 1.7).
      expect(() => currentCard(cards)).not.toThrow();
      // The cell is empty again and the grades are back to dimmed.
      expect(inkSurface.clears).toBe(1);
      expect(grade('Correct').disabled).toBe(true);
    });
  }

  it('keeps counting past the scope size, with the bar clamped at full', async () => {
    // Selection is with replacement and nothing closes the session until
    // Story 1.9 -- overshooting the counter is the intended behavior, not
    // an overflow bug. The smaller yoon scope keeps the loop below cheap.
    const cards = cardsInScope([...CARDS], HIRAGANA_YOON_SCOPE);
    const inkSurface = fakeInkSurface();
    renderDrill({ scope: HIRAGANA_YOON_SCOPE, inkSurface });

    for (let i = 0; i < cards.length; i++) {
      await inkSurface.landStroke();
      await fireEvent.click(grade('Correct'));
    }

    expect(screen.getByText(`${cards.length + 1} / ${cards.length}`)).toBeTruthy();
    const fill = document.querySelector('.bar-fill') as HTMLElement;
    expect(fill.style.width).toBe('100%');
    // The visible counter overshoots, but the exposed progress value must
    // stay inside its own min/max or screen readers announce nonsense.
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe(String(cards.length));
  });

  it('calls onBack from the temporary Back control', async () => {
    const onBack = vi.fn();
    renderDrill({ onBack });

    await fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('shows no post-grade toast or Undo', async () => {
    // Stories 1.6/1.8 own the tally toast and Undo, not this story.
    const inkSurface = fakeInkSurface();
    renderDrill({ inkSurface });

    await inkSurface.landStroke();
    await fireEvent.click(grade('Missed'));

    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Next character' })).toBeNull();
    // No cumulative tally readout either -- Story 1.6 introduces that.
    expect(screen.queryByText(/missed \d+/i)).toBeNull();
  });

  function reveal(): HTMLButtonElement {
    return screen.getByRole('button', { name: 'Reveal' }) as HTMLButtonElement;
  }

  it('is active from the moment a prompt appears, before any stroke', () => {
    renderDrill();

    expect(reveal().disabled).toBe(false);
    expect(reveal().className).not.toContain('btn--dimmed');
  });

  it('unlocks Missed and Correct from a blank cell', async () => {
    renderDrill();

    await fireEvent.click(reveal());

    for (const name of ['Missed', 'Correct'] as const) {
      expect(grade(name).disabled).toBe(false);
    }
  });

  it('shows the empty Yours panel (no inked glyph) when revealed from blank', async () => {
    const cards = cardsInScope([...CARDS], HIRAGANA_BASE_SCOPE);
    renderDrill();
    const target = currentCard(cards);

    await fireEvent.click(reveal());

    expect(screen.getByText('Yours')).toBeTruthy();
    expect(screen.getByText('Reference')).toBeTruthy();
    expect(screen.getByText(target.grapheme)).toBeTruthy();
  });

  it('shows the Yours ink alongside the Reference glyph when revealed from written ink', async () => {
    const cards = cardsInScope([...CARDS], HIRAGANA_BASE_SCOPE);
    const inkSurface = fakeInkSurface();
    renderDrill({ inkSurface });
    const target = currentCard(cards);

    await inkSurface.landStroke();
    await fireEvent.click(reveal());

    // The same ink-surface node stays mounted -- no second mount/destroy,
    // and the ink itself is never cleared just because Reveal was tapped.
    expect(inkSurface.mounts).toHaveLength(1);
    expect(inkSurface.destroys).toBe(0);
    expect(inkSurface.clears).toBe(0);
    expect(screen.getByText(target.grapheme)).toBeTruthy();
  });

  it('does not clip a two-character yoon reference glyph', async () => {
    const cards = cardsInScope([...CARDS], HIRAGANA_YOON_SCOPE);
    renderDrill({ scope: HIRAGANA_YOON_SCOPE });
    const target = currentCard(cards);
    expect(target.kind).toBe('yoon');

    await fireEvent.click(reveal());

    const glyph = screen.getByText(target.grapheme);
    expect(glyph.className).toContain('glyph--yoon');
  });

  it('ties the Yours/Reference captions to their panels for assistive tech', async () => {
    renderDrill();

    await fireEvent.click(reveal());

    const yoursLabel = screen.getByText('Yours');
    const referenceLabel = screen.getByText('Reference');
    const groups = screen.getAllByRole('group');
    expect(groups.map((g) => g.getAttribute('aria-labelledby'))).toEqual(
      expect.arrayContaining([yoursLabel.id, referenceLabel.id]),
    );
  });

  it('locks the ink cell to pointer input once revealed, so the reference cannot be traced', async () => {
    const inkSurface = fakeInkSurface();
    renderDrill({ inkSurface });

    await inkSurface.landStroke();
    await fireEvent.click(reveal());

    const cellEl = document.querySelector('.cell');
    expect(cellEl?.className).toContain('cell--locked');
  });

  it('moves focus to Missed so Reveal becoming disabled does not drop it to the page', async () => {
    renderDrill();

    await fireEvent.click(reveal());
    await tick();

    expect(document.activeElement).toBe(grade('Missed'));
  });

  it('never assigns a grade on its own and becomes a dimmed "Revealed" label', async () => {
    renderDrill();

    await fireEvent.click(reveal());

    expect(screen.getByText('1 / 46')).toBeTruthy();
    const revealedLabel = screen.getByRole('button', { name: 'Revealed' });
    expect(revealedLabel.hasAttribute('disabled')).toBe(true);
    expect(revealedLabel.className).toContain('btn--dimmed');
  });

  it('hides Clear and the disclaimer once revealed', async () => {
    const inkSurface = fakeInkSurface();
    renderDrill({ inkSurface });

    await inkSurface.landStroke();
    await fireEvent.click(reveal());

    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
    expect(screen.queryByText('Your call — nothing is checking the shape')).toBeNull();
  });

  it('resets to the single-cell layout on the next prompt after a graded reveal', async () => {
    renderDrill();

    await fireEvent.click(reveal());
    await fireEvent.click(grade('Missed'));

    expect(screen.getByText('2 / 46')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reveal' }).hasAttribute('disabled')).toBe(false);
    expect(screen.queryByText('Yours')).toBeNull();
    expect(screen.queryByText('Reference')).toBeNull();
    expect(grade('Correct').disabled).toBe(true);
  });

  it('resets to the single-cell layout after grading a reveal that started from written ink', async () => {
    const inkSurface = fakeInkSurface();
    renderDrill({ inkSurface });

    await inkSurface.landStroke();
    await fireEvent.click(reveal());
    await fireEvent.click(grade('Correct'));

    expect(screen.getByText('2 / 46')).toBeTruthy();
    expect(screen.queryByText('Yours')).toBeNull();
    expect(screen.queryByText('Reference')).toBeNull();
    expect(screen.getByRole('button', { name: 'Reveal' }).hasAttribute('disabled')).toBe(false);
    expect(grade('Correct').disabled).toBe(true);
  });

  // Story 1.5: an Attempt is persisted on every grade.
  describe('attempt recording', () => {
    it('persists an attempt with every required field when graded after writing', async () => {
      const cards = cardsInScope([...CARDS], HIRAGANA_BASE_SCOPE);
      const inkSurface = fakeInkSurface();
      const attemptRepository = fakeAttemptRepository();
      renderDrill({ inkSurface, attemptRepository });
      const target = currentCard(cards);

      await inkSurface.landStroke({ widthPreset: 'calligraphy' });
      await fireEvent.click(grade('Correct'));
      await tick();

      expect(attemptRepository.adds).toHaveLength(1);
      const attempt = attemptRepository.adds[0]!;
      expect(attempt.id).toEqual(expect.any(String));
      expect(attempt.sessionId).toEqual(expect.any(String));
      expect(attempt.cardId).toBe(target.cardId);
      // ISO-8601.
      expect(attempt.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(attempt.strokeCount).toBe(1);
      expect(attempt.revealUsed).toBe(false);
      expect(attempt.selfGrade).toBe('correct');
      expect(attempt.strokes).toHaveLength(1);
      expect(attempt.strokes[0]?.widthPreset).toBe('calligraphy');
      expect(attempt.timeToFirstStrokeMs).toBeGreaterThanOrEqual(0);
      expect(attempt.totalTimeMs).toBeGreaterThanOrEqual(attempt.timeToFirstStrokeMs);
    });

    it('persists a Missed grade as selfGrade "incorrect"', async () => {
      const inkSurface = fakeInkSurface();
      const attemptRepository = fakeAttemptRepository();
      renderDrill({ inkSurface, attemptRepository });

      await inkSurface.landStroke();
      await fireEvent.click(grade('Missed'));
      await tick();

      expect(attemptRepository.adds[0]?.selfGrade).toBe('incorrect');
    });

    it('persists strokeCount 0, empty strokes, and revealUsed true when graded from a blank reveal', async () => {
      const attemptRepository = fakeAttemptRepository();
      renderDrill({ attemptRepository });

      await fireEvent.click(reveal());
      await fireEvent.click(grade('Correct'));
      await tick();

      expect(attemptRepository.adds).toHaveLength(1);
      const attempt = attemptRepository.adds[0]!;
      expect(attempt.strokeCount).toBe(0);
      expect(attempt.strokes).toEqual([]);
      expect(attempt.revealUsed).toBe(true);
      // No first-stroke instant exists -- timeToFirstStrokeMs falls back to
      // totalTimeMs rather than an undefined/negative value.
      expect(attempt.timeToFirstStrokeMs).toBe(attempt.totalTimeMs);
    });

    it('persists only the post-Clear stroke(s) when ink is cleared and rewritten before grading', async () => {
      const inkSurface = fakeInkSurface();
      const attemptRepository = fakeAttemptRepository();
      renderDrill({ inkSurface, attemptRepository });

      await inkSurface.landStroke({ x: 0.1, y: 0.1 });
      await fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
      await inkSurface.landStroke({ x: 0.9, y: 0.9 });
      await fireEvent.click(grade('Correct'));
      await tick();

      expect(attemptRepository.adds).toHaveLength(1);
      const attempt = attemptRepository.adds[0]!;
      expect(attempt.strokeCount).toBe(1);
      expect(attempt.strokes).toHaveLength(1);
      // The pre-Clear stroke (0.1, 0.1) is gone -- only the post-Clear one
      // (0.9, 0.9) is embedded.
      expect(attempt.strokes[0]?.points[0]).toMatchObject({ x: 0.9, y: 0.9 });
    });

    it('advances to the next prompt and logs a persistence failure via console.error, without blocking', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const inkSurface = fakeInkSurface();
      const attemptRepository = fakeAttemptRepository({ ok: false, error: new Error('write failed') });
      renderDrill({ inkSurface, attemptRepository });

      await inkSurface.landStroke();
      await fireEvent.click(grade('Correct'));
      await tick();
      // Flush the resolved (never-thrown) promise the failed add() returns.
      await Promise.resolve();
      await tick();

      // The screen still advances -- persistence never blocks the next card.
      expect(screen.getByText('2 / 46')).toBeTruthy();
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });

    it('advances and logs via console.error when attemptRepository.add() rejects instead of resolving a Result', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const inkSurface = fakeInkSurface();
      const attemptRepository = fakeAttemptRepository();
      attemptRepository.add = () => Promise.reject(new Error('connection lost'));
      renderDrill({ inkSurface, attemptRepository });

      await inkSurface.landStroke();
      await fireEvent.click(grade('Correct'));
      await tick();
      // Flush the rejected (never-thrown) promise the failed add() returns.
      await Promise.resolve();
      await tick();

      expect(screen.getByText('2 / 46')).toBeTruthy();
      expect(consoleError).toHaveBeenCalledWith('Failed to persist attempt:', expect.any(Error));

      consoleError.mockRestore();
    });

    it('persists revealUsed: true alongside a nonzero strokeCount when Reveal is tapped after writing', async () => {
      const inkSurface = fakeInkSurface();
      const attemptRepository = fakeAttemptRepository();
      renderDrill({ inkSurface, attemptRepository });

      await inkSurface.landStroke();
      await fireEvent.click(reveal());
      await fireEvent.click(grade('Correct'));
      await tick();

      expect(attemptRepository.adds).toHaveLength(1);
      const attempt = attemptRepository.adds[0]!;
      expect(attempt.revealUsed).toBe(true);
      expect(attempt.strokeCount).toBeGreaterThan(0);
      expect(attempt.strokes.length).toBeGreaterThan(0);
    });

    it("leaves a graded attempt's persisted strokes untouched once the next card accumulates its own", async () => {
      const inkSurface = fakeInkSurface();
      const attemptRepository = fakeAttemptRepository();
      renderDrill({ inkSurface, attemptRepository });

      await inkSurface.landStroke({ x: 0.2, y: 0.2 });
      await fireEvent.click(grade('Correct'));
      await tick();

      expect(attemptRepository.adds).toHaveLength(1);
      const firstAttempt = attemptRepository.adds[0]!;
      const firstStrokesSnapshot = firstAttempt.strokes.map((s) => ({ ...s }));

      // The next card accumulates its own stroke(s) -- `handleGrade` must
      // have reassigned `strokes = []` for the next card rather than ever
      // mutating the array already handed to the first attempt.
      await inkSurface.landStroke({ x: 0.8, y: 0.8 });

      expect(firstAttempt.strokes).toEqual(firstStrokesSnapshot);
      expect(firstAttempt.strokes).toHaveLength(1);
    });
  });

  // Story 1.6: every self-graded Missed bumps the card's tally; Correct
  // never touches it.
  describe('miss tally', () => {
    it('calls increment(cardId) exactly once when graded Missed', async () => {
      const cards = cardsInScope([...CARDS], HIRAGANA_BASE_SCOPE);
      const inkSurface = fakeInkSurface();
      const tallyRepository = fakeTallyRepository();
      renderDrill({ inkSurface, tallyRepository });
      const target = currentCard(cards);

      await inkSurface.landStroke();
      await fireEvent.click(grade('Missed'));
      await tick();

      expect(tallyRepository.increments).toEqual([target.cardId]);
    });

    it('increments the graded card, not the next prompt, in a multi-card scope', async () => {
      const cards = cardsInScope([...CARDS], HIRAGANA_BASE_SCOPE);
      const inkSurface = fakeInkSurface();
      const tallyRepository = fakeTallyRepository();
      renderDrill({ inkSurface, tallyRepository });
      const graded = currentCard(cards);

      await inkSurface.landStroke();
      await fireEvent.click(grade('Missed'));
      await tick();

      expect(tallyRepository.increments).toEqual([graded.cardId]);
    });

    it('never calls increment when graded Correct', async () => {
      const inkSurface = fakeInkSurface();
      const tallyRepository = fakeTallyRepository();
      renderDrill({ inkSurface, tallyRepository });

      await inkSurface.landStroke();
      await fireEvent.click(grade('Correct'));
      await tick();

      expect(tallyRepository.increments).toEqual([]);
    });

    it('advances and logs a tally persistence failure via console.error, without blocking', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const inkSurface = fakeInkSurface();
      const tallyRepository = fakeTallyRepository({ ok: false, error: new Error('write failed') });
      renderDrill({ inkSurface, tallyRepository });

      await inkSurface.landStroke();
      await fireEvent.click(grade('Missed'));
      await tick();
      // Flush the resolved (never-thrown) promise the failed increment() returns.
      await Promise.resolve();
      await tick();

      expect(screen.getByText('2 / 46')).toBeTruthy();
      expect(consoleError).toHaveBeenCalledWith('Failed to increment tally:', expect.any(Error));

      consoleError.mockRestore();
    });

    it('advances and logs via console.error when increment() rejects instead of resolving a Result', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const inkSurface = fakeInkSurface();
      const tallyRepository = fakeTallyRepository();
      tallyRepository.increment = () => Promise.reject(new Error('connection lost'));
      renderDrill({ inkSurface, tallyRepository });

      await inkSurface.landStroke();
      await fireEvent.click(grade('Missed'));
      await tick();
      // Flush the rejected (never-thrown) promise the failed increment() returns.
      await Promise.resolve();
      await tick();

      expect(screen.getByText('2 / 46')).toBeTruthy();
      expect(consoleError).toHaveBeenCalledWith('Failed to increment tally:', expect.any(Error));

      consoleError.mockRestore();
    });
  });

  // Story 1.7: weak-spot-biased selection replaces uniform random.
  describe('weak-spot-biased selection', () => {
    it('seeds sessionAttempts from the attempts prop so history feeds the very first prompt, not just later picks', () => {
      // A large, recent miss history for one arbitrary in-scope card
      // dominates the weighted draw (weight ~1001 vs. every other card's
      // floor of 1, out of a 46-card scope) -- a mid-range RNG draw (0.5)
      // reliably lands in that card's cumulative slice regardless of its
      // position in the catalog. This only happens if the initial pick at
      // mount actually reads the seeded `attempts` prop, not just picks
      // made after a grade.
      const cards = cardsInScope([...CARDS], HIRAGANA_BASE_SCOPE);
      const heavy = cards[10]!;
      const attempts: Attempt[] = Array.from({ length: 1000 }, (_, i) => ({
        id: `seed-${i}`,
        sessionId: 'prior-session',
        cardId: heavy.cardId,
        timestamp: new Date().toISOString(),
        timeToFirstStrokeMs: 100,
        totalTimeMs: 200,
        strokeCount: 1,
        revealUsed: false,
        selfGrade: 'incorrect',
        strokes: [],
      }));
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);

      renderDrill({ attempts });

      expect(currentCard(cards)).toBe(heavy);

      randomSpy.mockRestore();
    });

    it('never re-fetches attempts mid-session -- listAll() is not part of this component', () => {
      // Drill takes `attempts` as a prop, seeded once from the composition
      // root; it has no repository call of its own to load attempt history.
      const attemptRepository = fakeAttemptRepository();
      const listAllSpy = vi.spyOn(attemptRepository, 'listAll');
      renderDrill({ attemptRepository });

      expect(listAllSpy).not.toHaveBeenCalled();
    });

    it('can repeat the same card back-to-back (no previous-card exclusion)', async () => {
      // A single Correct grade contributes zero score (a correct attempt
      // never adds weight), so the weighted distribution is identical
      // before and after it -- every candidate stays at its floor weight of
      // 1. With Math.random() pinned to the same value both times, the
      // cumulative-weight walk deterministically lands on the same card
      // twice in a row, which only happens if `selectNext` never excludes
      // the just-graded card (Story 1.7 supersedes Story 1.3's
      // never-repeats-the-previous-card behavior).
      const cards = cardsInScope([...CARDS], HIRAGANA_BASE_SCOPE);
      const inkSurface = fakeInkSurface();
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.4);
      renderDrill({ inkSurface });
      const first = currentCard(cards);

      await inkSurface.landStroke();
      await fireEvent.click(grade('Correct'));

      expect(currentCard(cards)).toBe(first);
      expect(screen.getByText('2 / 46')).toBeTruthy();

      randomSpy.mockRestore();
    });
  });
});
