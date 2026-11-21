<script lang="ts">
  // The one top bar every screen shares (docs/design.md): the back control
  // on the left, the screen's micro-label title beside it, History/Settings
  // text links on the right wherever that screen offers them -- and nowhere
  // else. The composition root renders it for every screen but Drill;
  // Drill renders its own instance, where the progress readout and the
  // "I'm done" closure control (a session closure, not back-navigation)
  // live next to the queue position only it knows.
  interface Props {
    /** Micro-label screen title. Absent on Drill (its header is the
     * progress readout, not a title). */
    title?: string;
    /** The bar's back control. Absent where there is nothing to go back
     * to (First run, Scope picker). Drill passes "I'm done" instead. */
    backLabel?: string;
    onBack?: () => void;
    onHistory?: () => void;
    onSettings?: () => void;
    /** Screen-entry focus (History, Summary): the bar outlives the screen
     * below it, so entry focus moves onto its title here rather than into
     * the screen. shortcut: summary -> history keeps focus (the prop stays
     * true across that hop, so the effect does not refire) -- acceptable,
     * the focused element is the title either way. */
    focusTitle?: boolean;
    /** Set by the composition root while Settings' import warning is open:
     * the bar sits outside the screen's own inert main, so it is inerted
     * separately -- no keyboard escape from the modal. */
    inert?: boolean;
    /** Drill's sampled-queue readout: "N / total" beside the progress bar,
     * always shown together, never the bar alone. */
    progress?: { now: number; total: number };
  }

  const {
    title,
    backLabel = 'Back',
    onBack,
    onHistory,
    onSettings,
    focusTitle = false,
    inert = false,
    progress,
  }: Props = $props();

  let titleEl: HTMLHeadingElement | undefined = $state();
  $effect(() => {
    if (focusTitle) titleEl?.focus();
  });
</script>

<header class="top-bar" inert={inert}>
  {#if onBack}
    <button type="button" class="back" onclick={onBack}>{backLabel}</button>
  {/if}
  {#if title}
    <h1 class="title" tabindex="-1" bind:this={titleEl}>{title}</h1>
  {/if}
  {#if progress}
    <div class="progress">
      <p class="counter">{progress.now} / {progress.total}</p>
      <div
        class="bar"
        role="progressbar"
        aria-label="Cards written"
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.now}
      >
        <div class="bar-fill" style="width: {(progress.now / progress.total) * 100}%"></div>
      </div>
    </div>
  {/if}
  {#if onHistory || onSettings}
    <nav class="links">
      {#if onHistory}
        <button type="button" class="link" onclick={onHistory}>History</button>
      {/if}
      {#if onSettings}
        <button type="button" class="link" onclick={onSettings}>Settings</button>
      {/if}
    </nav>
  {/if}
</header>

<style>
  .top-bar {
    display: flex;
    align-items: center;
    gap: var(--spacing-3);
    padding: var(--spacing-2) var(--spacing-4);
    border-bottom: 1px solid var(--color-ink-hairline);
    flex: none;
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

  .title {
    /* Fills the bar so the nav links sit at the far right. */
    flex: 1;
    margin: 0;
    font-family: var(--font-label);
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    font-size: 0.75rem;
    color: var(--color-ink-muted);
  }

  .title:focus {
    outline: none;
  }

  .progress {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1);
  }

  .counter {
    margin: 0;
    font-family: var(--font-body);
    font-size: 0.95rem;
    color: var(--color-ink-muted);
  }

  .bar {
    height: 6px;
    border-radius: var(--radius-full);
    background: var(--color-ink-hairline);
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    border-radius: var(--radius-full);
    background: var(--color-accent);
  }

  .links {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
  }

  .link {
    min-height: 56px;
    padding: 0 var(--spacing-2);
    border: none;
    background: transparent;
    color: var(--color-accent-strong);
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: 1rem;
    cursor: pointer;
  }
</style>
