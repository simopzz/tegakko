---
title: "Product Brief: Kana Writing Practice"
status: final
created: 2026-09-01
updated: 2026-09-02
---

# Product Brief: Kana Writing Practice (working title)

## Executive Summary

A personal tablet-and-stylus app for testing true handwriting recall of Japanese kana (hiragana and katakana) — a targeted reinforcement tool, not a replacement for the SRS apps already doing the real incremental learning. The gap it closes: existing tools test *recognition*, not *production*. Renshuu makes you trace the correct stroke path; Duolingo auto-recognizes an approximate finger-drawn shape but still guides your hand along it. Neither ever confirms you can produce a character from a blank page with nothing to go on. This app does, with a genuine pen canvas — a genkouyoushi grid rendered with real ink quality — and one simple discipline: see a prompt, write it from memory, honestly grade yourself.

It isn't a second SRS — no scheduling algorithm, just a light per-character weak-spot tally (see Solution). Content is the full 92-character kana set, hiragana and katakana interleaved and kept script-distinct (see Scope).

Kana is the fast, low-risk path to a working v1: a small, fixed, already-understood content set that exercises the full pipeline without depending on any external curriculum. It's a starting point, not the ceiling — kanji and vocabulary are expected to follow soon after v1 ships (see Vision).

## The Problem

Practice today is split across two tools that each test the wrong thing: recognition, not recall. Neither ever asks whether a character can be produced from memory, with nothing guiding the hand. The cost is quiet uncertainty — sitting down unsure whether a kana is really known or only recognizable, with no fast, honest way to check.

## The Solution

An on-demand, self-graded handwriting drill: pick a scope (or take the full 92-character set), get a prompt, write the character from memory on a high-fidelity pen canvas, and mark it right or wrong yourself. No stroke-order recognition or ML grading — the user is the judge, which is what makes this buildable without an OCR/shape-matching engine.

The app keeps a lightweight tally of which characters tend to get missed and biases future selection toward those, so a short session stays useful without needing due dates, review intervals, or any scheduling algorithm. Content and progress are local-only (no account, no sync) — this is a single-user tool for its own creator.

## What Makes This Different

- **Free recall, not guided recognition.** No tracing, no shape-matching leniency — the one axis none of the existing tools test.
- **Ink quality as the actual product.** The ink feel — pressure-sensitive strokes on a genkouyoushi grid, near-hardware-limited latency — is the emotional hook and the technically riskiest part, so it gets built and de-risked first, even while everything else stays simple. Building on a tablet with a real stylus is part of that appeal too, not just a means to an end.
- **Script-aware content model.** Cards are keyed on grapheme and script, not romaji or sound, so same-sound hiragana/katakana pairs stay distinct — the foundation both interleaving and future kanji/vocab expansion depend on.
- **Narrow by design, not by accident.** Not a second SRS — staying out of that lane is what keeps it buildable and honest about its actual job.

## Who This Serves

One user: the app's creator, who wants a fast, honest way to confirm — or expose gaps in — genuine free recall built up through other tools' guided practice.

## Success Criteria

Not engagement metrics, not a daily-use streak — the real learning happens elsewhere. Success looks like:

- Opening the app when unsure about a character and getting a fast, honest answer about whether it's really known.
- The weak-spot bias actually surfacing the characters that are shaky, without the user having to remember which ones those are.
- The ink feel being satisfying enough to want to reach for it, rather than a chore.
- The script-aware data model holding up cleanly as a foundation once kanji and vocabulary are added — this is a build-quality goal as much as a product one, since getting it wrong now would mean redoing it later under a bigger content set.

## Scope

**In v1:**
- Full 92-character kana set (hiragana and katakana, interleaved), keyed on grapheme and script.
- Pen canvas with genkouyoushi grid, low-latency pressure-sensitive stylus input, built as a web/PWA (Pointer Events + Delegated Ink Trails) — chosen over native after a PoC of both; see addendum.
- Prompt → write from memory → self-graded correct/incorrect.
- Lightweight per-character miss tally that biases future selection toward weak spots (no due dates or review intervals).
- Local-only persistence — no account, no sync.

**Explicitly out of v1:**
- Kanji and vocabulary, including compound words (expected soon after v1, not a distant roadmap item — see Vision).
- Mnemonics, streaks/gamification.
- Cloud accounts or multi-device sync.
- Automatic stroke-order recognition or ML/OCR-based grading.
- Any due-date/interval-based scheduling algorithm (considered during early scoping and deliberately dropped — see Open Questions and rejected alternatives in the addendum).

## Open Questions

- **How does "already learned" travel forward into kanji/vocab?** Kana works as a starting scope because it's small, fixed, and needs no external curriculum. Kanji and vocabulary don't have that property — what counts as "in scope for practice" will need to come from somewhere (self-curated list? manual entry? something read from Renshuu?). Not a v1 problem, but worth deciding deliberately before scope expands rather than backing into it.
- **Does the miss-tally need any decay or reset?** A purely cumulative "times gotten wrong" count could over time overweight characters that were hard early on but are now solid. Left open for v1 (the set is small enough that this may not matter yet), worth revisiting if it does.

## Vision

Kana is the proof-of-pipeline, not the destination. The creator has already nearly memorized the full kana set, so kanji and vocabulary support are expected to follow soon after v1 ships — likely a matter of a few months, not the usual multi-year horizon. The script-aware, self-graded, weak-spot-biased shape of v1 is meant to carry forward largely unchanged; what expands is the content model and the open question of how "already learned elsewhere" gets represented once the content set is no longer small and fixed.
