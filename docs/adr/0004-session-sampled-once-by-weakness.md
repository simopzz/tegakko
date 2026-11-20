# Sessions are sampled once at start, weighted by weakness from attempt history

A session's cards are drawn once, when it starts, by `sampleSessionCards` in `domain/drill.ts`, and the session then works through that fixed queue. Nothing is re-picked mid-session: a miss counts toward the *next* session's sample. Because cards are drawn without replacement, a session never repeats a card and ends as **complete** exactly when its queue runs out.

The draw is biased by each card's **weakness**, computed at sample time from the full attempt history: every incorrect attempt since the card's last correct one contributes a weight that halves with elapsed wall-clock time (not with attempt position; the half-life is in `drill.ts`), and a correct attempt zeroes the misses before it. Each card is drawn with weight `1 + weakness`, so no card in scope ever has zero chance. The drawn set is then shuffled uniformly, so weight decides *which* cards come up but not their order.

This is deliberately not spaced repetition: there are no due dates, intervals or scheduling state, only a probabilistic pull toward recent misses. That is also why recency comes from attempt timestamps rather than from fields on the miss count: the stored miss count stays a plain lifetime number (`cardId`, `missCount`) that backs the "N shaky" and "missed N times" displays and never drives selection.

## Considered options

- **Re-pick the next card after every grade, with replacement.** The first implementation did this; it repeated cards within a session and could only end a session as complete probabilistically.
- **A dedicated weighted-sampling algorithm (e.g. Efraimidis–Spirakis).** Repeating the existing single weighted pick against a shrinking pool is simpler and fast enough at catalog sizes.
