# Brainstorm Intent: Japanese Handwriting SRS

## Problem / Goal
Tablet + stylus app for practicing Japanese handwriting with spaced repetition, replacing the awkward experience of finger-typing answers into phone-based SRS apps.

## MVP Definition (final, scope-revised)
- **Content**: 92 characters — all hiragana + all katakana, interleaved (not hiragana-only; revised up from the original 46-character scope).
- **Loop**: flashcard prompt shown -> user writes the character on a pen canvas -> user self-grades correct/incorrect (no automatic stroke-order or shape recognition) -> Leitner or SM-2-lite reschedules the card.
- **Canvas**: high-quality pen/ink rendering on a genkouyoushi-style grid background.
- **Persistence**: local only (e.g. SQLite/localStorage) — no cloud account, no sync.
- **Explicitly out of v1**: OCR/automatic stroke-order recognition or ML grading.

## Key Design Principle (must survive into implementation)
Card identity is keyed on the actual character (grapheme + script: hiragana vs. katakana) — never on romaji/sound alone. Same-sound pairs across scripts (e.g. hiragana あ vs. katakana ア) must remain distinct cards, since discriminating between scripts for a shared sound is itself part of what's being learned. This is what enables deliberate interleaving of hiragana and katakana in the queue.

## Cut List (deliberately excluded from v1)
- **Kanji** — kana-only scope for v1; kanji deferred.
- **Mnemonics** (WaniKani/Heisig-style stories or radical breakdowns) — deferred, not core to the write-to-recall loop.
- **Streaks / gamification** (Duolingo-style streak counters, hearts/ink-limit mechanics) — deferred to avoid scope creep beyond the core loop.
- **Multi-device / cloud sync** — local persistence only for MVP.
- **Vocab / compound words** — isolated-character practice only; no example sentences or word-level cards.
- **Automatic stroke-order ML/OCR grading** — replaced by user self-grading; this is the central scope-reduction move of the MVP.
- **Cloud accounts** — no login/auth system in v1.
- Also excluded: stroke-order animation guides, multiple reading/meaning quiz modes, community/shared decks.

## Load-Bearing Insights (should shape build decisions)
1. **Self-grading resolves the core tension** between "must check real stroke order/shape" (job-to-be-done) and "must defer ML recognition" (one-feature constraint): making the user the grader satisfies the underlying job (confirm real recall, not recognition) without requiring OCR/stroke-matching engineering. This is the mechanism that makes the MVP buildable with just a canvas, a scheduling algorithm, and a content list.
2. **Ink/pen rendering quality is the actual product, not a nice-to-have.** It's the technically riskiest part, it's the direct differentiator vs. existing phone-based SRS apps, and it's the emotional hook that keeps users engaged (tactile pleasure of pen on "paper"). It should be de-risked and prioritized early, even if scheduling logic starts crude.
3. **Card identity must be structural, not phonetic** (see Key Design Principle above) — this is a foundational data-model decision, not a UI detail, and must be correct from the first schema/content-list implementation to support hiragana/katakana interleaving.

## Worth Remembering for v2 (not commitments)
- Exportable image of the day's writing (notebook/diary-page metaphor, cheap emotional payoff).
- Ink-blot-fades-if-you-quit guilt mechanic (abandon-session feedback).
- KanjiVG open stroke-order SVG dataset as a future data source once kanji/stroke-order features are considered.
- Radical-based character grouping, to support learning transfer once kanji are introduced.
