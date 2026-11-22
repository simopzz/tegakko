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
  <span class="brand" aria-label="tegakko">tegakko</span>
  <div class="bar-context">
    {#if onBack}
      <button type="button" class="back" onclick={onBack}>{backLabel}</button>
    {/if}
    {#if title}
      <h1 class="title" tabindex="-1" bind:this={titleEl}>{title}</h1>
    {/if}
  </div>
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
    gap: var(--spacing-4);
    min-height: 76px;
    padding: 10px clamp(16px, 4vw, 40px);
    background: var(--color-accent);
    color: var(--color-accent-on-paper);
    flex: none;
  }

  .brand {
    flex: none;
    color: var(--color-accent-on-paper);
    font-family: var(--font-display);
    font-size: 1.45rem;
    font-weight: 600;
    letter-spacing: -0.025em;
  }

  .bar-context {
    display: flex;
    align-items: center;
    gap: var(--spacing-3);
    min-width: 0;
  }

  .back {
    min-height: 48px;
    padding: 0 var(--spacing-2);
    border: 1px solid rgba(251, 246, 235, 0.42);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-accent-on-paper);
    font-family: var(--font-body);
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;
    transition: background var(--motion-press), border-color var(--motion-press);
  }

  .title {
    flex: none;
    margin: 0;
    color: rgba(251, 246, 235, 0.78);
    font-family: var(--font-body);
    font-weight: 500;
    font-size: 0.9rem;
  }

  .title:focus {
    outline: 3px solid var(--color-paper);
    outline-offset: 4px;
    border-radius: var(--radius-sm);
  }

  .progress {
    flex: 1;
    min-width: 90px;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1);
  }

  .counter {
    margin: 0;
    font-family: var(--font-body);
    font-size: 0.85rem;
    font-variant-numeric: tabular-nums;
    color: rgba(251, 246, 235, 0.82);
  }

  .bar {
    height: 4px;
    border-radius: var(--radius-full);
    background: rgba(251, 246, 235, 0.25);
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    border-radius: var(--radius-full);
    background: var(--color-mark);
  }

  .links {
    display: flex;
    align-items: center;
    gap: var(--spacing-3);
    margin-left: auto;
  }

  .link {
    position: relative;
    min-height: 48px;
    padding: 0 2px;
    border: none;
    background: transparent;
    color: rgba(251, 246, 235, 0.88);
    font-family: var(--font-body);
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;
    transition: color var(--motion-press);
  }

  .back:hover,
  .link:hover {
    color: var(--color-paper);
  }

  .back:hover {
    background: rgba(251, 246, 235, 0.08);
    border-color: rgba(251, 246, 235, 0.7);
  }

  @media (max-width: 560px) {
    .top-bar {
      flex-wrap: wrap;
      gap: 8px 14px;
      min-height: 68px;
      padding: 10px 16px;
    }

    .brand {
      font-size: 1.25rem;
    }

    .bar-context {
      gap: 10px;
    }

    .title,
    .link,
    .back {
      font-size: 0.82rem;
    }

    .progress {
      order: 3;
      flex-basis: 100%;
      flex-direction: row;
      align-items: center;
    }

    .progress .bar {
      flex: 1;
    }

    .links {
      gap: 14px;
    }
  }
</style>
