import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import 'fake-indexeddb/auto';
import App from './App.svelte';
import { IdbSettingsRepository } from '../adapters/persistence/settings-repository';
import { IdbSessionRepository } from '../adapters/persistence/session-repository';
import { resetDb } from '../adapters/persistence/test-reset-db';
import { DEFAULT_SETTINGS } from '../domain/settings';
import type { InkSurface } from '../ports/ink-surface';
import type { Stroke, StrokeTiming } from '../domain/ink';

/** Fake ink surface for whole-app tests: records its subscriber and exposes
 * a helper to complete a stroke, exactly like the real canvas adapter does. */
function fakeInkSurface(): InkSurface & { landStroke: () => Promise<void> } {
  let cb: ((stroke: Stroke, timing: StrokeTiming) => void) | null = null;
  const surface = {
    mount() {},
    destroy() {},
    clear() {},
    onStrokeComplete(next: (stroke: Stroke, timing: StrokeTiming) => void) {
      cb = next;
    },
    setWidthPreset() {},
    async landStroke() {
      const startedAt = performance.now();
      cb?.({ points: [{ x: 0.5, y: 0.5, pressure: 0.7 }], widthPreset: 'expressive' }, {
        startedAt,
        endedAt: performance.now(),
      });
      await tick();
    },
  };
  return surface;
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
});
