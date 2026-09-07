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
  import { onMount, tick, untrack } from 'svelte';
  import type { Card, Script } from '../../domain/cards';
  import { CARDS } from '../../domain/cards';
  import type { Scope } from '../../domain/scope';
  import { cardsInScope } from '../../domain/scope';
  import type { InkSurface } from '../../ports/ink-surface';
  import type { Stroke } from '../../domain/ink';
  import type { Attempt, SelfGrade } from '../../domain/attempt';
  import type { AttemptRepository } from '../../ports/attempt-repository';
  import type { TallyRepository } from '../../ports/tally-repository';
  import { selectNext } from '../../domain/drill';

  interface Props {
    scope: Scope;
    /** Session-start attempt history from the composition root, loaded once
     * via `listAll()` at drill entry -- never re-fetched mid-session (Story
     * 1.7). */
    attempts: Attempt[];
    inkSurface: InkSurface;
    attemptRepository: AttemptRepository;
    tallyRepository: TallyRepository;
    /** Temporary: Story 1.9's "I'm done" replaces or absorbs this control. */
    onBack: () => void;
  }

  const { scope, attempts, inkSurface, attemptRepository, tallyRepository, onBack }: Props =
    $props();

  // `scope` is fixed for the lifetime of a drill entry (the composition root
  // builds a fresh component per entry), so this drives the existing
  // counter/progress bar exactly as the old `cards` prop did.
  const cards = $derived(cardsInScope(CARDS, scope));

  // Minted once per drill entry -- the composition root builds a fresh
  // component per entry (same lifetime as `card`, below), so this is stable
  // for every attempt this instance ever persists.
  const sessionId = crypto.randomUUID();

  const scriptLabel: Record<Script, string> = {
    hiragana: 'Hiragana',
    katakana: 'Katakana',
  };

  // Plain `let`, not `$state` -- mirrors `strokes` below: nothing renders
  // from this directly, it only feeds `selectNext` on the next grade. Seeded
  // from the session-start `attempts` prop and appended to in-memory as new
  // attempts are graded, never re-fetched (Story 1.7's Boundaries &
  // Constraints). `untrack`: this is a deliberate one-shot seed, not a
  // subscription to `attempts` -- Svelte otherwise warns
  // (state_referenced_locally) about exactly that.
  const sessionAttempts: Attempt[] = untrack(() => [...attempts]);

  // `untrack`: the first prompt is drawn once, at mount. `scope` is fixed for
  // the lifetime of a drill entry (the composition root builds a fresh
  // component per entry), so capturing its initial value is the intent --
  // Svelte otherwise warns (state_referenced_locally) about exactly that.
  let card = $state<Card>(untrack(() => selectNext(sessionAttempts, scope)));
  let position = $state(1);
  let hasInk = $state(false);
  // Reveal (Story 1.4): active the instant a prompt appears, resets on every
  // grade alongside `hasInk`. Once true it unlocks Missed/Correct even from a
  // blank cell -- revealing nothing is itself an honest "I don't know".
  let revealed = $state(false);

  // Story 1.5's persistence locals. None of these render anything -- `hasInk`
  // above already drives the UI -- so they are plain `let`, not `$state`.
  // Every completed stroke since the last Clear/grade, embedded verbatim into
  // the persisted `Attempt`.
  let strokes: Stroke[] = [];
  // `performance.now()` when the current prompt appeared (and again after
  // each grade, for the next one) -- the origin `timeToFirstStrokeMs` and
  // `totalTimeMs` are both measured from.
  let promptShownAt = performance.now();
  // The first post-Clear stroke's `pointerdown` time, same clock as
  // `promptShownAt` above. `undefined` until a stroke lands; stays
  // `undefined` through a reveal-from-blank grade.
  let firstStrokeStartedAt: number | undefined;

  // Selection is with replacement, so the counter can climb past the scope
  // size ("47 / 46") until Story 1.9 adds closure. The bar clamps at 100% --
  // and is never the only position signal, the text counter always shows.
  const progress = $derived(Math.min(1, position / Math.max(1, cards.length)));

  // Assigned by `bind:this` before `onMount` runs; typed as possibly
  // undefined rather than asserted, so the mount below is a real check.
  let cell: HTMLElement | undefined;
  // Focus target after Reveal fires (below): the button `disabled` there
  // stops being the focused element, and most browsers drop focus to
  // `<body>` rather than leaving it on the control the user just pressed.
  let missedButton: HTMLButtonElement | undefined;

  onMount(() => {
    if (!cell) return;
    inkSurface.onStrokeComplete((stroke, timing) => {
      // A reveal locks the cell to pointer input (see `.cell--locked`
      // below); this guards the same invariant at the state level in case a
      // stroke-complete notification is ever still in flight when it fires.
      if (revealed) return;
      hasInk = true;
      strokes.push(stroke);
      // Only the first stroke since the last Clear/grade sets this --
      // `timeToFirstStrokeMs` measures to the *first* stroke, not the latest.
      firstStrokeStartedAt ??= timing.startedAt;
    });
    inkSurface.mount(cell);
    return () => {
      inkSurface.destroy();
    };
  });

  function handleClear(): void {
    // Clear never advances and never grades: same prompt, empty cell. Only
    // the post-Clear stroke(s) may end up persisted, so the in-progress
    // stroke bookkeeping resets too -- `promptShownAt` does not, since the
    // prompt itself hasn't changed.
    inkSurface.clear();
    hasInk = false;
    strokes = [];
    firstStrokeStartedAt = undefined;
  }

  function handleReveal(): void {
    // Never assigns a grade -- Missed/Correct stay required afterward.
    revealed = true;
    // Move focus onto the newly-active Missed button so a keyboard/screen
    // reader user isn't dropped to `<body>` by Reveal's own `disabled`.
    void tick().then(() => missedButton?.focus());
  }

  function handleGrade(grade: SelfGrade): void {
    // A grade always persists an attempt, ink or not, reveal or not (I/O
    // matrix) -- built and fired before the state below resets for the next
    // card. Never awaited: persistence must not block advancing (Boundaries
    // & Constraints), so a slow or failing write is logged, not blocking.
    const gradedAt = performance.now();
    const totalTimeMs = gradedAt - promptShownAt;
    const timeToFirstStrokeMs =
      firstStrokeStartedAt === undefined ? totalTimeMs : firstStrokeStartedAt - promptShownAt;
    const attempt: Attempt = {
      id: crypto.randomUUID(),
      sessionId,
      cardId: card.cardId,
      timestamp: new Date().toISOString(),
      timeToFirstStrokeMs,
      totalTimeMs,
      strokeCount: strokes.length,
      revealUsed: revealed,
      selfGrade: grade,
      strokes,
    };
    // Appended synchronously, before the never-awaited persistence calls
    // below, so `selectNext` (also below) always sees this attempt --
    // persistence must not gate what the in-memory history reflects.
    sessionAttempts.push(attempt);
    void attemptRepository
      .add(attempt)
      .then((result) => {
        if (!result.ok) console.error('Failed to persist attempt:', result.error);
      })
      .catch((error: unknown) => {
        console.error('Failed to persist attempt:', error);
      });

    // Every self-graded Missed bumps the card's running miss tally -- never
    // Correct (Boundaries & Constraints). Same never-awaited pattern as the
    // attempt write above: persistence must not block advancing.
    if (grade === 'incorrect') {
      void tallyRepository
        .increment(card.cardId)
        .then((result) => {
          if (!result.ok) console.error('Failed to increment tally:', result.error);
        })
        .catch((error: unknown) => {
          console.error('Failed to increment tally:', error);
        });
    }

    // No toast is shown (Story 1.8 owns that) -- a grade only advances. Every
    // in-scope card, including the one just graded, keeps a nonzero
    // selection probability -- there is no previous-card exclusion.
    card = selectNext(sessionAttempts, scope);
    position += 1;
    revealed = false;
    inkSurface.clear();
    hasInk = false;
    strokes = [];
    firstStrokeStartedAt = undefined;
    promptShownAt = performance.now();
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
       `.cell` div itself is never inside a conditional block -- only its
       enclosing `.panel`'s CSS box changes (a second `.panel` sibling
       appears beside it on reveal), so Svelte never remounts it and AD-2's
       "mount() exactly once per instance" holds across a reveal. Each
       `.panel` is its own container-query context so the cell can size
       itself to whatever room is actually left after the header/prompt/
       footer/grades claim theirs, rather than guessing a fraction of the
       viewport and risking a taller-than-fits page. -->
  <div class="cell-wrap" class:cell-wrap--revealed={revealed}>
    <div class="panel">
      {#if revealed}<p class="label" id="yours-label">Yours</p>{/if}
      <div
        class="cell"
        class:cell--locked={revealed}
        bind:this={cell}
        role="group"
        aria-labelledby={revealed ? 'yours-label' : undefined}
      ></div>
    </div>
    {#if revealed}
      <div class="panel">
        <p class="label" id="reference-label">Reference</p>
        <div class="reference-cell" role="group" aria-labelledby="reference-label">
          <span class="glyph" class:glyph--yoon={card.kind === 'yoon'}>{card.grapheme}</span>
        </div>
      </div>
    {/if}
  </div>

  {#if !revealed}
    <div class="cell-footer">
      <p class="disclaimer">Your call — nothing is checking the shape</p>
      {#if hasInk}
        <button type="button" class="clear" onclick={handleClear}>Clear</button>
      {/if}
    </div>
  {/if}

  <div class="grades">
    <button
      type="button"
      class="btn btn--neutral"
      class:btn--dimmed={revealed}
      disabled={revealed}
      onclick={handleReveal}
    >
      {revealed ? 'Revealed' : 'Reveal'}
    </button>
    <button
      type="button"
      class="btn btn--neutral"
      class:btn--dimmed={!hasInk && !revealed}
      disabled={!hasInk && !revealed}
      onclick={() => handleGrade('incorrect')}
      bind:this={missedButton}
    >
      Missed
    </button>
    <button
      type="button"
      class="btn btn--primary"
      class:btn--dimmed={!hasInk && !revealed}
      disabled={!hasInk && !revealed}
      onclick={() => handleGrade('correct')}
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
       minimum instead of the (larger) automatic default. One `.panel` child
       normally (the ink cell, centered); Reveal adds a second, equal-width
       "Reference" panel beside it (Story 1.4). */
    flex: 1;
    min-height: 0;
    min-width: 0;
    display: flex;
    align-items: stretch;
    justify-content: center;
  }

  .cell-wrap--revealed {
    gap: var(--spacing-3);
  }

  .panel {
    /* Each panel is its own container-query context, not `.cell-wrap` --
       `.cell`'s `cqw`/`cqh` sizing must measure the box actually available
       to IT (half of `.cell-wrap`'s width once Reveal adds a second panel),
       never the wrapper's full width. With one panel this is identical to
       measuring `.cell-wrap` directly. */
    flex: 1;
    min-height: 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-1);
    container-type: size;
  }

  .cell {
    /* Square at every size: `toGridRelative` normalizes x and y
       independently, so a non-square cell would replay stored strokes
       distorted. `cqw`/`cqh` are relative to `.panel`'s actual box (from the
       flex layout above), so the cell is always the largest square that
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

  .cell--locked {
    /* Once revealed, the "Yours" panel is a frozen record of what was
       written, not an active writing surface -- tracing over the
       just-revealed reference would undercut the whole point of reveal
       never assigning a grade for the learner. */
    pointer-events: none;
  }

  .reference-cell {
    /* Mirrors `.cell`'s box exactly, so Yours/Reference read as one
       comparison pair -- but tinted `--color-missed-bg` per DESIGN.md
       ("the reference-glyph panel on the Reveal screen" uses the missed
       tint, not the canvas ground: this is attention, not the writing
       surface). */
    width: min(100cqw, 100cqh);
    height: min(100cqw, 100cqh);
    border-radius: var(--radius-lg);
    background: var(--color-missed-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .glyph {
    /* The brush face renders ONLY an actual grapheme, never UI text
       (DESIGN.md) -- romaji/labels stay in `--font-heading`/`--font-body`
       throughout this component. */
    font-family: var(--font-glyph-ink);
    font-size: min(60cqw, 60cqh);
    line-height: 1;
    color: var(--color-missed-fg);
    transform: rotate(-1.2deg);
    white-space: nowrap;
  }

  .glyph--yoon {
    /* A yoon grapheme is two characters (e.g. きゃ) -- `.glyph`'s width-based
       cap is sized for one and would clip against `.reference-cell`'s
       `overflow: hidden`. Capped by width alone (not height) since it's the
       extra character, not extra vertical space, that needs room. */
    font-size: min(34cqw, 60cqh);
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
