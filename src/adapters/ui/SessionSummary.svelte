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
  import { describeScope } from '../../domain/scope';
  import ScreenShell from './ScreenShell.svelte';

  interface Props {
    summary: SessionSummaryView;
    onAgain: () => void;
  }

  const { summary, onAgain }: Props = $props();

  const scriptLabel: Record<string, string> = {
    hiragana: 'Hiragana',
    katakana: 'Katakana',
    kanji: 'Kanji',
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

<ScreenShell bookmark="Session notes">
  <h1 class="heading">Session summary</h1>
  <p class="scope-line">{describeScope(summary.scope)}</p>

  {#if summary.closureReason === 'explicit'}
    <span class="chip chip--positive">Session ended by you</span>
  {/if}

  <div class="stats" aria-label="Session details">
    <div class="stat">
      <p class="stat-label">Cards</p>
      <p class="stat-value">{summary.cardsAttempted}</p>
    </div>
    <div class="stat">
      <p class="stat-label">Time</p>
      <p class="stat-value">{formatTime(summary.timeMs)}</p>
    </div>
    <div class="stat">
      <p class="stat-label">Reveals</p>
      <p class="stat-value">{summary.revealCount}</p>
    </div>
    <div class="stat stat--accuracy">
      <p class="stat-label">Accuracy</p>
      <p class="stat-value">{Math.round(summary.accuracy * 100)}%</p>
    </div>
  </div>

  {#if summary.missed.length > 0}
    <section class="missed" aria-labelledby="missed-title">
      <h2 class="group-label" id="missed-title">Cards missed this session</h2>
      <ul class="missed-list" aria-label="Cards missed this session">
        {#each summary.missed as chip (chip.cardId)}
          <li class="missed-row">
            <span class="chip-glyph">{chip.grapheme}</span>
            <span>{scriptLabel[chip.script] ?? chip.script}</span>
            <span class="miss-count">Missed {chip.missCount} {chip.missCount === 1 ? 'time' : 'times'}</span>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  <button type="button" class="btn btn--primary" onclick={onAgain}>Choose another scope</button>
</ScreenShell>

<style>
  .heading {
    margin: 0;
    font-family: var(--font-heading);
    font-weight: 600;
    letter-spacing: -0.025em;
    font-size: clamp(1.8rem, 4vw, 2.35rem);
    line-height: 1.14;
    color: var(--color-ink);
  }

  .scope-line {
    margin: 0;
    color: var(--color-ink-muted);
    font-size: 1rem;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    border-radius: var(--radius-sm);
    padding: 8px 12px;
    font-family: var(--font-label);
    font-weight: 700;
    font-size: 0.85rem;
  }

  .chip--positive {
    background: var(--color-positive-bg);
    color: var(--color-positive-fg);
  }

  .stats {
    display: flex;
    flex-wrap: wrap;
    padding: var(--spacing-3) 0;
    border-top: 1px solid var(--color-paper-line);
    border-bottom: 1px solid var(--color-paper-line);
  }

  .stat {
    flex: 1;
    min-width: 100px;
    padding: 4px var(--spacing-2);
    display: flex;
    flex-direction: column;
    gap: 5px;
    border-right: 1px solid var(--color-paper-line);
  }

  .stat:first-child {
    padding-left: 0;
  }

  .stat:last-child {
    border-right: 0;
  }

  .stat-label {
    margin: 0;
    font-family: var(--font-label);
    font-weight: 700;
    font-size: 0.8rem;
    color: var(--color-ink-muted);
  }

  .stat-value {
    margin: 0;
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: 1.25rem;
    font-variant-numeric: tabular-nums;
    color: var(--color-ink);
  }

  .stat--accuracy .stat-value {
    color: var(--color-mark);
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

  .missed-list {
    display: flex;
    flex-direction: column;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .missed-row {
    display: grid;
    grid-template-columns: minmax(48px, auto) minmax(100px, 1fr) auto;
    align-items: center;
    gap: var(--spacing-2);
    padding: 11px 0;
    border-bottom: 1px solid var(--color-paper-line);
  }

  .missed-row:first-child {
    border-top: 1px solid var(--color-paper-line);
  }

  .chip-glyph {
    width: 46px;
    min-height: 44px;
    display: grid;
    place-items: center;
    background: var(--color-missed-bg);
    color: var(--color-missed-fg);
    font-family: var(--font-glyph-ink);
    font-size: 1.45rem;
    line-height: 1;
  }

  .miss-count {
    color: var(--color-ink-muted);
    font-size: 0.9rem;
    text-align: right;
  }

  .btn {
    min-height: 88px;
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

  .btn--primary:hover {
    background: var(--color-accent-strong);
  }

  .btn--primary:active {
    transform: scale(0.99);
  }

  @media (max-width: 520px) {
    .stat {
      flex-basis: calc(50% - 1px);
      border-right: 0;
      padding: 8px 10px;
    }

    .missed-row {
      grid-template-columns: 44px 1fr;
    }

    .miss-count {
      grid-column: 2;
      text-align: left;
      margin-top: -8px;
    }
  }
</style>
