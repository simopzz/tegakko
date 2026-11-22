<script lang="ts">
  import { onMount } from 'svelte';
  import type { Session } from '../../domain/session';
  import { formatDate } from './format-date';
  import { describeScope } from '../../domain/scope';
  import {
    sortSessionsDescending,
    sparklineSessions,
    rampColorForAccuracy,
    closureChipVariant,
  } from '../../domain/history';
  import ScreenShell from './ScreenShell.svelte';

  interface Props {
    history: { list(): Promise<Session[]> };
  }

  const { history }: Props = $props();
  let sessions = $state<Session[]>([]);
  let loaded = $state(false);

  onMount(() => {
    void history.list().then((listed) => {
      sessions = sortSessionsDescending(listed);
      loaded = true;
    });
  });

  const recentSessions = $derived(sparklineSessions(sessions));
</script>

<ScreenShell bookmark="Practice history">
  {#if loaded}
    {#if sessions.length > 0}
      {#if sessions.length >= 3}
        <section class="history-trend" aria-labelledby="trend-title">
          <div>
            <h2 class="section-title" id="trend-title">Recent session accuracy</h2>
            <p class="trend-caption">Last {recentSessions.length} sessions, oldest to newest</p>
          </div>
          <div class="chart" role="group" aria-label="Recent session accuracy chart">
            <div class="y-axis" aria-hidden="true"><span>100%</span><span>50%</span><span>0%</span></div>
            <div class="chart-columns">
              {#each recentSessions as entry, i (entry.id)}
                <div
                  class="chart-column"
                  role="img"
                  aria-label="{formatDate(entry.date)}: {Math.round(entry.accuracy * 100)} percent accuracy"
                >
                  <span class="bar-value">{Math.round(entry.accuracy * 100)}%</span>
                  <div class="bar-track">
                    <div
                      class="bar"
                      class:bar--latest={i === recentSessions.length - 1}
                      style={`height: ${Math.round(entry.accuracy * 100)}%; background-color: ${
                        i === recentSessions.length - 1 ? 'var(--color-accent)' : rampColorForAccuracy(entry.accuracy)
                      };`}
                    ></div>
                  </div>
                  <span class="chart-date">{formatDate(entry.date)}</span>
                </div>
              {/each}
            </div>
          </div>
        </section>
      {/if}

      <section class="history-list" aria-labelledby="sessions-title">
        <h2 class="section-title" id="sessions-title">Sessions</h2>
        <ul class="rows">
          {#each sessions as sessionItem (sessionItem.id)}
            {@const variant = closureChipVariant(sessionItem.closureReason)}
            <li class="row">
              <div class="row-head">
                <p class="date">{formatDate(sessionItem.date)}</p>
                <p class="meta">
                  {sessionItem.cardsAttempted}
                  {sessionItem.cardsAttempted === 1 ? 'card' : 'cards'} · {describeScope(sessionItem.scope)}
                </p>
                {#if variant === 'positive'}
                  <span class="chip chip--positive">Session complete</span>
                {:else if variant === 'neutral'}
                  <span class="chip chip--neutral">Closed on idle</span>
                {/if}
              </div>
              <div class="accuracy" class:dimmed={sessionItem.closureReason === 'inactivity'}>
                <span class="accuracy-value">{Math.round(sessionItem.accuracy * 100)}%</span>
                <span class="accuracy-label">accuracy</span>
              </div>
            </li>
          {/each}
        </ul>
      </section>
    {:else}
      <div class="empty-state">
        <h2 class="section-title">No sessions yet</h2>
        <p>Complete a practice session and it will be recorded here.</p>
      </div>
    {/if}
  {:else}
    <p class="loading" role="status" aria-live="polite">Loading your history…</p>
  {/if}
</ScreenShell>

<style>
  .history-trend,
  .history-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
  }

  .section-title {
    margin: 0;
    font-family: var(--font-heading);
    font-size: 1.35rem;
    line-height: 1.2;
    font-weight: 600;
    color: var(--color-ink);
  }

  .trend-caption {
    margin: 5px 0 0;
    color: var(--color-ink-muted);
    font-size: 0.88rem;
  }

  .chart {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr);
    gap: 8px;
    height: 180px;
    padding: 12px 0 2px;
  }

  .y-axis {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 0 0 22px;
    color: var(--color-ink-muted);
    font-size: 0.72rem;
    font-variant-numeric: tabular-nums;
  }

  .chart-columns {
    display: flex;
    align-items: stretch;
    justify-content: space-between;
    gap: 7px;
    min-width: 0;
    border-bottom: 1px solid var(--color-paper-line);
  }

  .chart-column {
    flex: 1;
    min-width: 0;
    display: grid;
    grid-template-rows: 18px 1fr 22px;
    justify-items: center;
    color: var(--color-ink-muted);
  }

  .bar-value {
    font-size: 0.68rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .bar-track {
    width: min(100%, 28px);
    height: 100%;
    min-height: 1px;
    display: flex;
    align-items: flex-end;
    border-bottom: 1px solid var(--color-paper-line);
  }

  .bar {
    width: 100%;
    min-height: 3px;
    border-radius: 3px 3px 0 0;
    opacity: 0.82;
  }

  .bar--latest {
    opacity: 1;
  }

  .chart-date {
    width: 100%;
    overflow: hidden;
    padding-top: 4px;
    font-size: 0.65rem;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .rows {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-3);
    padding: 16px 0;
    border-bottom: 1px solid var(--color-paper-line);
  }

  .row-head {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 5px;
    min-width: 0;
  }

  .date {
    margin: 0;
    font-family: var(--font-body);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--color-ink);
  }

  .meta {
    margin: 0;
    font-family: var(--font-body);
    color: var(--color-ink-muted);
  }

  .accuracy {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    flex: none;
    color: var(--color-accent);
  }

  .accuracy-value {
    font-family: var(--font-heading);
    font-size: 1.2rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .accuracy-label {
    color: var(--color-ink-muted);
    font-size: 0.72rem;
  }

  .accuracy.dimmed .accuracy-value {
    color: var(--color-ink-muted);
  }

  .chip {
    border-radius: var(--radius-sm);
    padding: 6px 9px;
    font-family: var(--font-label);
    font-weight: 700;
    font-size: 0.75rem;
  }

  .chip--positive {
    background: var(--color-positive-bg);
    color: var(--color-positive-fg);
  }

  .chip--neutral {
    background: var(--color-paper-warm);
    color: var(--color-ink);
  }

  .empty-state {
    padding: var(--spacing-4) 0;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
  }

  .empty-state p,
  .loading {
    margin: 0;
    color: var(--color-ink-muted);
    line-height: 1.5;
  }

  @media (max-width: 520px) {
    .chart {
      grid-template-columns: 34px minmax(0, 1fr);
    }

    .chart-columns {
      gap: 3px;
    }

    .bar-value,
    .chart-date {
      font-size: 0.58rem;
    }

    .row {
      align-items: flex-start;
    }
  }
</style>
