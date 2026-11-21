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
  import { onMount, tick } from 'svelte';
  import { SMALL_KANA, type KanjiCard, type Script } from '../../domain/cards';
  import type { InkSurface } from '../../ports/ink-surface';
  import type { Stroke } from '../../domain/ink';
  import type { SelfGrade } from '../../domain/attempt';
  import { DrillSession } from './drill-session';
  import TopBar from './TopBar.svelte';

  interface Props {
    /** The running session, created and owned by the practice module. */
    drillSession: DrillSession;
    inkSurface: InkSurface;
  }

  const { drillSession: session, inkSurface }: Props = $props();
  const queue = $derived(session.queue);

  const scriptLabel: Record<Script, string> = {
    hiragana: 'Hiragana',
    katakana: 'Katakana',
    kanji: 'Kanji',
  };

  /** The kanji prompt's readings line: the on'yomi and kun'yomi groups
   * split by a middle dot -- katakana vs hiragana already tells the two
   * apart, so no labels. A kanji missing a group (電 has no kun'yomi)
   * renders just the one it has. */
  function readingsLine(card: KanjiCard): string {
    return [card.onyomi.join(' '), card.kunyomi.join(' ')]
      .filter((part) => part.length > 0)
      .join(' · ');
  }

  // Index into `queue` of the card on screen. Advances on the grade itself;
  // Undo is the only thing that moves it back.
  let queueIndex = $state(0);
  // 1-based, display-only; `$derived` so it can never desync.
  const position = $derived(queueIndex + 1);
  const card = $derived(queue[queueIndex]!);
  // One genkouyoushi cell per character of the grapheme: two for a yoon
  // (チョ -> チ | ョ), one for a single kana. Drives both the writing row's
  // box and `setCellCount` below.
  const cellCount = $derived(card.grapheme.length);
  // The row's box: N square cells. The fixed N:1 aspect is what makes
  // grid-relative strokes replay undistorted, so both the writing cell and
  // the reference row size themselves with this one expression.
  const cellBoxStyle = $derived(
    `width: min(100cqw, ${cellCount * 100}cqh); height: min(${100 / cellCount}cqw, 100cqh)`,
  );
  let hasInk = $state(false);
  // Reveal: once true it unlocks Missed/Correct even from a
  // blank cell -- revealing nothing is itself an honest "I don't know".
  let revealed = $state(false);

  // The post-grade toast, floating over whatever the grade moved to: the
  // next prompt mid-queue, or the frozen last card at queue end. Carries
  // everything Undo needs to bring the graded card back exactly as it
  // was -- position, reveal state, ink and its timing. `strokes` is a
  // copy, so later drawing on the restored card can never mutate the array
  // the persisted attempt already embeds.
  let graded = $state<{
    grade: SelfGrade;
    missCount: number | null;
    index: number;
    revealed: boolean;
    strokes: Stroke[];
    promptShownAt: number;
    firstStrokeStartedAt: number | undefined;
  } | null>(null);
  // The queue-completing grade has no next prompt: the last card freezes
  // under its toast (dimmed, cell locked) until Undo or Finish, and
  // nothing can be written on it. Every other graded card is already
  // behind the queue pointer.
  const frozen = $derived(graded !== null && graded.index === queueIndex);
  // Component-side undo-in-flight flag: drives rendering (dims Finish) and
  // `handleUndo`'s double-tap guard. `DrillSession`'s own flag is
  // authoritative for session-level guards (idle/close/interaction).
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

  /** Ends the undo window: writing on, or revealing, the new prompt is
   * committing to it, so the previous grade becomes final. */
  function endUndoWindow(): void {
    if (graded === null) return;
    graded = null;
    session.clearUndoable();
  }

  onMount(() => {
    if (!cell) return;
    inkSurface.onStrokeComplete((stroke, timing) => {
      // A reveal, or the frozen closing card, locks the cell to pointer
      // input (see `.cell--locked` below); this guards the same invariant
      // at the state level in case a stroke-complete notification is ever
      // still in flight when it fires.
      if (revealed || frozen) return;
      // A stroke is itself an interaction: if it arrives idle-eligible, it
      // closes the session instead of landing -- the interaction that
      // reveals an idle session is dropped, never recorded as part of the
      // closed session.
      if (!session.recordInteraction()) return;
      // The new prompt's first stroke ends the undo window.
      endUndoWindow();
      hasInk = true;
      strokes.push(stroke);
      // Only the first stroke since the last Clear/grade sets this --
      // `timeToFirstStrokeMs` measures to the *first* stroke, not the latest.
      firstStrokeStartedAt ??= timing.startedAt;
    });
    // The grid the adapter draws must match the prompt from the very first
    // frame, so the count is set before the canvas mounts.
    inkSurface.setCellCount(cellCount);
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
    // A Reveal on the new prompt ends the undo window, same as its first
    // stroke.
    endUndoWindow();
    // Never assigns a grade -- Missed/Correct stay required afterward.
    revealed = true;
    // Move focus onto the newly-active Missed button so a keyboard/screen
    // reader user isn't dropped to `<body>` by Reveal's own `disabled`.
    void tick().then(() => missedButton?.focus());
  }

  function handleGrade(grade: SelfGrade): void {
    if (!session.recordInteraction()) return;
    // A grade always persists an attempt, ink or not, reveal or not; the
    // writes are never awaited. Snapshot the graded card's state for Undo,
    // then advance immediately -- one tap per card, no "Next character".
    const missCount = session.recordGrade({
      card,
      grade,
      strokes,
      revealed,
      promptShownAt,
      firstStrokeStartedAt,
    });
    graded = {
      grade,
      missCount,
      index: queueIndex,
      revealed,
      strokes: [...strokes],
      promptShownAt,
      firstStrokeStartedAt,
    };
    // Move focus onto Undo: the prompt the learner just tapped Missed or
    // Correct on is gone, and the toast's control is new to the page.
    void tick().then(() => undoButton?.focus());
    // The queue-completing grade has no next prompt to advance to: freeze
    // this card instead, leaving Undo and Finish (in the action row) to
    // close the session when the learner says so.
    if (session.isLastCard(queueIndex)) return;
    queueIndex += 1;
    revealed = false;
    // The writing row re-grids for the new prompt's grapheme; the box
    // resize the inline style causes is picked up by the adapter's own
    // ResizeObserver.
    inkSurface.setCellCount(queue[queueIndex]!.grapheme.length);
    inkSurface.clear();
    hasInk = false;
    strokes = [];
    firstStrokeStartedAt = undefined;
    promptShownAt = performance.now();
  }

  /** Complete closure rides this control on the closing grade's frozen
   * card -- the queue-completing grade never closes on its own, so Undo
   * stays fair on the last card too. */
  function handleFinish(): void {
    if (!session.recordInteraction()) return;
    session.closeComplete();
  }

  async function handleUndo(): Promise<void> {
    if (!session.recordInteraction()) return;
    const snapshot = graded;
    if (!snapshot || undoing) return;
    undoing = true;
    try {
      await session.undoLastGrade();
      graded = null;
      // The graded card returns exactly as it was written: prompt, reveal
      // panel, ink and its timing all restored from the snapshot, so a
      // re-grade reproduces the original attempt (reveal flag included).
      queueIndex = snapshot.index;
      revealed = snapshot.revealed;
      strokes = snapshot.strokes;
      promptShownAt = snapshot.promptShownAt;
      firstStrokeStartedAt = snapshot.firstStrokeStartedAt;
      hasInk = snapshot.strokes.length > 0;
      // The graded card's grid comes back with its ink: a yoon returns as
      // two cells, a single kana as one.
      inkSurface.setCellCount(queue[snapshot.index]!.grapheme.length);
      inkSurface.restore(snapshot.strokes);
    } finally {
      undoing = false;
    }
  }

  // No-op once closed or mid-undo (see `DrillSession.closeExplicit`'s guards).
  function handleExplicitClose(): void {
    session.closeExplicit();
  }
</script>

<!-- The shared top bar's Drill instance: "I'm done" is this screen's back
     control (a session closure into Summary, not back-navigation) and the
     progress readout sits beside it -- rendered by Drill itself because
     the queue position is Drill's render state. -->
<TopBar
  backLabel="I'm done"
  onBack={handleExplicitClose}
  progress={{ now: position, total: queue.length }}
/>

<main class="drill">
  <section class="prompt" class:dimmed={frozen}>
    <p class="label">Write from memory</p>
    {#if card.script === 'kanji'}
      <p class="romaji">{card.meanings.join(', ')}</p>
      <p class="readings">{readingsLine(card)}</p>
    {:else if card.writtenRomaji}
      <p class="romaji">{card.romaji} ({card.writtenRomaji})</p>
    {:else}
      <p class="romaji">{card.romaji}</p>
    {/if}
    <p class="script">{scriptLabel[card.script]}</p>
  </section>

  <!-- The ink adapter owns the inner node: it creates and appends the single
       canvas element there on mount. Svelte renders nothing inside it. The
       `.cell` div itself is never inside a conditional block -- only its
       enclosing boxes change (Reveal adds a Reference `.panel` below), so
       Svelte never remounts it and the ink port's "mount() exactly once per
       instance" holds across a reveal. Each `.row-box` is its own
       container-query context so the cell can size itself to whatever room
       is actually left after the header/prompt/footer/grades claim theirs,
       rather than guessing a fraction of the viewport and risking a
       taller-than-fits page. -->
  <div
    class="cell-wrap"
    class:cell-wrap--revealed={revealed}
    class:dimmed={frozen}
  >
    <div class="panel" class:panel--ink={revealed}>
      {#if revealed}<p class="label" id="yours-label">Yours</p>{/if}
      <div class="row-box">
        <div
          class="cell"
          class:cell--locked={revealed || frozen}
          style={cellBoxStyle}
          bind:this={cell}
          role="group"
          aria-labelledby={revealed ? 'yours-label' : undefined}
        ></div>
      </div>
    </div>
    {#if revealed}
      <div class="panel panel--reference">
        <p class="label" id="reference-label">Reference</p>
        <div class="row-box">
          <div
            class="reference-row"
            role="group"
            aria-labelledby="reference-label"
            style={cellBoxStyle}
          >
            {#each [...card.grapheme] as char, index (index)}
              <div class="reference-cell">
                <span class="glyph" class:glyph--small={SMALL_KANA.has(char)}>{char}</span>
              </div>
            {/each}
          </div>
        </div>
      </div>
    {/if}
  </div>

  {#if !revealed && !frozen}
    <div class="cell-footer">
      <p class="disclaimer">Your call — nothing is checking the shape</p>
      {#if hasInk}
        <button type="button" class="clear" onclick={handleClear}>Clear</button>
      {/if}
    </div>
  {/if}

  <div class="grades">
    {#if frozen}
      <!-- The closing grade's action row: Reveal keeps its own frozen
           state (dimmed either way -- Missed/Correct never came back once
           reveal fired), and the wide control completes the session; Undo
           lives in the toast above, so the last card stays as reversible
           as every other one. -->
      <button type="button" class="btn btn--neutral btn--dimmed" disabled>
        {revealed ? 'Revealed' : 'Reveal'}
      </button>
      <button
        type="button"
        class="btn btn--primary next-btn"
        disabled={undoing}
        class:btn--dimmed={undoing}
        onclick={handleFinish}
      >
        Finish
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
         floating above the action row, not a dark full-width bar -- the
         graded card and its new miss count, plus a single outlined Undo
         pill. It rides over the next prompt (or the frozen last card)
         until the learner commits to what's under it: the new prompt's
         first stroke or a Reveal, Undo itself, or Finish on the last
         card. -->
    <div class="toast">
      <!-- role=status wraps ONLY the copy: a button inside a live region
           gets read out as part of the announcement, so Undo stays an
           ordinary control outside it. -->
      <div class="toast-copy" role="status">
        <p class="toast-headline">
          {graded.missCount !== null ? 'Marked missed' : 'Marked correct'}
        </p>
        <p class="toast-detail">
          {queue[graded.index]!.grapheme} · {scriptLabel[queue[graded.index]!.script]}
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
    /* Fills exactly the room the shell (`App.svelte`'s `.app`) leaves under
       the top bar -- the shell owns the fixed `100dvh`, and every other
       section's fixed sizing (leaving `.cell-wrap` to fill what's left,
       below) keeps the whole screen inside it with nothing to scroll. */
    flex: 1;
    min-height: 0;
    overflow: hidden;
    padding: var(--spacing-5) var(--spacing-4);
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

  .readings {
    /* The kanji prompt's second line: meanings big above, the readings
     * (kana, not the answer) in the heading serif but muted and smaller.
     * romaji/labels stay in `--font-heading`/`--font-body` (docs/design.md)
     * -- these are kana text, not the grapheme, so the brush face stays
     * reserved for the reference glyph. */
    margin: 0;
    font-family: var(--font-heading);
    font-size: 1.25rem;
    color: var(--color-ink-muted);
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
       normally (the ink cell, centered); Reveal stacks a second Reference
       panel below it. */
    flex: 1;
    min-height: 0;
    min-width: 0;
    display: flex;
    align-items: stretch;
    justify-content: center;
  }

  .cell-wrap--revealed {
    /* Portrait: stacking Yours over Reference at full width keeps the ink
       at a useful size where a side-by-side pair would halve it and leave
       large empty bands above and below. */
    flex-direction: column;
    gap: var(--spacing-3);
  }

  /* The learner's ink earns the larger share (2:1); the reference is a
     comparison aid, not the thing being practised. */
  .cell-wrap--revealed .panel--ink {
    flex: 2;
  }

  .cell-wrap--revealed .panel--reference {
    flex: 1;
  }

  .panel {
    flex: 1;
    min-height: 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1);
  }

  .row-box {
    /* The container-query context: the room left under the panel's label,
       so a row sized by `100cqh` can never push its own label out of the
       panel. */
    flex: 1;
    min-height: 0;
    container-type: size;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .cell {
    /* The inline style sizes the box: a row of N square cells (one per
       character), so `toGridRelative` -- x and y normalized independently
       -- never replays stored strokes distorted: the N:1 aspect is fixed
       per card. `cqw`/`cqh` are relative to `.row-box`'s actual box (from
       the flex layout above), so the row is always the largest that fits
       the room actually left -- never a guessed fraction of the viewport
       that could be taller than what's really available. The adapter draws
       the solid rules between cells on the canvas itself. */
    border: 1px solid var(--color-grid-guide);
    border-radius: var(--radius-lg);
    background: var(--color-surface-canvas);
    overflow: hidden;
    touch-action: none;
    -webkit-user-select: none;
    user-select: none;
  }

  .cell--locked {
    /* Once revealed, or on the frozen closing card, the cell is a frozen
       record of what was written, not an active writing surface --
       tracing over the just-revealed reference would undercut the whole
       point of reveal never assigning a grade for the learner, and writing
       after the queue is complete would attach strokes to a card whose
       attempt is already recorded. */
    pointer-events: none;
  }

  .reference-row {
    /* Mirrors `.cell`'s box (same inline sizing, its own row-box), so
       Yours/Reference read as one comparison pair -- one reference cell
       per character, in the same row shape the learner wrote in. Tinted
       `--color-missed-bg` (docs/design.md: the Reveal reference panel uses
       the missed tint, not the canvas ground -- this is attention, not the
       writing surface). */
    display: flex;
    border-radius: var(--radius-lg);
    background: var(--color-missed-bg);
    overflow: hidden;
  }

  .reference-cell {
    flex: 1;
    min-width: 0;
    height: 100%;
    /* Its own container-query context, so the glyph inside sizes against
       its cell (not the whole row) -- a small kana then renders small in
       the cell genkouyoushi gives it. */
    container-type: size;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* The same grid-guide rule the writing row draws between its cells, so
     the reference mirrors it cell for cell -- a repeated kana would
     otherwise read as one tinted slab. */
  .reference-cell + .reference-cell {
    border-left: 1px solid var(--color-grid-guide);
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

  .glyph--small {
    /* A small kana (the ョ in チョ) renders at about half size in its own
       cell, so the reference teaches the right proportions. */
    font-size: min(34cqw, 34cqh);
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
     (the shell is fixed to `100dvh` with nothing to scroll; see `.drill`
     above). */
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

  /* The closing grade dims and locks the last card -- its ink stays
     exactly as graded until Undo or Finish (see `frozen`). */
  .dimmed {
    opacity: 0.35;
  }

  /* Closing-grade action row: Reveal keeps its `flex: 1` share, Finish
     takes the two grade buttons' combined share instead of a third slot. */
  .next-btn {
    flex: 2;
  }
</style>
