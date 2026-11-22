<script lang="ts">
  // Script and Set choices are derived from the catalog. The writing desk
  // keeps every choice explicit while describing the groups in plain language.
  import { onMount, untrack } from 'svelte';
  import { cardsInScope, FULL_SCOPE, resolveSessionSize } from '../../domain/scope';
  import type { Scope, SessionSizeChoice } from '../../domain/scope';
  import { countShaky, type Tally } from '../../domain/tally';
  import { CARDS, type CardSet, type Script } from '../../domain/cards';
  import ScreenShell from './ScreenShell.svelte';
  import { handleRadioKeys } from './radio-keys';

  function capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function setLabel(script: Script, set: CardSet): string {
    if (script === 'kanji') return `JLPT ${set.toUpperCase()}`;
    return set === 'base' ? 'Single kana' : 'Combined sounds';
  }

  function setDetail(script: Script, set: CardSet): string {
    if (script === 'kanji') return 'Kanji in this level';
    return set === 'base' ? 'Base forms and voiced kana' : 'Two kana written together';
  }

  interface Props {
    /** The composition root's preview use-case: fresh stored miss counts,
     * fail-open to none. The counts themselves are pure domain over the
     * static bundled catalog, computed below. */
    scopePreview: { tallies(): Promise<Tally[]> };
    /** The composition root's `handleStart` is `async` (it awaits the
     * practice module's start) -- `void | Promise<void>` reflects that
     * without forcing this component to await it itself. */
    onStart: (scope: Scope) => void | Promise<void>;
    /** Seeds the selection on mount. This screen is unmounted while Drill,
     * Settings or History is open, so the composition root -- not this
     * component -- is what keeps a selection alive across a Back
     * (`onScopeChange` feeds it, this prop restores it). */
    initialScope?: Scope;
    onScopeChange?: (scope: Scope) => void;
    /** A second, independent pill group for the session-size choice.
     * Mirrors `initialScope`/`onScopeChange` exactly. Deliberately not
     * threaded into `onStart` itself -- the composition root resolves this
     * into an exact card count via `domain/scope.ts`'s
     * `resolveSessionSize` inside its own `handleStart`. */
    initialSessionSize?: SessionSizeChoice;
    onSessionSizeChange?: (choice: SessionSizeChoice) => void;
  }

  const {
    scopePreview,
    onStart,
    initialScope,
    onScopeChange,
    initialSessionSize,
    onSessionSizeChange,
  }: Props = $props();

  // Fetched once on mount, fails open to [] -- the use-case folds the
  // failure and logs it, so a tally-fetch failure still shows "0 shaky"
  // rather than blocking the Scope picker.
  let tallies = $state<Tally[]>([]);
  onMount(() => {
    void scopePreview.tallies().then((loaded) => {
      tallies = loaded;
    });
  });

  // The catalog decides what can be picked: first-appearance order puts
  // scripts and Sets in catalog order, and a future script (kanji) needs
  // no change here once its cards exist.
  const scripts = [...new Set(CARDS.map((card) => card.script))] as Script[];
  const setsByScript = new Map<Script, CardSet[]>(
    scripts.map((script) => [
      script,
      [...new Set(CARDS.filter((card) => card.script === script).map((card) => card.set))] as CardSet[],
    ]),
  );

  // A plain mutable copy (frozen arrays would throw under $state proxies):
  // the scope itself is the single source of truth -- pills read from it,
  // toggles write it, nothing translates between a "choice" type and it.
  function cloneScope(scope: Scope): Scope {
    return Object.fromEntries(
      Object.entries(scope).map(([script, sets]) => [script, [...(sets ?? [])]]),
    ) as Scope;
  }

  let scope = $state<Scope>(untrack(() => cloneScope(initialScope ?? FULL_SCOPE)));

  const selectedScripts = $derived(scripts.filter((script) => scope[script] !== undefined));

  function toggleScript(script: Script): void {
    if (scope[script] === undefined) {
      // Re-selecting a script restores its full Set row -- the widest
      // guaranteed-valid scope for it.
      scope = { ...scope, [script]: [...(setsByScript.get(script) ?? [])] };
      return;
    }
    // The last selected script stays on: an empty scope has no cards, so
    // no session could ever start from it.
    if (selectedScripts.length === 1) return;
    const next = { ...scope };
    delete next[script];
    scope = next;
  }

  function toggleSet(script: Script, set: CardSet): void {
    const current = scope[script] ?? [];
    if (!current.includes(set)) {
      scope = { ...scope, [script]: [...current, set] };
      return;
    }
    // A selected script always keeps at least one Set.
    if (current.length === 1) return;
    scope = { ...scope, [script]: current.filter((candidate) => candidate !== set) };
  }

  const SIZE_CHOICES: readonly SessionSizeChoice[] = [10, 20, 50, 'all'];
  let sizeChoice = $state<SessionSizeChoice>(untrack(() => initialSessionSize ?? 'all'));

  const scopedCards = $derived(cardsInScope(CARDS, scope));
  const shakyCount = $derived(countShaky(scopedCards, tallies));

  // Report every change, not just the one at "Start writing" -- Settings or
  // History can be opened mid-selection, and coming back must land on the
  // same pills. A snapshot, never the $state proxy itself: proxies are not
  // structured-cloneable (coding-standards.md rule 9).
  $effect(() => {
    onScopeChange?.($state.snapshot(scope));
  });

  // Mirrors the `onScopeChange` effect above, one-for-one.
  $effect(() => {
    onSessionSizeChange?.(sizeChoice);
  });

  function handleStart(): void {
    // Snapshot for the same reason as `onScopeChange` above.
    onStart($state.snapshot(scope));
  }
</script>

<ScreenShell bookmark="Today's scope">
  <div class="scope-layout">
  <h1 class="heading">What would you like to write?</h1>
  <p class="intro">Choose a writing system, then set the size of your session.</p>

  <div class="group">
    <p class="group-label">Writing systems</p>
    <div class="option-row" role="group" aria-label="Writing systems">
      {#each scripts as script (script)}
        <button
          type="button"
          class="option"
          class:option--active={scope[script] !== undefined}
          aria-pressed={scope[script] !== undefined}
          onclick={() => toggleScript(script)}
        >
          <span>{capitalize(script)}</span>
          {#if script === 'kanji'}<small>JLPT levels</small>{/if}
        </button>
      {/each}
    </div>
  </div>

  {#each selectedScripts as script (script)}
    <div class="group">
      <p class="group-label">{capitalize(script)} groups</p>
      <div class="option-row option-row--sets" role="group" aria-label="{capitalize(script)} groups">
        {#each setsByScript.get(script) ?? [] as set (set)}
          <button
            type="button"
            class="option option--set"
            class:option--active={scope[script]?.includes(set) === true}
            aria-pressed={scope[script]?.includes(set) === true}
            onclick={() => toggleSet(script, set)}
          >
            <span>{setLabel(script, set)}</span>
            <small>{setDetail(script, set)}</small>
          </button>
        {/each}
      </div>
    </div>
  {/each}

  <div class="group">
    <p class="group-label">How many cards?</p>
    <div
      class="pill-group"
      role="radiogroup"
      aria-label="Session size"
      tabindex="-1"
      onkeydown={(event) => handleRadioKeys(event, SIZE_CHOICES, (next) => (sizeChoice = next))}
    >
      {#each SIZE_CHOICES as choice (choice)}
        <button
          type="button"
          class="size-choice"
          class:size-choice--active={sizeChoice === choice}
          role="radio"
          aria-checked={sizeChoice === choice}
          tabindex={sizeChoice === choice ? 0 : -1}
          onclick={() => (sizeChoice = choice)}
        >
          {choice === 'all' ? 'All available' : choice}
        </button>
      {/each}
    </div>
  </div>

  <div class="summary" aria-live="polite">
    <div class="summary-main">
      <span>Session</span>
      <strong>{resolveSessionSize(sizeChoice, scopedCards.length)} cards</strong>
    </div>
    <p>{scopedCards.length} available · {shakyCount} with recent misses</p>
    <p class="summary-note">Cards missed recently are sampled sooner in future sessions.</p>
  </div>
  </div>

  <button type="button" class="btn btn--primary" onclick={handleStart}>Start writing</button>
</ScreenShell>

<style>
  .scope-layout {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-4);
  }

  .heading {
    margin: 0;
    font-family: var(--font-heading);
    font-weight: 600;
    letter-spacing: -0.025em;
    font-size: clamp(1.7rem, 4vw, 2.35rem);
    line-height: 1.14;
    color: var(--color-ink);
  }

  .intro {
    margin: -8px 0 4px;
    max-width: 48ch;
    color: var(--color-ink-muted);
    line-height: 1.5;
  }

  .group {
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

  .option-row {
    display: flex;
    gap: 10px;
  }

  .option {
    flex: 1;
    min-width: 0;
    min-height: 62px;
    padding: 10px 12px;
    border: 1px solid var(--color-paper-line);
    border-radius: var(--radius-sm);
    background: var(--color-paper);
    color: var(--color-ink);
    font-family: var(--font-body);
    font-weight: 600;
    font-size: 0.95rem;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 3px;
    text-align: left;
    transition: background-color var(--motion-state), border-color var(--motion-state), color var(--motion-state);
  }

  .option small {
    color: var(--color-ink-muted);
    font-size: 0.75rem;
    font-weight: 400;
    line-height: 1.25;
  }

  .option--active {
    border-color: var(--color-accent);
    background: var(--color-accent);
    color: var(--color-accent-on-paper);
  }

  .option--active small {
    color: rgba(251, 246, 235, 0.86);
  }

  .option-row--sets {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  }

  .option--set {
    min-height: 68px;
  }

  .size-choice {
    flex: 1;
    min-width: 0;
    min-height: 52px;
    padding: 8px 10px;
    border: 1px solid var(--color-paper-line);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-ink);
    font-family: var(--font-body);
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: background-color var(--motion-state), border-color var(--motion-state), color var(--motion-state);
  }

  .size-choice--active {
    border-color: var(--color-accent);
    background: var(--color-accent);
    color: var(--color-accent-on-paper);
  }

  .summary {
    margin: 2px 0 0;
    padding: var(--spacing-3) 0 0;
    border-top: 1px solid var(--color-paper-line);
  }

  .summary-main {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--spacing-2);
    color: var(--color-ink-muted);
  }

  .summary-main strong {
    color: var(--color-ink);
    font-family: var(--font-heading);
    font-size: 1.2rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .summary p {
    margin: 0;
    padding-top: 5px;
    color: var(--color-ink-muted);
    font-size: 0.9rem;
  }

  .btn {
    min-height: 88px;
    border-radius: var(--radius-sm);
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: 1.15rem;
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
    .scope-layout {
      gap: 10px;
    }

    .option-row {
      gap: 7px;
    }

    .option {
      padding: 9px 8px;
      font-size: 0.82rem;
    }

    .option small {
      font-size: 0.68rem;
    }

    .option-row--sets {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .option--set {
      min-height: 62px;
    }

    .size-choice {
      padding-inline: 4px;
      font-size: 0.77rem;
    }

    .btn {
      min-height: 72px;
    }
  }
</style>
