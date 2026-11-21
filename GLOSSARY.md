# tegakko

Handwriting-recall practice for Japanese: the app prompts for a character, the learner writes it from memory with a pen, and the result is judged honestly. Weak characters come back more often.

## Language

### Content

**Card**:
One thing the app can prompt for: a grapheme in a script.
_Avoid_: Character, item, flashcard

**Grapheme**:
A card's written form: one kana (あ), a two-kana yoon (きゃ), or one kanji (学).
_Avoid_: Glyph, character

**Script**:
Hiragana, katakana or kanji; part of every card's identity alongside its grapheme.
_Avoid_: Alphabet, syllabary

**Set**:
The group a card belongs to within its script: **base** (seion plus dakuten/handakuten) or **yoon** for kana, a JLPT level for kanji.
_Avoid_: Unit, kind

**Yoon**:
A base consonant kana plus small ゃ/ゅ/ょ, practised as one card.

### Practice

**Scope**:
The scripts a session draws its cards from, each with its own selected Sets -- one script's Sets never widen or narrow another's.
_Avoid_: Filter, deck

**Session**:
A bounded run of prompts over a sample of cards from a scope, ending in a closure.
_Avoid_: Round, drill (as a noun for the run)

**Prompt**:
The app asking for one card: romaji and script for kana, meaning and readings for kanji.

**Meaning**:
The short English gloss a kanji card is prompted by.
_Avoid_: Keyword, translation

**Attempt**:
One prompt from shown to graded, with its ink, its timings and whether reveal was used.
_Avoid_: Answer, try

**Self-grade**:
The learner's own correct/incorrect judgement of an attempt.
_Avoid_: Score, mark

**Reveal**:
Showing the card's grapheme next to the learner's ink before grading, without grading it.
_Avoid_: Hint, peek

**Closure**:
How a session ended: **explicit** (the learner ended it), **complete** (every sampled card was graded), or **inactivity** (idle past the threshold).
_Avoid_: Full-scope, end reason

### Weak spots

**Miss count**:
A card's lifetime number of incorrect self-grades. Shown to the learner; never drives selection.
_Avoid_: Miss tally (ambiguous), score

**Weakness**:
A card's recency-weighted pull toward being sampled, derived from its attempt history: recent misses weigh more, later correct attempts discount earlier misses.
_Avoid_: Miss tally, priority, due

**Shaky**:
A card in scope whose miss count is above the scope's average.
