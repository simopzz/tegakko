<script lang="ts">
  // Scope picker screen (docs/design.md): script is a multi-select, each
  // selected script gets its own Set row, session size is a fixed count
  // clamped to the scope, and one "N cards · M shaky" line sums the scope
  // up. Scripts and their Sets derive from the catalog, so a third script
  // slots into the same layout when its cards land in `CARDS`.
  import { onMount, untrack } from 'svelte';
  import { cardsInScope, FULL_SCOPE } from '../../domain/scope';
  import type { Scope, SessionSizeChoice } from '../../domain/scope';
  import { countShaky, type Tally } from '../../domain/tally';
  import { CARDS, type CardSet, type Script } from '../../domain/cards';
  import ScreenShell from './ScreenShell.svelte';
  import { handleRadioKeys } from './radio-keys';

  function capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
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

<ScreenShell>
  <h1 class="heading">What are we testing today?</h1>

  <div class="group">
    <p class="group-label">Script</p>
    <div class="pill-group" role="group" aria-label="Script">
      {#each scripts as script (script)}
        <button
          type="button"
          class="pill"
          class:pill--active={scope[script] !== undefined}
          aria-pressed={scope[script] !== undefined}
          onclick={() => toggleScript(script)}
        >
          {capitalize(script)}
        </button>
      {/each}
    </div>
  </div>

  {#each selectedScripts as script (script)}
    <div class="group">
      <p class="group-label">{capitalize(script)} Sets</p>
      <div class="pill-group" role="group" aria-label="{capitalize(script)} Sets">
        {#each setsByScript.get(script) ?? [] as set (set)}
          <button
            type="button"
            class="pill"
            class:pill--active={scope[script]?.includes(set) === true}
            aria-pressed={scope[script]?.includes(set) === true}
            onclick={() => toggleSet(script, set)}
          >
            {capitalize(set)}
          </button>
        {/each}
      </div>
    </div>
  {/each}

  <div class="group">
    <p class="group-label">Session size</p>
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
          class="pill"
          class:pill--active={sizeChoice === choice}
          role="radio"
          aria-checked={sizeChoice === choice}
          tabindex={sizeChoice === choice ? 0 : -1}
          onclick={() => (sizeChoice = choice)}
        >
          {choice === 'all' ? 'All' : choice}
        </button>
      {/each}
    </div>
  </div>

  <!-- One line, live: the scope's size and how many shaky cards it holds.
       A count preset larger than the scope clamps silently at Start. -->
  <p class="summary" aria-live="polite">{scopedCards.length} cards · {shakyCount} shaky</p>

  <button type="button" class="btn btn--primary" onclick={handleStart}> Start writing </button>
</ScreenShell>

<style>
  .heading {
    margin: 0;
    font-family: var(--font-heading);
    font-weight: 600;
    letter-spacing: -0.02em;
    font-size: 2rem;
    color: var(--color-ink);
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

  .pill-group {
    display: flex;
    gap: var(--spacing-1);
    background: var(--color-surface-card-secondary);
    border-radius: var(--radius-sm);
    padding: var(--spacing-1);
  }

  .pill {
    flex: 1;
    min-height: 56px;
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--color-ink);
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: 1rem;
    cursor: pointer;
  }

  .pill--active {
    background: var(--color-accent);
    color: var(--color-surface-card);
  }

  .summary {
    margin: 0;
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: 1.25rem;
    color: var(--color-ink);
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
