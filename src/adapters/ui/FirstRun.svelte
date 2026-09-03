<script lang="ts">
  // First Run / pen-check screen (Story 1.1). Own lightweight pointermove
  // listener per AD-2's exemption -- this is a diagnostic surface, not the
  // drill's ink-rendering hot path, so it does not go through InkSurface.
  // Behavior mirrors poc-web/index.html's normalizedPressure/pointer
  // handling, simplified: no stroke rendering, just a live pressure readout.
  import { onMount } from 'svelte';
  import type { SettingsRepository } from '../../ports/settings-repository';
  import { DEFAULT_SETTINGS } from '../../domain/settings';

  interface Props {
    settingsRepository: SettingsRepository;
    onDismiss: () => void;
  }

  const { settingsRepository, onDismiss }: Props = $props();

  // `beforeinstallprompt` isn't in lib.dom's WindowEventMap -- declared here
  // instead of reaching for `any` (Chromium-only; see Design Notes).
  interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  }

  type PenStatus = 'idle' | 'pressure-detected' | 'no-pressure';

  let penStatus = $state<PenStatus>('idle');
  let pressure = $state(0);
  let deferredInstallPrompt = $state<BeforeInstallPromptEvent | null>(null);
  let dismissError = $state<string | null>(null);

  const chipText: Record<PenStatus, string> = {
    idle: 'Touch the pad with your stylus',
    'pressure-detected': 'Stylus found',
    'no-pressure': 'No pressure input detected',
  };
  const chipVariant: Record<PenStatus, 'idle' | 'positive' | 'neutral'> = {
    idle: 'idle',
    'pressure-detected': 'positive',
    'no-pressure': 'neutral',
  };

  function evaluatePointer(event: PointerEvent): void {
    if (event.pointerType === 'pen') {
      if (event.pressure > 0) {
        penStatus = 'pressure-detected';
        pressure = event.pressure;
      }
      // A pen event with zero pressure doesn't prove absence of a pressure
      // API yet (a later move in the same contact might report one) -- only
      // pointerup settles that, below.
      return;
    }
    // Mouse or touch: never carries meaningful pressure.
    if (penStatus !== 'pressure-detected') {
      penStatus = 'no-pressure';
    }
  }

  function handlePointerUp(event: PointerEvent): void {
    if (event.pointerType === 'pen' && penStatus === 'idle') {
      penStatus = 'no-pressure';
    }
  }

  async function persistPenCheckShown(): Promise<void> {
    if (dismissError) {
      // A previous attempt already surfaced the failure note -- don't
      // hard-block a follow-up tap behind a retry the learner didn't ask
      // for; let them straight through this time.
      onDismiss();
      return;
    }
    const current = await settingsRepository.get();
    const base = current.ok ? current.value : DEFAULT_SETTINGS;
    const result = await settingsRepository.save({ ...base, penCheckShown: true });
    if (!result.ok) {
      // Never hard-block: surface the failure (a short, generic message --
      // the technical detail is for the console, not the learner), but stay
      // on this screen so the note is actually seen at least once instead of
      // being unmounted in the same tick it appears.
      console.error('Failed to persist penCheckShown:', result.error);
      dismissError = "Couldn't save that -- tap again to continue anyway.";
      return;
    }
    onDismiss();
  }

  function handleJustUseItHere(): void {
    void persistPenCheckShown();
  }

  async function handleInstall(): Promise<void> {
    const promptEvent = deferredInstallPrompt;
    if (!promptEvent) return;
    deferredInstallPrompt = null;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === 'accepted') {
      await persistPenCheckShown();
    }
  }

  onMount(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      deferredInstallPrompt = event as BeforeInstallPromptEvent;
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  });
</script>

<main class="first-run">
  <div class="card">
    <p class="label">First run</p>
    <h1 class="heading">Check your stylus</h1>
    <p class="body">
      Touch the pad below with your pen. This app is built around handwriting recall, so it's
      worth confirming pressure comes through before you start.
    </p>

    <div class="chip chip--{chipVariant[penStatus]}">{chipText[penStatus]}</div>

    {#if penStatus === 'pressure-detected'}
      <p class="readout">{pressure.toFixed(2)}</p>
    {/if}

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="pad"
      onpointerdown={evaluatePointer}
      onpointermove={evaluatePointer}
      onpointerup={handlePointerUp}
      onpointercancel={handlePointerUp}
    >
      <span class="pad-hint">touch here</span>
    </div>

    {#if dismissError}
      <p class="error-note">{dismissError}</p>
    {/if}

    <div class="actions">
      {#if deferredInstallPrompt}
        <button type="button" class="btn btn--primary" onclick={() => void handleInstall()}>
          Install
        </button>
      {/if}
      <button type="button" class="btn btn--neutral" onclick={handleJustUseItHere}>
        Just use it here
      </button>
    </div>
  </div>
</main>

<style>
  .first-run {
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
    font-weight: 400;
    color: var(--color-ink-muted);
    line-height: 1.5;
  }

  .chip {
    align-self: flex-start;
    border-radius: var(--radius-sm);
    padding: var(--spacing-1) var(--spacing-2);
    font-family: var(--font-label);
    font-weight: 700;
    font-size: 0.8rem;
    letter-spacing: 0.02em;
  }
  .chip--idle {
    background: rgba(32, 30, 29, 0.07);
    color: var(--color-ink);
  }
  .chip--positive {
    background: var(--color-positive-bg);
    color: var(--color-positive-fg);
  }
  .chip--neutral {
    background: rgba(32, 30, 29, 0.07);
    color: var(--color-ink);
  }

  .readout {
    margin: 0;
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: 2.5rem;
    color: var(--color-accent-deep);
  }

  .pad {
    height: 220px;
    border-radius: var(--radius-lg);
    background: var(--color-surface-canvas);
    border: 1px solid var(--color-grid-guide);
    display: flex;
    align-items: center;
    justify-content: center;
    touch-action: none;
    -webkit-user-select: none;
    user-select: none;
  }

  .pad-hint {
    font-family: var(--font-body);
    color: var(--color-ink-faint);
    font-size: 1rem;
    pointer-events: none;
  }

  .error-note {
    margin: 0;
    font-family: var(--font-body);
    font-size: 0.85rem;
    color: var(--color-missed-fg);
  }

  .actions {
    display: flex;
    gap: var(--spacing-2);
    margin-top: var(--spacing-2);
  }

  .btn {
    flex: 1;
    min-height: 88px;
    border-radius: var(--radius-md);
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: 1.1rem;
    cursor: pointer;
  }

  .btn--primary {
    background: var(--color-accent);
    color: var(--color-surface-card);
    border: none;
  }

  .btn--neutral {
    background: transparent;
    color: var(--color-ink);
    border: 1px solid var(--color-ink-faint);
  }
</style>
