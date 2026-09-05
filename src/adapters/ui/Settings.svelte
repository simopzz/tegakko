<script lang="ts">
  // Settings screen (Story 1.3): the ink-width pill toggle only. Story 1.9
  // adds the idle threshold here.
  //
  // Reuses ScopePicker.svelte's `.pill`/`.pill--active` markup and its
  // radiogroup semantics: exactly one active segment, commits immediately,
  // no confirm step.
  import { onMount } from 'svelte';
  import type { SettingsRepository } from '../../ports/settings-repository';
  import { DEFAULT_SETTINGS, type Settings, type WidthPreset } from '../../domain/settings';

  interface Props {
    settingsRepository: SettingsRepository;
    onPresetChange: (preset: WidthPreset) => void;
    onBack: () => void;
  }

  const { settingsRepository, onPresetChange, onBack }: Props = $props();

  const PRESETS: Array<{ value: WidthPreset; label: string; hint: string }> = [
    { value: 'subtle', label: 'Subtle', hint: 'Even line, slight taper' },
    { value: 'expressive', label: 'Expressive', hint: 'Clear pressure response' },
    { value: 'calligraphy', label: 'Calligraphy', hint: 'Hairline to bold, brush-like' },
  ];

  // The last *successfully read* settings record. Every save is a
  // read-modify-write onto this, never a record rebuilt from
  // `DEFAULT_SETTINGS` -- otherwise saving a width preset would silently
  // clobber `penCheckShown` (re-showing First Run) and `idleTimeoutMs`.
  let lastRead = $state<Settings | null>(null);
  let preset = $state<WidthPreset>(DEFAULT_SETTINGS.widthPreset);
  let note = $state<string | null>(null);
  let loaded = $state(false);

  onMount(() => {
    void settingsRepository.get().then((result) => {
      if (result.ok) {
        lastRead = result.value;
        preset = result.value.widthPreset;
      } else {
        // Render, but inert: with no known baseline there is nothing safe to
        // write back, so the toggle shows the default and saves nothing
        // rather than persisting a record assembled from guesses.
        console.error('Failed to read settings:', result.error);
        note = "Couldn't load your settings -- ink width can't be changed right now.";
      }
      loaded = true;
    });
  });

  async function choose(next: WidthPreset): Promise<void> {
    const baseline = lastRead;
    // Re-tapping the already-active preset is normally a no-op, but if the
    // last save of it failed (`note` is still showing), it's the only way to
    // retry -- switching away and back would also work, but shouldn't be
    // required.
    if (!baseline || (next === preset && !note)) return;

    // Optimistic: the toggle moves and the drill picks the new range up
    // immediately, even if persistence then fails -- this run stays usable.
    preset = next;
    note = null;
    onPresetChange(next);

    const updated: Settings = { ...baseline, widthPreset: next };
    const result = await settingsRepository.save(updated);
    if (!result.ok) {
      console.error('Failed to save ink-width preset:', result.error);
      note = "Couldn't save that -- it'll apply for now but won't stick.";
      return;
    }
    lastRead = updated;
  }
</script>

<main class="settings">
  <div class="card">
    <header class="header">
      <button type="button" class="back" onclick={onBack}>Back</button>
      <p class="label">Settings</p>
    </header>

    <h1 class="heading">Ink width</h1>
    <p class="body">How much the stroke thickens as you press harder. Applies to your next stroke.</p>

    {#if loaded}
      <div class="pill-group" role="radiogroup" aria-label="Ink width">
        {#each PRESETS as option (option.value)}
          <button
            type="button"
            class="pill"
            class:pill--active={preset === option.value}
            class:pill--inert={!lastRead}
            role="radio"
            aria-checked={preset === option.value}
            aria-disabled={!lastRead}
            tabindex={preset === option.value ? 0 : -1}
            onclick={() => void choose(option.value)}
          >
            {option.label}
          </button>
        {/each}
      </div>

      <p class="hint">{PRESETS.find((option) => option.value === preset)?.hint ?? ''}</p>
    {/if}

    {#if note}
      <p class="note" role="status" aria-live="polite">{note}</p>
    {/if}
  </div>
</main>

<style>
  .settings {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: var(--spacing-6);
  }

  .card {
    width: 100%;
    max-width: 640px;
    background: var(--color-surface-card);
    border-radius: var(--radius-xl);
    box-shadow: 0 12px 32px rgba(32, 30, 29, 0.16);
    padding: var(--spacing-6);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
  }

  .header {
    display: flex;
    align-items: center;
    gap: var(--spacing-3);
  }

  .back {
    min-height: 56px;
    padding: 0 var(--spacing-3);
    border: 1px solid var(--color-ink-faint);
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--color-ink);
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: 1rem;
    cursor: pointer;
  }

  .label {
    margin: 0;
    font-family: var(--font-label);
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    font-size: 0.75rem;
    color: var(--color-ink-muted);
  }

  .heading {
    margin: 0;
    font-family: var(--font-heading);
    font-weight: 600;
    letter-spacing: -0.02em;
    font-size: 2rem;
    color: var(--color-ink);
  }

  .body {
    margin: 0;
    font-family: var(--font-body);
    color: var(--color-ink-muted);
    line-height: 1.5;
  }

  .pill-group {
    display: flex;
    gap: var(--spacing-1);
    background: var(--color-surface-card-secondary);
    border-radius: var(--radius-sm);
    padding: var(--spacing-1);
  }

  .pill {
    flex: 1;
    min-height: 56px;
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--color-ink);
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: 1rem;
    cursor: pointer;
  }

  .pill--active {
    background: var(--color-accent);
    color: var(--color-surface-card);
  }

  .pill--inert {
    opacity: 0.4;
    cursor: default;
  }

  .hint {
    margin: 0;
    font-family: var(--font-body);
    font-size: 0.9rem;
    color: var(--color-ink-muted);
  }

  .note {
    margin: 0;
    font-family: var(--font-body);
    font-size: 0.85rem;
    color: var(--color-missed-fg);
  }
</style>
