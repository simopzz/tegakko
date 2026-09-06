<script lang="ts">
  // Composition root (AD-1): the only place concrete adapters are
  // constructed and wired. Reads settings once on boot -- `penCheckShown`
  // decides whether First Run shows, `widthPreset` is held here and pushed
  // into the ink adapter (AD-12's single screen variable drives the rest).
  import { onMount } from 'svelte';
  import type { Screen } from '../adapters/ui/screens';
  import FirstRun from '../adapters/ui/FirstRun.svelte';
  import ScopePicker from '../adapters/ui/ScopePicker.svelte';
  import Drill from '../adapters/ui/Drill.svelte';
  import Settings from '../adapters/ui/Settings.svelte';
  import { IdbSettingsRepository } from '../adapters/persistence/settings-repository';
  import { IdbAttemptRepository } from '../adapters/persistence/attempt-repository';
  import { InMemoryCardRepository } from '../adapters/content/card-repository';
  import { CanvasInkSurface } from '../adapters/ink/canvas-ink-surface';
  import type { InkSurface } from '../ports/ink-surface';
  import { cardsInScope, FULL_SCOPE, type Scope } from '../domain/scope';
  import { DEFAULT_SETTINGS, type WidthPreset } from '../domain/settings';
  import type { Card } from '../domain/cards';

  const settingsRepository = new IdbSettingsRepository();
  const attemptRepository = new IdbAttemptRepository();
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
  let drillCards = $state<Card[]>([]);
  let widthPreset = $state<WidthPreset>(DEFAULT_SETTINGS.widthPreset);
  // A fresh instance per drill entry: `mount()` is called exactly once per
  // adapter instance, and `Drill.svelte`'s unmount cleanup calls `destroy()`.
  let inkSurface = $state<InkSurface | null>(null);

  onMount(() => {
    void settingsRepository.get().then((result) => {
      // First Run never hard-blocks: an unreadable settings store just means
      // we fall back to showing First Run rather than skipping it silently,
      // and the ink width stays at its default.
      screen = result.ok && result.value.penCheckShown ? 'scope-picker' : 'pen-check';
      if (result.ok) widthPreset = result.value.widthPreset;
      ready = true;
    });
  });

  function handlePenCheckDismissed(): void {
    screen = 'scope-picker';
  }

  function handleStart(chosenScope: Scope): void {
    scope = chosenScope;
    drillCards = cardsInScope(cardRepository.getAll(), chosenScope);
    const surface = new CanvasInkSurface({ colors: INK_COLORS });
    surface.setWidthPreset(widthPreset);
    inkSurface = surface;
    screen = 'drill';
  }

  function handleDrillBack(): void {
    screen = 'scope-picker';
    inkSurface = null;
  }

  function handleOpenSettings(): void {
    screen = 'settings';
  }

  function handleSettingsBack(): void {
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
      onStart={handleStart}
      onSettings={handleOpenSettings}
      initialScope={scope}
      onScopeChange={(next) => (scope = next)}
    />
  {:else if screen === 'settings'}
    <Settings {settingsRepository} onPresetChange={handlePresetChange} onBack={handleSettingsBack} />
  {:else if screen === 'drill' && inkSurface}
    <Drill cards={drillCards} {inkSurface} {attemptRepository} onBack={handleDrillBack} />
  {/if}
{/if}
