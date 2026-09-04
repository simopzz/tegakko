<script lang="ts">
  // Scope picker screen (Story 1.2). Follows FirstRun.svelte's pattern: its
  // own scoped style block using existing theme tokens, callback props, no
  // local routing. Pill-toggle groups commit immediately (no confirm step)
  // and drive a live card-count recompute -- see EXPERIENCE.md's Component
  // Patterns and this story's frozen Intent.
  import type { CardRepository } from '../../ports/card-repository';
  import { cardsInScope, type Scope } from '../../domain/scope';
  import type { Script, CardKind } from '../../domain/cards';

  interface Props {
    cardRepository: CardRepository;
    onStart: (scope: Scope) => void;
  }

  const { cardRepository, onStart }: Props = $props();

  // `$derived`, not a plain top-level read, so Svelte doesn't warn about
  // capturing only `cardRepository`'s initial value (state_referenced_locally)
  // -- in practice this recomputes once, since the catalog is static bundled
  // data (AD-3) and `cardRepository` itself never changes over this
  // component's lifetime.
  const allCards = $derived(cardRepository.getAll());

  type ScriptChoice = 'both' | Script;
  type SetChoice = 'all' | CardKind;

  let scriptChoice = $state<ScriptChoice>('both');
  let setChoice = $state<SetChoice>('all');

  const scope = $derived<Scope>({
    scripts: scriptChoice === 'both' ? ['hiragana', 'katakana'] : [scriptChoice],
    units: setChoice === 'all' ? ['base', 'yoon'] : [setChoice],
  });

  const scopedCount = $derived(cardsInScope(allCards, scope).length);

  const scriptChipLabels = $derived(
    scriptChoice === 'both' ? ['Hiragana', 'Katakana'] : [scriptChoice === 'hiragana' ? 'Hiragana' : 'Katakana'],
  );
  const setChipLabels = $derived(
    setChoice === 'all' ? ['Base', 'Yoon'] : [setChoice === 'base' ? 'Base' : 'Yoon'],
  );

  function handleStart(): void {
    onStart(scope);
  }
</script>

<main class="scope-picker">
  <div class="card">
    <p class="label">Scope</p>
    <h1 class="heading">What are we testing today?</h1>

    <div class="group">
      <p class="group-label">Script</p>
      <div class="pill-group" role="group" aria-label="Script">
        <button
          type="button"
          class="pill"
          class:pill--active={scriptChoice === 'both'}
          aria-pressed={scriptChoice === 'both'}
          onclick={() => (scriptChoice = 'both')}
        >
          Both
        </button>
        <button
          type="button"
          class="pill"
          class:pill--active={scriptChoice === 'hiragana'}
          aria-pressed={scriptChoice === 'hiragana'}
          onclick={() => (scriptChoice = 'hiragana')}
        >
          Hiragana
        </button>
        <button
          type="button"
          class="pill"
          class:pill--active={scriptChoice === 'katakana'}
          aria-pressed={scriptChoice === 'katakana'}
          onclick={() => (scriptChoice = 'katakana')}
        >
          Katakana
        </button>
      </div>
    </div>

    <div class="group">
      <p class="group-label">Set</p>
      <div class="pill-group" role="group" aria-label="Set">
        <button
          type="button"
          class="pill"
          class:pill--active={setChoice === 'all'}
          aria-pressed={setChoice === 'all'}
          onclick={() => (setChoice = 'all')}
        >
          Both
        </button>
        <button
          type="button"
          class="pill"
          class:pill--active={setChoice === 'base'}
          aria-pressed={setChoice === 'base'}
          onclick={() => (setChoice = 'base')}
        >
          Base
        </button>
        <button
          type="button"
          class="pill"
          class:pill--active={setChoice === 'yoon'}
          aria-pressed={setChoice === 'yoon'}
          onclick={() => (setChoice = 'yoon')}
        >
          Yoon
        </button>
      </div>
    </div>

    <div class="count-card">
      <p class="count-value">{scopedCount} cards in scope</p>
      <div class="chips">
        {#each scriptChipLabels as label (label)}
          <span class="chip chip--positive">{label}</span>
        {/each}
        {#each setChipLabels as label (label)}
          <span class="chip chip--positive">{label}</span>
        {/each}
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
