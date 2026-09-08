<script lang="ts">
  // History screen (Story 1.10): reverse-chronological session rows plus an
  // up-to-10-session accuracy sparkline. Follows Settings.svelte's structural
  // pattern exactly -- a single `.card` centered in `main`, header outside
  // the `{#if loaded}` gate, one-shot `onMount` read, no live re-fetch/poll
  // while mounted.
  //
  // Reads only via `sessionRepository.list()` -- no writes, no
  // editing/deleting rows (Boundaries & Constraints). `list()`'s own order is
  // unspecified per its port docstring, so `sortSessionsDescending` always
  // imposes History's own order before anything renders.
  import { onMount } from 'svelte';
  import type { SessionRepository } from '../../ports/session-repository';
  import type { Session } from '../../domain/session';
  import { err } from '../../domain/result';
  import { formatDate } from './format-date';
  import {
    sortSessionsDescending,
    sparklineSessions,
    rampColorForAccuracy,
    closureChipVariant,
  } from '../../domain/history';

  interface Props {
    sessionRepository: SessionRepository;
    onBack: () => void;
  }

  const { sessionRepository, onBack }: Props = $props();

  let sessions = $state<Session[]>([]);
  let loaded = $state(false);

  // Move keyboard/screen-reader focus onto the "History" heading on entry --
  // mirrors `SessionSummary.svelte`'s identical `heading?.focus()` pattern.
  let heading: HTMLHeadingElement | undefined = $state();
  onMount(() => {
    heading?.focus();
  });

  // One-shot fetch, same pattern as `Settings.svelte`'s `onMount` -- no
  // live re-fetch/poll while History is mounted. Mirrors `App.svelte`'s
  // `attemptRepository.listAll().catch(...)` handling: a rejected promise is
  // converted into the same `Result` shape a resolved `{ ok: false }` already
  // is, so both of a repository's possible failure paths fail open through
  // one branch, leaving `sessions` empty and logging via `console.error`.
  onMount(() => {
    void sessionRepository
      .list()
      .catch((error: unknown) =>
        err<Session[]>(error instanceof Error ? error : new Error(String(error))),
      )
      .then((result) => {
        if (result.ok) {
          sessions = sortSessionsDescending(result.value);
        } else {
          console.error('Failed to load sessions:', result.error);
        }
        loaded = true;
      });
  });

  const sparkline = $derived(sparklineSessions(sessions));
</script>

<main class="history">
  <div class="card">
    <header class="header">
      <button type="button" class="back" onclick={onBack}>Back</button>
      <h1 class="label" tabindex="-1" bind:this={heading}>History</h1>
    </header>

    {#if loaded}
      {#if sessions.length > 0}
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

        <ul class="rows">
          {#each sessions as sessionItem (sessionItem.id)}
            {@const variant = closureChipVariant(sessionItem.closureReason)}
            <li class="row">
              <div class="row-left">
                <p class="date">{formatDate(sessionItem.date)}</p>
                {#if variant === 'positive'}
                  <span class="chip chip--positive">Whole scope</span>
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
  </div>
</main>

<style>
  .history {
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
