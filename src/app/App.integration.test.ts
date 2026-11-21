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
    scope: overrides.scope ?? { scripts: ['hiragana'], sets: ['base'] },
    cardsAttempted: overrides.cardsAttempted ?? 10,
    accuracy: overrides.accuracy ?? 0.5,
    closureReason: overrides.closureReason ?? 'explicit',
  };
}

function historyRows(): HTMLElement[] {
  return [...document.querySelectorAll('.row')] as HTMLElement[];
}

function sparklineBars(): HTMLElement[] {
  return [...document.querySelectorAll('.bar')] as HTMLElement[];
}

describe('App integration', () => {
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
    await screen.findByText('What are we testing today?');

    // Narrow to a small, deterministic scope so grading one card and ending
    // is enough to exercise the whole pipeline.
    await fireEvent.click(screen.getByRole('radio', { name: 'Hiragana' }));
    await fireEvent.click(screen.getByRole('radio', { name: 'Yoon' }));
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
    expect(await screen.findByText('Session summary')).toBeTruthy();
    expect(screen.getByText('0%')).toBeTruthy();
    const sessionRepository = new IdbSessionRepository();
    await vi.waitFor(async () => {
      const sessions = await sessionRepository.list();
      expect(sessions.ok && sessions.value.length).toBe(1);
    });

    // Navigate to History and verify the closed session is listed.
    await fireEvent.click(screen.getByRole('button', { name: 'History' }));
    expect(await screen.findByText('History')).toBeTruthy();
    expect(await screen.findByText('0%')).toBeTruthy();
    expect(screen.queryByText('No sessions yet. Finish a drill to see it here.')).toBeNull();
  });

  // The drill grade flow: one tap per card -- a grade advances
  // straight to the next prompt, and the Undo toast lives over that prompt
  // until its first stroke. Shared preamble: an 8-card hiragana-yoon drill
  // (25% of the 33-card scope), started and waiting at "1 / 8".
  async function startEightCardDrill(): Promise<ReturnType<typeof fakeInkSurface>> {
    let surface = fakeInkSurface();
    render(App, {
      inkSurfaceFactory: () => {
        surface = fakeInkSurface();
        return surface;
      },
    });
    await screen.findByText('What are we testing today?');
    await fireEvent.click(screen.getByRole('radio', { name: 'Hiragana' }));
    await fireEvent.click(screen.getByRole('radio', { name: 'Yoon' }));
    await fireEvent.click(screen.getByRole('radio', { name: '25%' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Start writing' }));
    expect(await screen.findByText(/1 \/ 8/)).toBeTruthy();
    return surface;
  }

  it('grades straight to the next prompt, and Undo reverts the card before its first stroke', async () => {
    const surface = await startEightCardDrill();

    // One tap per card: the grade itself advances; "Next character" is gone.
    await surface.landStroke();
    await fireEvent.click(screen.getByRole('button', { name: 'Missed' }));
    await tick();

    expect(screen.getByText(/2 \/ 8/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Next character' })).toBeNull();
    // The toast rides the new prompt rather than freezing the graded card.
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();

    // Undo before the new prompt's first stroke reverts the attempt and its
    // miss count, and brings the graded card back with its ink intact.
    await fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByText(/1 \/ 8/)).toBeTruthy();
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
    const surface = await startEightCardDrill();

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
    const surface = await startEightCardDrill();

    // Grades 1 through 7 advance straight through the queue; the 8th card
    // is now the prompt (the grade itself moved the counter).
    for (let i = 0; i < 7; i++) {
      await surface.landStroke();
      await fireEvent.click(screen.getByRole('button', { name: 'Correct' }));
      await tick();
    }
    expect(screen.getByText(/8 \/ 8/)).toBeTruthy();

    // The queue-completing grade freezes the last card under its toast
    // instead of closing on its own: Undo stays fair, Finish completes.
    await surface.landStroke();
    await fireEvent.click(screen.getByRole('button', { name: 'Correct' }));
    await tick();
    expect(screen.getByText(/8 \/ 8/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Finish' })).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: 'Finish' }));

    expect(await screen.findByText('Session summary')).toBeTruthy();
    const sessionRepository = new IdbSessionRepository();
    await vi.waitFor(async () => {
      const sessions = await sessionRepository.list();
      expect(sessions.ok && sessions.value[0]?.closureReason).toBe('complete');
    });
  });

  it('writes a yoon across two genkouyoushi cells and reveals the reference cell by cell', async () => {
    const surface = await startEightCardDrill();

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

  it('shows the scope\'s card and shaky counts live, from the stored miss counts', async () => {
    // One heavily-missed hiragana card: above the average on the full
    // scope, gone entirely once the scope narrows past it.
    const tallyRepository = new IdbTallyRepository();
    const heavy = CARDS.find((c) => c.script === 'hiragana' && c.set === 'base')!;
    for (let i = 0; i < 10; i++) {
      await tallyRepository.increment(heavy.cardId);
    }

    render(App);

    await screen.findByText('What are we testing today?');
    expect(screen.getByText('208 cards in scope')).toBeTruthy();
    expect(screen.getByText('208 cards this session')).toBeTruthy();
    expect(await screen.findByText('1 shaky')).toBeTruthy();

    await fireEvent.click(screen.getByRole('radio', { name: 'Katakana' }));
    expect(await screen.findByText('104 cards in scope')).toBeTruthy();
    // The only miss record dropped out of scope -- nothing is above the
    // average any more.
    expect(await screen.findByText('0 shaky')).toBeTruthy();

    await fireEvent.click(screen.getByRole('radio', { name: 'Both scripts' }));
    expect(await screen.findByText('208 cards in scope')).toBeTruthy();
    expect(await screen.findByText('1 shaky')).toBeTruthy();
  });

  it('lists stored sessions newest-first with closure chips and a sparkline', async () => {
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
    await screen.findByText('What are we testing today?');
    // No stored miss counts on a fresh database -- the badge reads zero.
    expect(await screen.findByText('0 shaky')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'History' }));

    // Focus lands on the History heading on entry.
    await vi.waitFor(() => expect(document.activeElement?.textContent).toBe('History'));

    // Reverse-chronological: complete (09-03), explicit (09-02), idle (09-01).
    await screen.findByText(formatDate(complete.date));
    const rows = historyRows();
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByText(formatDate(complete.date))).toBeTruthy();
    expect(within(rows[1]!).getByText(formatDate(explicit.date))).toBeTruthy();
    expect(within(rows[2]!).getByText(formatDate(idle.date))).toBeTruthy();

    // Complete: positive chip, no dimming. Idle: neutral chip, dimmed.
    expect(within(rows[0]!).getByText('Session complete').className).toContain('chip--positive');
    expect(within(rows[0]!).getByText('90%').className).not.toContain('dimmed');
    expect(within(rows[1]!).queryByText('Session complete')).toBeNull();
    expect(within(rows[2]!).getByText('Closed on idle').className).toContain('chip--neutral');
    expect(within(rows[2]!).getByText('60%').className).toContain('dimmed');

    // One bar per session, the newest always the accent color.
    const bars = sparklineBars();
    expect(bars).toHaveLength(3);
    expect(bars[2]!.getAttribute('style')).toContain('background-color: var(--color-accent)');
  });

  it('shows History\'s empty state on a fresh database', async () => {
    render(App);
    await screen.findByText('What are we testing today?');
    await fireEvent.click(screen.getByRole('button', { name: 'History' }));

    expect(await screen.findByText('No sessions yet. Finish a drill to see it here.')).toBeTruthy();
    expect(document.querySelector('.sparkline')).toBeNull();
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
    await screen.findByText('What are we testing today?');
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
    await screen.findByText('What are we testing today?');
    await fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    await fireEvent.click(screen.getByRole('button', { name: 'Export' }));

    await vi.waitFor(() => expect(blobs).toHaveLength(1));
    expect(screen.queryByText("Couldn't export -- try again.")).toBeNull();
    const envelope = JSON.parse(await blobs[0]!.text()) as {
      version: number;
      tallies: Array<{ cardId: string; missCount: number }>;
      sessions: Session[];
    };
    expect(envelope.version).toBe(2);
    expect(envelope.tallies).toEqual([{ cardId: missed.cardId, missCount: 3 }]);
    expect(envelope.sessions).toEqual([stored]);

    createObjectURL.mockRestore();
  });

  it('imports a backup file from Settings, replacing everything stored', async () => {
    const imported: Session = {
      id: 'imported-session',
      date: '2026-10-05T00:00:00.000Z',
      scope: { scripts: ['katakana'], sets: ['yoon'] },
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
    await screen.findByText('What are we testing today?');
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

    // Cancel, practise something locally, pick again: the warning now
    // reports the local activity instead.
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
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
    await screen.findByText('What are we testing today?');
    await fireEvent.click(screen.getByRole('button', { name: 'History' }));
    expect(await screen.findByText('50%')).toBeTruthy();
    expect(screen.queryByText('No sessions yet. Finish a drill to see it here.')).toBeNull();
  });

  it('rejects a file that is not a tegakko backup without changing anything', async () => {
    render(App);
    await screen.findByText('What are we testing today?');
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
