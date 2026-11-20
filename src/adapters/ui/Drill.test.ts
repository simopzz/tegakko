import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import Drill from './Drill.svelte';
import DrillScopeHarness from './DrillScopeHarness.svelte';
import { CARDS, type Card } from '../../domain/cards';
import { cardsInScope, type Scope } from '../../domain/scope';
import type { InkSurface } from '../../ports/ink-surface';
import type { Stroke, StrokeTiming } from '../../domain/ink';
import type { WidthPreset } from '../../domain/settings';
import type { Attempt } from '../../domain/attempt';
import type { AttemptRepository } from '../../ports/attempt-repository';
import type { TallyRepository } from '../../ports/tally-repository';
import type { Tally } from '../../domain/tally';
import type { Result } from '../../domain/result';
import type { SessionRepository } from '../../ports/session-repository';
import type { Session, SessionSummaryView } from '../../domain/session';

// `sampleSessionCards` draws from the real `CARDS` catalog filtered
// by `scope` -- a `Scope` can only narrow to a full script+set combination
// (minimum 33 cards), never to an arbitrary short list, so this file can no
// longer force a specific first prompt via a hand-picked `cards` array. Two
// fixed scopes stand in for the old ad hoc single/two-card fixtures; tests
// that used to assert an exact prompt now read whichever card actually
// rendered instead.
const HIRAGANA_BASE_SCOPE: Scope = { scripts: ['hiragana'], sets: ['base'] }; // 71 cards
const HIRAGANA_YOON_SCOPE: Scope = { scripts: ['hiragana'], sets: ['yoon'] }; // 33 cards

// A `ui` adapter must never import a sibling adapter's implementation
// (docs/adr/0001-hexagonal-boundary.md),
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
  deleteLastResult: Result<void> = { ok: true, value: undefined },
): AttemptRepository & { adds: Attempt[]; deletes: string[] } {
  const adds: Attempt[] = [];
  const deletes: string[] = [];
  return {
    adds,
    deletes,
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
    deleteLast(sessionId: string) {
      deletes.push(sessionId);
      return Promise.resolve(deleteLastResult);
    },
  };
}

/** Fakes `TallyRepository`, recording every `increment()`/`decrement()` call
 * -- mirrors `fakeAttemptRepository` above, against
 * `ports/tally-repository.ts`. */
function fakeTallyRepository(
  incrementResult: Result<void> = { ok: true, value: undefined },
  decrementResult: Result<void> = { ok: true, value: undefined },
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
      return Promise.resolve(decrementResult);
    },
  };
}

/** Fakes `SessionRepository`, recording every `add()` call -- mirrors
 * `fakeAttemptRepository`/`fakeTallyRepository` above, against
 * `ports/session-repository.ts`. */
function fakeSessionRepository(
  addResult: Result<void> = { ok: true, value: undefined },
): SessionRepository & { adds: Session[] } {
  const adds: Session[] = [];
  return {
    adds,
    add(session: Session) {
      adds.push(session);
      return Promise.resolve(addResult);
    },
    list() {
      return Promise.resolve({ ok: true, value: [] });
    },
  };
}

/** The exact text the Drill prompt renders for a card -- `romaji` alone, or
 * `"<romaji> (<writtenRomaji>)"` on the 4 disambiguated cards. */
function promptText(card: Card): string {
  return card.writtenRomaji ? `${card.romaji} (${card.writtenRomaji})` : card.romaji;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Reads the currently-rendered prompt's text, matched against `cards`
 * (every candidate `sampleSessionCards` could have drawn from). Plain romaji
 * collides for two pairs (じ/ぢ both "ji", ず/づ both "zu"); `promptText`
 * disambiguates those 4 cards, so every candidate's displayed text is
 * unique. */
function currentCard(cards: Card[]): Card {
  const pattern = new RegExp(`^(${cards.map((c) => escapeRegExp(promptText(c))).join('|')})$`);
  const displayed = screen.getByText(pattern).textContent ?? '';
  const found = cards.find((c) => promptText(c) === displayed);
  if (!found) throw new Error(`no card matches displayed prompt "${displayed}"`);
  return found;
}

function grade(name: 'Missed' | 'Correct'): HTMLButtonElement {
  return screen.getByRole('button', { name }) as HTMLButtonElement;
}

/** The toast's "Next character" control -- clears the toast and runs the
 * advance deferred from `handleGrade` behind this tap. */
function nextCharacter(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'Next character' }) as HTMLButtonElement;
}

/** The toast's Undo control -- reverses the just-graded attempt. */
function undo(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement;
}

/** `handleUndo` chains several sequential `await`s (the pending attempt/tally
 * writes, then `deleteLast`, then `decrement`) -- a single `tick()` only
 * flushes Svelte's own pending-update queue, not that whole promise chain.
 * A macrotask (`setTimeout`) always runs after every microtask queued so
 * far, however deep the chain, so this reliably drains it before the
 * trailing `tick()` lets Svelte re-render from the settled state. */
async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await tick();
}

/** `render(Drill, ...)` with both port fakes defaulted, so call sites that
 * don't care about ink/attempt persistence don't have to construct both
 * fakes every time -- pass an override to capture a reference when a test
 * does care. */
function renderDrill(
  overrides: {
    scope?: Scope;
    sessionSize?: number;
    attempts?: Attempt[];
    tallies?: Tally[];
    inkSurface?: ReturnType<typeof fakeInkSurface>;
    attemptRepository?: ReturnType<typeof fakeAttemptRepository>;
    tallyRepository?: ReturnType<typeof fakeTallyRepository>;
    sessionRepository?: ReturnType<typeof fakeSessionRepository>;
    idleTimeoutMs?: number;
    onClose?: (summary: SessionSummaryView) => void;
  } = {},
) {
  const scope = overrides.scope ?? HIRAGANA_BASE_SCOPE;
  // Defaults to the full scoped count (the 'all' session-size choice) so
  // most tests -- which don't care about session sizing -- see the same
  // queue length as the old `cards.length`, and the sampled queue
  // structurally covers the entire scope regardless of weighting.
  const sessionSize = overrides.sessionSize ?? cardsInScope([...CARDS], scope).length;
  const attempts = overrides.attempts ?? [];
  const tallies = overrides.tallies ?? [];
  const inkSurface = overrides.inkSurface ?? fakeInkSurface();
  const attemptRepository = overrides.attemptRepository ?? fakeAttemptRepository();
  const tallyRepository = overrides.tallyRepository ?? fakeTallyRepository();
  const sessionRepository = overrides.sessionRepository ?? fakeSessionRepository();
  const idleTimeoutMs = overrides.idleTimeoutMs ?? 300_000;
  const onClose = overrides.onClose ?? vi.fn();
  const result = render(Drill, {
    scope,
    sessionSize,
    attempts,
    tallies,
    inkSurface,
    attemptRepository,
    tallyRepository,
    sessionRepository,
    idleTimeoutMs,
    onClose,
  });
  return {
    ...result,
    scope,
    sessionSize,
    attempts,
    tallies,
    inkSurface,
    attemptRepository,
    tallyRepository,
    sessionRepository,
    idleTimeoutMs,
    onClose,
  };
}

describe('Drill', () => {
  it('prompts with romaji plus the script name, and no grapheme', () => {
    // The grapheme is the answer -- Reveal owns showing it.
    renderDrill();
    const cards = cardsInScope([...CARDS], HIRAGANA_BASE_SCOPE);
    const target = currentCard(cards);

    expect(screen.getByText(promptText(target))).toBeTruthy();
    expect(screen.getByText('Hiragana')).toBeTruthy();
    expect(screen.queryByText(target.grapheme)).toBeNull();
  });

  it('appends the written-form romaji for the 4 cards whose romaji collides with another card\'s', async () => {
    // ぢ reads "ji (di)"; づ reads "zu (du)" -- disambiguates
    // from じ/ず, which keep rendering plain "ji"/"zu".
    const dakutenScope: Scope = { scripts: ['hiragana'], sets: ['base'] };
    const cards = cardsInScope([...CARDS], dakutenScope);
    const disambiguated = cards.filter((c) => c.writtenRomaji !== undefined);
    expect(disambiguated.map((c) => c.grapheme).sort()).toEqual(['づ', 'ぢ'].sort());

    // Walk the complete queue until each disambiguated card is prompted,
    // asserting its exact rendered text along the way.
    renderDrill({ scope: dakutenScope, sessionSize: cards.length });
    const seen = new Set<string>();
    for (let i = 0; i < cards.length && seen.size < disambiguated.length; i++) {
      const target = currentCard(cards);
      if (target.writtenRomaji !== undefined) {
        expect(screen.getByText(`${target.romaji} (${target.writtenRomaji})`)).toBeTruthy();
        expect(screen.queryByText(target.romaji, { exact: true })).toBeNull();
        seen.add(target.cardId);
      }
      await fireEvent.click(screen.getByRole('button', { name: 'Reveal' }));
      await fireEvent.click(screen.getByRole('button', { name: 'Missed' }));
      await fireEvent.click(screen.getByRole('button', { name: 'Next character' }));
    }
    expect(seen.size).toBe(disambiguated.length);
  });

  it('starts the counter at "1 / N" for a scope of N cards', () => {
    renderDrill({ scope: HIRAGANA_BASE_SCOPE });

    expect(screen.getByText('1 / 71')).toBeTruthy();
  });

  it('pairs the counter with a progress bar, never a bar alone', () => {
    renderDrill({ scope: HIRAGANA_BASE_SCOPE });

    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('1');
    expect(bar.getAttribute('aria-valuemax')).toBe('71');
    expect(screen.getByText('1 / 71')).toBeTruthy();
  });

  it('mounts the ink surface exactly once, into a node Svelte leaves empty', () => {
    const inkSurface = fakeInkSurface();
    renderDrill({ inkSurface });

    expect(inkSurface.mounts).toHaveLength(1);
    // The adapter owns this node's contents: Svelte renders nothing
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
    expect(screen.getByText('1 / 71')).toBeTruthy();
  });

  for (const name of ['Missed', 'Correct'] as const) {
    it(`${name} advances the counter and still shows a prompt from the scope`, async () => {
      const cards = cardsInScope([...CARDS], HIRAGANA_BASE_SCOPE);
      const inkSurface = fakeInkSurface();
      renderDrill({ inkSurface });

      await inkSurface.landStroke();
      await fireEvent.click(grade(name));
      await fireEvent.click(nextCharacter());

      expect(screen.getByText('2 / 71')).toBeTruthy();
      // Still a prompt from the scope.
      expect(() => currentCard(cards)).not.toThrow();
      // The cell is empty again and the grades are back to dimmed.
      expect(inkSurface.clears).toBe(1);
      expect(grade('Correct').disabled).toBe(true);
    });
  }

  it('reaches exactly 100% with no overshoot once the queue is fully graded', async () => {
    // Sampling is without replacement -- the bar/counter reach
    // exactly 100% on the last card, never past it. The smaller yoon scope
    // keeps the loop below cheap; grading every card but the last (so the
    // session never closes) leaves the final card's full-width bar
    // observable without also asserting on `onClose`.
    const cards = cardsInScope([...CARDS], HIRAGANA_YOON_SCOPE);
    const inkSurface = fakeInkSurface();
    renderDrill({ scope: HIRAGANA_YOON_SCOPE, inkSurface });

    for (let i = 0; i < cards.length - 1; i++) {
      await inkSurface.landStroke();
      await fireEvent.click(grade('Correct'));
      await fireEvent.click(nextCharacter());
    }

    expect(screen.getByText(`${cards.length} / ${cards.length}`)).toBeTruthy();
    const fill = document.querySelector('.bar-fill') as HTMLElement;
    expect(fill.style.width).toBe('100%');
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe(String(cards.length));
  });

  it('calls onClose with an explicit-closure summary from "I\'m done"', async () => {
    const onClose = vi.fn();
    renderDrill({ onClose });

    await fireEvent.click(screen.getByRole('button', { name: "I'm done" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ closureReason: 'explicit' }));
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
    expect(target.set).toBe('yoon');

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

  it('locks the ink cell to pointer input on a grade fired without a prior reveal', async () => {
    const inkSurface = fakeInkSurface();
    const attemptRepository = fakeAttemptRepository();
    renderDrill({ inkSurface, attemptRepository });

    await inkSurface.landStroke();
    await fireEvent.click(grade('Missed'));

    const cellEl = document.querySelector('.cell');
    expect(cellEl?.className).toContain('cell--locked');

    // A stroke notification arriving after the grade (e.g. still in flight)
    // must not be treated as new ink on the already-graded attempt.
    const strokesBefore = attemptRepository.adds.at(-1)?.strokes.length;
    await inkSurface.landStroke();
    expect(attemptRepository.adds.at(-1)?.strokes.length).toBe(strokesBefore);
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

    expect(screen.getByText('1 / 71')).toBeTruthy();
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
    await fireEvent.click(nextCharacter());

    expect(screen.getByText('2 / 71')).toBeTruthy();
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
    await fireEvent.click(nextCharacter());

    expect(screen.getByText('2 / 71')).toBeTruthy();
    expect(screen.queryByText('Yours')).toBeNull();
    expect(screen.queryByText('Reference')).toBeNull();
    expect(screen.getByRole('button', { name: 'Reveal' }).hasAttribute('disabled')).toBe(false);
    expect(grade('Correct').disabled).toBe(true);
  });

  // An Attempt is persisted on every grade.
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
      await fireEvent.click(nextCharacter());

      // The screen still advances -- persistence never blocks the next card.
      expect(screen.getByText('2 / 71')).toBeTruthy();
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
      await fireEvent.click(nextCharacter());

      expect(screen.getByText('2 / 71')).toBeTruthy();
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

      // The next card accumulates its own stroke(s) -- `handleNext` (the
      // advance is deferred here, off the grade itself) must have
      // reassigned `strokes = []` for the next card rather than ever
      // mutating the array already handed to the first attempt.
      await fireEvent.click(nextCharacter());
      await inkSurface.landStroke({ x: 0.8, y: 0.8 });

      expect(firstAttempt.strokes).toEqual(firstStrokesSnapshot);
      expect(firstAttempt.strokes).toHaveLength(1);
    });
  });

  // Every self-graded Missed bumps the card's tally; Correct
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
      await fireEvent.click(nextCharacter());

      expect(screen.getByText('2 / 71')).toBeTruthy();
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
      await fireEvent.click(nextCharacter());

      expect(screen.getByText('2 / 71')).toBeTruthy();
      expect(consoleError).toHaveBeenCalledWith('Failed to increment tally:', expect.any(Error));

      consoleError.mockRestore();
    });
  });

  // Weak-spot-biased sampling, once per session at mount
  // (docs/adr/0004-session-sampled-once-by-weakness.md).
  describe('weak-spot-biased sampling', () => {
    it('seeds the sampled queue from the attempts prop, weighting the very first prompt', () => {
      // A large, recent miss history for one arbitrary in-scope card
      // dominates the weighted draw (weight ~1001 vs. every other card's
      // floor of 1, out of a 71-card scope) -- a mid-range RNG draw (0.5)
      // reliably lands in that card's cumulative slice regardless of its
      // position in the catalog. `sessionSize: 1` keeps this a single draw
      // (no shuffle-induced reordering, since a 1-element array's shuffle
      // pass is a no-op), isolating that the *sampling* step itself -- not
      // just later picks -- reads the seeded `attempts` prop.
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

      renderDrill({ attempts, sessionSize: 1 });

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

    it('never shows the same card twice within one session (sampling is without replacement)', async () => {
      // The queue is sampled once, distinct, at mount -- "Next character"
      // can never advance onto a card already seen this session.
      const cards = cardsInScope([...CARDS], HIRAGANA_YOON_SCOPE);
      const inkSurface = fakeInkSurface();
      renderDrill({ scope: HIRAGANA_YOON_SCOPE, inkSurface });

      const seen = new Set<string>();
      for (let i = 0; i < cards.length - 1; i++) {
        const shown = currentCard(cards);
        expect(seen.has(shown.cardId)).toBe(false);
        seen.add(shown.cardId);
        await inkSurface.landStroke();
        await fireEvent.click(grade('Correct'));
        await fireEvent.click(nextCharacter());
      }
    });
  });

  // Grading defers the advance behind a toast (Undo, plus "Next
  // character") instead of advancing immediately.
  describe('undo last grade', () => {
    it('replaces Missed/Correct with a dimmed Reveal and a wide Next character while the toast is showing', async () => {
      const inkSurface = fakeInkSurface();
      renderDrill({ inkSurface });

      await inkSurface.landStroke();
      await fireEvent.click(grade('Missed'));

      expect(reveal().disabled).toBe(true);
      expect(screen.queryByRole('button', { name: 'Missed' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Correct' })).toBeNull();
      expect(nextCharacter()).toBeTruthy();
    });

    it('shows a cumulative tally on Missed but not on Correct', async () => {
      const inkSurface = fakeInkSurface();
      renderDrill({ inkSurface, tallies: [] });

      await inkSurface.landStroke();
      await fireEvent.click(grade('Missed'));

      expect(screen.getByText(/missed 1/i)).toBeTruthy();

      await fireEvent.click(undo());
      await flushAsync();
      await inkSurface.landStroke();
      await fireEvent.click(grade('Correct'));

      expect(screen.queryByText(/missed \d+/i)).toBeNull();
      expect(undo()).toBeTruthy();
    });

    it('Undo after Missed deletes the last attempt, decrements the tally, and re-enables grading without clearing ink', async () => {
      const cards = cardsInScope([...CARDS], HIRAGANA_BASE_SCOPE);
      const inkSurface = fakeInkSurface();
      const attemptRepository = fakeAttemptRepository();
      const tallyRepository = fakeTallyRepository();
      renderDrill({ inkSurface, attemptRepository, tallyRepository });
      const target = currentCard(cards);

      await inkSurface.landStroke();
      await fireEvent.click(grade('Missed'));
      await tick();
      await fireEvent.click(undo());
      await flushAsync();

      expect(attemptRepository.deletes.length).toBeGreaterThan(0);
      expect(tallyRepository.decrements).toEqual([target.cardId]);
      // No advance happened -- same prompt, same position, toast gone.
      expect(currentCard(cards)).toBe(target);
      expect(screen.getByText('1 / 71')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Next character' })).toBeNull();
      // Grading re-enabled and the ink from before the grade is untouched --
      // clearing is deferred to "Next character", never to Undo.
      expect(grade('Correct').disabled).toBe(false);
      expect(inkSurface.clears).toBe(0);
    });

    it('Undo after Correct deletes the last attempt but never calls decrement', async () => {
      const inkSurface = fakeInkSurface();
      const attemptRepository = fakeAttemptRepository();
      const tallyRepository = fakeTallyRepository();
      renderDrill({ inkSurface, attemptRepository, tallyRepository });

      await inkSurface.landStroke();
      await fireEvent.click(grade('Correct'));
      await tick();
      await fireEvent.click(undo());
      await flushAsync();

      expect(attemptRepository.deletes.length).toBeGreaterThan(0);
      expect(tallyRepository.decrements).toEqual([]);
    });

    it('restores the tally-display count so re-grading Missed on the same card shows 1 again, not 2', async () => {
      const inkSurface = fakeInkSurface();
      renderDrill({ inkSurface });

      await inkSurface.landStroke();
      await fireEvent.click(grade('Missed'));
      expect(screen.getByText(/missed 1/i)).toBeTruthy();

      await fireEvent.click(undo());
      await flushAsync();
      await inkSurface.landStroke();
      await fireEvent.click(grade('Missed'));

      expect(screen.getByText(/missed 1/i)).toBeTruthy();
    });

    it('awaits the pending add()/increment() writes before calling deleteLast/decrement, even when Undo is tapped immediately', async () => {
      const inkSurface = fakeInkSurface();
      let resolveAdd!: (value: Result<void>) => void;
      const attemptRepository = fakeAttemptRepository();
      attemptRepository.add = () =>
        new Promise((resolve) => {
          resolveAdd = resolve;
        });
      const tallyRepository = fakeTallyRepository();
      renderDrill({ inkSurface, attemptRepository, tallyRepository });

      await inkSurface.landStroke();
      await fireEvent.click(grade('Missed'));
      // Undo tapped before the pending add() resolves.
      await fireEvent.click(undo());

      expect(attemptRepository.deletes).toEqual([]);

      resolveAdd({ ok: true, value: undefined });
      await flushAsync();

      // Only once add() resolves does the undo actually run deleteLast.
      expect(attemptRepository.deletes.length).toBeGreaterThan(0);
    });

    it('clears the toast and advances normally when deleteLast fails, logging via console.error', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const inkSurface = fakeInkSurface();
      const attemptRepository = fakeAttemptRepository(
        { ok: true, value: undefined },
        { ok: false, error: new Error('delete failed') },
      );
      renderDrill({ inkSurface, attemptRepository });

      await inkSurface.landStroke();
      await fireEvent.click(grade('Missed'));
      await tick();
      await fireEvent.click(undo());
      await flushAsync();

      expect(consoleError).toHaveBeenCalledWith('Failed to undo grade:', expect.any(Error));
      // Still returns to the written (pre-advance) state -- never blocks.
      expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
      expect(grade('Correct').disabled).toBe(false);

      consoleError.mockRestore();
    });

    it('shows a cumulative tally that includes prior lifetime misses, not just this grade', async () => {
      // A card can no longer repeat within one session now that sampling is
      // without replacement, so this exercises the same
      // cumulative-tally arithmetic via a card whose lifetime `tallies`
      // prop already carries a prior miss, rather than re-grading the same
      // queue slot twice.
      const cards = cardsInScope([...CARDS], HIRAGANA_BASE_SCOPE);
      const tallies: Tally[] = cards.map((c) => ({ cardId: c.cardId, missCount: 1 }));
      const inkSurface = fakeInkSurface();
      renderDrill({ inkSurface, tallies, sessionSize: 1 });

      await inkSurface.landStroke();
      await fireEvent.click(grade('Missed'));

      expect(screen.getByText(/missed 2/i)).toBeTruthy();
    });

    it('guards against a double-tap on Undo running the reversal twice', async () => {
      const inkSurface = fakeInkSurface();
      const attemptRepository = fakeAttemptRepository();
      const tallyRepository = fakeTallyRepository();
      renderDrill({ inkSurface, attemptRepository, tallyRepository });

      await inkSurface.landStroke();
      await fireEvent.click(grade('Missed'));
      await tick();

      const undoBtn = undo();
      // Both dispatched before either's internal `await`s settle -- the
      // second call must see `undoing` already `true` and bail, regardless
      // of whether the DOM's `disabled` attribute has re-rendered yet.
      const firstClick = fireEvent.click(undoBtn);
      const secondClick = fireEvent.click(undoBtn);
      await firstClick;
      await secondClick;
      await flushAsync();

      expect(attemptRepository.deletes.length).toBe(1);
      expect(tallyRepository.decrements.length).toBe(1);
    });

    it('does not call deleteLast when add() failed, so it never deletes an unrelated persisted attempt', async () => {
      const inkSurface = fakeInkSurface();
      const attemptRepository = fakeAttemptRepository({ ok: false, error: new Error('add failed') });
      renderDrill({ inkSurface, attemptRepository });

      await inkSurface.landStroke();
      await fireEvent.click(grade('Correct'));
      await tick();
      await fireEvent.click(undo());
      await flushAsync();

      expect(attemptRepository.deletes).toEqual([]);
    });

    it('does not call decrement when increment() failed, only deleteLast', async () => {
      const inkSurface = fakeInkSurface();
      const attemptRepository = fakeAttemptRepository();
      const tallyRepository = fakeTallyRepository({ ok: false, error: new Error('increment failed') });
      renderDrill({ inkSurface, attemptRepository, tallyRepository });

      await inkSurface.landStroke();
      await fireEvent.click(grade('Missed'));
      await tick();
      await fireEvent.click(undo());
      await flushAsync();

      expect(attemptRepository.deletes.length).toBeGreaterThan(0);
      expect(tallyRepository.decrements).toEqual([]);
    });
  });

  // A session closes explicitly ("I'm done"), on complete
  // closure (via the existing "Next character" tap), or retroactively on
  // detected inactivity -- every closure persists a `Session` record and
  // hands the composition root a `SessionSummaryView`.
  describe('session closure', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    function priorLifetimeAttempts(cards: Card[]): Attempt[] {
      // A different session's full coverage of every in-scope card --
      // `attempts` seeds `sessionAttempts` (the lifetime history for
      // weak-spot selection), never `thisSessionAttempts` (this drill
      // entry's own attempts).
      return cards.map((c, i) => ({
        id: `prior-${i}`,
        sessionId: 'prior-session',
        cardId: c.cardId,
        timestamp: new Date(Date.now() - 86_400_000).toISOString(),
        timeToFirstStrokeMs: 100,
        totalTimeMs: 200,
        strokeCount: 1,
        revealUsed: false,
        selfGrade: 'correct',
        strokes: [],
      }));
    }

    it('closes with a zero-attempt summary when "I\'m done" is tapped before any grade', async () => {
      const onClose = vi.fn();
      const sessionRepository = fakeSessionRepository();
      renderDrill({ onClose, sessionRepository });

      await fireEvent.click(screen.getByRole('button', { name: "I'm done" }));

      expect(onClose).toHaveBeenCalledTimes(1);
      const summary = onClose.mock.calls[0]?.[0] as SessionSummaryView;
      expect(summary.closureReason).toBe('explicit');
      expect(summary.accuracy).toBe(0);
      expect(summary.missed).toEqual([]);
      expect(sessionRepository.adds).toHaveLength(1);
      expect(sessionRepository.adds[0]?.cardsAttempted).toBe(0);
      expect(sessionRepository.adds[0]?.accuracy).toBe(0);
    });

    it('persists a structured-cloneable session record when scope arrives as reactive state', async () => {
      // Mounted through DrillScopeHarness so `scope` is a live `$state`
      // proxy -- what App.svelte actually passes -- not a plain fixture.
      // Handing that proxy to IndexedDB verbatim throws a DataCloneError,
      // so the session silently never persists (only a console.error
      // remains) and History stays empty. The record must therefore survive
      // a clone round-trip here, which is the exact contract IDB requires.
      const sessionRepository = fakeSessionRepository();
      render(DrillScopeHarness, {
        sessionSize: 71, // full 71-card hiragana-base scope, matching the harness's fixed scope
        attempts: [],
        tallies: [],
        inkSurface: fakeInkSurface(),
        attemptRepository: fakeAttemptRepository(),
        tallyRepository: fakeTallyRepository(),
        sessionRepository,
        idleTimeoutMs: 300_000,
        onClose: vi.fn(),
      });

      await fireEvent.click(screen.getByRole('button', { name: "I'm done" }));

      expect(sessionRepository.adds).toHaveLength(1);
      const record = sessionRepository.adds[0]!;
      expect(() => structuredClone(record)).not.toThrow();
      expect(structuredClone(record).scope).toEqual(HIRAGANA_BASE_SCOPE);
    });

    it('closes with "explicit" even while the post-grade toast (Undo/"Next character") is showing', async () => {
      const inkSurface = fakeInkSurface();
      const onClose = vi.fn();
      const sessionRepository = fakeSessionRepository();
      renderDrill({ inkSurface, onClose, sessionRepository });

      // Grade a card first -- the toast is now showing and the deferred
      // advance hasn't run yet.
      await inkSurface.landStroke();
      await fireEvent.click(grade('Correct'));
      await tick();

      await fireEvent.click(screen.getByRole('button', { name: "I'm done" }));

      // "I'm done" is never gated by the toast state -- it closes with
      // whatever was already graded, not with the deferred advance applied.
      expect(onClose).toHaveBeenCalledTimes(1);
      const summary = onClose.mock.calls[0]?.[0] as SessionSummaryView;
      expect(summary.closureReason).toBe('explicit');
      expect(summary.accuracy).toBe(1);
      expect(sessionRepository.adds[0]?.cardsAttempted).toBe(1);
    });

    it('closes with "complete" (no explicit control) once every in-scope card has been graded', async () => {
      // With `sessionSize` at its default (the full scope), the sampled
      // queue structurally holds every in-scope card exactly once,
      // regardless of weighting or RNG -- so grading `cards.length`
      // cards in a row must exhaust it deterministically, with no need to
      // pin `Math.random` to walk a specific draw order.
      const cards = cardsInScope([...CARDS], HIRAGANA_YOON_SCOPE); // 33 cards
      const inkSurface = fakeInkSurface();
      const onClose = vi.fn();
      const sessionRepository = fakeSessionRepository();
      renderDrill({ scope: HIRAGANA_YOON_SCOPE, inkSurface, onClose, sessionRepository });

      let lastCard: Card | undefined;
      for (let i = 0; i < cards.length; i++) {
        lastCard = currentCard(cards);
        await inkSurface.landStroke();
        await fireEvent.click(grade('Correct'));
        await fireEvent.click(nextCharacter());
      }

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ closureReason: 'complete' }));
      expect(sessionRepository.adds).toHaveLength(1);
      expect(sessionRepository.adds[0]?.closureReason).toBe('complete');
      expect(sessionRepository.adds[0]?.cardsAttempted).toBe(cards.length);
      // No next prompt was drawn on the closing tap -- the same card that
      // was just graded is still what's on screen.
      expect(currentCard(cards)).toBe(lastCard);
    });

    it('closes with "complete" after exactly the resolved session size, smaller than the full scope', async () => {
      // Session size can be smaller than the scope -- the queue, counter, and closure
      // must all track `sessionSize` (`queue.length`), never the larger
      // `cardsInScope(...).length`.
      const cards = cardsInScope([...CARDS], HIRAGANA_YOON_SCOPE); // 33 cards
      const sessionSize = 10;
      const inkSurface = fakeInkSurface();
      const onClose = vi.fn();
      const sessionRepository = fakeSessionRepository();
      renderDrill({ scope: HIRAGANA_YOON_SCOPE, sessionSize, inkSurface, onClose, sessionRepository });

      const seen = new Set<string>();
      for (let i = 0; i < sessionSize; i++) {
        const shown = currentCard(cards);
        expect(seen.has(shown.cardId)).toBe(false);
        seen.add(shown.cardId);
        expect(screen.getByText(`${i + 1} / ${sessionSize}`)).toBeTruthy();
        await inkSurface.landStroke();
        await fireEvent.click(grade('Correct'));
        await fireEvent.click(nextCharacter());
      }

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ closureReason: 'complete' }));
      expect(sessionRepository.adds[0]?.cardsAttempted).toBe(sessionSize);
    });

    it('keeps the drill open when Undo reverses the scope-completing grade (no onClose)', async () => {
      const cards = cardsInScope([...CARDS], HIRAGANA_YOON_SCOPE); // 33 cards
      const inkSurface = fakeInkSurface();
      const onClose = vi.fn();
      renderDrill({ scope: HIRAGANA_YOON_SCOPE, inkSurface, onClose });

      // Grade the first 32 distinct cards normally.
      for (let i = 0; i < cards.length - 1; i++) {
        await inkSurface.landStroke();
        await fireEvent.click(grade('Correct'));
        await fireEvent.click(nextCharacter());
      }

      // The 33rd (and last) grade completes the queue, but the deferred
      // advance still shows the normal toast/Undo -- closure only
      // fires on "Next character", not on the grade itself.
      await inkSurface.landStroke();
      await fireEvent.click(grade('Correct'));
      expect(onClose).not.toHaveBeenCalled();

      await fireEvent.click(undo());
      await flushAsync();

      expect(onClose).not.toHaveBeenCalled();
    });

    it('closes as "inactivity" on resume once idle time has elapsed, backdating date/time to the last interaction, not "now"', async () => {
      vi.useFakeTimers();
      const start = new Date('2026-01-01T00:00:00.000Z').getTime();
      vi.setSystemTime(start);
      const onClose = vi.fn();
      const sessionRepository = fakeSessionRepository();
      renderDrill({ idleTimeoutMs: 300_000, onClose, sessionRepository });

      // An interaction partway through -- `lastInteractionAt` moves to here.
      const interactionAt = start + 60_000;
      vi.setSystemTime(interactionAt);
      await fireEvent.click(screen.getByRole('button', { name: 'Reveal' }));

      // Resume well past the idle threshold measured from that interaction.
      const resumeAt = interactionAt + 300_000 + 120_000;
      vi.setSystemTime(resumeAt);
      document.dispatchEvent(new Event('visibilitychange'));
      await tick();

      expect(onClose).toHaveBeenCalledTimes(1);
      const summary = onClose.mock.calls[0]?.[0] as SessionSummaryView;
      expect(summary.closureReason).toBe('inactivity');
      expect(sessionRepository.adds).toHaveLength(1);
      expect(sessionRepository.adds[0]?.date).toBe(new Date(interactionAt).toISOString());
      expect(sessionRepository.adds[0]?.date).not.toBe(new Date(resumeAt).toISOString());
    });

    it('also closes as "inactivity" on a window focus event, same as visibilitychange', async () => {
      vi.useFakeTimers();
      const start = new Date('2026-01-01T00:00:00.000Z').getTime();
      vi.setSystemTime(start);
      const onClose = vi.fn();
      renderDrill({ idleTimeoutMs: 300_000, onClose });

      vi.setSystemTime(start + 300_000);
      window.dispatchEvent(new Event('focus'));
      await tick();

      expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ closureReason: 'inactivity' }));
    });

    it('removes the visibilitychange/focus listeners on unmount, so a torn-down instance never fires onClose', async () => {
      vi.useFakeTimers();
      const start = new Date('2026-01-01T00:00:00.000Z').getTime();
      vi.setSystemTime(start);
      const onClose = vi.fn();
      const { unmount } = renderDrill({ idleTimeoutMs: 300_000, onClose });

      unmount();

      vi.setSystemTime(start + 300_000);
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
      await tick();

      expect(onClose).not.toHaveBeenCalled();
    });

    it('closes as "inactivity" with a zero-attempt summary when idled past the threshold with no interaction at all', async () => {
      vi.useFakeTimers();
      const start = new Date('2026-01-01T00:00:00.000Z').getTime();
      vi.setSystemTime(start);
      const onClose = vi.fn();
      const sessionRepository = fakeSessionRepository();
      renderDrill({ idleTimeoutMs: 300_000, onClose, sessionRepository });

      // No grade, stroke, or reveal ever happens -- idle from the moment of
      // mount.
      vi.setSystemTime(start + 300_000);
      document.dispatchEvent(new Event('visibilitychange'));
      await tick();

      expect(onClose).toHaveBeenCalledTimes(1);
      const summary = onClose.mock.calls[0]?.[0] as SessionSummaryView;
      expect(summary.closureReason).toBe('inactivity');
      expect(summary.accuracy).toBe(0);
      expect(summary.missed).toEqual([]);
      expect(sessionRepository.adds).toHaveLength(1);
      expect(sessionRepository.adds[0]?.cardsAttempted).toBe(0);
      expect(sessionRepository.adds[0]?.accuracy).toBe(0);
    });

    it('closes as "inactivity" on a stray interaction past the idle threshold, dropping that interaction rather than recording it', async () => {
      vi.useFakeTimers();
      const start = new Date('2026-01-01T00:00:00.000Z').getTime();
      vi.setSystemTime(start);
      const inkSurface = fakeInkSurface();
      const onClose = vi.fn();
      const attemptRepository = fakeAttemptRepository();
      renderDrill({ idleTimeoutMs: 300_000, inkSurface, onClose, attemptRepository });

      vi.setSystemTime(start + 300_000);
      await inkSurface.landStroke();

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ closureReason: 'inactivity' }));
      // The triggering stroke never lands as ink and is never graded/persisted.
      expect(attemptRepository.adds).toEqual([]);
    });

    it('never reclassifies "I\'m done" as inactivity, regardless of elapsed idle time', async () => {
      vi.useFakeTimers();
      const start = new Date('2026-01-01T00:00:00.000Z').getTime();
      vi.setSystemTime(start);
      const onClose = vi.fn();
      renderDrill({ idleTimeoutMs: 300_000, onClose });

      vi.setSystemTime(start + 10 * 300_000);
      await fireEvent.click(screen.getByRole('button', { name: "I'm done" }));

      expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ closureReason: 'explicit' }));
    });

    it('never blocks reaching the Summary when sessionRepository.add() fails, logging via console.error', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const onClose = vi.fn();
      const sessionRepository = fakeSessionRepository({ ok: false, error: new Error('write failed') });
      renderDrill({ onClose, sessionRepository });

      await fireEvent.click(screen.getByRole('button', { name: "I'm done" }));
      await flushAsync();

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(consoleError).toHaveBeenCalledWith('Failed to persist session:', expect.any(Error));

      consoleError.mockRestore();
    });

    it('carries revealCount and wall-clock timeMs into the closed summary', async () => {
      vi.useFakeTimers();
      const start = new Date('2026-01-01T00:00:00.000Z').getTime();
      vi.setSystemTime(start);
      const onClose = vi.fn();
      renderDrill({ onClose });

      // Reveal (no stroke needed -- revealing nothing is itself an honest
      // "I don't know") then grade: this attempt carries `revealUsed`.
      await fireEvent.click(screen.getByRole('button', { name: 'Reveal' }));
      await fireEvent.click(grade('Missed'));

      vi.setSystemTime(start + 90_000);
      await fireEvent.click(screen.getByRole('button', { name: "I'm done" }));

      expect(onClose).toHaveBeenCalledTimes(1);
      const summary = onClose.mock.calls[0]?.[0] as SessionSummaryView;
      expect(summary.revealCount).toBe(1);
      expect(summary.timeMs).toBe(90_000);
    });

    // Closure-during-Undo guards (review): a resume event, an explicit
    // close, or a stray interaction landing while `handleUndo`'s pending
    // writes are still in flight must neither bump the idle clock nor
    // close/persist ahead of that Undo's reversal.
    function renderDrillWithGatedAttemptWrite(idleTimeoutMs = 300_000): {
      inkSurface: ReturnType<typeof fakeInkSurface>;
      onClose: ReturnType<typeof vi.fn>;
      sessionRepository: ReturnType<typeof fakeSessionRepository>;
      releaseAttemptWrite: (result: Result<void>) => void;
    } {
      let releaseAttemptWrite!: (result: Result<void>) => void;
      const gated = new Promise<Result<void>>((resolve) => {
        releaseAttemptWrite = resolve;
      });
      const attemptRepository = fakeAttemptRepository();
      const recorded: Attempt[] = attemptRepository.adds;
      attemptRepository.add = vi.fn((attempt: Attempt) => {
        recorded.push(attempt);
        return gated;
      });
      const inkSurface = fakeInkSurface();
      const onClose = vi.fn();
      const sessionRepository = fakeSessionRepository();
      renderDrill({ idleTimeoutMs, inkSurface, attemptRepository, onClose, sessionRepository });
      return { inkSurface, onClose, sessionRepository, releaseAttemptWrite };
    }

    it('does not close on resume while an Undo is still reversing', async () => {
      vi.useFakeTimers();
      const start = new Date('2026-01-01T00:00:00.000Z').getTime();
      vi.setSystemTime(start);
      const { inkSurface, onClose, sessionRepository, releaseAttemptWrite } =
        renderDrillWithGatedAttemptWrite();

      await inkSurface.landStroke();
      await fireEvent.click(grade('Correct'));
      await fireEvent.click(undo());
      await tick();

      vi.setSystemTime(start + 600_000);
      document.dispatchEvent(new Event('visibilitychange'));
      await tick();

      expect(onClose).not.toHaveBeenCalled();
      expect(sessionRepository.adds).toEqual([]);

      vi.useRealTimers();
      releaseAttemptWrite({ ok: true, value: undefined });
      await flushAsync();

      // The Undo reversed normally and the drill stayed open -- no close.
      expect(onClose).not.toHaveBeenCalled();
      expect(sessionRepository.adds).toEqual([]);
    });

    it('does not close via "I\'m done" while an Undo is still reversing', async () => {
      const inkSurface = fakeInkSurface();
      let releaseAttemptWrite!: (result: Result<void>) => void;
      const gated = new Promise<Result<void>>((resolve) => {
        releaseAttemptWrite = resolve;
      });
      const attemptRepository = fakeAttemptRepository();
      const recorded: Attempt[] = attemptRepository.adds;
      attemptRepository.add = vi.fn((attempt: Attempt) => {
        recorded.push(attempt);
        return gated;
      });
      const onClose = vi.fn();
      const sessionRepository = fakeSessionRepository();
      renderDrill({ inkSurface, attemptRepository, onClose, sessionRepository });

      await inkSurface.landStroke();
      await fireEvent.click(grade('Correct'));
      await fireEvent.click(undo());
      await tick();

      // "I'm done" has no `disabled={undoing}` (unlike Next), so this tap is
      // UI-reachable -- it must be dropped, not closed ahead of the reversal.
      await fireEvent.click(screen.getByRole('button', { name: "I'm done" }));

      expect(onClose).not.toHaveBeenCalled();
      expect(sessionRepository.adds).toEqual([]);

      releaseAttemptWrite({ ok: true, value: undefined });
      await flushAsync();

      expect(onClose).not.toHaveBeenCalled();
      expect(sessionRepository.adds).toEqual([]);
    });

    it('drops a stray idle-eligible stroke arriving mid-Undo instead of closing as inactivity', async () => {
      vi.useFakeTimers();
      const start = new Date('2026-01-01T00:00:00.000Z').getTime();
      vi.setSystemTime(start);
      const { inkSurface, onClose, sessionRepository, releaseAttemptWrite } =
        renderDrillWithGatedAttemptWrite();

      await inkSurface.landStroke();
      await fireEvent.click(grade('Correct'));
      await fireEvent.click(undo());
      await tick();

      // Past the idle threshold, but an Undo is in flight: `recordInteraction`
      // guards `undoing`, so this neither closes nor bumps the idle clock.
      vi.setSystemTime(start + 600_000);
      await inkSurface.landStroke();

      expect(onClose).not.toHaveBeenCalled();
      expect(sessionRepository.adds).toEqual([]);

      vi.useRealTimers();
      releaseAttemptWrite({ ok: true, value: undefined });
      await flushAsync();

      expect(onClose).not.toHaveBeenCalled();
      expect(sessionRepository.adds).toEqual([]);
    });

    // `attempts` is the learner's entire *lifetime* history -- it only ever
    // feeds the once-at-mount sampling weights, never this drill entry's own
    // session. Only
    // `thisSessionAttempts` (starts empty, populated by this entry's own
    // grades) may ever feed `buildSummary`/`buildSessionRecord`; closure
    // itself (queue exhaustion) reads neither -- it's a pointer/length
    // comparison against `queue`, so it structurally can't be swayed by
    // lifetime attempt data at all.
    it('does not auto-close after a single grade when the seeded lifetime attempts already cover the full scope', async () => {
      const cards = cardsInScope([...CARDS], HIRAGANA_BASE_SCOPE); // 71 cards
      const inkSurface = fakeInkSurface();
      const onClose = vi.fn();
      renderDrill({
        scope: HIRAGANA_BASE_SCOPE,
        attempts: priorLifetimeAttempts(cards),
        inkSurface,
        onClose,
      });

      await inkSurface.landStroke();
      await fireEvent.click(grade('Correct'));
      await fireEvent.click(nextCharacter());

      // A returning learner who has already covered this scope before must
      // not have their session auto-closed after a single grade -- the
      // drill advances to a new prompt instead.
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByText('2 / 71')).toBeTruthy();
      expect(() => currentCard(cards)).not.toThrow();
    });

    it('reports only this session\'s attempts in the summary and persisted record, never the seeded lifetime total', async () => {
      const cards = cardsInScope([...CARDS], HIRAGANA_BASE_SCOPE); // 71 cards
      const inkSurface = fakeInkSurface();
      const onClose = vi.fn();
      const sessionRepository = fakeSessionRepository();
      renderDrill({
        scope: HIRAGANA_BASE_SCOPE,
        attempts: priorLifetimeAttempts(cards),
        inkSurface,
        onClose,
        sessionRepository,
      });

      await inkSurface.landStroke();
      await fireEvent.click(grade('Correct'));
      await fireEvent.click(nextCharacter());
      await inkSurface.landStroke();
      await fireEvent.click(grade('Missed'));
      await fireEvent.click(screen.getByRole('button', { name: "I'm done" }));

      expect(onClose).toHaveBeenCalledTimes(1);
      const summary = onClose.mock.calls[0]?.[0] as SessionSummaryView;
      expect(summary.accuracy).toBe(0.5);
      expect(sessionRepository.adds).toHaveLength(1);
      expect(sessionRepository.adds[0]?.cardsAttempted).toBe(2);
      expect(sessionRepository.adds[0]?.accuracy).toBe(0.5);
    });
  });
});
