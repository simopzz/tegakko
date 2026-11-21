<script lang="ts">
  // Session Summary screen: the climax of every session closure
  // (explicit "I'm done", complete closure, retroactively-detected
  // inactivity). No local routing -- the exits are the bar's Back and
  // History/Settings links plus "Another round", all owned by the
  // composition root.
  //
  // Idle and complete closures render identically here: only an explicit
  // close ever carries the positive "You ended it" chip -- the
  // idle/complete distinction is History's concern.
  import type { SessionSummaryView } from '../../domain/session';

  interface Props {
    summary: SessionSummaryView;
    onAgain: () => void;
  }

  const { summary, onAgain }: Props = $props();

  const scriptLabel: Record<string, string> = {
    hiragana: 'Hiragana',
    katakana: 'Katakana',
  };

  // `M:SS`, floored to the whole second -- no centisecond precision needed
  // for a session-length readout.
  function formatTime(timeMs: number): string {
    const totalSeconds = Math.max(0, Math.floor(timeMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }
</script>

<main class="summary">
  <div class="content">
    <div class="hero">
      <p class="accuracy">{Math.round(summary.accuracy * 100)}%</p>
      <p class="accuracy-label">Accuracy</p>
    </div>

    {#if summary.closureReason === 'explicit'}
      <div class="chips">
        <span class="chip chip--positive">You ended it</span>
      </div>
    {/if}

    <div class="stats">
      <div class="stat-tile">
        <p class="stat-label">Time</p>
        <p class="stat-value">{formatTime(summary.timeMs)}</p>
      </div>
      <div class="stat-tile">
        <p class="stat-label">Reveals</p>
        <p class="stat-value">{summary.revealCount}</p>
      </div>
    </div>

    {#if summary.missed.length > 0}
      <div class="missed">
        <p class="group-label">Missed this time</p>
        <ul class="missed-chips" aria-label="Missed cards">
          {#each summary.missed as chip (chip.cardId)}
            <li class="chip chip--missed">
              <span class="chip-glyph">{chip.grapheme}</span>
              <span class="chip-count">
                {scriptLabel[chip.script] ?? chip.script} · missed {chip.missCount}
              </span>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    <button type="button" class="btn btn--primary" onclick={onAgain}>Another round</button>
  </div>
</main>

<style>
  .summary {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    background: var(--color-surface-card);
    display: flex;
    flex-direction: column;
    padding: var(--spacing-6);
  }

  /* `margin: auto` centres the content when it is shorter than the screen
     and resolves to zero when it is taller (no clipped overflow, unlike
     justify-content centring in a scroll container). */
  .content {
    width: 100%;
    max-width: 640px;
    margin: auto;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-4);
  }

  .hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-1);
    padding: var(--spacing-3) 0;
  }

  .accuracy {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 600;
    letter-spacing: -0.02em;
    font-size: 4.5rem;
    line-height: 1;
    color: var(--color-accent-deep);
  }

  .accuracy-label {
    margin: 0;
    font-family: var(--font-label);
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    font-size: 0.75rem;
    color: var(--color-ink-muted);
  }

  .chips {
    display: flex;
    justify-content: center;
    gap: var(--spacing-1);
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-1);
    border-radius: var(--radius-sm);
    padding: var(--spacing-1) var(--spacing-2);
    font-family: var(--font-label);
    font-weight: 700;
    font-size: 0.8rem;
    letter-spacing: 0.02em;
  }

  .chip--positive {
    background: var(--color-positive-bg);
    color: var(--color-positive-fg);
  }

  .chip--missed {
    background: var(--color-missed-bg);
    color: var(--color-missed-fg);
  }

  .chip-glyph {
    font-family: var(--font-glyph-ink);
    font-size: 1.1rem;
    line-height: 1;
  }

  .stats {
    display: flex;
    gap: var(--spacing-2);
  }

  .stat-tile {
    flex: 1;
    background: var(--color-surface-card-secondary);
    border-radius: var(--radius-lg);
    padding: var(--spacing-3);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1);
  }

  .stat-label {
    margin: 0;
    font-family: var(--font-label);
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    font-size: 0.75rem;
    color: var(--color-ink-muted);
  }

  .stat-value {
    margin: 0;
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: 1.5rem;
    color: var(--color-ink);
  }

  .missed {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
  }

  .group-label {
    margin: 0;
    font-family: var(--font-label);
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    font-size: 0.75rem;
    color: var(--color-ink-muted);
  }

  .missed-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-1);
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .btn {
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
</style>
