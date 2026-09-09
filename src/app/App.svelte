<script lang="ts">
  // Composition root (AD-1): the only place concrete adapters are
  // constructed and wired. Reads settings once on boot -- `penCheckShown`
  // decides whether First Run shows, `widthPreset` is held here and pushed
  // into the ink adapter (AD-12's single screen variable drives the rest).
  import { onMount } from 'svelte';
  import type { Screen } from '../adapters/ui/screens';
  import FirstRun from '../adapters/ui/FirstRun.svelte';
  import ScopePicker, { type SizeChoice } from '../adapters/ui/ScopePicker.svelte';
  import Drill from '../adapters/ui/Drill.svelte';
  import Settings from '../adapters/ui/Settings.svelte';
  import SessionSummary from '../adapters/ui/SessionSummary.svelte';
  import History from '../adapters/ui/History.svelte';
  import { IdbSettingsRepository } from '../adapters/persistence/settings-repository';
  import { IdbAttemptRepository } from '../adapters/persistence/attempt-repository';
  import { IdbTallyRepository } from '../adapters/persistence/tally-repository';
  import { IdbSessionRepository } from '../adapters/persistence/session-repository';
  import { InMemoryCardRepository } from '../adapters/content/card-repository';
  import { CanvasInkSurface } from '../adapters/ink/canvas-ink-surface';
  import type { InkSurface } from '../ports/ink-surface';
  import type { SessionRepository } from '../ports/session-repository';
  import { FULL_SCOPE, type Scope } from '../domain/scope';
  import { DEFAULT_SETTINGS, type WidthPreset } from '../domain/settings';
  import type { Attempt } from '../domain/attempt';
  import type { Tally } from '../domain/tally';
  import type { SessionSummaryView } from '../domain/session';
  import { err } from '../domain/result';

  const settingsRepository = new IdbSettingsRepository();
  const attemptRepository = new IdbAttemptRepository();
  const tallyRepository = new IdbTallyRepository();
  const sessionRepository: SessionRepository = new IdbSessionRepository();
  const cardRepository = new InMemoryCardRepository();

  // A canvas can't read CSS custom properties, so `theme.css`'s token values
  // are handed to the ink adapter from here -- the composition root is the
  // one layer allowed to know both the theme and the adapter.
  const INK_COLORS = Object.freeze({
    ink: '#201E1D', // --color-ink
    guide: '#CCDBB2', // --color-grid-guide
    dot: '#E1EECC', // --color-positive-bg
    canvas: '#F9F4ED', // --color-surface-canvas
  });

  let screen = $state<Screen>('pen-check');
  let ready = $state(false);
  // The Scope picker is unmounted while the drill or Settings is open, so its
  // selection lives here -- that is what makes Back return to the picker with
  // the selection intact rather than reset to the full scope.
  let scope = $state<Scope>(FULL_SCOPE);
  // Sibling to `scope` above, wired the same way, purely for Back-navigation
  // persistence -- Story 1.2's amended AC; not yet threaded into
  // `handleStart` (Story 1.7's `sampleSessionCards` is what eventually
  // consumes it).
  let sessionSize = $state<SizeChoice>('all');
  // Loaded once via `listAll()` at drill entry (Story 1.7) -- `Drill` seeds
  // its own in-memory `sessionAttempts` from this and never asks this
  // composition root to re-fetch mid-session.
  let drillAttempts = $state<Attempt[]>([]);
  // Loaded once via `getAll()` at drill entry (Story 1.8) -- mirrors
  // `drillAttempts` above, never re-fetched mid-session.
  let drillTallies = $state<Tally[]>([]);
  let widthPreset = $state<WidthPreset>(DEFAULT_SETTINGS.widthPreset);
  // Loaded once on boot, same as `widthPreset` -- Settings is unreachable
  // while Drill is mounted (no nav path exists), so this never needs a
  // live-reload mid-drill (Story 1.9's Boundaries & Constraints).
  let idleTimeoutMs = $state<number>(DEFAULT_SETTINGS.idleTimeoutMs);
  // Set by `handleDrillClose` when a Drill session closes (any reason);
  // drives the `summary` screen below and is cleared on "Another round".
  let summary = $state<SessionSummaryView | null>(null);
  // A fresh instance per drill entry: `mount()` is called exactly once per
  // adapter instance, and `Drill.svelte`'s unmount cleanup calls `destroy()`.
  let inkSurface = $state<InkSurface | null>(null);
  // Guards `handleStart` against re-entrancy: a double-tap on "Start
  // writing" (realistic on a stylus tablet) would otherwise fire it twice
  // before the first `listAll()` resolves, racing two `CanvasInkSurface`s
  // into existence -- the losing one never mounted or `destroy()`ed, and
  // `drillAttempts` seeded from whichever `listAll()` call happens to
  // resolve last.
  let starting = false;

  onMount(() => {
    void settingsRepository.get().then((result) => {
      // First Run never hard-blocks: an unreadable settings store just means
      // we fall back to showing First Run rather than skipping it silently,
      // and the ink width stays at its default.
      screen = result.ok && result.value.penCheckShown ? 'scope-picker' : 'pen-check';
      if (result.ok) {
        widthPreset = result.value.widthPreset;
        idleTimeoutMs = result.value.idleTimeoutMs;
      }
      ready = true;
    });
  });

  function handlePenCheckDismissed(): void {
    screen = 'scope-picker';
  }

  async function handleStart(chosenScope: Scope): Promise<void> {
    // A second concurrent call (a double-tap while the first is still
    // awaiting `listAll()`) is a no-op -- see `starting`'s declaration.
    if (starting) return;
    starting = true;
    try {
      scope = chosenScope;
      // Loaded once per drill entry, never re-fetched mid-session (Story
      // 1.7). Fails open to `[]` on either failure path this codebase's
      // adapters can take -- a resolved `{ok: false}` Result or an outright
      // rejected promise -- the same as `Drill.svelte`'s
      // `attemptRepository.add()`/`tallyRepository.increment()` calls. An
      // unreadable attempt history just means `selectNext` falls back to
      // its uniform floor rather than blocking the drill from starting.
      const result = await attemptRepository.listAll().catch((error: unknown) => {
        console.error('Failed to load attempt history:', error);
        return err<Attempt[]>(error instanceof Error ? error : new Error(String(error)));
      });
      drillAttempts = result.ok ? result.value : [];
      // Same fail-open pattern as `drillAttempts` above -- an unreadable
      // tally store just means the toast's cumulative count starts from an
      // empty baseline rather than blocking the drill from starting.
      const tallyResult = await tallyRepository.getAll().catch((error: unknown) => {
        console.error('Failed to load tallies:', error);
        return err<Tally[]>(error instanceof Error ? error : new Error(String(error)));
      });
      drillTallies = tallyResult.ok ? tallyResult.value : [];
      const surface = new CanvasInkSurface({ colors: INK_COLORS });
      surface.setWidthPreset(widthPreset);
      inkSurface = surface;
      screen = 'drill';
    } finally {
      starting = false;
    }
  }

  function handleDrillClose(closedSummary: SessionSummaryView): void {
    summary = closedSummary;
    screen = 'summary';
    inkSurface = null;
  }

  function handleSummaryAgain(): void {
    screen = 'scope-picker';
    summary = null;
  }

  function handleOpenSettings(): void {
    screen = 'settings';
  }

  function handleSettingsBack(): void {
    screen = 'scope-picker';
  }

  function handleOpenHistory(): void {
    screen = 'history';
  }

  // History's own "Back" always returns to the Scope picker, even when
  // opened from the Session summary -- Design Notes: avoids adding
  // "previous screen" state for a single-portrait, no-router app.
  function handleHistoryBack(): void {
    screen = 'scope-picker';
  }

  function handlePresetChange(preset: WidthPreset): void {
    widthPreset = preset;
    // A live surface (there is none while Settings is open today, but the
    // wiring is not conditional on that) picks the range up on its next
    // stroke; strokes already drawn are untouched.
    inkSurface?.setWidthPreset(preset);
  }
</script>

{#if ready}
  {#if screen === 'pen-check'}
    <FirstRun {settingsRepository} onDismiss={handlePenCheckDismissed} />
  {:else if screen === 'scope-picker'}
    <ScopePicker
      {cardRepository}
      {tallyRepository}
      onStart={handleStart}
      onSettings={handleOpenSettings}
      onHistory={handleOpenHistory}
      initialScope={scope}
      onScopeChange={(next) => (scope = next)}
      initialSessionSize={sessionSize}
      onSessionSizeChange={(next) => (sessionSize = next)}
    />
  {:else if screen === 'settings'}
    <Settings {settingsRepository} onPresetChange={handlePresetChange} onBack={handleSettingsBack} />
  {:else if screen === 'drill' && inkSurface}
    <Drill
      {scope}
      attempts={drillAttempts}
      tallies={drillTallies}
      {inkSurface}
      {attemptRepository}
      {tallyRepository}
      {sessionRepository}
      {idleTimeoutMs}
      onClose={handleDrillClose}
    />
  {:else if screen === 'summary' && summary}
    <SessionSummary {summary} onAgain={handleSummaryAgain} onHistory={handleOpenHistory} />
  {:else if screen === 'history'}
    <History {sessionRepository} onBack={handleHistoryBack} />
  {/if}
{/if}
