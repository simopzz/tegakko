<script lang="ts">
  // History screen: reverse-chronological session rows plus an
  // up-to-10-session accuracy sparkline. Reads only -- no writes, no
  // editing/deleting rows. The list arrives from the composition root's
  // use-case in unspecified order, so `sortSessionsDescending` always
  // imposes History's own order before anything renders. The top bar
  // (title, Back) is rendered by the composition root.
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
    /** The composition root's use-case: the stored session list, fail-open
     * to empty -- the use-case folds and logs the failure. Order is
     * unspecified there, so `sortSessionsDescending` below always imposes
     * History's own order before anything renders. */
    history: { list(): Promise<Session[]> };
  }

  const { history }: Props = $props();

  let sessions = $state<Session[]>([]);
  let loaded = $state(false);

  // One-shot fetch, same pattern as `Settings.svelte`'s `onMount` -- no
  // live re-fetch/poll while History is mounted.
  onMount(() => {
    void history.list().then((listed) => {
      sessions = sortSessionsDescending(listed);
      loaded = true;
    });
  });

  const sparkline = $derived(sparklineSessions(sessions));
</script>

<ScreenShell>
    {#if loaded}
      {#if sessions.length > 0}
        {#if sessions.length >= 3}
          <div class="sparkline" aria-hidden="true">
          {#each sparkline as entry, i (entry.id)}
            <div
              class="bar"
              style={`height: ${Math.round(entry.accuracy * 100)}%; background-color: ${
                i === sparkline.length - 1 ? 'var(--color-accent)' : rampColorForAccuracy(entry.accuracy)
              };`}
            ></div>
          {/each}
          </div>
        {/if}

        <ul class="rows">
          {#each sessions as sessionItem (sessionItem.id)}
            {@const variant = closureChipVariant(sessionItem.closureReason)}
            <li class="row">
              <div class="row-left">
                <div class="row-head">
                  <p class="date">{formatDate(sessionItem.date)}</p>
                  <p class="meta">
                    {sessionItem.cardsAttempted}
                    {sessionItem.cardsAttempted === 1 ? 'card' : 'cards'} · {describeScope(
                      sessionItem.scope,
                    )}
                  </p>
                </div>
                {#if variant === 'positive'}
                  <span class="chip chip--positive">Session complete</span>
                {:else if variant === 'neutral'}
                  <span class="chip chip--neutral">Closed on idle</span>
                {/if}
              </div>
              <p class="accuracy" class:dimmed={sessionItem.closureReason === 'inactivity'}>
                {Math.round(sessionItem.accuracy * 100)}%
              </p>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="empty">No sessions yet. Finish a drill to see it here.</p>
      {/if}
    {/if}
</ScreenShell>

<style>
  .sparkline {
    display: flex;
    align-items: flex-end;
    gap: var(--spacing-1);
    height: 96px;
    padding: 0 var(--spacing-1);
  }

  .bar {
    flex: 1;
    border-radius: var(--radius-full);
    min-width: 8px;
    min-height: 4px;
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
    padding: var(--spacing-4) var(--spacing-1);
  }

  .row:not(:last-child) {
    border-bottom: 1px solid var(--color-ink-faint);
  }

  .row-left {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
  }

  .date {
    margin: 0;
    font-family: var(--font-body);
    font-weight: 600;
    color: var(--color-ink);
  }

  .row-head {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1);
  }

  .meta {
    margin: 0;
    font-family: var(--font-body);
    color: var(--color-ink-muted);
  }

  .accuracy {
    margin: 0;
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: 1.25rem;
    color: var(--color-accent-deep);
  }

  .accuracy.dimmed {
    color: var(--color-ink-muted);
  }

  .chip {
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

  .chip--neutral {
    background: rgba(32, 30, 29, 0.07);
    color: var(--color-ink);
  }

  .empty {
    margin: 0;
    text-align: center;
    font-family: var(--font-body);
    color: var(--color-ink-muted);
    padding: var(--spacing-4) 0;
  }
</style>
