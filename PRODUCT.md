# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary User:** Solo Japanese language learners dedicated to building genuine handwriting recall (writing kana and kanji from memory, not recognition).
- **Situation & Mindset:** Daily morning ritual on a dedicated stylus tablet, treating the app as physical stationery (notebook and sumi ink) rather than a gamified habit tracker or high-frequency engagement app.

## Product Purpose

- **Purpose:** Provide a distraction-free, low-latency digital canvas for Japanese handwriting recall practice.
- **Success:** The learner develops confident muscular and visual recall of kana and kanji graphemes, receives honest feedback on weak spots, and experiences practice as a calming, intentional ritual.

## Positioning

- **Core Difference:** Genuine recall over recognition. Unlike apps that provide stroke-tracing outlines or multiple-choice flashcard decks, tegakko presents a blank genkouyoushi cell with only the prompt (romaji or kanji meanings/readings).
- **Data & Autonomy:** Strictly local-first and single-user. No accounts, no cloud sync, no tracking, and no guilt-inducing streak mechanics.
- **Planned Evolution:** Expanding to support optional automated grading (shape/stroke evaluation) alongside self-grading, and exploring intentional, calm gamification mechanisms that avoid cheap engagement traps.

## Operating Context

- **Environment & Hardware:** Installed PWA on a Chromium-based Android tablet held in portrait (~800×1280 CSS px), operated primarily with an active stylus.
- **Input & Display:** Utilizes Pointer Events and Delegated Ink Trails for low-latency ink response with variable pressure widths. Mouse and touch remain functional for testing.
- **Ritual & Lifecycle:** Morning practice sessions drawn from user-selected scopes (Hiragana, Katakana, and JLPT N5–N1 Kanji). Sessions draw cards once, weighted by historical weakness, and conclude via explicit learner action, queue completion, or idle timeout.

## Capabilities and Constraints

- **Writing & Canvas:** Single-canvas genkouyoushi grid with pressure-sensitive ink rendering, supporting single kana, compound yoon (e.g., きゃ), and kanji.
- **Evaluation & Grading:** Self-grade model with optional Reveal comparison against a brush reference glyph (Yuji Syuku). Automated grading is planned for future evolution.
- **Sampling & Weak Spots:** Recency-weighted sampling from lifetime attempt history (draw weight halves with elapsed wall-clock time; correct attempts zero previous miss weights). Deliberately not spaced-repetition scheduling (no due dates or intervals).
- **Persistence & Portability:** Single IndexedDB database (`idb`). Progress backup and restore through atomic, all-or-nothing JSON export/import (replaces progress, never merges).
- **Gamification:** Currently none; open to investigation for motivating features that respect learner calm and focus.

## Brand Commitments

- **Tone & Voice:** Quiet confidence, restraint, and directness. Like good stationery.
- **App Copy Rules:** Factual status without exclamation marks, cheerleading, or patronizing praise ("Start writing", "I'm done", "Your call — nothing is checking the shape"). Misses are treated as neutral observations ("missed 3 times now, so it'll come round sooner"), never failure or red alert.
- **Visual Identity:** Warm washi paper tones (`--color-surface-card`), warm sumi ink (`--color-ink`), terracotta accent (`--color-accent`), sage positive chips, and peach attention highlights. Zero pure black, zero harsh red.

## Evidence on Hand

- **Domain Model & Vocabulary:** Documented in `GLOSSARY.md` (Card, Grapheme, Script, Set, Yoon, Scope, Session, Prompt, Meaning, Attempt, Self-grade, Reveal, Closure, Miss count, Weakness, Shaky).
- **Design System & Architecture:** Documented in `docs/design.md`, `docs/.impeccable/design-full.md`, and `docs/adr/` (Hexagonal boundary, single canvas ink ownership, atomic import, weakness sampling).
- **Codebase:** Fully operational Svelte 5 + Vite + TypeScript PWA with comprehensive unit and integration tests.

## Product Principles

1. **Recall Over Recognition:** Always test active memory into a blank cell; never draw stroke guidelines or templates under the pen.
2. **Stationery, Not an Engagement Trap:** Treat practice as a mindful morning ritual. Avoid anxiety-inducing streaks, notifications, and loud gamification.
3. **Paper-Like Directness:** Minimize UI friction and eliminate felt latency. The writing canvas is the center of gravity; navigation and secondary controls recede.
4. **Honest and Forgiving Feedback:** Grading is an honest dialogue with oneself; misses guide future sampling naturally without penalty or scolding.
5. **Absolute Local Ownership:** The learner's handwriting data and attempt history belong exclusively to their device.

## Accessibility & Inclusion

- Stylus-first interaction with fallback to touch and pointer input.
- High-contrast, WCAG AA compliant text/surface pairings across all color tokens.
- Polite `aria-live` announcements for dynamic status changes (scope counts, pen status, grade toasts) with non-modal dismissals.
- Generous tap targets (>48dp) suitable for tablet stylus and finger tapping.
