<script lang="ts">
  // Drill screen: prompt -> write from memory -> self-grade.
  //
  // NB: a literal style or script tag written out in a comment here makes
  // svelte-check parse the whole component as one unterminated script --
  // hence the prose. Drill sub-states are local component state, never
  // members of the `Screen` union.
  //
  // The ink surface arrives as a port instance from the composition root --
  // `adapters/ui` never imports `adapters/ink`
  // (docs/adr/0001-hexagonal-boundary.md). Svelte renders NOTHING inside
  // `.cell`: the adapter owns that node's contents
  // (docs/adr/0002-ink-adapter-owns-its-canvas.md).
  //
  // All non-rendering bookkeeping (queue, idle, closure, grade/undo
  // persistence) lives in `DrillSession`; this keeps render state only.
  import { onMount, tick, untrack } from 'svelte';
  import type { Card, Script } from '../../domain/cards';
  import type { Scope } from '../../domain/scope';
  import type { InkSurface } from '../../ports/ink-surface';
  import type { Stroke } from '../../domain/ink';
  import type { Attempt, SelfGrade } from '../../domain/attempt';
  import type { AttemptRepository } from '../../ports/attempt-repository';
  import type { TallyRepository } from '../../ports/tally-repository';
  import type { Tally } from '../../domain/tally';
  import type { SessionRepository } from '../../ports/session-repository';
  import type { SessionSummaryView } from '../../domain/session';
  import { DrillSession } from './drill-session';

  interface Props {
    scope: Scope;
    /** Resolved card count for this session (`domain/scope.ts`'s
     * `resolveSessionSize`, computed by the composition root from the Scope
     * picker's `SessionSizeChoice`). Read exactly once, at mount, to draw
     * the sampled queue below -- never re-resolved mid-session. */
    sessionSize: number;
    /** Session-start attempt history from the composition root, loaded once
     * via `listAll()` at drill entry -- never re-fetched mid-session
     * (docs/adr/0004-session-sampled-once-by-weakness.md). */
    attempts: Attempt[];
    /** Session-start tally snapshot from the composition root, loaded once
     * via `getAll()` at drill entry -- mirrors `attempts` above, never
     * re-fetched mid-session. */
    tallies: Tally[];
    inkSurface: InkSurface;
    attemptRepository: AttemptRepository;
    tallyRepository: TallyRepository;
    sessionRepository: SessionRepository;
    /** Loaded once at drill entry, same as `widthPreset`/`tallies` -- no
     * live-reload mid-drill. */
    idleTimeoutMs: number;
    /** Fires on every session closure (explicit, complete, or inactivity)
     * with the closed session's Summary view. */
    onClose: (summary: SessionSummaryView) => void;
  }

  const {
    scope,
    sessionSize,
    attempts,
    tallies,
    inkSurface,
    attemptRepository,
    tallyRepository,
    sessionRepository,
    idleTimeoutMs,
    onClose,
  }: Props = $props();

  // One session per drill entry -- the composition root builds a fresh
  // component per entry. `untrack`: a deliberate one-shot seed, not a
  // subscription to the props -- Svelte otherwise warns
  // (state_referenced_locally) about exactly that. `$state.snapshot`:
  // `scope` arrives as a Svelte 5 deep proxy (App's `$state` plus
  // `$props()` re-wrapping), and a proxy is not structured-cloneable --
  // handing it on to `sessionRepository.add()` verbatim makes IndexedDB
  // reject the write with a DataCloneError, so the session silently never
  // persists. Snapshot to plain data at this boundary; every other record
  // field is already plain (`strokes` is deliberately a non-`$state` local).
  const session = untrack(
    () =>
      new DrillSession({
        scope: $state.snapshot(scope),
        sessionSize,
        attempts,
        tallies,
        idleTimeoutMs,
        attemptRepository,
        tallyRepository,
        sessionRepository,
        onClose,
      }),
  );
  const queue = session.queue;

  const scriptLabel: Record<Script, string> = {
    hiragana: 'Hiragana',
    katakana: 'Katakana',
  };

  // Index into `queue` of the card on screen. Advances only on "Next
  // character", never on the grade itself, so Undo needs no queue
  // reinsertion.
  let queueIndex = $state(0);
  // 1-based, display-only; `$derived` so it can never desync.
  const position = $derived(queueIndex + 1);
  let card = $state<Card>(queue[0]!);
  let hasInk = $state(false);
  // Reveal: once true it unlocks Missed/Correct even from a
  // blank cell -- revealing nothing is itself an honest "I don't know".
  let revealed = $state(false);

  // The post-grade toast: set by `handleGrade`, cleared by
  // `handleUndo`/`handleNext`. While set, Missed/Correct/Reveal stay disabled
  // and prompt/ink/strokes stay frozen, so Undo needs no restore mechanism.
  let graded = $state<{ cardId: string; grade: SelfGrade; missCount: number | null } | null>(
    null,
  );
  // Component-side undo-in-flight flag: drives rendering (dims "Next
  // character") and `handleUndo`'s double-tap guard. `DrillSession`'s own
  // flag is authoritative for session-level guards (idle/close/interaction).
  // Set synchronously around the awaited `session.undoLastGrade()`.
  let undoing = $state(false);

  // Per-prompt ink bookkeeping: plain `let`, nothing renders
  // from it. Every stroke since the last Clear/advance, persisted verbatim.
  let strokes: Stroke[] = [];
  // `performance.now()` when the current prompt appeared (and again after
  // each advance, for the next one) -- the origin `timeToFirstStrokeMs` and
  // `totalTimeMs` are both measured from.
  let promptShownAt = performance.now();
  // The first post-Clear stroke's `pointerdown` time, same clock as
  // `promptShownAt` above. `undefined` until a stroke lands; stays
  // `undefined` through a reveal-from-blank grade.
  let firstStrokeStartedAt: number | undefined;

  // Sampled without replacement: always reaches exactly 100%, never
  // overshoots. Always shown alongside the text counter, never alone.
  const progress = $derived(position / queue.length);

  // Assigned by `bind:this` before `onMount` runs; typed as possibly
  // undefined rather than asserted, so the mount below is a real check.
  let cell: HTMLElement | undefined;
  // Focus target after Reveal fires (below): the button `disabled` there
  // stops being the focused element, and most browsers drop focus to
  // `<body>` rather than leaving it on the control the user just pressed.
  // `$state`: this binds inside the `{#if graded}...{:else}...{/if}` grades
  // block (the post-grade action row swap), so it's rebound/unbound on every toast
  // show/hide, not just once at mount.
  let missedButton: HTMLButtonElement | undefined = $state();
  // Focus target once the toast appears (Missed/Correct just went
  // `disabled`); `$state` for the same conditional-binding reason.
  let undoButton: HTMLButtonElement | undefined = $state();

  // No-op mid-undo (see `DrillSession.checkIdleOnResume`'s guard).
  const checkIdleOnResume = (): void => session.checkIdleOnResume();

  onMount(() => {
    if (!cell) return;
    inkSurface.onStrokeComplete((stroke, timing) => {
      // A reveal, or a grade fired without one (Missed/Correct straight from
      // the blank cell), locks the cell to pointer input (see
      // `.cell--locked` below); this guards the same invariant at the state
      // level in case a stroke-complete notification is ever still in
      // flight when it fires.
      if (revealed || graded !== null) return;
      // A stroke is itself an interaction: if it arrives idle-eligible, it
      // closes the session instead of landing -- the interaction that
      // reveals an idle session is dropped, never recorded as part of the
      // closed session.
      if (!session.recordInteraction()) return;
      hasInk = true;
      strokes.push(stroke);
      // Only the first stroke since the last Clear/grade sets this --
      // `timeToFirstStrokeMs` measures to the *first* stroke, not the latest.
      firstStrokeStartedAt ??= timing.startedAt;
    });
    inkSurface.mount(cell);
    // Idle detection is retroactive, never a live timer: every resume
    // re-checks elapsed idle time instead of a running countdown.
    document.addEventListener('visibilitychange', checkIdleOnResume);
    window.addEventListener('focus', checkIdleOnResume);
    return () => {
      inkSurface.destroy();
      document.removeEventListener('visibilitychange', checkIdleOnResume);
      window.removeEventListener('focus', checkIdleOnResume);
    };
  });

  function handleClear(): void {
    if (!session.recordInteraction()) return;
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
    if (!session.recordInteraction()) return;
    // Never assigns a grade -- Missed/Correct stay required afterward.
    revealed = true;
    // Move focus onto the newly-active Missed button so a keyboard/screen
    // reader user isn't dropped to `<body>` by Reveal's own `disabled`.
    void tick().then(() => missedButton?.focus());
  }

  function handleGrade(grade: SelfGrade): void {
    if (!session.recordInteraction()) return;
    // A grade always persists an attempt, ink or not, reveal or not; the
    // writes are never awaited. The advance (queue index/clear/reset) is
    // deferred to `handleNext` -- the toast shows instead, offering Undo
    // (always) and the new miss count (only on Missed).
    const missCount = session.recordGrade({
      card,
      grade,
      strokes,
      revealed,
      promptShownAt,
      firstStrokeStartedAt,
    });
    graded = { cardId: card.cardId, grade, missCount };
    // Move focus onto Undo, the same way Reveal moves it onto Missed:
    // Missed/Correct/Reveal just went `disabled`, and the toast's two
    // controls are new to the page.
    void tick().then(() => undoButton?.focus());
  }

  function handleNext(): void {
    if (!session.recordInteraction()) return;
    // Complete closure rides this existing tap rather than a
    // new control: the queue-completing grade still shows the normal
    // toast/Undo, and only tapping past it closes the session.
    if (session.isLastCard(queueIndex)) {
      session.closeComplete();
      return;
    }
    queueIndex += 1;
    card = queue[queueIndex]!;
    revealed = false;
    inkSurface.clear();
    hasInk = false;
    strokes = [];
    firstStrokeStartedAt = undefined;
    promptShownAt = performance.now();
    graded = null;
    session.clearUndoable();
  }

  async function handleUndo(): Promise<void> {
    if (!session.recordInteraction()) return;
    if (!graded || undoing) return;
    undoing = true;
    try {
      await session.undoLastGrade();
      graded = null;
    } finally {
      undoing = false;
    }
  }

  // No-op once closed or mid-undo (see `DrillSession.closeExplicit`'s guards).
  function handleExplicitClose(): void {
    session.closeExplicit();
  }
</script>

<main class="drill">
  <header class="header">
    <button type="button" class="back" onclick={handleExplicitClose}>I'm done</button>
    <div class="progress">
      <p class="counter">{position} / {queue.length}</p>
      <div
        class="bar"
        role="progressbar"
        aria-label="Cards written"
        aria-valuemin={0}
        aria-valuemax={queue.length}
        aria-valuenow={position}
      >
        <div class="bar-fill" style="width: {progress * 100}%"></div>
      </div>
    </div>
  </header>

  <section class="prompt" class:dimmed={graded !== null}>
    <p class="label">Write from memory</p>
    <p class="romaji">{card.writtenRomaji ? `${card.romaji} (${card.writtenRomaji})` : card.romaji}</p>
    <p class="script">{scriptLabel[card.script]}</p>
  </section>

  <!-- The ink adapter owns the inner node: it creates and appends the single
       canvas element there on mount. Svelte renders nothing inside it. The
       `.cell` div itself is never inside a conditional block -- only its
       enclosing `.panel`'s CSS box changes (a second `.panel` sibling
       appears beside it on reveal), so Svelte never remounts it and the ink
       port's "mount() exactly once per instance" holds across a reveal. Each
       `.panel` is its own container-query context so the cell can size
       itself to whatever room is actually left after the header/prompt/
       footer/grades claim theirs, rather than guessing a fraction of the
       viewport and risking a taller-than-fits page. -->
  <div
    class="cell-wrap"
    class:cell-wrap--revealed={revealed}
    class:dimmed={graded !== null}
  >
    <div class="panel">
      {#if revealed}<p class="label" id="yours-label">Yours</p>{/if}
      <div
        class="cell"
        class:cell--locked={revealed || graded !== null}
        bind:this={cell}
        role="group"
        aria-labelledby={revealed ? 'yours-label' : undefined}
      ></div>
    </div>
    {#if revealed}
      <div class="panel">
        <p class="label" id="reference-label">Reference</p>
        <div class="reference-cell" role="group" aria-labelledby="reference-label">
          <span class="glyph" class:glyph--yoon={card.set === 'yoon'}>{card.grapheme}</span>
        </div>
      </div>
    {/if}
  </div>

  {#if !revealed && !graded}
    <div class="cell-footer">
      <p class="disclaimer">Your call — nothing is checking the shape</p>
      {#if hasInk}
        <button type="button" class="clear" onclick={handleClear}>Clear</button>
      {/if}
    </div>
  {/if}

  <div class="grades">
    {#if graded}
      <!-- The action row collapses to a dimmed
           Reveal (its own state is frozen either way -- Missed/Correct never
           came back once reveal fired) plus a wide "Next character". -->
      <button type="button" class="btn btn--neutral btn--dimmed" disabled>
        {revealed ? 'Revealed' : 'Reveal'}
      </button>
      <button
        type="button"
        class="btn btn--primary next-btn"
        disabled={undoing}
        class:btn--dimmed={undoing}
        onclick={handleNext}
      >
        Next character
      </button>
    {:else}
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
    {/if}
  </div>

  {#if graded}
    <!-- "Self-grade landed": a peach (missed-tint) card
         floating above the action row, not a dark full-width bar -- message
         plus a single outlined Undo pill; "Next character" lives in the
         action row above, not in this card. -->
    <div class="toast" role="status">
      <div class="toast-copy">
        <p class="toast-headline">
          {graded.missCount !== null ? 'Marked missed' : 'Marked correct'}
        </p>
        <p class="toast-detail">
          {card.grapheme} · {scriptLabel[card.script]}
          {#if graded.missCount !== null}
            — missed {graded.missCount}
            {graded.missCount === 1 ? 'time' : 'times'} now, so it'll come round
            sooner.
          {/if}
        </p>
      </div>
      <button
        type="button"
        class="toast-undo"
        disabled={undoing}
        onclick={handleUndo}
        bind:this={undoButton}
      >
        Undo
      </button>
    </div>
  {/if}
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
       "Reference" panel beside it. */
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
    /* Once revealed, or once a grade lands (with or without a prior
       reveal), the cell is a frozen record of what was written, not an
       active writing surface -- tracing over the just-revealed reference
       would undercut the whole point of reveal never assigning a grade for
       the learner, and drawing after a grade has already landed would
       silently attach strokes to an attempt that's already been recorded. */
    pointer-events: none;
  }

  .reference-cell {
    /* Mirrors `.cell`'s box exactly, so Yours/Reference read as one
       comparison pair -- but tinted `--color-missed-bg` (docs/design.md: the
       Reveal reference panel uses the missed tint, not the canvas ground --
       this is attention, not the writing surface). */
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
       (docs/design.md) -- romaji/labels stay in `--font-heading`/`--font-body`
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

  /* The post-grade toast: the missed-tint card
     floats above the action row -- an overlay, not a flex-column sibling,
     so it can appear/disappear on every grade without reflowing `.drill`
     (fixed to `100dvh` with nothing to scroll; see `.drill` above). */
  .toast {
    position: fixed;
    left: var(--spacing-6);
    right: var(--spacing-6);
    /* Clears the action row (`.btn`'s 88px plus `.drill`'s bottom padding)
       so it floats above the buttons, never over them. */
    bottom: calc(88px + var(--spacing-4) + var(--spacing-3));
    /* Only fixed-position element on this screen today, but pinned above
       anything that could later share that positioning (e.g. a future
       modal) rather than leaving stacking order to source order alone. */
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-3);
    padding: 30px 34px;
    border-radius: var(--radius-xl);
    background: var(--color-missed-bg);
    box-shadow: 0 12px 32px rgba(46, 43, 37, 0.18);
  }

  .toast-copy {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1);
    min-width: 0;
  }

  .toast-headline {
    margin: 0;
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: 1.5rem;
    color: var(--color-accent-on-peach);
  }

  .toast-detail {
    margin: 0;
    font-size: 1rem;
    color: var(--color-accent-strong);
  }

  .toast-undo {
    flex: none;
    min-height: 48px;
    padding: 12px 22px;
    border-radius: var(--radius-md);
    background: transparent;
    border: 1px solid rgba(140, 73, 26, 0.35);
    color: var(--color-accent-strong);
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: 1.1rem;
    cursor: pointer;
  }

  /* Dimmed *and* `disabled` while a reversal is in flight -- mirrors
     `.btn--dimmed`'s reasoning above. */
  .toast-undo:disabled {
    opacity: 0.5;
    cursor: default;
  }

  /* Prompt and cell fade back once a grade lands -- signals the drill
     is mid-transition without hiding what was just written; ink/strokes
     stay exactly as graded until "Next character" (see `handleNext`). */
  .dimmed {
    opacity: 0.35;
  }

  /* Post-grade action row: Reveal keeps its `flex: 1` share, "Next character"
     takes the two grade buttons' combined share instead of a third slot. */
  .next-btn {
    flex: 2;
  }
</style>
