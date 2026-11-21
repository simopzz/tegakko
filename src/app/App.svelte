<script lang="ts">
  // Composition root (docs/adr/0001-hexagonal-boundary.md): the only place
  // concrete adapters are
  // constructed and wired. Reads settings once on boot -- `penCheckShown`
  // decides whether First Run shows, `widthPreset` is held here and pushed
  // into the ink adapter (a single screen variable drives the rest).
  import { onMount } from 'svelte';
  import type { Screen } from '../adapters/ui/screens';
  import FirstRun from '../adapters/ui/FirstRun.svelte';
  import ScopePicker from '../adapters/ui/ScopePicker.svelte';
  import Drill from '../adapters/ui/Drill.svelte';
  import Settings from '../adapters/ui/Settings.svelte';
  import SessionSummary from '../adapters/ui/SessionSummary.svelte';
  import History from '../adapters/ui/History.svelte';
  import { IdbSettingsRepository } from '../adapters/persistence/settings-repository';
  import { IdbAttemptRepository } from '../adapters/persistence/attempt-repository';
  import { IdbTallyRepository } from '../adapters/persistence/tally-repository';
  import { IdbSessionRepository } from '../adapters/persistence/session-repository';
  import { CanvasInkSurface } from '../adapters/ink/canvas-ink-surface';
  import { JsonProgressExporter } from '../adapters/io/json-progress-exporter';
  import { JsonProgressImporter } from '../adapters/io/json-progress-importer';
  import { IdbProgressReplacer } from '../adapters/persistence/progress-replacer';
  import type { InkSurface } from '../ports/ink-surface';
  import type { SessionRepository } from '../ports/session-repository';
  import {
    cardsInScope,
    FULL_SCOPE,
    resolveSessionSize,
    type Scope,
    type SessionSizeChoice,
  } from '../domain/scope';
  import { CARDS } from '../domain/cards';
  import { DEFAULT_SETTINGS, type WidthPreset } from '../domain/settings';
  import type { SessionSummaryView } from '../domain/session';
  import { PracticeModule } from './practice';
  import { Backup, ScopePreview, SessionHistory, SettingsStore } from './use-cases';
  import type { DrillSession } from '../adapters/ui/drill-session';

  const settingsRepository = new IdbSettingsRepository();
  const attemptRepository = new IdbAttemptRepository();
  const tallyRepository = new IdbTallyRepository();
  const sessionRepository: SessionRepository = new IdbSessionRepository();
  // The io adapter reads through the same repo instances as the rest of the
  // app -- it never imports `adapters/persistence` itself.
  const progressExporter = new JsonProgressExporter({
    attempts: attemptRepository,
    tallies: tallyRepository,
    sessions: sessionRepository,
  });
  // Persistence's atomic replace is handed to io through the
  // `ProgressReplacer` port. ScopePicker and History re-read on mount, so no
  // cache needs invalidating after an import.
  const progressImporter = new JsonProgressImporter({
    attempts: attemptRepository,
    sessions: sessionRepository,
    replacer: new IdbProgressReplacer(),
  });

  // The screens' use-cases: repositories stop at this line -- no screen
  // below receives one (docs/adr/0001-hexagonal-boundary.md).
  const scopePreview = new ScopePreview(tallyRepository);
  const sessionHistory = new SessionHistory(sessionRepository);
  const settingsStore = new SettingsStore(settingsRepository);
  const backup = new Backup(progressExporter, progressImporter);

  // A canvas can't read CSS custom properties, so `theme.css`'s token values
  // are handed to the ink adapter from here -- the composition root is the
  // one layer allowed to know both the theme and the adapter.
  const INK_COLORS = Object.freeze({
    ink: '#201E1D', // --color-ink
    guide: '#CCDBB2', // --color-grid-guide
    dot: '#E1EECC', // --color-positive-bg
    canvas: '#F9F4ED', // --color-surface-canvas
  });

  function createInkSurfaceFactory(): InkSurface {
    const surface = new CanvasInkSurface({ colors: INK_COLORS });
    surface.setWidthPreset(widthPreset);
    return surface;
  }

  interface Props {
    /** Injectable ink-surface factory: production uses the real canvas
     * adapter; tests can supply a fake surface. The factory is a closure so
     * the composition root can inject theme colors and the current width
     * preset without Drill or the practice module knowing either. */
    inkSurfaceFactory?: () => InkSurface;
  }

  const { inkSurfaceFactory = createInkSurfaceFactory }: Props = $props();

  let screen = $state<Screen>('pen-check');
  let ready = $state(false);
  // The Scope picker is unmounted while the drill or Settings is open, so its
  // selection lives here -- that is what makes Back return to the picker with
  // the selection intact rather than reset to the full scope.
  let scope = $state<Scope>(FULL_SCOPE);
  // Sibling to `scope` above, wired the same way, purely for Back-navigation
  // persistence. `handleStart` resolves this into an exact card count
  // (`resolveSessionSize`) and passes it to the practice module, which
  // samples the queue exactly once at session start.
  let sessionSize = $state<SessionSizeChoice>('all');
  // The exact resolved count for the drill entry currently open -- set once
  // per `handleStart` call.
  let resolvedSessionSize = $state(0);
  let widthPreset = $state<WidthPreset>(DEFAULT_SETTINGS.widthPreset);
  // Loaded once on boot, same as `widthPreset` -- Settings is unreachable
  // while Drill is mounted (no nav path exists), so this never needs a
  // live-reload mid-drill.
  let idleTimeoutMs = $state<number>(DEFAULT_SETTINGS.idleTimeoutMs);
  // Set by `handleDrillClose` when a Drill session closes (any reason);
  // drives the `summary` screen below and is cleared on "Another round".
  let summary = $state<SessionSummaryView | null>(null);
  // The running DrillSession for the current drill entry, created by the
  // practice module; unmounted along with Drill when the screen changes.
  let drillSession = $state<DrillSession | null>(null);
  // A fresh instance per drill entry: `mount()` is called exactly once per
  // adapter instance, and `Drill.svelte`'s unmount cleanup calls `destroy()`.
  let inkSurface = $state<InkSurface | null>(null);
  // Guards `handleStart` against re-entrancy: a double-tap on "Start
  // writing" (realistic on a stylus tablet) would otherwise fire it twice
  // before the first `listAll()` resolves, racing two ink surfaces into
  // existence -- the losing one never mounted or `destroy()`ed.
  let starting = false;

  // svelte-ignore state_referenced_locally
  const practiceModule = new PracticeModule({
    attemptRepository,
    tallyRepository,
    sessionRepository,
    inkSurfaceFactory,
  });

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
    // awaiting the practice module's start) is a no-op -- see `starting`'s
    // declaration.
    if (starting) return;
    starting = true;
    try {
      scope = chosenScope;
      // The one shared formula (`domain/scope.ts`'s `resolveSessionSize`) --
      // identical to what `ScopePicker`'s own live hint independently
      // computes, so the drill entry's actual sampled size can never drift
      // from what the learner saw before tapping "Start writing".
      resolvedSessionSize = resolveSessionSize(sessionSize, cardsInScope(CARDS, chosenScope).length);
      const handle = await practiceModule.start(
        chosenScope,
        resolvedSessionSize,
        idleTimeoutMs,
        handleDrillClose,
      );
      drillSession = handle.session;
      inkSurface = handle.inkSurface;
      screen = 'drill';
    } finally {
      starting = false;
    }
  }

  function handleDrillClose(closedSummary: SessionSummaryView): void {
    summary = closedSummary;
    screen = 'summary';
    drillSession = null;
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
  // opened from the Session summary: avoids adding
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
    <FirstRun settings={settingsStore} onDismiss={handlePenCheckDismissed} />
  {:else if screen === 'scope-picker'}
    <ScopePicker
      {scopePreview}
      onStart={handleStart}
      onSettings={handleOpenSettings}
      onHistory={handleOpenHistory}
      initialScope={scope}
      onScopeChange={(next) => (scope = next)}
      initialSessionSize={sessionSize}
      onSessionSizeChange={(next) => (sessionSize = next)}
    />
  {:else if screen === 'settings'}
    <Settings
      settings={settingsStore}
      {backup}
      onPresetChange={handlePresetChange}
      onBack={handleSettingsBack}
    />
  {:else if screen === 'drill' && drillSession && inkSurface}
    <Drill {drillSession} {inkSurface} />
  {:else if screen === 'summary' && summary}
    <SessionSummary {summary} onAgain={handleSummaryAgain} onHistory={handleOpenHistory} />
  {:else if screen === 'history'}
    <History history={sessionHistory} onBack={handleHistoryBack} />
  {/if}
{/if}
