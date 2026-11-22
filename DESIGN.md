---
name: tegakko
description: A tactile, unhurried Japanese handwriting recall ritual on washi paper with sumi brush ink.
colors:
  primary: "#c67139"
  primary-strong: "#8c491a"
  primary-deep: "#b2622d"
  primary-on-peach: "#643312"
  surface-card: "#f5ead8"
  surface-card-secondary: "#ebddc5"
  canvas: "#f9f4ed"
  ink: "#201e1d"
  ink-muted: "rgba(32, 30, 29, 0.55)"
  ink-faint: "rgba(32, 30, 29, 0.16)"
  ink-hairline: "rgba(32, 30, 29, 0.1)"
  positive-bg: "#e1eecc"
  positive-fg: "#3d472b"
  positive-accent: "#56633f"
  missed-bg: "#ffe1d0"
  missed-fg: "#643312"
  grid-guide: "#ccdbb2"
typography:
  display:
    fontFamily: "Noto Serif JP, serif"
    fontSize: "3.5rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Noto Serif JP, serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Noto Serif JP, serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Figtree, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Figtree, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.1em"
rounded:
  sm: "10px"
  md: "12px"
  lg: "14px"
  xl: "18px"
  squircle: "34px"
  full: "9999px"
spacing:
  "1": "8px"
  "2": "12px"
  "3": "18px"
  "4": "24px"
  "5": "32px"
  "6": "40px"
  "7": "56px"
  "8": "72px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface-card}"
    rounded: "{rounded.md}"
    padding: "16px 24px"
  button-primary-hover:
    backgroundColor: "{colors.primary-strong}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "16px 24px"
  chip-positive:
    backgroundColor: "{colors.positive-bg}"
    textColor: "{colors.positive-fg}"
    rounded: "{rounded.sm}"
    padding: "4px 12px"
  chip-missed:
    backgroundColor: "{colors.missed-bg}"
    textColor: "{colors.missed-fg}"
    rounded: "{rounded.sm}"
    padding: "4px 12px"
  card:
    backgroundColor: "{colors.surface-card}"
    rounded: "{rounded.lg}"
    padding: "24px"
---

# Design System: tegakko

## Overview

**Creative North Star: "The Morning Sumi Notebook"**

tegakko is designed as an unhurried, tactile morning stationery ritual rather than an engagement product. It opens like a fine physical notebook: a prompt, a blank genkouyoushi cell, and warm sumi brush ink. The interface is grounded in the material sensibility of Japanese washi paper, natural mineral pigments, and calligraphy craftsmanship. Every element feels deliberate, permanent, and quiet.

The system rejects the hyperactivity of modern language software. There are no cartoon mascots, no celebratory confetti, no guilt-tripping streak counters, and no loud gamification gimmicks. Instead, the design fosters quiet confidence and honest self-appraisal: errors are not punished with red alerts, and successes are met with calm acknowledgment rather than patronizing praise.

**Key Characteristics:**
- **Tactile Paper Surfaces:** Warm cream washi grounds the entire viewport; there is no harsh digital white or synthetic gray.
- **Physical Restraint:** Controls behave with physical weight and subtle debossed press feedback rather than bouncy micro-animations.
- **Single Chromatic Accent:** Earthy Japanese Persimmon (kaki) used with extreme discipline, behaving like an artist's personal seal.
- **Sacred Brushwork:** Brushed calligraphy typography (Yuji Syuku) is reserved strictly for genuine Japanese graphemes.

## Colors

The palette draws inspiration from traditional Japanese papercraft and ink painting: warm paper neutrals, earthy sumi carbon, and vegetable/mineral tints.

### Primary
- **Japanese Persimmon (Kaki)** (`#c67139`): The single chromatic accent. Reserved exclusively for primary forward momentum (the "Correct" grade button, primary start CTA, progress fill, and current session bar).
- **Deep Persimmon** (`#8c491a`): Hover and pressed state for primary controls, secondary text links (Back, History, Settings), and the toast's action link.
- **Terracotta Earth** (`#b2622d`): Dedicated strictly to primary numeric readouts (Summary accuracy percentage and History row accuracy).
- **Warm Persimmon on Peach** (`#643312`): High-contrast text color paired with peach backgrounds.

### Secondary
- **Sage Green Background** (`#e1eecc`): Calm, organic green tint for non-urgent positive statuses (stylus confirmed, session complete chip, script tags).
- **Sage Green Foreground** (`#3d472b`): Deep olive-slate text paired with Sage Green backgrounds for accessible contrast.
- **Sage Accent** (`#56633f`): Mid-tone green used for positive accuracy sparkline gradients.
- **Soft Peach Background** (`#ffe1d0`): Attention-framing peach for missed-card chips, the Reveal reference panel, and the grade toast. Frames misses as neutral opportunities for review.
- **Soft Peach Foreground** (`#643312`): Rich dark brown text for peach surfaces. Meets WCAG AA contrast (4.5:1).

### Neutral
- **Warm Cream Washi** (`#f5ead8`): The main paper surface. Fills the entire visible viewport (`100dvh`); there is no separate background ground canvas.
- **Warm Secondary Paper** (`#ebddc5`): One shade warmer than cream washi; used for grouped segmented control tracks, stat cards, and nested tiles.
- **Clean Calligraphy Sheet** (`#f9f4ed`): The lightest paper surface, reserved solely for the active genkouyoushi drawing cell to read as pristine paper.
- **Deep Sumi Ink** (`#201e1d`): Warm carbon sumi ink; text and handwritten ink strokes. Pure #000000 is strictly forbidden.
- **Sumi Muted** (`rgba(32, 30, 29, 0.55)`): Secondary explanatory copy, captions, and scope subtitles.
- **Sumi Faint** (`rgba(32, 30, 29, 0.16)`): Borders, card dividers, and inactive control outlines.
- **Sumi Hairline** (`rgba(32, 30, 29, 0.1)`): Unfilled progress tracks and thin structural dividers.
- **Grid Guide Green** (`#ccdbb2`): Delicate dashed cross guidelines and border inside the genkouyoushi cell; lowest step on the accuracy sparkline.

### Named Rules
**The Persimmon Rarity Rule.** Japanese Persimmon (`#c67139`) must occupy ≤5% of any rendered viewport. Its visual power stems entirely from rarity. It is never applied to large surface fills, headers, or decorative borders.
**The No-Red Rule.** True red (`#ff0000` or saturated crimson) is banned from the product. Missed characters and destructive warnings use Soft Peach (`#ffe1d0`) with rich brown text (`#643312`) to communicate attention and reflection rather than alarm or failure.

## Typography

**Display Font:** Noto Serif JP 600 (with serif fallback)  
**Body Font:** Figtree 400 (with sans-serif fallback)  
**Label Font:** Figtree 700 (with sans-serif fallback)  
**Glyph Ink Font:** Yuji Syuku (with serif fallback)

**Character:** A harmonious dialogue between a classical Japanese serif with confident chiseling (Noto Serif JP), an elegant geometric sans for modern readability (Figtree), and an expressive cursive brush face (Yuji Syuku).

### Hierarchy
- **Display** (SemiBold 600, `3.5rem` / 56px, line-height 1.1, letter-spacing `-0.02em`): The single hero metric on a screen (e.g. Session Summary accuracy percentage). Restricted to at most one instance per view.
- **Headline** (SemiBold 600, `1.75rem` / 28px, line-height 1.2, letter-spacing `-0.01em`): Screen titles and major milestone headers.
- **Title** (SemiBold 600, `1.25rem` / 20px, line-height 1.3): Section headers, button labels, kanji meaning prompts, and numeric data tiles.
- **Body** (Regular 400, `1rem` / 16px, line-height 1.5): Explanatory sentences, prompt guidelines, and descriptive paragraphs. Line length capped at 65ch.
- **Label** (Bold 700, `0.75rem` / 12px, line-height 1.2, letter-spacing `0.1em`, uppercase): Group headers, status micro-labels ("SCRIPT", "YOURS", "REFERENCE").
- **Glyph Ink** (Regular 400, scaled dynamically, tilted `-1.2deg`): The reference character rendered in authentic brush ink.

### Named Rules
**The Sacred Brush Rule.** Yuji Syuku is reserved strictly for genuine Japanese graphemes (kana and kanji reference glyphs). It must never be applied to romaji prompts, English definitions, UI labels, or button text.
**The Structural Voice Rule.** All numbers, grades, and structural headers speak in Noto Serif JP 600. Explanatory sentences and instructional captions speak in Figtree 400.

## Layout

tegakko is calibrated for a single device class: a Chromium-based Android tablet held in portrait (~800×1280 CSS px) with an active stylus. It operates as an installed fullscreen PWA without responsive mobile breakpoints.

- **Viewport Frame:** The application shell (`.app`) locks firmly to `100dvh`. Nothing scrolls at the viewport level. The top navigation bar occupies its fixed height, and the active screen fills the remainder.
- **Scrollable Screens:** Secondary views (Scope Picker, Summary, History, Settings) share `ScreenShell.svelte`, which centers content horizontally (max-width `640px`) and vertically (`margin: auto`). Stacked elements maintain an `18px` (`--spacing-3`) spatial rhythm.
- **Drill Layout:** The Drill view does not scroll; the genkouyoushi canvas expands to fill available vertical space while action controls lock to the bottom edge.
- **Spacing Scale:**
  - `--spacing-1` (`8px`) / `--spacing-2` (`12px`): Internal control padding and micro-gaps.
  - `--spacing-3` (`18px`) / `--spacing-4` (`24px`): Rhythm between stacked elements and cards.
  - `--spacing-5` (`32px`) / `--spacing-6` (`40px`): Section gaps and container padding.
  - `--spacing-7` (`56px`) / `--spacing-8` (`72px`): Major screen gutters and header margins.

## Elevation & Depth

Depth in tegakko is tactile and physical, resembling sheets of handmade paper arranged on a wooden desk. Surfaces are flat at rest, achieving hierarchy solely through warm tonal paper shifts (`#f5ead8` → `#ebddc5` → `#f9f4ed`).

Floating elements cast soft, ink-tinted ambient shadows, evoking paper lifted momentarily off the surface. Interactive controls communicate state through mechanical debossing and subtle scale changes rather than synthetic drop shadows.

### Shadow Vocabulary
- **Lifted Paper Ambient** (`box-shadow: 0 12px 32px rgba(32, 30, 29, 0.12)`): Applied exclusively to the floating Grade Toast and modal confirmation dialogs. A wide, diffuse dispersion tinted with carbon sumi ink.

### Named Rules
**The Paper Plane Rule.** Screens and cards represent the paper itself. They sit flush at rest without elevation shadows or border bevels. Depth is conveyed through tonal layering.
**The Mechanical Press Rule.** Buttons and interactive tiles do not elevate on hover. Upon press (`:active`), they exhibit tactile mechanical debossing: a slight downward scale (`transform: scale(0.98)`) and tonal deepening.

## Shapes

tegakko employs warm, approachable rounded rectangles that evoke cleanly trimmed stationery cards.

- **Radius Scale:**
  - `--radius-sm` (`10px`): Small chips, status tags, and inline badges.
  - `--radius-md` (`12px`): Interactive buttons, segmented pill toggle items, and text inputs.
  - `--radius-lg` (`14px`): Genkouyoushi drawing cells, stat tiles, and content containers.
  - `--radius-xl` (`18px`): Floating grade toast and modal cards.
  - `--radius-squircle` (`34px`): App home-screen launcher icon.
  - `--radius-full` (`9999px`): Dedicated strictly to progress meter tracks and sparkline bars.
- **Form Geometry:** Full pill rounding (`9999px`) is never applied to action buttons or cards. Buttons maintain confident rectangular integrity (`12px` radius) with ample height (`min-height: 88px` on drill actions) for stylus stability.

## Components

Every interactive component is optimized for stylus-first precision, meeting or exceeding Android's `48dp` touch target specification.

### Buttons
- **Shape:** Rounded rectangle (`12px` radius, `min-height: 88px` on drill buttons, `56px` on standard buttons).
- **Primary ("Correct" / "Start writing"):** Japanese Persimmon fill (`#c67139`), Warm Cream Washi text (`#f5ead8`), font Noto Serif JP 600.
- **Secondary / Action ("Reveal" / "Missed"):** Transparent background, hairline border (`1px solid rgba(32, 30, 29, 0.16)`), Deep Sumi Ink text (`#201e1d`). Dimmed to 40% opacity when inactive.
- **Tactile State:** `:hover` deepens the primary fill to Deep Persimmon (`#8c491a`); `:active` triggers physical deboss (`transform: scale(0.98)`).

### Chips
- **Shape:** Compact rounded pill (`10px` radius, padding `4px 12px`, Figtree 600 `0.875rem`).
- **Positive Chip ("Stylus found", "Session complete"):** Sage Green background (`#e1eecc`), Sage Foreground text (`#3d472b`). Always pairs color with text.
- **Missed Chip ("Miss count"):** Soft Peach background (`#ffe1d0`), Peach Foreground text (`#643312`). Shows lifetime misses; never framed as an error.

### Genkouyoushi Writing Cell
- **Surface:** Clean Calligraphy Sheet (`#f9f4ed`), `14px` border-radius.
- **Guides:** Faint outer border (`1px solid rgba(32, 30, 29, 0.1)`), dashed cross center guides (`#ccdbb2`), single center dot at rest.
- **Layout:** One cell per character (single kana/kanji: 1 cell; compound yoon: 2 horizontal cells).

### Pill Segmented Controls
- **Track:** Warm Secondary Paper (`#ebddc5`), `12px` radius.
- **Segments:** Equal-width tiles. Inactive segments show Deep Sumi Ink text; active segment receives Japanese Persimmon fill (`#c67139`) with Cream Washi text (`#f5ead8`). Single-choice controls use radio semantics; multi-choice (Scope Picker) toggles independently.

### Grade Toast
- **Structure:** Floating capsule (`18px` radius, Soft Peach fill `#ffe1d0`, Lifted Paper Ambient shadow `0 12px 32px rgba(32, 30, 29, 0.12)`).
- **Content:** Announcements in Peach Foreground (`#643312`); action link ("Undo") in Deep Persimmon (`#8c491a`) without background fill or border.

## Do's and Don'ts

### Do:
- **Do** lock screens firmly to `100dvh` in portrait orientation (`~800×1280px`).
- **Do** preserve the Warm Cream Washi ground (`#f5ead8`) across every screen.
- **Do** pair every status color chip with descriptive text; never communicate state by color alone.
- **Do** maintain a minimum `88px` button height for drill grading actions to prevent mis-taps with a stylus.
- **Do** reserve Yuji Syuku tilted at `-1.2deg` solely for authentic Japanese graphemes.
- **Do** allow Undo on grading only while the grade toast is active or on the frozen final card.

### Don't:
- **Don't** use saturated red (`#ff0000`, `#e53e3e`) anywhere in the application.
- **Don't** use pure digital black (`#000000`) or cold digital grays; always use Deep Sumi Ink (`#201e1d`).
- **Don't** introduce gamification tropes: no streak fire icons, XP points, confetti animations, or push nudges.
- **Don't** overlay reference stroke templates inside the active genkouyoushi cell; recall must remain unguided.
- **Don't** apply full-pill border radius (`9999px`) to action buttons or content cards.
- **Don't** add audio sound effects, celebratory chimes, or buzzer sounds on grading.
