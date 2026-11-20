<script lang="ts">
  // Settings screen: the ink-width pill toggle, the idle-close threshold
  // toggle, Backup/Export, and Import with its confirm-before-replace warning
  // toast.
  //
  // Reuses ScopePicker.svelte's `.pill`/`.pill--active` markup and its
  // radiogroup semantics: exactly one active segment, commits immediately,
  // no confirm step.
  import { onMount, tick } from 'svelte';
  import type { SettingsRepository } from '../../ports/settings-repository';
  import type { ProgressExporter } from '../../ports/progress-exporter';
  import type { PendingImport, ProgressImporter } from '../../ports/progress-importer';
  import { err, type Result } from '../../domain/result';
  import { isInvalidImportError } from '../../domain/import';
  import { formatDate } from './format-date';
  import { DEFAULT_SETTINGS, type Settings, type WidthPreset } from '../../domain/settings';

  interface Props {
    settingsRepository: SettingsRepository;
    progressExporter: ProgressExporter;
    progressImporter: ProgressImporter;
    onPresetChange: (preset: WidthPreset) => void;
    onBack: () => void;
  }

  const { settingsRepository, progressExporter, progressImporter, onPresetChange, onBack }: Props = $props();

  const PRESETS: Array<{ value: WidthPreset; label: string; hint: string }> = [
    { value: 'subtle', label: 'Subtle', hint: 'Even line, slight taper' },
    { value: 'expressive', label: 'Expressive', hint: 'Clear pressure response' },
    { value: 'calligraphy', label: 'Calligraphy', hint: 'Hairline to bold, brush-like' },
  ];

  // 5 min stays the default, matching `DEFAULT_SETTINGS.idleTimeoutMs`.
  const IDLE_PRESETS: Array<{ value: number; label: string }> = [
    { value: 120_000, label: '2 min' },
    { value: 300_000, label: '5 min' },
    { value: 600_000, label: '10 min' },
  ];

  // The last *successfully read* settings record. Every save is a
  // read-modify-write onto this, never a record rebuilt from
  // `DEFAULT_SETTINGS` -- otherwise saving a width preset would silently
  // clobber `penCheckShown` (re-showing First Run) and `idleTimeoutMs`.
  let lastRead = $state<Settings | null>(null);
  let preset = $state<WidthPreset>(DEFAULT_SETTINGS.widthPreset);
  let idleTimeoutMs = $state<number>(DEFAULT_SETTINGS.idleTimeoutMs);
  // The one-time boot read can fail before either control has a baseline --
  // shown once, globally, since neither toggle is usable yet either way.
  let readNote = $state<string | null>(null);
  // Separate per control (fixed from an earlier shared-`note` bug): a failed
  // save on one control must never be silently cleared -- nor trigger a
  // spurious re-save -- by tapping the *other* control's already-active
  // segment.
  let widthNote = $state<string | null>(null);
  let idleNote = $state<string | null>(null);
  let loaded = $state(false);
  // Export's own note -- independent of the settings notes above.
  let exportNote = $state<string | null>(null);
  // In-flight guard: a second tap while an export is running is a no-op, so
  // exactly one file downloads.
  let exporting = false;

  // Import. `pending` holds a validated file between the warning
  // toast and Replace/Cancel -- nothing is written until `confirmImport()`.
  // `$state.raw`, not `$state`: deep `$state` wraps the records in Proxies,
  // which IndexedDB's structured clone rejects ("could not be cloned"), so
  // every confirmed import would abort. `pending` is only ever reassigned
  // whole, never mutated, so it needs no deep reactivity.
  let importNote = $state<string | null>(null);
  let pending = $state.raw<PendingImport | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);
  let cancelButton = $state<HTMLButtonElement | null>(null);
  let importButton = $state<HTMLButtonElement | null>(null);
  // In-flight guards: a second pick while one is being read/validated, or a
  // second Replace tap while one is applying, is a no-op -- exactly one
  // `apply()` per confirmation.
  let preparing = false;
  let applying = $state(false);

  const INVALID_NOTE = "That file isn't a tegakko backup -- nothing was changed.";
  const FAILED_NOTE = "Couldn't import -- nothing was changed.";

  function toErr<T>(error: unknown): Result<T> {
    return err<T>(error instanceof Error ? error : new Error(String(error)));
  }

  // Focus goes to Cancel whenever the warning opens -- the safe default for
  // the only destructive two-step action in the app.
  $effect(() => {
    if (pending && cancelButton) cancelButton.focus();
  });

  // Serializes `choose()`/`chooseIdle()`'s writes onto one queue. Without
  // this, two saves fired before either resolves would each read `lastRead`
  // from a snapshot captured before waiting -- whichever save's `.then`
  // happened to run last would then persist a record built from a *stale*
  // baseline, silently reverting the other control's already-applied
  // change. Chaining every write through this one queue means each write
  // only starts once the previous one (and its `lastRead` update) has fully
  // settled, so it always merges its patch onto the truly freshest record.
  let saveQueue: Promise<void> = Promise.resolve();

  function persist(
    patch: Partial<Settings>,
    logLabel: string,
    setNote: (message: string | null) => void,
  ): Promise<void> {
    const run = saveQueue.then(async () => {
      if (!lastRead) return;
      const updated: Settings = { ...lastRead, ...patch };
      const result = await settingsRepository.save(updated);
      if (!result.ok) {
        console.error(logLabel, result.error);
        setNote("Couldn't save that -- it'll apply for now but won't stick.");
        return;
      }
      lastRead = updated;
    });
    saveQueue = run;
    return run;
  }

  onMount(() => {
    void settingsRepository.get().then((result) => {
      if (result.ok) {
        lastRead = result.value;
        preset = result.value.widthPreset;
        idleTimeoutMs = result.value.idleTimeoutMs;
      } else {
        // Render, but inert: with no known baseline there is nothing safe to
        // write back, so the toggles show their defaults and save nothing
        // rather than persisting a record assembled from guesses.
        console.error('Failed to read settings:', result.error);
        readNote = "Couldn't load your settings -- nothing can be changed right now.";
      }
      loaded = true;
    });
  });

  async function choose(next: WidthPreset): Promise<void> {
    // Re-tapping the already-active preset is normally a no-op, but if the
    // last save of it failed (`widthNote` is still showing), it's the only
    // way to retry -- switching away and back would also work, but
    // shouldn't be required.
    if (!lastRead || (next === preset && !widthNote)) return;

    // Optimistic: the toggle moves and the drill picks the new range up
    // immediately, even if persistence then fails -- this run stays usable.
    preset = next;
    widthNote = null;
    onPresetChange(next);

    await persist({ widthPreset: next }, 'Failed to save ink-width preset:', (message) => {
      widthNote = message;
    });
  }

  // Mirrors `choose()` exactly -- optimistic update, queued read-modify-write
  // against the freshest `lastRead`, its own `idleNote`.
  async function chooseIdle(next: number): Promise<void> {
    if (!lastRead || (next === idleTimeoutMs && !idleNote)) return;

    idleTimeoutMs = next;
    idleNote = null;

    await persist({ idleTimeoutMs: next }, 'Failed to save idle-close threshold:', (message) => {
      idleNote = message;
    });
  }

  async function runExport(): Promise<void> {
    if (exporting) return;
    exporting = true;
    exportNote = null;
    // One Backup note at a time: a stale import note never sits beside this.
    importNote = null;
    try {
      // A rejection is folded into `err` too, so the note always shows.
      const result = await progressExporter.export().catch((error: unknown) =>
        err<void>(error instanceof Error ? error : new Error(String(error))),
      );
      if (!result.ok) {
        console.error('Failed to export progress:', result.error);
        exportNote = "Couldn't export -- try again.";
      }
    } finally {
      exporting = false;
    }
  }

  function pickImportFile(): void {
    if (preparing || applying || pending) return;
    fileInput?.click();
  }

  async function handleFileChange(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    // Reset after every pick so choosing the same file again (e.g. after a
    // Cancel) still fires `change`.
    input.value = '';
    if (!file || preparing || applying || pending) return;
    preparing = true;
    importNote = null;
    exportNote = null;
    try {
      let json: string;
      try {
        json = await file.text();
      } catch (error) {
        console.error('Failed to read import file:', error);
        importNote = FAILED_NOTE;
        return;
      }
      const result = await progressImporter.prepare(json).catch(toErr<PendingImport>);
      if (!result.ok) {
        console.error('Failed to prepare import:', result.error);
        importNote = isInvalidImportError(result.error) ? INVALID_NOTE : FAILED_NOTE;
        return;
      }
      pending = result.value;
    } finally {
      preparing = false;
    }
  }

  // Closing unmounts the focused Cancel button; hand focus back to Import
  // (once `main` is no longer inert) instead of letting it fall to body.
  async function closeWarning(): Promise<void> {
    pending = null;
    await tick();
    importButton?.focus();
  }

  function cancelImport(): void {
    if (applying) return;
    void closeWarning();
  }

  async function confirmImport(): Promise<void> {
    if (applying || !pending) return;
    applying = true;
    const toApply = pending;
    try {
      const result = await progressImporter.apply(toApply).catch(toErr<void>);
      if (result.ok) {
        importNote = 'Imported. Your progress now matches the file.';
      } else {
        console.error('Failed to import progress:', result.error);
        importNote = FAILED_NOTE;
      }
    } finally {
      applying = false;
      await closeWarning();
    }
  }

  function handleDialogKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelImport();
    }
  }
</script>

<main class="settings" inert={pending !== null}>
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

    {#if widthNote}
      <p class="note" role="status" aria-live="polite">{widthNote}</p>
    {/if}

    <h1 class="heading">Idle close</h1>
    <p class="body">How long with no interaction before a session closes on its own.</p>

    {#if loaded}
      <div class="pill-group" role="radiogroup" aria-label="Idle close">
        {#each IDLE_PRESETS as option (option.value)}
          <button
            type="button"
            class="pill"
            class:pill--active={idleTimeoutMs === option.value}
            class:pill--inert={!lastRead}
            role="radio"
            aria-checked={idleTimeoutMs === option.value}
            aria-disabled={!lastRead}
            tabindex={idleTimeoutMs === option.value ? 0 : -1}
            onclick={() => void chooseIdle(option.value)}
          >
            {option.label}
          </button>
        {/each}
      </div>
    {/if}

    {#if idleNote}
      <p class="note" role="status" aria-live="polite">{idleNote}</p>
    {/if}

    {#if readNote}
      <p class="note" role="status" aria-live="polite">{readNote}</p>
    {/if}

    <h1 class="heading">Backup</h1>
    <p class="body">Download your tallies, attempts, handwriting and history as one file.</p>
    <button type="button" class="action" onclick={() => void runExport()}>Export</button>

    {#if exportNote}
      <p class="note" role="status" aria-live="polite">{exportNote}</p>
    {/if}

    <p class="body">Restore from a backup file. This replaces everything stored here.</p>
    <button type="button" class="action" onclick={pickImportFile} bind:this={importButton}>
      Import
    </button>
    <input
      bind:this={fileInput}
      class="file-input"
      type="file"
      accept=".json,application/json"
      tabindex="-1"
      aria-hidden="true"
      data-testid="import-file"
      onchange={(event) => void handleFileChange(event)}
    />

    {#if importNote}
      <p class="note" role="status" aria-live="polite">{importNote}</p>
    {/if}
  </div>
</main>

{#if pending}
  <!-- The app's only modal, the import warning: a full-screen scrim blocks
       the screen, `main` above goes `inert`, and the peach toast holds the
       two text-only actions. -->
  <div class="scrim">
    <div
      class="toast"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="import-warning-title"
      aria-describedby="import-warning-dates"
      tabindex="-1"
      onkeydown={handleDialogKeydown}
    >
      <p class="toast-headline" id="import-warning-title">
        Importing replaces everything here — tallies, attempts, history.
      </p>
      <div class="toast-dates" id="import-warning-dates">
        <p class="toast-detail">
          {pending.localDate
            ? `On this device: last practiced ${formatDate(pending.localDate)}`
            : 'On this device: nothing yet'}
        </p>
        <p class="toast-detail">In the file: {formatDate(pending.fileDate)}</p>
      </div>
      <div class="toast-actions">
        <button
          type="button"
          class="toast-action toast-action--cancel"
          disabled={applying}
          onclick={cancelImport}
          bind:this={cancelButton}
        >
          Cancel
        </button>
        <button
          type="button"
          class="toast-action toast-action--confirm"
          disabled={applying}
          onclick={() => void confirmImport()}
        >
          Replace everything
        </button>
      </div>
    </div>
  </div>
{/if}

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

  .back,
  .action {
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

  .action {
    align-self: flex-start;
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

  /* Opened only programmatically, from the visible Import button. */
  .file-input {
    display: none;
  }

  .scrim {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--spacing-6);
    background: rgba(32, 30, 29, 0.32);
  }

  /* Copied from Drill.svelte's post-grade `.toast`:
     peach missed-tint card, xl radius, the single card shadow. */
  .toast {
    width: 100%;
    max-width: 640px;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
    padding: 30px 34px;
    border-radius: var(--radius-xl);
    background: var(--color-missed-bg);
    box-shadow: 0 12px 32px rgba(46, 43, 37, 0.18);
  }

  .toast-headline {
    margin: 0;
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: 1.5rem;
    color: var(--color-accent-on-peach);
  }

  .toast-dates {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1);
  }

  .toast-detail {
    margin: 0;
    font-size: 1rem;
    color: var(--color-accent-on-peach);
  }

  .toast-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--spacing-3);
  }

  /* Text-only actions: no fill, no border. */
  .toast-action {
    min-height: 56px;
    padding: 0 var(--spacing-3);
    border: none;
    background: transparent;
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: 1.1rem;
    cursor: pointer;
  }

  .toast-action--confirm {
    color: var(--color-accent-strong);
  }

  .toast-action--cancel {
    color: var(--color-ink-muted);
  }

  .toast-action:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
