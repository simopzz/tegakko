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
  import type { Scope } from '../../domain/scope';
  import type { InkSurface } from '../../ports/ink-surface';
  import type { Stroke } from '../../domain/ink';
  import type { Attempt, SelfGrade } from '../../domain/attempt';
  import type { AttemptRepository } from '../../ports/attempt-repository';
  import type { TallyRepository } from '../../ports/tally-repository';
  import type { Tally } from '../../domain/tally';
  import type { Result } from '../../domain/result';
  import { sampleSessionCards, undoLastGrade } from '../../domain/drill';
  import type { SessionRepository } from '../../ports/session-repository';
  import type { ClosureReason, SessionSummaryView } from '../../domain/session';
  import { isSessionIdle, buildSummary, buildSessionRecord } from '../../domain/session';

  interface Props {
    scope: Scope;
    /** Resolved card count for this session (`domain/scope.ts`'s
     * `resolveSessionSize`, computed by the composition root from the Scope
     * picker's `SessionSizeChoice`). Read exactly once, at mount, to draw
     * the sampled queue below -- never re-resolved mid-session (AD-10). */
    sessionSize: number;
    /** Session-start attempt history from the composition root, loaded once
     * via `listAll()` at drill entry -- never re-fetched mid-session
     * (AD-10). */
    attempts: Attempt[];
    /** Session-start tally snapshot from the composition root, loaded once
     * via `getAll()` at drill entry -- mirrors `attempts` above, never
     * re-fetched mid-session (Story 1.8). */
    tallies: Tally[];
    inkSurface: InkSurface;
    attemptRepository: AttemptRepository;
    tallyRepository: TallyRepository;
    sessionRepository: SessionRepository;
    /** Loaded once at drill entry, same as `widthPreset`/`tallies` -- no
     * live-reload mid-drill (Story 1.9's Boundaries & Constraints). */
    idleTimeoutMs: number;
    /** Fires on every session closure (explicit, full-scope, or inactivity)
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

  // Minted once per drill entry -- the composition root builds a fresh
  // component per entry (same lifetime as `card`, below), so this is stable
  // for every attempt this instance ever persists.
  const sessionId = crypto.randomUUID();

  // Story 1.9's closure bookkeeping. `sessionStartedAt` is the origin
  // `closeSession`'s `timeMs` measures from; `lastInteractionAt` is updated
  // by every interaction (`recordInteraction`) and read-only otherwise --
  // idle detection is retroactive, never a live timer (Boundaries &
  // Constraints). `closed` guards every closure path against firing twice.
  const sessionStartedAt = Date.now();
  let lastInteractionAt = Date.now();
  let closed = false;

  const scriptLabel: Record<Script, string> = {
    hiragana: 'Hiragana',
    katakana: 'Katakana',
  };

  // Populated only by this drill entry's own `handleGrade`/`handleUndo` --
  // the only attempts array `buildSummary`/`buildSessionRecord` ever read
  // from. Routing those through the learner's entire *lifetime* `attempts`
  // prop instead would auto-close a returning learner's session after a
  // single grade and report lifetime totals on the Summary screen (Spec
  // Change Log, review pass 1's `bad_spec` finding). Sampling itself needs
  // no equivalent mirror of `attempts` -- `sampleSessionCards` (below) reads
  // the `attempts` prop directly, once, at mount (AD-10) -- so there is no
  // `sessionAttempts` array to keep in sync alongside this one.
  const thisSessionAttempts: Attempt[] = [];

  // Plain, mirrors `thisSessionAttempts` above -- seeded once from the
  // session-start `tallies` prop, updated in-memory as grades/undos happen,
  // never re-fetched (Story 1.8's Boundaries & Constraints). Deliberately a
  // plain `Map`, not `SvelteMap`: nothing renders from it directly (its only
  // readers are `handleGrade`'s `tallyCount` computation and `handleUndo`'s
  // decrement), so it needs no reactivity of its own.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- plain, non-rendering lookup; see comment above.
  const cardTallies = new Map(untrack(() => tallies.map((t) => [t.cardId, t.missCount])));

  // Sampled exactly once, at mount, from the `attempts` prop as loaded --
  // weighted-without-replacement, then uniform-shuffled (AD-10). Fixed for
  // the lifetime of this drill entry: never re-sampled, appended to, or
  // reordered mid-session. `untrack`: a deliberate one-shot seed, not a
  // subscription to `attempts`/`scope`/`sessionSize` -- Svelte otherwise
  // warns (state_referenced_locally) about exactly that. `scope` is fixed
  // for the lifetime of a drill entry (the composition root builds a fresh
  // component per entry), so capturing its initial value is the intent.
  const queue: Card[] = untrack(() => sampleSessionCards(attempts, scope, sessionSize));

  // Index into `queue` of the card currently on screen. Advances only on
  // "Next character" (`handleNext`), never on the grade itself (Story 1.8's
  // deferred-advance pattern) -- Undo therefore needs no queue-reinsertion
  // logic: the pointer can never have passed the just-graded card while
  // Undo is offered (AD-13).
  let queueIndex = $state(0);
  // 1-based, purely for display -- `queueIndex + 1`, kept as its own
  // `$derived` rather than a hand-incremented `$state` so it can never
  // desync from `queueIndex`.
  const position = $derived(queueIndex + 1);
  let card = $state<Card>(queue[0]!);
  let hasInk = $state(false);
  // Reveal (Story 1.4): active the instant a prompt appears, resets on every
  // grade alongside `hasInk`. Once true it unlocks Missed/Correct even from a
  // blank cell -- revealing nothing is itself an honest "I don't know".
  let revealed = $state(false);

  // Story 1.8's deferred-advance toast. Set the instant a grade is submitted
  // (`handleGrade`), cleared by either `handleUndo` or `handleNext`. While
  // set, Missed/Correct/Reveal stay disabled and the prompt/ink/strokes are
  // exactly as they were the instant the grade fired -- the advance itself
  // (queue index/clear/reset) is deferred to `handleNext`, so Undo needs no
  // restore mechanism.
  let graded = $state<{ cardId: string; grade: SelfGrade; tallyCount: number | null } | null>(
    null,
  );
  // The in-flight `add()`/`increment()` promises fired by the grade `graded`
  // describes -- `handleUndo` awaits both before calling `deleteLast`/
  // `decrement`, so a fast Undo can never race the write it's meant to
  // reverse (Boundaries & Constraints). Plain, not `$state`: nothing renders
  // from these.
  let pendingAttemptWrite: Promise<Result<void>> | undefined;
  let pendingTallyWrite: Promise<Result<void>> | undefined;
  // Guards `handleUndo` against re-entrancy: a double-tap on "Undo" (or a
  // stray double keyboard activation) before its `await`s settle would
  // otherwise pop `thisSessionAttempts` and call `undoLastGrade` twice for
  // one grade (mirrors `App.svelte`'s `starting` guard on `handleStart`).
  let undoing = $state(false);

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

  // Sampling is without replacement (sampled once at session start, AD-10),
  // so the counter advances exactly one per grade and always reaches exactly
  // 100% -- it can never exceed `queue.length` (Boundaries & Constraints: no
  // overshoot-handling needed). Full-scope closure (Story 1.9) fires once
  // `queue` is exhausted, checked directly in `handleNext` below. The text
  // counter is never the only position signal -- it always shows alongside
  // this bar.
  const progress = $derived(position / queue.length);

  // Assigned by `bind:this` before `onMount` runs; typed as possibly
  // undefined rather than asserted, so the mount below is a real check.
  let cell: HTMLElement | undefined;
  // Focus target after Reveal fires (below): the button `disabled` there
  // stops being the focused element, and most browsers drop focus to
  // `<body>` rather than leaving it on the control the user just pressed.
  // `$state`: this binds inside the `{#if graded}...{:else}...{/if}` grades
  // block (A4's action row swap), so it's rebound/unbound on every toast
  // show/hide, not just once at mount.
  let missedButton: HTMLButtonElement | undefined = $state();
  // Focus target after a grade fires and the toast appears: Missed/Correct
  // become `disabled` the same way Reveal does above, so focus would
  // otherwise drop to `<body>` right as two new controls (Undo/Next
  // character) appear. `$state`, unlike `missedButton` above: this one binds
  // inside a conditional (`{#if graded}`) block, so it's rebound/unbound on
  // every toast show/hide rather than once at mount.
  let undoButton: HTMLButtonElement | undefined = $state();

  // Story 1.9's idle-detection mechanism: retroactive, never a live timer.
  // Every interaction routes through `recordInteraction` first -- if idle
  // time has already elapsed, that interaction closes the session instead
  // of landing, and is itself dropped (Boundaries & Constraints).
  function recordInteraction(): boolean {
    // Guards `undoing` too (same reasoning as `checkIdleOnResume`/
    // `handleExplicitClose`): an interaction landing mid-Undo must neither
    // bump `lastInteractionAt` nor close/persist ahead of the in-flight
    // reversal -- it is dropped, exactly like the idle-revealing interaction.
    if (closed || undoing) return false;
    if (isSessionIdle(lastInteractionAt, idleTimeoutMs)) {
      closeSession('inactivity', lastInteractionAt);
      return false;
    }
    lastInteractionAt = Date.now();
    return true;
  }

  // Fired on `visibilitychange`/`focus` (below): the same idle check as
  // `recordInteraction`, but never updates `lastInteractionAt` itself -- a
  // resume is not, on its own, proof of presence the way an actual
  // interaction is. Guards `undoing` too: firing mid-Undo (its pending
  // attempt/tally writes still in flight) would otherwise close/persist the
  // session counting the not-yet-reversed grade while the in-flight Undo
  // still reverses it afterward, desyncing the persisted session from the
  // attempts/tallies store.
  function checkIdleOnResume(): void {
    if (undoing) return;
    if (isSessionIdle(lastInteractionAt, idleTimeoutMs)) {
      closeSession('inactivity', lastInteractionAt);
    }
  }

  onMount(() => {
    if (!cell) return;
    inkSurface.onStrokeComplete((stroke, timing) => {
      // A reveal locks the cell to pointer input (see `.cell--locked`
      // below); this guards the same invariant at the state level in case a
      // stroke-complete notification is ever still in flight when it fires.
      if (revealed) return;
      // A stroke is itself an interaction: if it arrives idle-eligible, it
      // closes the session instead of landing -- the interaction that
      // reveals an idle session is dropped, never recorded as part of the
      // closed session (Boundaries & Constraints).
      if (!recordInteraction()) return;
      hasInk = true;
      strokes.push(stroke);
      // Only the first stroke since the last Clear/grade sets this --
      // `timeToFirstStrokeMs` measures to the *first* stroke, not the latest.
      firstStrokeStartedAt ??= timing.startedAt;
    });
    inkSurface.mount(cell);
    // Idle detection is retroactive, never a live timer: every resume
    // (`visibilitychange`/`focus`) re-checks elapsed idle time against
    // `lastInteractionAt` instead of a running countdown.
    document.addEventListener('visibilitychange', checkIdleOnResume);
    window.addEventListener('focus', checkIdleOnResume);
    return () => {
      inkSurface.destroy();
      document.removeEventListener('visibilitychange', checkIdleOnResume);
      window.removeEventListener('focus', checkIdleOnResume);
    };
  });

  function handleClear(): void {
    if (!recordInteraction()) return;
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
    if (!recordInteraction()) return;
    // Never assigns a grade -- Missed/Correct stay required afterward.
    revealed = true;
    // Move focus onto the newly-active Missed button so a keyboard/screen
    // reader user isn't dropped to `<body>` by Reveal's own `disabled`.
    void tick().then(() => missedButton?.focus());
  }

  function handleGrade(grade: SelfGrade): void {
    if (!recordInteraction()) return;
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
    // This drill entry's own attempts only (Story 1.9) -- feeds
    // `buildSummary`/`buildSessionRecord`. The sampled `queue` above needs
    // no equivalent append: it was drawn once at mount and never grows or
    // reorders mid-session (AD-10).
    thisSessionAttempts.push(attempt);
    // Captured (not awaited here) so `handleUndo` can await the same
    // promise before calling `deleteLast` -- a fast Undo could otherwise
    // race the write it's meant to reverse. The logging chain below still
    // fires independently and never blocks advancing.
    const attemptWrite = attemptRepository.add(attempt);
    pendingAttemptWrite = attemptWrite;
    void attemptWrite
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
      const tallyWrite = tallyRepository.increment(card.cardId);
      pendingTallyWrite = tallyWrite;
      void tallyWrite
        .then((result) => {
          if (!result.ok) console.error('Failed to increment tally:', result.error);
        })
        .catch((error: unknown) => {
          console.error('Failed to increment tally:', error);
        });
    } else {
      pendingTallyWrite = undefined;
    }

    // Defer the advance (queue index/clear/reset) to `handleNext` -- the
    // toast shows instead, offering Undo (always) and the new cumulative
    // tally (only on Missed). Committed here (not just computed) so a later
    // Missed grade on the same card this session reads the updated count
    // instead of the stale pre-grade one -- `handleUndo`'s decrement is what
    // reverses exactly this write.
    let tallyCount: number | null = null;
    if (grade === 'incorrect') {
      tallyCount = (cardTallies.get(card.cardId) ?? 0) + 1;
      cardTallies.set(card.cardId, tallyCount);
    }
    graded = { cardId: card.cardId, grade, tallyCount };
    // Move focus onto Undo, the same way Reveal moves it onto Missed:
    // Missed/Correct/Reveal just went `disabled`, and the toast's two
    // controls are new to the page.
    void tick().then(() => undoButton?.focus());
  }

  function handleNext(): void {
    if (!recordInteraction()) return;
    // Full-scope closure (Story 1.9) rides this existing tap rather than a
    // new control: the queue-completing grade still shows the normal
    // toast/Undo, and only tapping past it (here, with no next queue entry
    // to load) closes the session -- exact, since `queue` is sampled without
    // replacement (AD-10), never merely "probably done".
    if (queueIndex + 1 >= queue.length) {
      closeSession('full-scope', Date.now());
      return;
    }
    // Exactly the advance block that used to run at the end of `handleGrade`
    // (Story 1.8 defers it to here) -- now a queue-pointer advance instead
    // of a fresh weighted draw.
    queueIndex += 1;
    card = queue[queueIndex]!;
    revealed = false;
    inkSurface.clear();
    hasInk = false;
    strokes = [];
    firstStrokeStartedAt = undefined;
    promptShownAt = performance.now();
    graded = null;
    pendingAttemptWrite = undefined;
    pendingTallyWrite = undefined;
  }

  async function handleUndo(): Promise<void> {
    if (!recordInteraction()) return;
    // Re-entrancy guard: a double-tap before the `await`s below settle would
    // otherwise run everything from here down twice for one grade (pop
    // `thisSessionAttempts` twice, decrement `cardTallies` twice, call
    // `undoLastGrade` twice).
    if (!graded || undoing) return;
    undoing = true;
    try {
      const { cardId, grade } = graded;
      // Await the pending writes first -- a fast Undo must never race the
      // store it's meant to reverse (Boundaries & Constraints). Their
      // resolved `Result` (not just settlement) matters below: a write that
      // never actually landed has nothing in the store for `undoLastGrade`
      // to reverse.
      const attemptWriteResult = await pendingAttemptWrite?.catch(
        (error: unknown): Result<void> => ({
          ok: false,
          error: error instanceof Error ? error : new Error(String(error)),
        }),
      );
      const tallyWriteResult =
        grade === 'incorrect'
          ? await pendingTallyWrite?.catch(
              (error: unknown): Result<void> => ({
                ok: false,
                error: error instanceof Error ? error : new Error(String(error)),
              }),
            )
          : undefined;

      // Unconditional, regardless of the repository calls' outcome below --
      // the in-memory mirror must reflect "this grade never happened"
      // either way. No queue-side reversal needed alongside it: `queueIndex`
      // only ever advances on "Next character", which Undo is offered as an
      // alternative to, so the pointer has never passed this card while
      // Undo is reachable (AD-13) -- there is nothing to reinsert.
      thisSessionAttempts.pop();
      if (grade === 'incorrect') {
        cardTallies.set(cardId, Math.max(0, (cardTallies.get(cardId) ?? 0) - 1));
      }

      // Only reverse what the store actually recorded: if `add()` never
      // succeeded, nothing was persisted for `deleteLast` to remove, and
      // calling it anyway would delete an unrelated, previously-persisted
      // attempt for this session instead of no-op'ing. Same reasoning for
      // `decrement` against a failed `increment()`.
      if (attemptWriteResult?.ok) {
        const wasIncorrect = grade === 'incorrect' && tallyWriteResult?.ok === true;
        const result = await undoLastGrade(
          sessionId,
          cardId,
          wasIncorrect,
          attemptRepository,
          tallyRepository,
        );
        if (!result.ok) console.error('Failed to undo grade:', result.error);
      }

      graded = null;
      pendingAttemptWrite = undefined;
      pendingTallyWrite = undefined;
    } finally {
      undoing = false;
    }
  }

  // Closes the session exactly once, regardless of which of the three
  // triggers fired it (Boundaries & Constraints). An idle closure's
  // `dateIso`/`timeMs` are backdated to `closedAt` (`lastInteractionAt`,
  // when activity actually stopped) rather than credited to whenever the
  // app happened to resume; every other closure uses `Date.now()`.
  function closeSession(reason: ClosureReason, closedAt: number): void {
    if (closed) return;
    closed = true;
    const effectiveClosedAt = reason === 'inactivity' ? closedAt : Date.now();
    const dateIso = new Date(effectiveClosedAt).toISOString();
    // Clamped at 0: a backward system-clock adjustment mid-session would
    // otherwise yield a negative duration (device clock skew -- this is an
    // offline client with no server clock authority, mirrors
    // `domain/drill.ts`'s `score()` clamp).
    const timeMs = Math.max(0, effectiveClosedAt - sessionStartedAt);
    // `thisSessionAttempts`, never the learner's lifetime `attempts` prop --
    // the persisted record and the Summary view must reflect only this
    // session's own attempts (Spec Change Log).
    const summary = buildSummary(thisSessionAttempts, cardTallies, reason, timeMs);
    // `sessionId`, not a fresh UUID -- keeps the persisted `Session.id`
    // correlated with this session's own `Attempt.sessionId` values.
    // `$state.snapshot`: `scope` arrives as a Svelte 5 deep proxy (App's
    // `$state` plus `$props()` re-wrapping), and a proxy is not
    // structured-cloneable -- handing it to `sessionRepository.add()`
    // verbatim makes IndexedDB reject the write with a DataCloneError, so
    // the session silently never persists (only a console.error remains).
    // Snapshot to plain data at this boundary; every other record field is
    // already plain (`strokes` is deliberately a non-`$state` local above).
    const record = buildSessionRecord(sessionId, $state.snapshot(scope), thisSessionAttempts, reason, dateIso);
    // Fire-and-forget, logged on failure, same as every other write in this
    // codebase (Boundaries & Constraints) -- it must never block reaching
    // the Summary screen.
    void sessionRepository
      .add(record)
      .then((result) => {
        if (!result.ok) console.error('Failed to persist session:', result.error);
      })
      .catch((error: unknown) => {
        console.error('Failed to persist session:', error);
      });
    onClose(summary);
  }

  // "I'm done" always closes with `closureReason: 'explicit'` immediately,
  // regardless of elapsed idle time -- never routed through
  // `recordInteraction`/gated by the idle check, so a deliberate close is
  // never confusingly relabeled as an idle one (Boundaries & Constraints).
  // Guards `undoing` too, same reasoning as `checkIdleOnResume` above -- a
  // tap landing mid-Undo must not close/persist the session ahead of that
  // Undo's still-in-flight reversal.
  function handleExplicitClose(): void {
    if (closed || undoing) return;
    closeSession('explicit', Date.now());
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
  <div
    class="cell-wrap"
    class:cell-wrap--revealed={revealed}
    class:dimmed={graded !== null}
  >
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
      <!-- Mirrors UX spec screen A4: the action row collapses to a dimmed
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
    <!-- UX spec screen A4 "self-grade landed": a peach (missed-tint) card
         floating above the action row, not a dark full-width bar -- message
         plus a single outlined Undo pill; "Next character" lives in the
         action row above, not in this card. -->
    <div class="toast" role="status">
      <div class="toast-copy">
        <p class="toast-headline">
          {graded.tallyCount !== null ? 'Marked missed' : 'Marked correct'}
        </p>
        <p class="toast-detail">
          {card.grapheme} · {scriptLabel[card.script]}
          {#if graded.tallyCount !== null}
            — missed {graded.tallyCount}
            {graded.tallyCount === 1 ? 'time' : 'times'} now, so it'll come round
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

  /* Story 1.8's post-grade toast (UX spec screen A4): the missed-tint card
     floats above the action row -- an overlay, not a flex-column sibling,
     so it can appear/disappear on every grade without reflowing `.drill`
     (fixed to `100dvh` with nothing to scroll; see `.drill` above). */
  .toast {
    position: fixed;
    left: var(--spacing-6);
    right: var(--spacing-6);
    /* Clears the action row (`.btn`'s 88px plus `.drill`'s bottom padding)
       so it floats above the buttons, never over them (A4). */
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

  /* Dimmed *and* `disabled` while a reversal is in flight (Boundaries &
     Constraints) -- mirrors `.btn--dimmed`'s reasoning above. */
  .toast-undo:disabled {
    opacity: 0.5;
    cursor: default;
  }

  /* Prompt and cell fade back (A4) once a grade lands -- signals the drill
     is mid-transition without hiding what was just written; ink/strokes
     stay exactly as graded until "Next character" (see `handleNext`). */
  .dimmed {
    opacity: 0.35;
  }

  /* A4's action row: Reveal keeps its `flex: 1` share, "Next character"
     takes the two grade buttons' combined share instead of a third slot. */
  .next-btn {
    flex: 2;
  }
</style>
