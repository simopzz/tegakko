<script lang="ts">
  // Scope picker screen. Follows FirstRun.svelte's pattern: its own scoped
  // style block using existing theme tokens, callback props, no local
  // routing. Pill-toggle groups commit immediately (no confirm step) and
  // drive a live card-count recompute (see docs/design.md).
  import { onMount, untrack } from 'svelte';
  import type { CardRepository } from '../../ports/card-repository';
  import type { TallyRepository } from '../../ports/tally-repository';
  import {
    cardsInScope,
    FULL_SCOPE,
    resolveSessionSize,
    type Scope,
    type SessionSizeChoice,
  } from '../../domain/scope';
  import { countShaky, type Tally } from '../../domain/tally';
  import type { Script, CardKind } from '../../domain/cards';

  function capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  interface Props {
    cardRepository: CardRepository;
    tallyRepository: TallyRepository;
    /** The composition root's `handleStart` is `async` (it awaits
     * `listAll()` before entering the drill) -- `void | Promise<void>`
     * reflects that without forcing this component to await it itself. */
    onStart: (scope: Scope) => void | Promise<void>;
    onSettings: () => void;
    onHistory: () => void;
    /** Seeds the pill groups on mount. This screen is unmounted whenever the
     * drill or Settings is open, so the composition root -- not this
     * component -- is what keeps a selection alive across a Back
     * (`onScopeChange` feeds it, this prop restores it). */
    initialScope?: Scope;
    onScopeChange?: (scope: Scope) => void;
    /** A second, independent pill group for the
     * session-size choice. Mirrors `initialScope`/`onScopeChange` exactly --
     * seeds the pill on mount, reports every change so Back (via Settings)
     * restores it. Deliberately not threaded into `onStart` itself (that
     * signature stays `(scope: Scope) => ...`) -- the composition root
     * resolves this into an exact card
     * count via `domain/scope.ts`'s `resolveSessionSize` inside its own
     * `handleStart`, from the `sessionSize` state reported through
     * `onSessionSizeChange`. */
    initialSessionSize?: SessionSizeChoice;
    onSessionSizeChange?: (choice: SessionSizeChoice) => void;
  }

  const {
    cardRepository,
    tallyRepository,
    onStart,
    onSettings,
    onHistory,
    initialScope,
    onScopeChange,
    initialSessionSize,
    onSessionSizeChange,
  }: Props = $props();

  // Fetched once on mount, fails open to `[]` -- mirrors `App.svelte`'s
  // settings-read fallback: a tally-fetch failure still shows "0 shaky"
  // rather than blocking the Scope picker.
  let tallies = $state<Tally[]>([]);
  onMount(() => {
    void tallyRepository
      .getAll()
      .then((result) => {
        if (result.ok) tallies = result.value;
      })
      .catch((error: unknown) => {
        console.error('Failed to load tallies:', error);
      });
  });

  // `$derived`, not a plain top-level read, so Svelte doesn't warn about
  // capturing only `cardRepository`'s initial value (state_referenced_locally)
  // -- in practice this recomputes once, since the catalog is static bundled
  // data and `cardRepository` itself never changes over this
  // component's lifetime.
  const allCards = $derived(cardRepository.getAll());

  type ScriptChoice = 'both' | Script;
  type SetChoice = 'all' | CardKind;

  // A restored `Scope` maps back onto the pill choices unambiguously: a
  // two-entry array is the unnarrowed "Both", anything else is the single
  // narrowed value. `untrack` because this is a deliberate one-shot seed --
  // the props are read for their initial value only, and Svelte otherwise
  // warns (state_referenced_locally) about exactly that.
  let scriptChoice = $state<ScriptChoice>(
    untrack(() => {
      const scripts = initialScope?.scripts;
      return scripts && scripts.length === 1 && scripts[0] ? scripts[0] : 'both';
    }),
  );
  let setChoice = $state<SetChoice>(
    untrack(() => {
      const units = initialScope?.units;
      return units && units.length === 1 && units[0] ? units[0] : 'all';
    }),
  );
  // Restored verbatim -- unlike `scriptChoice`/`setChoice`, there is no
  // `Scope`-shaped round trip to unambiguously re-derive here, so the prop
  // carries the discrete choice itself.
  let sizeChoice = $state<SessionSizeChoice>(untrack(() => initialSessionSize ?? 'all'));

  // "Both"/"All" fall back to `FULL_SCOPE`'s own arrays -- not a re-typed
  // literal -- so this can never silently drift from the domain's definition
  // of "unnarrowed" (verification-gap: ScopePicker used to duplicate the
  // literal instead of importing it).
  const scope = $derived<Scope>({
    scripts: scriptChoice === 'both' ? FULL_SCOPE.scripts : [scriptChoice],
    units: setChoice === 'all' ? FULL_SCOPE.units : [setChoice],
  });

  const scopedCount = $derived(cardsInScope(allCards, scope).length);

  // Live recompute, not a cached number: a percentage of a
  // changed scope is already a valid value for that scope, so there is no
  // separate "clamp" step when the scope narrows or widens underneath an
  // already-made choice. `resolveSessionSize` is the one shared formula
  // (`domain/scope.ts`) -- this hint can never drift from what
  // `App.svelte`'s `handleStart` independently resolves and actually
  // samples.
  const effectiveSessionSize = $derived(resolveSessionSize(sizeChoice, scopedCount));

  // Informational only: recomputed
  // live on every script/set toggle, but never fed back into
  // `sampleSessionCards`' weighting.
  const shakyCount = $derived(countShaky(cardsInScope(allCards, scope), tallies));

  // Chip labels are derived from `scope` itself, not re-branched from
  // `scriptChoice`/`setChoice` a second time, so the chips the learner sees
  // can never drift from the scope actually handed to `onStart`.
  const scriptChipLabels = $derived(scope.scripts.map(capitalize));
  const setChipLabels = $derived(scope.units.map(capitalize));

  // Report every change, not just the one at "Start writing" -- Settings can
  // be opened mid-selection, and coming back must land on the same pills.
  $effect(() => {
    onScopeChange?.(scope);
  });

  // Mirrors the `onScopeChange` effect above, one-for-one: reports every
  // change (not just the one at "Start writing"), since Settings can be
  // opened mid-pick and coming back must land on the same segment.
  $effect(() => {
    onSessionSizeChange?.(sizeChoice);
  });

  function handleStart(): void {
    onStart(scope);
  }
</script>

<main class="scope-picker">
  <div class="card">
    <!-- Settings is a text link, not a second accent-filled control: exactly
         one primary action per screen, and that is "Start writing". -->
    <div class="header">
      <p class="label">Scope</p>
      <div class="header-links">
        <button type="button" class="link" onclick={onHistory}>History</button>
        <button type="button" class="link" onclick={onSettings}>Settings</button>
      </div>
    </div>
    <h1 class="heading">What are we testing today?</h1>

    <div class="group">
      <p class="group-label">Script</p>
      <div class="pill-group" role="radiogroup" aria-label="Script">
        <button
          type="button"
          class="pill"
          class:pill--active={scriptChoice === 'both'}
          role="radio"
          aria-checked={scriptChoice === 'both'}
          aria-label="Both scripts"
          tabindex={scriptChoice === 'both' ? 0 : -1}
          onclick={() => (scriptChoice = 'both')}
        >
          Both
        </button>
        <button
          type="button"
          class="pill"
          class:pill--active={scriptChoice === 'hiragana'}
          role="radio"
          aria-checked={scriptChoice === 'hiragana'}
          tabindex={scriptChoice === 'hiragana' ? 0 : -1}
          onclick={() => (scriptChoice = 'hiragana')}
        >
          Hiragana
        </button>
        <button
          type="button"
          class="pill"
          class:pill--active={scriptChoice === 'katakana'}
          role="radio"
          aria-checked={scriptChoice === 'katakana'}
          tabindex={scriptChoice === 'katakana' ? 0 : -1}
          onclick={() => (scriptChoice = 'katakana')}
        >
          Katakana
        </button>
      </div>
    </div>

    <div class="group">
      <p class="group-label">Set</p>
      <div class="pill-group" role="radiogroup" aria-label="Set">
        <button
          type="button"
          class="pill"
          class:pill--active={setChoice === 'all'}
          role="radio"
          aria-checked={setChoice === 'all'}
          aria-label="Both sets"
          tabindex={setChoice === 'all' ? 0 : -1}
          onclick={() => (setChoice = 'all')}
        >
          Both
        </button>
        <button
          type="button"
          class="pill"
          class:pill--active={setChoice === 'base'}
          role="radio"
          aria-checked={setChoice === 'base'}
          tabindex={setChoice === 'base' ? 0 : -1}
          onclick={() => (setChoice = 'base')}
        >
          Base
        </button>
        <button
          type="button"
          class="pill"
          class:pill--active={setChoice === 'yoon'}
          role="radio"
          aria-checked={setChoice === 'yoon'}
          tabindex={setChoice === 'yoon' ? 0 : -1}
          onclick={() => (setChoice = 'yoon')}
        >
          Yoon
        </button>
      </div>
    </div>

    <div class="group">
      <p class="group-label">Session size</p>
      <div class="pill-group" role="radiogroup" aria-label="Session size">
        <button
          type="button"
          class="pill"
          class:pill--active={sizeChoice === 0.25}
          role="radio"
          aria-checked={sizeChoice === 0.25}
          tabindex={sizeChoice === 0.25 ? 0 : -1}
          onclick={() => (sizeChoice = 0.25)}
        >
          25%
        </button>
        <button
          type="button"
          class="pill"
          class:pill--active={sizeChoice === 0.5}
          role="radio"
          aria-checked={sizeChoice === 0.5}
          tabindex={sizeChoice === 0.5 ? 0 : -1}
          onclick={() => (sizeChoice = 0.5)}
        >
          50%
        </button>
        <button
          type="button"
          class="pill"
          class:pill--active={sizeChoice === 0.75}
          role="radio"
          aria-checked={sizeChoice === 0.75}
          tabindex={sizeChoice === 0.75 ? 0 : -1}
          onclick={() => (sizeChoice = 0.75)}
        >
          75%
        </button>
        <button
          type="button"
          class="pill"
          class:pill--active={sizeChoice === 'all'}
          role="radio"
          aria-checked={sizeChoice === 'all'}
          tabindex={sizeChoice === 'all' ? 0 : -1}
          onclick={() => (sizeChoice = 'all')}
        >
          All
        </button>
      </div>
      <!-- Never threaded into `onStart` itself (see the prop docstring
           above) -- `App.svelte`'s `handleStart` independently resolves the
           same `resolveSessionSize` formula, so this hint can never drift
           from what the session actually samples. -->
      <p class="hint">{effectiveSessionSize} {effectiveSessionSize === 1 ? 'card' : 'cards'} this session</p>
    </div>

    <div class="count-card">
      <p class="count-value">{scopedCount} {scopedCount === 1 ? 'card' : 'cards'} in scope</p>
      <div class="chips">
        {#each scriptChipLabels as label (label)}
          <span class="chip chip--positive">{label}</span>
        {/each}
        {#each setChipLabels as label (label)}
          <span class="chip chip--positive">{label}</span>
        {/each}
        <span class="chip chip--missed">{shakyCount} shaky</span>
      </div>
    </div>

    <button type="button" class="btn btn--primary" onclick={handleStart}> Start writing </button>
  </div>
</main>

<style>
  .scope-picker {
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
    gap: var(--spacing-4);
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-3);
  }

  .header-links {
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

  .label {
    margin: 0;
    font-family: var(--font-label);
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    font-size: 0.75rem;
    color: var(--color-ink-muted);
  }

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

  .hint {
    margin: 0;
    font-family: var(--font-body);
    font-size: 0.9rem;
    color: var(--color-ink-muted);
  }

  .count-card {
    background: var(--color-surface-card-secondary);
    border-radius: var(--radius-xl);
    padding: var(--spacing-4);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
  }

  .count-value {
    margin: 0;
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: 1.5rem;
    color: var(--color-ink);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-1);
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

  .chip--missed {
    background: var(--color-missed-bg);
    color: var(--color-missed-fg);
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
