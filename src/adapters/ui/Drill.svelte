<script lang="ts">
  // Drill screen (Story 1.3): prompt -> write from memory -> self-grade.
  //
  // Follows ScopePicker.svelte's pattern (a scoped style block over existing
  // theme tokens, callback props, no local routing). NB: a literal style or
  // script tag written out in a comment here makes svelte-check parse the
  // whole component as one unterminated script -- hence the prose.
  // The drill's sub-states (blank
  // vs. written) are local component state, never members of the `Screen`
  // union (AD-12).
  //
  // The ink surface arrives as a port instance from the composition root --
  // `adapters/ui` never imports `adapters/ink` (AD-1, enforced by
  // import-x/no-restricted-paths). Svelte renders NOTHING inside `.cell`:
  // the adapter owns that node's contents (AD-2).
  import { onMount, untrack } from 'svelte';
  import type { Card, Script } from '../../domain/cards';
  import type { InkSurface } from '../../ports/ink-surface';
  import { pickRandomCard } from '../../domain/drill';

  interface Props {
    cards: Card[];
    inkSurface: InkSurface;
    /** Temporary: Story 1.9's "I'm done" replaces or absorbs this control. */
    onBack: () => void;
  }

  const { cards, inkSurface, onBack }: Props = $props();

  const scriptLabel: Record<Script, string> = {
    hiragana: 'Hiragana',
    katakana: 'Katakana',
  };

  // `untrack`: the first prompt is drawn once, at mount. `cards` is fixed for
  // the lifetime of a drill entry (the composition root builds a fresh
  // component per entry), so capturing its initial value is the intent --
  // Svelte otherwise warns (state_referenced_locally) about exactly that.
  let card = $state<Card>(untrack(() => pickRandomCard(cards)));
  let position = $state(1);
  let hasInk = $state(false);

  // Selection is with replacement, so the counter can climb past the scope
  // size ("47 / 46") until Story 1.9 adds closure. The bar clamps at 100% --
  // and is never the only position signal, the text counter always shows.
  const progress = $derived(Math.min(1, position / Math.max(1, cards.length)));

  // Assigned by `bind:this` before `onMount` runs; typed as possibly
  // undefined rather than asserted, so the mount below is a real check.
  let cell: HTMLElement | undefined;

  onMount(() => {
    if (!cell) return;
    inkSurface.onStrokeComplete(() => {
      hasInk = true;
    });
    inkSurface.mount(cell);
    return () => {
      inkSurface.destroy();
    };
  });

  function handleClear(): void {
    // Clear never advances and never grades: same prompt, empty cell.
    inkSurface.clear();
    hasInk = false;
  }

  function handleGrade(): void {
    // Nothing is persisted this story (Stories 1.5/1.6 own attempts and
    // tallies) and no toast is shown (Story 1.8) -- a grade only advances.
    card = pickRandomCard(cards, card);
    position += 1;
    inkSurface.clear();
    hasInk = false;
  }
</script>

<main class="drill">
  <header class="header">
    <button type="button" class="back" onclick={onBack}>Back</button>
    <div class="progress">
      <p class="counter">{position} / {cards.length}</p>
      <div
        class="bar"
        role="progressbar"
        aria-label="Cards written"
        aria-valuemin={0}
        aria-valuemax={cards.length}
        aria-valuenow={Math.min(position, cards.length)}
      >
        <div class="bar-fill" style="width: {progress * 100}%"></div>
      </div>
    </div>
  </header>

  <section class="prompt">
    <p class="label">Write from memory</p>
    <p class="romaji">{card.romaji}</p>
    <p class="script">{scriptLabel[card.script]}</p>
  </section>

  <!-- The ink adapter owns the inner node: it creates and appends the single
       canvas element there on mount. Svelte renders nothing inside it. The
       outer wrapper is a container-query context so the cell can size itself
       to whatever room is actually left after the header/prompt/footer/
       grades claim theirs, rather than guessing a fraction of the viewport
       and risking a taller-than-fits page. -->
  <div class="cell-wrap">
    <div class="cell" bind:this={cell}></div>
  </div>

  <div class="cell-footer">
    <p class="disclaimer">Your call — nothing is checking the shape</p>
    {#if hasInk}
      <button type="button" class="clear" onclick={handleClear}>Clear</button>
    {/if}
  </div>

  <div class="grades">
    <button
      type="button"
      class="btn btn--neutral"
      class:btn--dimmed={!hasInk}
      disabled={!hasInk}
      onclick={handleGrade}
    >
      Missed
    </button>
    <button
      type="button"
      class="btn btn--primary"
      class:btn--dimmed={!hasInk}
      disabled={!hasInk}
      onclick={handleGrade}
    >
      Correct
    </button>
  </div>
</main>

<style>
  .drill {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
    /* Fixed to the visible viewport, not just its floor: `min-height` let the
       page grow past whatever was actually visible (worse on a browser tab
       with an address bar than an installed PWA), pushing Missed/Correct
       below the fold. `100dvh` tracks the real visible height, and
       `overflow: hidden` plus every other section's fixed sizing (leaving
       `.cell-wrap` to fill what's left, below) keeps the whole screen inside
       it with nothing to scroll. */
    height: 100dvh;
    overflow: hidden;
    padding: var(--spacing-5) var(--spacing-4);
  }

  .header {
    display: flex;
    align-items: center;
    gap: var(--spacing-4);
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

  .progress {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1);
  }

  .counter {
    margin: 0;
    font-family: var(--font-body);
    font-size: 0.95rem;
    color: var(--color-ink-muted);
  }

  .bar {
    height: 6px;
    border-radius: var(--radius-full);
    background: var(--color-ink-hairline);
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    border-radius: var(--radius-full);
    background: var(--color-accent);
  }

  .prompt {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-1);
    padding: var(--spacing-3) 0;
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

  .romaji {
    margin: 0;
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: 3rem;
    letter-spacing: -0.02em;
    color: var(--color-ink);
  }

  .script {
    margin: 0;
    font-family: var(--font-body);
    font-size: 1rem;
    color: var(--color-ink-muted);
  }

  .cell-wrap {
    /* Takes exactly whatever vertical room the flex column has left after
       the header/prompt/cell-footer/grades take theirs -- the column's
       total height can never exceed `.drill`'s, so nothing here forces a
       scroll. `min-height: 0` lets it shrink below its content's natural
       minimum instead of the (larger) automatic default. */
    flex: 1;
    min-height: 0;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    container-type: size;
  }

  .cell {
    /* Square at every size: `toGridRelative` normalizes x and y
       independently, so a non-square cell would replay stored strokes
       distorted. `cqw`/`cqh` are relative to `.cell-wrap`'s actual box (from
       the flex layout above), so the cell is always the largest square that
       fits the room actually left -- never a guessed fraction of the
       viewport that could be taller than what's really available. */
    width: min(100cqw, 100cqh);
    height: min(100cqw, 100cqh);
    border: 1px solid var(--color-grid-guide);
    border-radius: var(--radius-lg);
    background: var(--color-surface-canvas);
    overflow: hidden;
    touch-action: none;
    -webkit-user-select: none;
    user-select: none;
  }

  .cell-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-2);
    min-height: 56px;
  }

  .disclaimer {
    margin: 0;
    font-family: var(--font-body);
    font-size: 0.9rem;
    color: var(--color-ink-muted);
  }

  .clear {
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

  .grades {
    /* No `margin-top: auto` needed -- `.cell-wrap` is the column's one
       flex-grow item, so it alone absorbs whatever space is left and
       `.grades` always sits directly under it. */
    display: flex;
    gap: var(--spacing-2);
  }

  .btn {
    flex: 1;
    min-height: 88px;
    border-radius: var(--radius-md);
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: 1.1rem;
    cursor: pointer;
  }

  .btn--neutral {
    background: transparent;
    color: var(--color-ink);
    border: 1px solid var(--color-ink-faint);
  }

  .btn--primary {
    background: var(--color-accent);
    color: var(--color-surface-card);
    border: none;
  }

  /* Dimmed *and* `disabled` -- state is never conveyed by color alone
     (accessibility floor), and the control is genuinely non-interactive,
     not merely styled to look it. */
  .btn--dimmed {
    opacity: 0.4;
    cursor: default;
  }
</style>
