<script lang="ts">
  // First Run / pen-check screen. Own lightweight pointermove listener
  // (docs/adr/0002-ink-adapter-owns-its-canvas.md allows it) -- this is a
  // diagnostic surface, not the
  // drill's ink-rendering hot path, so it does not go through InkSurface.
  // Lightweight normalizedPressure/pointer handling, simplified: no stroke
  // rendering, just a live pressure readout.
  import { onMount } from 'svelte';
  import type { Result } from '../../domain/result';
  import type { Settings } from '../../domain/settings';
  import ScreenShell from './ScreenShell.svelte';

  interface Props {
    /** The composition root's settings use-case: a read and a whole-record
     * save -- this screen merges `penCheckShown` onto the record it read
     * itself, so a failed read can never persist a record built from
     * guesses. */
    settings: {
      load(): Promise<Result<Settings>>;
      save(record: Settings): Promise<Result<void>>;
    };
    onDismiss: () => void;
  }

  const { settings, onDismiss }: Props = $props();

  // `beforeinstallprompt` isn't in lib.dom's WindowEventMap -- declared here
  // instead of reaching for `any` (Chromium-only, so the install button only
  // appears there).
  interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  }

  type PenStatus = 'idle' | 'pressure-detected' | 'no-pressure';

  let penStatus = $state<PenStatus>('idle');
  let pressure = $state(0);
  let deferredInstallPrompt = $state<BeforeInstallPromptEvent | null>(null);
  let dismissError = $state<string | null>(null);

  // Distinct from `dismissError` (the rendered message, which an
  // install-prompt failure also sets): only a *persistence* attempt
  // failing should let a later tap skip straight through without
  // retrying. An install-prompt failure never even attempted a save, so
  // it must not trip this guard -- see `persistPenCheckShown` below.
  let persistenceFailed = false;

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
        if (penStatus === 'pressure-detected') {
          // Already confirmed -- keep the live readout current regardless
          // of the exact value (including a genuine 0.5 reading).
          pressure = event.pressure;
          return;
        }
        if (event.pressure !== 0.5) {
          // Any reading other than exactly 0.5 confirms a real sensor
          // immediately. 0.5 alone is ambiguous: per the W3C Pointer
          // Events spec, hardware *without* pressure support reports
          // exactly 0.5 while a pen is in contact (0 otherwise), so a
          // lone 0.5 doesn't prove anything -- it takes a differing
          // reading to confirm.
          penStatus = 'pressure-detected';
          pressure = event.pressure;
        }
      }
      // A pen event with zero pressure -- or stuck at exactly 0.5 before
      // confirmation -- doesn't prove absence of a pressure API yet (a
      // later move in the same contact might report a differing value)
      // -- only pointerup settles that, below.
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
    if (persistenceFailed) {
      // A previous *persistence* attempt already surfaced the failure note
      // -- don't hard-block a follow-up tap behind a retry the learner
      // didn't ask for; let them straight through this time.
      onDismiss();
      return;
    }
    const current = await settings.load();
    if (!current.ok) {
      // Don't silently fall back to defaults on a read failure -- that
      // would overwrite any real settings (widthPreset, etc.) the same way a
      // save failure would. Surface it identically.
      console.error('Failed to read settings before persisting penCheckShown:', current.error);
      dismissError = "Couldn't save that -- tap again to continue anyway.";
      persistenceFailed = true;
      return;
    }
    const result = await settings.save({ ...current.value, penCheckShown: true });
    if (!result.ok) {
      // Never hard-block: surface the failure (a short, generic message --
      // the technical detail is for the console, not the learner), but stay
      // on this screen so the note is actually seen at least once instead of
      // being unmounted in the same tick it appears.
      console.error('Failed to persist penCheckShown:', result.error);
      dismissError = "Couldn't save that -- tap again to continue anyway.";
      persistenceFailed = true;
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
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === 'accepted') {
        await persistPenCheckShown();
      }
    } catch (cause) {
      // The native prompt can reject (e.g. invoked a second time) --
      // surface it like a persist failure instead of leaving the Install
      // button silently gone behind an unhandled rejection.
      console.error('Install prompt failed:', cause);
      dismissError = 'Couldn\'t open the install prompt -- choose “Continue without checking” to continue.';
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

<ScreenShell bookmark="First visit">
  <h1 class="heading">Check your stylus</h1>
    <p class="body">
      Try the pad with your stylus to check pressure. This check is optional; you can continue
      without it.
    </p>

    <!-- Live region: a pen-status change is an outcome worth hearing, not
         just seeing. -->
    <div class="chip chip--{chipVariant[penStatus]}" role="status" aria-live="polite">
      {chipText[penStatus]}
    </div>

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

    <!-- Always in the DOM, even while empty: a live region inserted
         together with its content is not reliably announced. -->
    <p class="error-note" role="status" aria-live="polite">{dismissError ?? ''}</p>

    <div class="actions">
      {#if deferredInstallPrompt}
        <button type="button" class="btn btn--neutral" onclick={() => void handleInstall()}>
          Install app
        </button>
      {/if}
      <button type="button" class="btn btn--primary" onclick={handleJustUseItHere}>
        Continue without checking
      </button>
    </div>
</ScreenShell>

<style>
  .heading {
    margin: 0;
    font-family: var(--font-heading);
    font-weight: 600;
    letter-spacing: -0.025em;
    font-size: clamp(1.8rem, 4vw, 2.5rem);
    line-height: 1.15;
    color: var(--color-ink);
  }

  .body {
    margin: 0;
    font-family: var(--font-body);
    font-weight: 400;
    color: var(--color-ink-muted);
    line-height: 1.5;
    max-width: 52ch;
  }

  .chip {
    align-self: flex-start;
    border-radius: var(--radius-sm);
    padding: 9px 13px;
    font-family: var(--font-label);
    font-weight: 700;
    font-size: 0.85rem;
    letter-spacing: 0.02em;
  }
  .chip--idle {
    background: var(--color-paper-warm);
    color: var(--color-ink);
  }
  .chip--positive {
    background: var(--color-positive-bg);
    color: var(--color-positive-fg);
  }
  .chip--neutral {
    background: var(--color-paper-warm);
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
    position: relative;
    height: clamp(180px, 26vh, 260px);
    border-radius: var(--radius-sm);
    background: var(--color-surface-canvas);
    border: 1px solid var(--color-paper-line);
    display: flex;
    align-items: center;
    justify-content: center;
    touch-action: none;
    -webkit-user-select: none;
    user-select: none;
  }

  .pad::before,
  .pad::after {
    position: absolute;
    content: '';
    pointer-events: none;
    background: var(--color-grid-guide);
    opacity: 0.8;
  }

  .pad::before {
    top: 0;
    bottom: 0;
    left: 50%;
    width: 1px;
  }

  .pad::after {
    right: 0;
    left: 0;
    top: 50%;
    height: 1px;
  }

  .pad-hint {
    font-family: var(--font-body);
    position: relative;
    z-index: 1;
    color: var(--color-ink-muted);
    background: var(--color-surface-canvas);
    padding: 4px 8px;
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
    gap: var(--spacing-3);
    margin-top: var(--spacing-2);
    flex-wrap: wrap;
  }

  .btn {
    flex: 1;
    min-height: 88px;
    min-width: 180px;
    border-radius: var(--radius-sm);
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: 1rem;
    cursor: pointer;
    transition: background-color var(--motion-press), transform var(--motion-press);
  }

  .btn--primary {
    background: var(--color-accent);
    color: var(--color-accent-on-paper);
    border: none;
  }

  .btn--neutral {
    background: transparent;
    color: var(--color-ink);
    border: 1px solid var(--color-paper-line);
  }

  .btn--primary:hover {
    background: var(--color-accent-strong);
  }

  .btn--neutral:hover {
    background: var(--color-paper-warm);
  }

  .btn:active {
    transform: scale(0.99);
  }

  @media (max-width: 520px) {
    .actions {
      flex-direction: column-reverse;
    }

    .btn {
      width: 100%;
      min-width: 0;
    }
  }
</style>
