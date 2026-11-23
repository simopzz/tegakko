import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import 'fake-indexeddb/auto';
import App from './App.svelte';
import { IdbSettingsRepository } from '../adapters/persistence/settings-repository';
import { IdbAttemptRepository } from '../adapters/persistence/attempt-repository';
import { IdbSessionRepository } from '../adapters/persistence/session-repository';
import { IdbTallyRepository } from '../adapters/persistence/tally-repository';
import { resetDb } from '../adapters/persistence/test-reset-db';
import { CARDS } from '../domain/cards';
import { buildExportEnvelope } from '../domain/export';
import { DEFAULT_SETTINGS } from '../domain/settings';
import type { Session } from '../domain/session';
import { formatDate } from '../adapters/ui/format-date';
import { fakeInkSurface } from '../test-utils/fake-ink-surface';

// The primary seam (CODING_STANDARDS.md: drive the app the way the learner
// does): the real composition root on the real IndexedDB adapters, a fake
// ink surface where strokes are needed. Since the screens stopped receiving
// repositories, this is also where their data behaviour lives -- the
// picker's counts, History's list, Settings changes and export/import.

function seededSession(overrides: Partial<Session> = {}): Session {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    date: overrides.date ?? '2026-09-01T00:00:00.000Z',
    scope: overrides.scope ?? { hiragana: ['base'] },
    cardsAttempted: overrides.cardsAttempted ?? 10,
    accuracy: overrides.accuracy ?? 0.5,
    closureReason: overrides.closureReason ?? 'explicit',
  };
}

function historyRows(): HTMLElement[] {
  return [...document.querySelectorAll('.row')] as HTMLElement[];
}

function chartBars(): HTMLElement[] {
  return [...document.querySelectorAll('.bar')] as HTMLElement[];
}

function findSummaryHeading(): Promise<HTMLElement> {
  return within(screen.getByRole('main')).findByRole('heading', { name: 'Session summary' });
}

describe('App integration', () => {
  // The rebuilt Scope picker: scripts are a multi-select, each selected
  // script gets its own Set row, and session sizes are fixed counts.
  function setPill(script: string, set: string): HTMLElement {
    const label = script === 'Kanji' ? `JLPT ${set}` : set === 'Base' ? 'Single kana' : 'Combined sounds';
    return within(screen.getByRole('group', { name: `${script} groups` })).getByRole('button', {
      name: new RegExp(`^${label}`),
    });
  }

  beforeEach(async () => {
    await resetDb();
    const settings = new IdbSettingsRepository();
    await settings.save({ ...DEFAULT_SETTINGS, penCheckShown: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('chooses a scope, starts, emits a stroke, grades, ends, and shows the session in History', async () => {
    let surface = fakeInkSurface();
    render(App, {
      inkSurfaceFactory: () => {
        surface = fakeInkSurface();
        return surface;
      },
    });

    // Scope picker is shown because settings were seeded with penCheckShown.
    await screen.findByText('What would you like to write?');

    // Narrow to a small, deterministic scope so grading one card and ending
    // is enough to exercise the whole pipeline.
    await fireEvent.click(screen.getByRole('button', { name: 'Katakana' }));
    await fireEvent.click(setPill('Hiragana', 'Base'));
    await fireEvent.click(screen.getByRole('button', { name: 'Start writing' }));

    // Drill entry: one card from the 33-card hiragana-yoon scope.
    expect(await screen.findByText(/1 \/ 33/)).toBeTruthy();

    // Emit a stroke so grading is enabled, then mark missed.
    await surface.landStroke();
    await fireEvent.click(screen.getByRole('button', { name: 'Missed' }));
    await tick();

    // End the session explicitly.
    await fireEvent.click(screen.getByRole('button', { name: "I'm done" }));

    // Session summary appears; wait for the fire-and-forget session write
    // to land before opening History.
    expect(await findSummaryHeading()).toBeTruthy();
    expect(screen.getByText('0%')).toBeTruthy();
    // The session's own card count and its scope, so "0%" means something.
    expect(screen.getByText('Cards')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('Hiragana Yoon')).toBeTruthy();
    const sessionRepository = new IdbSessionRepository();
    await vi.waitFor(async () => {
      const sessions = await sessionRepository.list();
      expect(sessions.ok && sessions.value.length).toBe(1);
    });

    // Navigate to History and verify the closed session is listed.
    await fireEvent.click(screen.getByRole('button', { name: 'History' }));
    expect(await screen.findByText('History')).toBeTruthy();
    expect(await screen.findByText('0%')).toBeTruthy();
    expect(screen.queryByText('No sessions yet')).toBeNull();
  });

  // The drill grade flow: one tap per card -- a grade advances
  // straight to the next prompt, and the Undo toast lives over that prompt
  // until its first stroke. Shared preamble: a 10-card hiragana-yoon drill,
  // started and waiting at "1 / 10".
  async function startTenCardDrill(): Promise<ReturnType<typeof fakeInkSurface>> {
    let surface = fakeInkSurface();
    render(App, {
      inkSurfaceFactory: () => {
        surface = fakeInkSurface();
        return surface;
      },
    });
    await screen.findByText('What would you like to write?');
    await fireEvent.click(screen.getByRole('button', { name: 'Katakana' }));
    await fireEvent.click(setPill('Hiragana', 'Base'));
    await fireEvent.click(screen.getByRole('radio', { name: '10' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Start writing' }));
    expect(await screen.findByText(/1 \/ 10/)).toBeTruthy();
    return surface;
  }

  it('grades straight to the next prompt, and Undo reverts the card before its first stroke', async () => {
    const surface = await startTenCardDrill();

    // One tap per card: the grade itself advances; "Next character" is gone.
    await surface.landStroke();
    await fireEvent.click(screen.getByRole('button', { name: 'Missed' }));
    await tick();

    expect(screen.getByText(/2 \/ 10/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Next character' })).toBeNull();
    // The toast rides the new prompt rather than freezing the graded card.
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
    // The toast's copy is the whole status announcement; Undo is an
    // ordinary control, never read out as part of it.
    const announcement = screen.getByRole('status');
    expect(announcement.textContent).toContain('Marked missed');
    expect(announcement.querySelector('button')).toBeNull();

    // Undo before the new prompt's first stroke reverts the attempt and its
    // miss count, and brings the graded card back with its ink intact.
    await fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByText(/1 \/ 10/)).toBeTruthy();
    // Ink intact: grading is live again without writing anything new.
    expect(screen.getByRole('button', { name: 'Missed' }).hasAttribute('disabled')).toBe(false);

    const attemptRepository = new IdbAttemptRepository();
    const tallyRepository = new IdbTallyRepository();
    await vi.waitFor(async () => {
      const attempts = await attemptRepository.listAll();
      expect(attempts.ok && attempts.value).toHaveLength(0);
      const tallies = await tallyRepository.getAll();
      expect(tallies.ok && tallies.value.every((t) => t.missCount === 0)).toBe(true);
    });
  });

  it('ends the Undo window at the new prompt\'s first stroke', async () => {
    const surface = await startTenCardDrill();

    await surface.landStroke();
    await fireEvent.click(screen.getByRole('button', { name: 'Correct' }));
    await tick();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();

    // Writing on the new prompt commits the previous grade: the toast is
    // gone and stays gone.
    await surface.landStroke();
    await tick();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();

    // Clearing the just-written ink does not bring the window back either.
    await fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('grades the last card to a frozen prompt with Undo, and Finish closes the session as complete', async () => {
    const surface = await startTenCardDrill();

    // Grades 1 through 9 advance straight through the queue; the 10th card
    // is now the prompt (the grade itself moved the counter).
    for (let i = 0; i < 9; i++) {
      await surface.landStroke();
      await fireEvent.click(screen.getByRole('button', { name: 'Correct' }));
      await tick();
    }
    expect(screen.getByText(/10 \/ 10/)).toBeTruthy();

    // The queue-completing grade freezes the last card under its toast
    // instead of closing on its own: Undo stays fair, Finish completes.
    await surface.landStroke();
    await fireEvent.click(screen.getByRole('button', { name: 'Correct' }));
    await tick();
    expect(screen.getByText(/10 \/ 10/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Finish' })).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: 'Finish' }));

    expect(await findSummaryHeading()).toBeTruthy();
    const sessionRepository = new IdbSessionRepository();
    await vi.waitFor(async () => {
      const sessions = await sessionRepository.list();
      expect(sessions.ok && sessions.value[0]?.closureReason).toBe('complete');
    });
  });

  it('writes a yoon across two genkouyoushi cells and reveals the reference cell by cell', async () => {
    const surface = await startTenCardDrill();

    // One writing cell per character: every card in this scope is a yoon,
    // so the row the adapter draws (ADR-0002: its canvas, observed through
    // the port) carries two cells.
    expect(surface.cellCounts).toEqual([2]);

    await fireEvent.click(screen.getByRole('button', { name: 'Reveal' }));

    // The reference is one cell per character beside the ink, never
    // overlaid -- and the small kana renders small in its own cell.
    const cells = document.querySelectorAll('.reference-cell');
    expect(cells).toHaveLength(2);
    expect(cells[0]?.querySelector('.glyph')?.className).not.toContain('glyph--small');
    expect(cells[1]?.querySelector('.glyph')?.className).toContain('glyph--small');
  });

  it('announces the available and recently missed counts from stored miss tallies', async () => {
    // One heavily-missed hiragana card: above the average on the full
    // scope, gone entirely once the scope narrows past it.
    const tallyRepository = new IdbTallyRepository();
    const heavy = CARDS.find((c) => c.script === 'hiragana' && c.set === 'base')!;
    for (let i = 0; i < 10; i++) {
      await tallyRepository.increment(heavy.cardId);
    }

    render(App);

    await screen.findByText('What would you like to write?');
    const summary = await screen.findByText('208 available · 1 with recent misses');
    // The line is the announcement: every count change reaches a screen
    // reader too.
    expect(summary.parentElement?.getAttribute('aria-live')).toBe('polite');

    await fireEvent.click(screen.getByRole('button', { name: 'Hiragana' }));
    // The only miss record dropped out of scope -- nothing is above the
    // average any more.
    expect(await screen.findByText('104 available · 0 with recent misses')).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: 'Hiragana' }));
    expect(await screen.findByText('208 available · 1 with recent misses')).toBeTruthy();
  });

  it('moves the session-size selection with arrow keys, committing like a tap', async () => {
    render(App);

    await screen.findByText('What would you like to write?');

    // Arrows select and commit, like a native radio group: Left wraps
    // from All back around to 50, focus following the selection.
    const all = screen.getByRole('radio', { name: 'All available' });
    all.focus();
    await fireEvent.keyDown(all, { key: 'ArrowLeft' });
    const fifty = screen.getByRole('radio', { name: '50' });
    expect(fifty.getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(fifty);

    await fireEvent.keyDown(fifty, { key: 'ArrowLeft' });
    expect(screen.getByRole('radio', { name: '20' }).getAttribute('aria-checked')).toBe('true');

    // Home jumps to the first option; ArrowDown walks forward from there.
    await fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Home' });
    expect(screen.getByRole('radio', { name: '10' }).getAttribute('aria-checked')).toBe('true');
    await fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowDown' });
    expect(screen.getByRole('radio', { name: '20' }).getAttribute('aria-checked')).toBe('true');

    // The arrow-moved selection is a real commit: the started session is
    // sized 20.
    await fireEvent.click(screen.getByRole('button', { name: 'Start writing' }));
    expect(await screen.findByText(/1 \/ 20/)).toBeTruthy();
  });

  it('practises an N5 kanji end to end: pick, prompt, reveal, grade, Summary and History', async () => {
    let surface = fakeInkSurface();
    render(App, {
      inkSurfaceFactory: () => {
        surface = fakeInkSurface();
        return surface;
      },
    });
    await screen.findByText('What would you like to write?');

    // Kanji is a picker opt-in: turn it on (selecting all five levels) and
    // both kana scripts off, then narrow the Set row to N5 so the session
    // draws only from the 79-card N5 catalog.
    await fireEvent.click(screen.getByRole('button', { name: /^Kanji/ }));
    await fireEvent.click(screen.getByRole('button', { name: 'Hiragana' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Katakana' }));
    for (const set of ['N4', 'N3', 'N2', 'N1']) {
      await fireEvent.click(setPill('Kanji', set));
    }
    expect(await screen.findByText('79 available · 0 with recent misses')).toBeTruthy();
    await fireEvent.click(screen.getByRole('radio', { name: '10' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Start writing' }));

    // Drill on a kanji card: the prompt is meanings and readings, and one
    // genkouyoushi cell.
    expect(await screen.findByText(/1 \/ 10/)).toBeTruthy();
    expect(screen.getByText('Kanji')).toBeTruthy();
    const kanji = CARDS.filter((card) => card.script === 'kanji');
    const displayed = document.querySelector('.romaji')?.textContent ?? '';
    const target = kanji.find((card) => card.script === 'kanji' && card.meanings.join(', ') === displayed);
    expect(target).toBeDefined();
    if (!target) throw new Error('no kanji card matches the prompt');
    const readings = document.querySelector('.readings')?.textContent ?? '';
    expect(readings).toContain(target.onyomi[0]!);
    expect(readings.includes('·')).toBe(target.onyomi.length > 0 && target.kunyomi.length > 0);
    expect(surface.cellCounts).toEqual([1]);

    // Reveal shows the kanji in the reference font, in one cell.
    await fireEvent.click(screen.getByRole('button', { name: 'Reveal' }));
    const referenceCells = document.querySelectorAll('.reference-cell');
    expect(referenceCells).toHaveLength(1);
    expect(referenceCells[0]?.textContent).toBe(target.grapheme);

    // Miss counts work for kanji unchanged: a Missed grade increments the
    // card's lifetime tally.
    await surface.landStroke();
    await fireEvent.click(screen.getByRole('button', { name: 'Missed' }));
    await tick();
    const tallyRepository = new IdbTallyRepository();
    await vi.waitFor(async () => {
      const tallies = await tallyRepository.getAll();
      expect(tallies.ok && tallies.value).toEqual([{ cardId: target.cardId, missCount: 1 }]);
    });

    // Summary and History both read the session as a Kanji N5 scope, the
    // graded card among Summary's missed chips.
    await fireEvent.click(screen.getByRole('button', { name: "I'm done" }));
    expect(await findSummaryHeading()).toBeTruthy();
    expect(screen.getByText('Kanji N5')).toBeTruthy();
    expect(screen.getByText(target.grapheme)).toBeTruthy();
    expect(screen.getByText(/Missed 1/)).toBeTruthy();

    const sessionRepository = new IdbSessionRepository();
    await vi.waitFor(async () => {
      const sessions = await sessionRepository.list();
      expect(sessions.ok && sessions.value).toHaveLength(1);
      expect(sessions.ok && sessions.value[0]?.scope).toEqual({ kanji: ['n5'] });
    });

    await fireEvent.click(screen.getByRole('button', { name: 'History' }));
    expect(await screen.findByText('1 card · Kanji N5')).toBeTruthy();
  });

  it('offers every kanji level and reads a multi-level scope in Summary and History', async () => {
    let surface = fakeInkSurface();
    render(App, {
      inkSurfaceFactory: () => {
        surface = fakeInkSurface();
        return surface;
      },
    });
    await screen.findByText('What would you like to write?');

    // Kanji on, both kana off: the Set row offers all five levels, and
    // turning the script on selects them all -- the whole 2,211-card catalog.
    await fireEvent.click(screen.getByRole('button', { name: /^Kanji/ }));
    await fireEvent.click(screen.getByRole('button', { name: 'Hiragana' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Katakana' }));
    for (const set of ['N5', 'N4', 'N3', 'N2', 'N1']) {
      expect(setPill('Kanji', set)).toBeTruthy();
    }
    expect(await screen.findByText('2211 available · 0 with recent misses')).toBeTruthy();

    // Narrow to two levels so Summary and History have a joined line to read.
    await fireEvent.click(setPill('Kanji', 'N5'));
    await fireEvent.click(setPill('Kanji', 'N3'));
    await fireEvent.click(setPill('Kanji', 'N2'));
    expect(await screen.findByText('1398 available · 0 with recent misses')).toBeTruthy();
    await fireEvent.click(screen.getByRole('radio', { name: '10' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Start writing' }));

    expect(await screen.findByText(/1 \/ 10/)).toBeTruthy();
    await surface.landStroke();
    await fireEvent.click(screen.getByRole('button', { name: 'Missed' }));
    await tick();
    await fireEvent.click(screen.getByRole('button', { name: "I'm done" }));
    expect(await findSummaryHeading()).toBeTruthy();
    expect(screen.getByText('Kanji N4+N1')).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: 'History' }));
    expect(await screen.findByText('1 card · Kanji N4+N1')).toBeTruthy();
  });

  it('lists stored sessions newest-first with closure chips and an accuracy chart', async () => {
    const idle = seededSession({
      date: '2026-09-01T00:00:00.000Z',
      closureReason: 'inactivity',
      accuracy: 0.6,
    });
    const complete = seededSession({
      date: '2026-09-03T00:00:00.000Z',
      closureReason: 'complete',
      accuracy: 0.9,
    });
    const explicit = seededSession({
      date: '2026-09-02T00:00:00.000Z',
      closureReason: 'explicit',
      accuracy: 0.75,
    });
    const sessionRepository = new IdbSessionRepository();
    for (const session of [idle, complete, explicit]) {
      await sessionRepository.add(session);
    }

    render(App);
    await screen.findByText('What would you like to write?');
    // No stored miss counts on a fresh database -- the line reads zero shaky.
    expect(await screen.findByText('208 available · 0 with recent misses')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'History' }));

    // Focus lands on the History heading on entry.
    await vi.waitFor(() => expect(document.activeElement?.textContent).toBe('History'));

    // Reverse-chronological: complete (09-03), explicit (09-02), idle (09-01).
    await screen.findByRole('heading', { name: 'Sessions' });
    const rows = historyRows();
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByText(formatDate(complete.date))).toBeTruthy();
    expect(within(rows[1]!).getByText(formatDate(explicit.date))).toBeTruthy();
    expect(within(rows[2]!).getByText(formatDate(idle.date))).toBeTruthy();

    // Each row carries its own card count and scope.
    for (const row of rows) {
      expect(within(row).getByText('10 cards · Hiragana Base')).toBeTruthy();
    }

    // Complete: positive chip, no dimming. Idle: neutral chip, dimmed.
    expect(within(rows[0]!).getByText('Session complete').className).toContain('chip--positive');
    expect(within(rows[0]!).getByText('90%').className).not.toContain('dimmed');
    expect(within(rows[1]!).queryByText('Session complete')).toBeNull();
    expect(within(rows[2]!).getByText('Closed on idle').className).toContain('chip--neutral');
    expect(within(rows[2]!).getByText('60%').closest('.accuracy')?.className).toContain('dimmed');

    // One bar per session, the newest always the accent color.
    const bars = chartBars();
    expect(bars).toHaveLength(3);
    expect(bars[2]!.getAttribute('style')).toContain('background-color: var(--color-accent)');
  });

  it('hides the accuracy chart below 3 sessions but still lists the rows', async () => {
    // One or two sessions are not enough to show a trend chart.
    const first = seededSession({ date: '2026-09-01T00:00:00.000Z' });
    const second = seededSession({ date: '2026-09-02T00:00:00.000Z' });
    const sessionRepository = new IdbSessionRepository();
    await sessionRepository.add(first);
    await sessionRepository.add(second);

    render(App);
    await screen.findByText('What would you like to write?');
    await fireEvent.click(screen.getByRole('button', { name: 'History' }));

    expect(await screen.findByText(formatDate(second.date))).toBeTruthy();
    expect(historyRows()).toHaveLength(2);
    expect(document.querySelector('.chart')).toBeNull();
  });

  it('shows History\'s empty state on a fresh database', async () => {
    render(App);
    await screen.findByText('What would you like to write?');
    await fireEvent.click(screen.getByRole('button', { name: 'History' }));

    expect(await screen.findByText('No sessions yet')).toBeTruthy();
    expect(document.querySelector('.chart')).toBeNull();
  });

  it('shows the stored presets in Settings and persists changes to both controls', async () => {
    // Off-preset idle value: no idle segment may read as active.
    const settingsRepository = new IdbSettingsRepository();
    await settingsRepository.save({
      widthPreset: 'subtle',
      idleTimeoutMs: 90_000,
      penCheckShown: true,
    });

    render(App);
    await screen.findByText('What would you like to write?');
    await fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    await screen.findByRole('radiogroup', { name: 'Ink width' });
    expect(screen.getByRole('radio', { name: 'Subtle' }).getAttribute('aria-checked')).toBe('true');
    for (const name of ['2 min', '5 min', '10 min'] as const) {
      expect(screen.getByRole('radio', { name }).getAttribute('aria-checked')).toBe('false');
    }

    // Two rapid taps across controls before either save resolves -- both
    // must land on the one stored record without clobbering each other.
    await fireEvent.click(screen.getByRole('radio', { name: 'Calligraphy' }));
    await fireEvent.click(screen.getByRole('radio', { name: '10 min' }));

    await vi.waitFor(async () => {
      const result = await settingsRepository.get();
      expect(result.ok && result.value).toEqual({
        widthPreset: 'calligraphy',
        idleTimeoutMs: 600_000,
        penCheckShown: true,
      });
    });
  });

  it('arrow-keys the Settings pill groups, commits both controls, and feeds the try pad', async () => {
    const settingsRepository = new IdbSettingsRepository();
    await settingsRepository.save({
      widthPreset: 'subtle',
      idleTimeoutMs: 300_000,
      penCheckShown: true,
    });

    // The factory the composition root hands both the practice module and
    // Settings: opening Settings calls it for the try pad's surface.
    let pad = fakeInkSurface();
    render(App, {
      inkSurfaceFactory: () => {
        pad = fakeInkSurface();
        return pad;
      },
    });
    await screen.findByText('What would you like to write?');
    await fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    // One page title (the bar's h1 "Settings") with the three sections
    // as subheadings under it.
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 2, name: 'Ink width' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Idle close' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Backup' })).toBeTruthy();
    // The page ends with the kanji sources' licence credit line.
    expect(
      screen.getByText('Kanji data: EDRDG KANJIDIC2 (CC BY-SA); JLPT lists by J. Waller (CC BY).'),
    ).toBeTruthy();

    // Wait for the stored record to land in the pills before keying them.
    await vi.waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Subtle' }).getAttribute('aria-checked')).toBe(
        'true',
      ),
    );

    // Arrows commit like taps and move focus.
    const subtle = screen.getByRole('radio', { name: 'Subtle' });
    subtle.focus();
    await fireEvent.keyDown(subtle, { key: 'ArrowRight' });
    const expressive = screen.getByRole('radio', { name: 'Expressive' });
    expect(expressive.getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(expressive);

    // The try pad draws with the newly chosen preset -- no session needed.
    await vi.waitFor(() => expect(pad.widthPresets).toContain('expressive'));
    await fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(pad.clears).toBe(1);

    // The idle group keys the same way, from its active segment.
    const five = screen.getByRole('radio', { name: '5 min' });
    five.focus();
    await fireEvent.keyDown(five, { key: 'ArrowDown' });
    const ten = screen.getByRole('radio', { name: '10 min' });
    expect(ten.getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(ten);

    // Both arrow commits persisted, exactly like the taps above.
    await vi.waitFor(async () => {
      const result = await settingsRepository.get();
      expect(result.ok && result.value).toEqual({
        widthPreset: 'expressive',
        idleTimeoutMs: 600_000,
        penCheckShown: true,
      });
    });
  });

  it('exports a backup file containing the stored progress', async () => {
    const tallyRepository = new IdbTallyRepository();
    const missed = CARDS.find((c) => c.script === 'katakana' && c.set === 'yoon')!;
    for (let i = 0; i < 3; i++) {
      await tallyRepository.increment(missed.cardId);
    }
    const stored = seededSession({ accuracy: 0.8 });
    const sessionRepository = new IdbSessionRepository();
    await sessionRepository.add(stored);

    // The real adapter hands the browser a Blob URL download; capturing the
    // blob keeps the whole real path while making the file's contents
    // assertable.
    const blobs: Blob[] = [];
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockImplementation((blob: Blob | MediaSource) => {
        blobs.push(blob as Blob);
        return 'blob:tegakko-test';
      });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    render(App);
    await screen.findByText('What would you like to write?');
    await fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    await fireEvent.click(screen.getByRole('button', { name: 'Download' }));

    await vi.waitFor(() => expect(blobs).toHaveLength(1));
    expect(screen.queryByText("Couldn't export -- try again.")).toBeNull();
    const envelope = JSON.parse(await blobs[0]!.text()) as {
      version: number;
      tallies: Array<{ cardId: string; missCount: number }>;
      sessions: Session[];
    };
    expect(envelope.version).toBe(3);
    expect(envelope.tallies).toEqual([{ cardId: missed.cardId, missCount: 3 }]);
    expect(envelope.sessions).toEqual([stored]);

    createObjectURL.mockRestore();
  });

  it('imports a backup file from Settings, replacing everything stored', async () => {
    const imported: Session = {
      id: 'imported-session',
      date: '2026-10-05T00:00:00.000Z',
      scope: { katakana: ['yoon'] },
      cardsAttempted: 7,
      accuracy: 0.5,
      closureReason: 'complete',
    };
    const exportedAt = '2026-10-06T09:00:00.000Z';
    const envelope = buildExportEnvelope(
      [{ cardId: 'あ:hiragana', missCount: 4 }],
      [],
      [imported],
      new Date(exportedAt),
    );

    render(App);
    await screen.findByText('What would you like to write?');
    await fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    const input = screen.getByTestId('import-file') as HTMLInputElement;
    const file = new File([JSON.stringify(envelope)], 'backup.json', {
      type: 'application/json',
    });
    async function pick(): Promise<void> {
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      await fireEvent.change(input);
    }

    // First pick against a clean database: the warning honestly reports
    // nothing local yet, and nothing is written until "Replace everything".
    await pick();
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByText('On this device: nothing yet')).toBeTruthy();
    expect(screen.getByText(`In the file: ${formatDate(exportedAt)}`)).toBeTruthy();
    // The bar sits outside Settings' own inert main, so the composition
    // root inerts it itself while the warning is open -- no keyboard
    // escape from the modal.
    expect(document.querySelector('.top-bar')?.hasAttribute('inert')).toBe(true);

    // Cancel, practise something locally, pick again: the warning now
    // reports the local activity instead.
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(document.querySelector('.top-bar')?.hasAttribute('inert')).toBe(false);
    const local = seededSession({ date: '2026-10-01T00:00:00.000Z' });
    const sessionRepository = new IdbSessionRepository();
    await sessionRepository.add(local);
    await pick();
    expect(await screen.findByRole('alertdialog')).toBeTruthy();
    expect(
      screen.getByText(`On this device: last practiced ${formatDate(local.date)}`),
    ).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: 'Replace everything' }));
    expect(await screen.findByText('Imported. Your progress now matches the file.')).toBeTruthy();

    // The database now matches the file, read back through the ports.
    const tallyRepository = new IdbTallyRepository();
    await vi.waitFor(async () => {
      const tallies = await tallyRepository.getAll();
      expect(tallies.ok && tallies.value).toEqual([{ cardId: 'あ:hiragana', missCount: 4 }]);
    });
    const sessions = await sessionRepository.list();
    expect(sessions.ok && sessions.value).toEqual([imported]);

    // The imported session is what History lists.
    await fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await screen.findByText('What would you like to write?');
    await fireEvent.click(screen.getByRole('button', { name: 'History' }));
    expect(await screen.findByText('50%')).toBeTruthy();
    expect(screen.queryByText('No sessions yet')).toBeNull();
  });

  it('rejects a file that is not a tegakko backup without changing anything', async () => {
    render(App);
    await screen.findByText('What would you like to write?');
    await fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    const input = screen.getByTestId('import-file') as HTMLInputElement;
    const file = new File(['nope'], 'backup.json', { type: 'application/json' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await fireEvent.change(input);

    expect(
      await screen.findByText("That file isn't a tegakko backup -- nothing was changed."),
    ).toBeTruthy();
    expect(screen.queryByRole('alertdialog')).toBeNull();

    const sessionRepository = new IdbSessionRepository();
    const sessions = await sessionRepository.list();
    expect(sessions.ok && sessions.value).toEqual([]);
  });
});
