<script lang="ts">
  // PROTOTYPE ONLY (ticket #80): Three radically different UI variations for
  // triggering Auto-grade, viewing two-part feedback (grapheme pass/fail +
  // advisory stroke-order hint), and accepting or overriding with Self-grade.
  // Sub-shape A: mounted inside the real Drill route with real InkSurface and
  // DrillSession, gated by `?variant=`.
  import { onMount, tick } from 'svelte';
  import { SMALL_KANA, type KanjiCard, type Script } from '../../domain/cards';
  import type { InkSurface } from '../../ports/ink-surface';
  import type { Stroke } from '../../domain/ink';
  import type { SelfGrade } from '../../domain/attempt';
  import { DrillSession } from './drill-session';
  import TopBar from './TopBar.svelte';
  import type { MockOutcome, VariantKey } from './PrototypeSwitcher.svelte';

  interface Props {
    drillSession: DrillSession;
    inkSurface: InkSurface;
    variant: VariantKey;
    mockOutcome: MockOutcome;
  }

  interface AutoGradeResult {
    status: 'ok' | 'offline';
    passed: boolean | null;
    recognizedAs: string | null;
    strokeOrder: 'ok' | 'mismatch';
    strokeHint: string;
  }

  const { drillSession: session, inkSurface, variant, mockOutcome }: Props = $props();
  const queue = $derived(session.queue);

  const scriptLabel: Record<Script, string> = {
    hiragana: 'Hiragana',
    katakana: 'Katakana',
    kanji: 'Kanji',
  };

  function readingsLine(card: KanjiCard): string {
    return [card.onyomi.join(' '), card.kunyomi.join(' ')]
      .filter((part) => part.length > 0)
      .join(' · ');
  }

  let queueIndex = $state(0);
  const position = $derived(queueIndex + 1);
  const card = $derived(queue[queueIndex]!);
  const cellCount = $derived(card.grapheme.length);
  const cellBoxStyle = $derived(
    `width: min(100cqw, ${cellCount * 100}cqh); height: min(${100 / cellCount}cqw, 100cqh)`,
  );

  let hasInk = $state(false);
  let revealed = $state(false);
  let checking = $state(false);
  let autoResult = $state<AutoGradeResult | null>(null);
  let manualMode = $state(false);

  let graded = $state<{
    grade: SelfGrade;
    missCount: number | null;
    index: number;
    revealed: boolean;
    strokes: Stroke[];
    promptShownAt: number;
    firstStrokeStartedAt: number | undefined;
  } | null>(null);
  const frozen = $derived(graded !== null && graded.index === queueIndex);
  let undoing = $state(false);

  let strokes: Stroke[] = [];
  let promptShownAt = performance.now();
  let firstStrokeStartedAt: number | undefined;
  let cell: HTMLElement | undefined;

  const isLocked = $derived(
    frozen ||
      (variant === 'A' && revealed) ||
      (variant === 'B' && (revealed || autoResult !== null || checking)) ||
      (variant === 'C' && (revealed || checking)),
  );

  function buildMockResult(targetGrapheme: string, outcome: MockOutcome): AutoGradeResult {
    const misreadChar =
      targetGrapheme === 'あ' ? 'お' : targetGrapheme === 'シ' ? 'ツ' : 'め';
    switch (outcome) {
      case 'pass-clean':
        return {
          status: 'ok',
          passed: true,
          recognizedAs: targetGrapheme,
          strokeOrder: 'ok',
          strokeHint: 'Stroke order matches standard order',
        };
      case 'pass-order-hint':
        return {
          status: 'ok',
          passed: true,
          recognizedAs: targetGrapheme,
          strokeOrder: 'mismatch',
          strokeHint: 'Advisory: strokes 2 and 3 were written in reverse order',
        };
      case 'fail-misread':
        return {
          status: 'ok',
          passed: false,
          recognizedAs: misreadChar,
          strokeOrder: 'mismatch',
          strokeHint: 'Advisory: stroke count/order differs from reference',
        };
      case 'offline':
        return {
          status: 'offline',
          passed: null,
          recognizedAs: null,
          strokeOrder: 'ok',
          strokeHint: 'Offline — grapheme check skipped; grade yourself',
        };
    }
  }

  // Re-evaluate simulated auto-result if the user switches the Mock selector while viewing a result.
  $effect(() => {
    if (autoResult !== null) {
      autoResult = buildMockResult(card.grapheme, mockOutcome);
    }
  });

  function resetCardState(): void {
    revealed = false;
    checking = false;
    autoResult = null;
    manualMode = false;
    hasInk = false;
    strokes = [];
    promptShownAt = performance.now();
    firstStrokeStartedAt = undefined;
  }

  function endUndoWindow(): void {
    if (graded === null) return;
    graded = null;
    session.clearUndoable();
  }

  onMount(() => {
    if (!cell) return;
    inkSurface.onStrokeComplete((stroke, timing) => {
      if (isLocked) return;
      if (!session.recordInteraction()) return;
      endUndoWindow();
      hasInk = true;
      strokes.push(stroke);
      if (firstStrokeStartedAt === undefined) {
        firstStrokeStartedAt = timing.startedAt;
      }
      // In Variant C, drawing again after a check clears the stale stamp so the learner can re-check.
      if (variant === 'C' && autoResult !== null) {
        autoResult = null;
      }
    });
    inkSurface.mount(cell);
    inkSurface.setCellCount(card.grapheme.length);
    return () => inkSurface.destroy();
  });

  function handleClear(): void {
    if (isLocked) return;
    if (!session.recordInteraction()) return;
    endUndoWindow();
    inkSurface.clear();
    strokes = [];
    hasInk = false;
    firstStrokeStartedAt = undefined;
    autoResult = null;
  }

  async function runCheck(): Promise<void> {
    if (checking) return;
    checking = true;
    const expected = card.grapheme;
    await new Promise((r) => setTimeout(r, 320));
    checking = false;
    autoResult = buildMockResult(expected, mockOutcome);
  }

  async function handleReveal(): Promise<void> {
    if (revealed || frozen) return;
    if (!session.recordInteraction()) return;
    endUndoWindow();
    revealed = true;
    if (variant === 'A' && hasInk && autoResult === null) {
      await runCheck();
    }
  }

  async function handleCheck(): Promise<void> {
    if (!hasInk || checking || frozen) return;
    if (!session.recordInteraction()) return;
    endUndoWindow();
    await runCheck();
  }

  function handleRetry(): void {
    if (frozen) return;
    if (!session.recordInteraction()) return;
    inkSurface.clear();
    strokes = [];
    hasInk = false;
    firstStrokeStartedAt = undefined;
    autoResult = null;
    revealed = false;
  }

  async function handleGrade(grade: SelfGrade): Promise<void> {
    if (frozen || undoing) return;
    if (!session.recordInteraction()) return;
    const snapshot = {
      index: queueIndex,
      revealed,
      strokes: [...strokes],
      promptShownAt,
      firstStrokeStartedAt,
    };
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
      ...snapshot,
    };

    if (!session.isLastCard(queueIndex)) {
      queueIndex += 1;
      resetCardState();
      inkSurface.clear();
      inkSurface.setCellCount(queue[queueIndex]!.grapheme.length);
    }
    await tick();
  }

  async function handleUndo(): Promise<void> {
    if (!graded || undoing) return;
    const snapshot = graded;
    undoing = true;
    try {
      await session.undoLastGrade();
      graded = null;
      resetCardState();
      queueIndex = snapshot.index;
      revealed = snapshot.revealed;
      strokes = snapshot.strokes;
      promptShownAt = snapshot.promptShownAt;
      firstStrokeStartedAt = snapshot.firstStrokeStartedAt;
      hasInk = snapshot.strokes.length > 0;
      inkSurface.setCellCount(queue[snapshot.index]!.grapheme.length);
      inkSurface.restore(snapshot.strokes);
    } finally {
      undoing = false;
    }
  }

  function handleFinish(): void {
    session.closeComplete();
  }

  const recommendedGrade = $derived<SelfGrade | null>(
    autoResult?.status === 'ok' ? (autoResult.passed ? 'correct' : 'incorrect') : null,
  );
</script>

<TopBar
  backLabel="I'm done"
  onBack={() => session.closeExplicit()}
  progress={{ now: position, total: queue.length }}
/>

<main class="drill">
  <section class="prompt" class:dimmed={frozen}>
    <p class="label">Write from memory · Variant {variant}</p>
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

  <div class="cell-wrap" class:cell-wrap--revealed={revealed} class:dimmed={frozen}>
    <div class="panel" class:panel--ink={revealed}>
      {#if revealed}<p class="label">Yours</p>{/if}
      <div class="row-box">
        <div
          class="cell"
          class:cell--locked={isLocked}
          style={cellBoxStyle}
          bind:this={cell}
          role="group"
        ></div>
      </div>
    </div>
    {#if revealed}
      <div class="panel panel--reference">
        <p class="label">Reference</p>
        <div class="row-box">
          <div class="reference-row" style={cellBoxStyle}>
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

  <!-- ============================================================
       VARIANT A: Reveal & Check (Combined trigger + Verdict Strip)
       ============================================================ -->
  {#if variant === 'A'}
    {#if autoResult || checking}
      <div
        class="verdict-strip"
        class:verdict--pass={autoResult?.status === 'ok' && autoResult.passed}
        class:verdict--fail={autoResult?.status === 'ok' && !autoResult.passed}
        class:verdict--offline={autoResult?.status === 'offline'}
        role="status"
      >
        {#if checking}
          <p class="verdict-main">Checking ink…</p>
        {:else if autoResult?.status === 'offline'}
          <p class="verdict-main">Offline — grade yourself</p>
          <p class="verdict-sub">{autoResult.strokeHint}</p>
        {:else if autoResult}
          <p class="verdict-main">
            {#if autoResult.passed}
              ✓ Looks like <span class="verdict-glyph">{autoResult.recognizedAs}</span>
            {:else}
              ✗ Read as <span class="verdict-glyph">{autoResult.recognizedAs}</span> (expected{' '}
              <span class="verdict-glyph">{card.grapheme}</span>)
            {/if}
          </p>
          <p class="verdict-sub">
            {autoResult.strokeOrder === 'ok' ? 'Order: ✓' : autoResult.strokeHint}
          </p>
        {/if}
      </div>
    {:else if !revealed && !frozen}
      <div class="cell-footer">
        <p class="disclaimer">
          {hasInk ? 'Reveal & Check will grade your ink' : 'Write from memory, or Reveal if stuck'}
        </p>
        {#if hasInk}
          <button type="button" class="clear" onclick={handleClear}>Clear</button>
        {/if}
      </div>
    {/if}

    <div class="grades">
      {#if frozen}
        <button type="button" class="btn btn--neutral btn--dimmed" disabled>
          {revealed ? 'Revealed' : 'Reveal'}
        </button>
        <button type="button" class="btn btn--primary next-btn" onclick={handleFinish}>Finish</button>
      {:else if autoResult && autoResult.status === 'ok'}
        <button
          type="button"
          class="btn"
          class:btn--primary={!autoResult.passed}
          class:btn--neutral={autoResult.passed}
          onclick={() => handleGrade('incorrect')}
        >
          {autoResult.passed ? 'Override: Missed' : 'Accept: Missed'}
        </button>
        <button
          type="button"
          class="btn"
          class:btn--primary={autoResult.passed}
          class:btn--neutral={!autoResult.passed}
          onclick={() => handleGrade('correct')}
        >
          {autoResult.passed ? 'Accept: Correct' : 'Override: Correct'}
        </button>
      {:else}
        <button
          type="button"
          class="btn"
          class:btn--primary={hasInk && !revealed}
          class:btn--neutral={!hasInk || revealed}
          class:btn--dimmed={revealed || checking}
          disabled={revealed || checking}
          onclick={handleReveal}
        >
          {revealed ? 'Revealed' : hasInk ? 'Reveal & Check' : 'Reveal'}
        </button>
        <button
          type="button"
          class="btn btn--neutral"
          class:btn--dimmed={!hasInk && !revealed}
          disabled={(!hasInk && !revealed) || checking}
          onclick={() => handleGrade('incorrect')}
        >
          Missed
        </button>
        <button
          type="button"
          class="btn"
          class:btn--primary={!hasInk && revealed}
          class:btn--neutral={hasInk || !revealed}
          class:btn--dimmed={!hasInk && !revealed}
          disabled={(!hasInk && !revealed) || checking}
          onclick={() => handleGrade('correct')}
        >
          Correct
        </button>
      {/if}
    </div>

  <!-- ============================================================
       VARIANT B: Check-First Card (Check independent of Reveal)
       ============================================================ -->
  {:else if variant === 'B'}
    {#if autoResult || checking}
      <div
        class="verdict-card"
        class:verdict--pass={autoResult?.status === 'ok' && autoResult.passed}
        class:verdict--fail={autoResult?.status === 'ok' && !autoResult.passed}
        class:verdict--offline={autoResult?.status === 'offline'}
        role="status"
      >
        {#if checking}
          <div class="verdict-card-top">
            <span class="badge">Checking…</span>
          </div>
        {:else if autoResult}
          <div class="verdict-card-top">
            <div>
              <span class="badge">
                {autoResult.status === 'offline'
                  ? 'Offline'
                  : autoResult.passed
                    ? 'Pass'
                    : 'Mismatch'}
              </span>
              <span class="verdict-card-title">
                {#if autoResult.status === 'offline'}
                  Manual Self-grade needed
                {:else if autoResult.passed}
                  Read as <span class="verdict-glyph">{autoResult.recognizedAs}</span>
                {:else}
                  Read as <span class="verdict-glyph">{autoResult.recognizedAs}</span> · Expected{' '}
                  <span class="verdict-glyph">{card.grapheme}</span>
                {/if}
              </span>
            </div>
            {#if !revealed}
              <button type="button" class="link-btn" onclick={handleReveal}>Show reference</button>
            {/if}
          </div>
          <p class="verdict-sub">
            {autoResult.strokeOrder === 'ok' ? '✓ Standard stroke order' : `⚠ ${autoResult.strokeHint}`}
          </p>
        {/if}
      </div>
    {:else if !frozen}
      <div class="cell-footer">
        <button type="button" class="link-btn" onclick={() => (manualMode = !manualMode)}>
          {manualMode ? 'Use Check' : 'Grade manually'}
        </button>
        {#if hasInk && !revealed}
          <button type="button" class="clear" onclick={handleClear}>Clear</button>
        {/if}
      </div>
    {/if}

    <div class="grades">
      {#if frozen}
        <button type="button" class="btn btn--primary next-btn" onclick={handleFinish}>Finish</button>
      {:else if manualMode || autoResult?.status === 'offline'}
        <button
          type="button"
          class="btn btn--neutral"
          disabled={revealed}
          class:btn--dimmed={revealed}
          onclick={handleReveal}
        >
          {revealed ? 'Revealed' : 'Reveal'}
        </button>
        <button
          type="button"
          class="btn btn--neutral"
          disabled={!hasInk && !revealed}
          class:btn--dimmed={!hasInk && !revealed}
          onclick={() => handleGrade('incorrect')}
        >
          Missed
        </button>
        <button
          type="button"
          class="btn btn--primary"
          disabled={!hasInk && !revealed}
          class:btn--dimmed={!hasInk && !revealed}
          onclick={() => handleGrade('correct')}
        >
          Correct
        </button>
      {:else if autoResult && recommendedGrade}
        <button
          type="button"
          class="btn btn--neutral"
          onclick={() => handleGrade(recommendedGrade === 'correct' ? 'incorrect' : 'correct')}
        >
          {recommendedGrade === 'correct' ? 'Override: Missed' : 'Override: Correct'}
        </button>
        <button
          type="button"
          class="btn btn--primary next-btn"
          onclick={() => handleGrade(recommendedGrade)}
        >
          {recommendedGrade === 'correct' ? 'Accept Pass & Next →' : 'Accept Miss & Next →'}
        </button>
      {:else}
        <button
          type="button"
          class="btn btn--neutral"
          disabled={revealed || checking}
          class:btn--dimmed={revealed || checking}
          onclick={handleReveal}
        >
          {revealed ? 'Revealed' : 'Reveal'}
        </button>
        <button
          type="button"
          class="btn btn--primary next-btn"
          disabled={!hasInk || checking}
          class:btn--dimmed={!hasInk || checking}
          onclick={handleCheck}
        >
          {checking ? 'Checking…' : 'Check'}
        </button>
      {/if}
    </div>

  <!-- ============================================================
       VARIANT C: Stamp & Retry (Floating stamp + Retry / Flip / Confirm)
       ============================================================ -->
  {:else}
    {#if autoResult || checking}
      <div
        class="stamp-banner"
        class:verdict--pass={autoResult?.status === 'ok' && autoResult.passed}
        class:verdict--fail={autoResult?.status === 'ok' && !autoResult.passed}
        class:verdict--offline={autoResult?.status === 'offline'}
        role="status"
      >
        {#if checking}
          <p class="verdict-main">Checking…</p>
        {:else if autoResult}
          <div class="stamp-copy">
            <p class="verdict-main">
              {#if autoResult.status === 'offline'}
                Offline — grade yourself
              {:else if autoResult.passed}
                Looks like <span class="verdict-glyph">{autoResult.recognizedAs}</span>
              {:else}
                Looks like <span class="verdict-glyph">{autoResult.recognizedAs}</span>, not{' '}
                <span class="verdict-glyph">{card.grapheme}</span>
              {/if}
            </p>
            <p class="verdict-sub">
              {autoResult.strokeOrder === 'ok' ? 'Order: ✓' : autoResult.strokeHint}
            </p>
          </div>
          {#if !revealed}
            <button type="button" class="link-btn" onclick={handleReveal}>Reveal</button>
          {/if}
        {/if}
      </div>
    {:else if !frozen}
      <div class="cell-footer">
        <p class="disclaimer">
          {hasInk ? 'Draw more or tap Check' : 'Write from memory'}
        </p>
        {#if hasInk && !revealed}
          <button type="button" class="clear" onclick={handleClear}>Clear</button>
        {/if}
      </div>
    {/if}

    <div class="grades">
      {#if frozen}
        <button type="button" class="btn btn--primary next-btn" onclick={handleFinish}>Finish</button>
      {:else if autoResult?.status === 'offline'}
        <button type="button" class="btn btn--neutral" onclick={() => handleGrade('incorrect')}>
          Missed
        </button>
        <button type="button" class="btn btn--primary" onclick={() => handleGrade('correct')}>
          Correct
        </button>
      {:else if autoResult && recommendedGrade}
        <button type="button" class="btn btn--neutral" onclick={handleRetry}>Retry</button>
        <button
          type="button"
          class="btn btn--neutral"
          onclick={() => handleGrade(recommendedGrade === 'correct' ? 'incorrect' : 'correct')}
        >
          {recommendedGrade === 'correct' ? 'No, Missed' : 'No, Correct'}
        </button>
        <button
          type="button"
          class="btn btn--primary"
          onclick={() => handleGrade(recommendedGrade)}
        >
          Confirm →
        </button>
      {:else}
        <button
          type="button"
          class="btn btn--neutral"
          disabled={revealed || checking}
          class:btn--dimmed={revealed || checking}
          onclick={handleReveal}
        >
          {revealed ? 'Revealed' : 'Reveal'}
        </button>
        <button
          type="button"
          class="btn btn--primary next-btn"
          disabled={!hasInk || checking}
          class:btn--dimmed={!hasInk || checking}
          onclick={handleCheck}
        >
          {checking ? 'Checking…' : 'Check'}
        </button>
      {/if}
    </div>
  {/if}

  {#if graded}
    <div class="toast">
      <div class="toast-copy" role="status">
        <p class="toast-headline">
          {graded.missCount !== null ? 'Marked missed' : 'Marked correct'}
        </p>
        <p class="toast-detail">
          {queue[graded.index]!.grapheme} · {scriptLabel[queue[graded.index]!.script]}
          {#if graded.missCount !== null}
            · missed {graded.missCount}; returns sooner
          {/if}
        </p>
      </div>
      <button type="button" class="toast-undo" disabled={undoing} onclick={handleUndo}>
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
    flex: 1;
    min-height: 0;
    overflow: hidden;
    background: var(--color-paper);
    padding: var(--spacing-5) var(--spacing-4) 64px;
  }

  .prompt {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-1);
    padding: var(--spacing-2) 0 var(--spacing-3);
    border-bottom: 1px solid var(--color-paper-line);
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
    flex: 1;
    min-height: 0;
    min-width: 0;
    display: flex;
    align-items: stretch;
    justify-content: center;
  }

  .cell-wrap--revealed {
    flex-direction: column;
    gap: var(--spacing-3);
  }

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
    flex: 1;
    min-height: 0;
    container-type: size;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .cell {
    border: 1px solid var(--color-grid-guide);
    border-radius: var(--radius-sm);
    background: var(--color-surface-canvas);
    overflow: hidden;
    touch-action: none;
    user-select: none;
  }

  .cell--locked {
    pointer-events: none;
  }

  .reference-row {
    display: flex;
    border-radius: var(--radius-lg);
    background: var(--color-missed-bg);
    overflow: hidden;
  }

  .reference-cell {
    flex: 1;
    min-width: 0;
    height: 100%;
    container-type: size;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .reference-cell + .reference-cell {
    border-left: 1px solid var(--color-grid-guide);
  }

  .glyph {
    font-family: var(--font-glyph-ink);
    font-size: min(60cqw, 60cqh);
    line-height: 1;
    color: var(--color-missed-fg);
    transform: rotate(-1.2deg);
    white-space: nowrap;
  }

  .glyph--small {
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
    min-height: 48px;
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

  .link-btn {
    background: transparent;
    border: none;
    padding: 6px 4px;
    font-family: var(--font-body);
    font-weight: 600;
    font-size: 0.92rem;
    color: var(--color-accent);
    text-decoration: underline;
    cursor: pointer;
  }

  .verdict-strip,
  .verdict-card,
  .stamp-banner {
    padding: 12px 16px;
    border-radius: var(--radius-md);
    background: var(--color-paper-warm);
    border: 1px solid var(--color-paper-line);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .stamp-banner {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }

  .stamp-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .verdict--pass {
    background: var(--color-positive-bg);
    border-color: var(--color-positive-accent);
    color: var(--color-positive-fg);
  }

  .verdict--fail {
    background: var(--color-missed-bg);
    border-color: var(--color-mark);
    color: var(--color-missed-fg);
  }

  .verdict--offline {
    background: var(--color-paper-warm);
    color: var(--color-ink);
  }

  .verdict-card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: var(--radius-full);
    background: rgba(37, 35, 31, 0.12);
    font-weight: 700;
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-right: 8px;
  }

  .verdict-card-title,
  .verdict-main {
    margin: 0;
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: 1.05rem;
  }

  .verdict-sub {
    margin: 0;
    font-size: 0.88rem;
    opacity: 0.9;
  }

  .verdict-glyph {
    font-family: var(--font-glyph-ink);
    font-size: 1.25rem;
  }

  .grades {
    display: flex;
    gap: var(--spacing-2);
  }

  .btn {
    flex: 1;
    min-height: 76px;
    border-radius: var(--radius-md);
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: 1.02rem;
    cursor: pointer;
    padding: 0 10px;
  }

  .btn--neutral {
    background: transparent;
    color: var(--color-ink);
    border: 1px solid var(--color-ink-faint);
  }

  .btn--primary {
    background: var(--color-accent-deep);
    color: var(--color-surface-card);
    border: none;
  }

  .btn--dimmed {
    opacity: 0.4;
    cursor: default;
  }

  .next-btn {
    flex: 2;
  }

  .toast {
    position: fixed;
    left: var(--spacing-6);
    right: var(--spacing-6);
    bottom: calc(76px + 64px + var(--spacing-3));
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-3);
    padding: 14px 20px;
    border-radius: var(--radius-md);
    background: var(--color-missed-bg);
    box-shadow: 0 12px 32px rgba(46, 43, 37, 0.18);
  }

  .toast-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .toast-headline {
    margin: 0;
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: 1.15rem;
    color: var(--color-accent-on-peach);
  }

  .toast-detail {
    margin: 0;
    font-size: 0.95rem;
    color: var(--color-accent-strong);
  }

  .toast-undo {
    flex: none;
    min-height: 44px;
    padding: 10px 18px;
    border-radius: var(--radius-md);
    background: transparent;
    border: 1px solid rgba(140, 73, 26, 0.35);
    color: var(--color-accent-strong);
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: 1rem;
    cursor: pointer;
  }

  .dimmed {
    opacity: 0.35;
  }
</style>
