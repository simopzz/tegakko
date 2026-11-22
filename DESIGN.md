---
name: tegakko — The Morning Writing Desk
description: A calm Japanese handwriting recall practice, set on warm paper with deep green ink.
colors:
  desk: "#e8d6b9"
  paper: "#fbf6eb"
  paper-warm: "#f3e8d5"
  paper-line: "#d4c4a8"
  ink: "#25231f"
  ink-muted: "#625b50"
  ink-soft: "#817666"
  ink-faint: "rgba(37, 35, 31, 0.24)"
  ink-hairline: "rgba(37, 35, 31, 0.14)"
  accent: "#385148"
  accent-strong: "#293f37"
  accent-on-paper: "#fbf6eb"
  mark: "#b86d47"
  positive-bg: "#dfe8d8"
  positive-fg: "#344b3d"
  positive-accent: "#526d59"
  missed-bg: "#f3dfd0"
  missed-fg: "#68432f"
  grid-guide: "#c9d6bf"
  surface-canvas: "#fffaf1"
typography:
  display:
    fontFamily: "Noto Serif JP, Yu Mincho, serif"
    fontWeight: 600
  heading:
    fontFamily: "Noto Serif JP, Yu Mincho, serif"
    fontWeight: 600
  body:
    fontFamily: "Figtree, Hiragino Kaku Gothic ProN, sans-serif"
    fontWeight: 400
  label:
    fontFamily: "Figtree, Hiragino Kaku Gothic ProN, sans-serif"
    fontWeight: 700
  glyph-ink:
    fontFamily: "Yuji Syuku, Yu Mincho, serif"
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
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
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-on-paper}"
    rounded: "{rounded.sm}"
    height: "88px"
  button-primary-hover:
    backgroundColor: "{colors.accent-strong}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "88px"
  chip-positive:
    backgroundColor: "{colors.positive-bg}"
    textColor: "{colors.positive-fg}"
    rounded: "{rounded.sm}"
    padding: "9px 13px"
  sheet:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "clamp(28px, 5vw, 52px) clamp(22px, 5vw, 52px)"
  recall-canvas:
    backgroundColor: "{colors.surface-canvas}"
    rounded: "{rounded.sm}"
  navigation:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-on-paper}"
    height: "76px"
---

# Design System: tegakko — The Morning Writing Desk

## Overview

**Creative North Star: "The Morning Writing Desk"**

The interface is a clear, well-kept writing desk for a quiet practice ritual. Warm paper sheets sit against a darker desk ground; deep green organizes the interface and terracotta acts as a small bookmark-like mark. Familiar controls stay legible and direct, while a restrained sheet frame gives secondary screens a sense of place.

The Drill screen brings the prompt and blank writing cell forward. The cell remains a working surface: no texture or decoration enters it. Japanese glyphs can use the expressive Yuji Syuku face where they are actual graphemes; labels, readings, explanations, and actions remain easy to read.

**Key Characteristics:**
- **Desk and paper:** warm desk ground, pale paper sheets, and quiet paper-line borders.
- **Green structure:** deep green anchors navigation and selected or primary actions.
- **Terracotta marker:** terracotta identifies the active page bookmark and selected accuracy emphasis.
- **Recall first:** the writing canvas stays blank apart from its faint center guides.

## Colors

The palette pairs warm paper and ink neutrals with deep green, a terracotta marker, and muted sage and peach status colors.

### Primary
- **Desk Green** (`#385148`): Navigation, selected scope controls, and primary actions.
- **Deep Desk Green** (`#293f37`): Hover and emphasis state for primary green controls.

### Secondary
- **Terracotta Bookmark** (`#b86d47`): The page bookmark and selected accuracy values; it marks context without taking over the surface.
- **Soft Sage** (`#dfe8d8`): Positive status background, paired with **Sage Ink** (`#344b3d`).
- **Warm Peach** (`#f3dfd0`): Miss and attention background, paired with **Brown Ink** (`#68432f`).

### Neutral
- **Desk** (`#e8d6b9`): Outer ground around framed sheets.
- **Paper** (`#fbf6eb`): Main sheet and interface surface.
- **Warm Paper** (`#f3e8d5`): Secondary paper tone for grouped controls and quiet neutral states.
- **Paper Line** (`#d4c4a8`): Sheet edges, dividers, and guide boundaries.
- **Ink** (`#25231f`): Main text and written ink.
- **Muted Ink** (`#625b50`) and **Soft Ink** (`#817666`): Supporting text and low-priority details.
- **Faint Ink** (`rgba(37, 35, 31, 0.24)`) and **Hairline Ink** (`rgba(37, 35, 31, 0.14)`): Light outlines and separators.
- **Canvas Paper** (`#fffaf1`): Blank writing and stylus-check surfaces.
- **Grid Guide** (`#c9d6bf`): Faint center guides within the writing surface.

### Named Rules
**The Blank Recall Rule.** Keep the active writing canvas free of reference glyphs, texture, and ornament; comparison appears only after the learner chooses Reveal.

## Typography

**Display Font:** Noto Serif JP 600 (with Yu Mincho and serif fallbacks)

**Body Font:** Figtree 400 (with Hiragino Kaku Gothic ProN and sans-serif fallbacks)

**Label Font:** Figtree 700 (with Hiragino Kaku Gothic ProN and sans-serif fallbacks)

**Glyph Ink Font:** Yuji Syuku (with Yu Mincho and serif fallbacks)

**Character:** Noto Serif JP gives headings and numeric readouts a calm, book-like structure. Figtree keeps instructions, labels, and controls clear at a glance.

### Hierarchy
- **Display** (Noto Serif JP 600): Brand wordmark and prominent readouts; sizes follow their component styles.
- **Heading** (Noto Serif JP 600): Screen titles, section headings, prompts, and action labels; responsive screen headings use `clamp()` where present.
- **Body** (Figtree 400): Explanations, helper text, status detail, and control content, generally at 1rem with 1.5 line-height for longer copy.
- **Label** (Figtree 700): Compact group labels and status text; uppercase labels use `0.75rem` and `0.1em` tracking.
- **Glyph Ink** (Yuji Syuku): Actual Japanese graphemes in the Reveal reference and missed-glyph summaries only. Keep romanization, meanings, readings, labels, and interface copy in the normal heading or body faces.

### Named Rules
**The Glyph Boundary Rule.** Yuji Syuku is reserved for actual Japanese graphemes, never romaji, English meanings, readings, labels, or button text.

## Layout

The application uses a responsive shell. A shared top bar anchors the brand and navigation; it is 76px tall at regular widths and compacts at narrow widths. Secondary screens sit on a warm desk ground inside a paper sheet up to 880px wide, with content constrained to 680px. The shell reduces outer and sheet padding below 520px and supports a 320px minimum viewport.

The six screens are First Run, Scope Picker, Drill, Session Summary, History, and Settings. First Run explains that the stylus pressure check is optional and lets the learner continue without checking; installation is a separate action when available. Scope Picker groups writing systems, available sets or JLPT levels, session size, a selected-scope recap, and the Start writing action in one column. It keeps at least one script and one set selected, with the existing all-available session size as the default. The bookmark identifies the current sheet. Drill uses the available viewport for the prompt and writing cell, with controls kept reachable at the bottom and narrow-screen adjustments below 560px. History and Settings remain scrollable within the screen shell.

The shared spacing rhythm is 8, 12, 18, 24, 32, 40, 56, and 72px. Screens and controls adapt at 520px and 560px breakpoints; shell width and padding use fluid `min()` and `clamp()` values.

## Elevation & Depth

Most surfaces are flat, and depth comes from the contrast between desk ground, paper sheets, and nested warm paper. Floating feedback and the Settings import confirmation use restrained shadows to distinguish temporary overlays from the page.

### Shadow Vocabulary
- **Grade feedback:** `0 12px 32px rgba(46, 43, 37, 0.18)` on the peach grade toast.
- **Import confirmation:** `0 12px 32px rgba(46, 43, 37, 0.16)` on the Settings dialog.

## Shapes

The form language uses modest rounded rectangles rather than pill-shaped cards or controls. The source radius scale is 6px, 8px, 12px, and 16px, with full rounding (`9999px`) reserved for progress tracks and bar ends. Paper sheets have a fine paper-line edge; buttons and options use the smaller radius. The bookmark has square top corners and softly rounded lower corners.

## Components

### Navigation
- The deep green bar carries the tegakko wordmark, available back or screen context, and History or Settings links where the screen supports them.
- The Drill bar uses queue position and a progress bar, with “I'm done” as an explicit session closure action.
- Controls keep at least a 48px target where shared navigation and text links are used.

### Buttons
- **Primary:** Deep green fill, paper text, Noto Serif JP label, 88px minimum height on major actions (72px on narrow Scope Picker and First Run layouts).
- **Secondary:** Transparent or warm-paper fill with an understated paper-line border and ink text.
- **State:** Green primary actions darken on hover. Press feedback uses a slight `scale(0.99)` transition; controls use the global 3px terracotta focus-visible outline with 3px offset. Focused top-bar screen titles use a 3px paper outline with 4px offset.

### Sheets and Bookmark
- Secondary screens share a paper sheet with a 1px paper-line border, 6px radius, and responsive padding. The content column is capped at 680px.
- A terracotta tab at the sheet's upper edge names the current context, such as “Today's scope” or “Practice history”.

### Scope Options
- Writing-system and set options are bordered paper controls; selected options become deep green with paper text.
- Session-size choices form a compact radio group. Script and set choices remain independently toggleable, with the existing minimum-selection behavior preserved.

### Recall Canvas and Reveal
- The active cell uses canvas paper, a quiet line, faint center guides, and no reference shape. It expands to the available writing area and accepts pressure-sensitive strokes.
- Reveal presents the reference glyph separately from the active writing surface. The learner remains responsible for self-grading.

### Status and Session Feedback
- Positive states use sage and missed states use peach, with descriptive text so color is not the sole signal.
- The grade toast reports the outcome and miss context; Undo is available only within the existing grading window, including the frozen final card.
- First Run's optional stylus check reports pressure as a factual readout. “Continue without checking” remains available; “Install app” appears when an install prompt is available. Summary presents session results and missed items; History shows past sessions and an accuracy trend when at least three sessions exist.

### Settings and Data Actions
- Writing feel, idle close, and backup actions remain separate groups. Import shows a blocking confirmation before replacing local progress; export and import preserve the existing local-only backup semantics.

## Do's and Don'ts

### Do:
- **Do** use the actual CSS custom properties in `src/app/theme.css` as the color source of truth.
- **Do** keep deep green for primary structure and actions, terracotta for bookmark and selected emphasis, and warm paper for the sheet surfaces.
- **Do** keep the writing area blank during recall and show references separately after Reveal.
- **Do** preserve the existing self-grading, Undo, sampling, backup, and accessible status-announcement behavior when changing screens.
- **Do** reserve Yuji Syuku for actual Japanese glyphs.
- **Do** keep status meaning legible in text as well as color and preserve visible keyboard focus.

### Don't:
- **Don't** bring back the previous persimmon-only palette or warm cream full-viewport ground; the implemented system uses green structure and paper sheets on a desk ground.
- **Don't** add texture or decoration to the active writing cell.
- **Don't** turn the experience into a generic card dashboard or decorative notebook scene.
- **Don't** add streaks, pressure notifications, cloud accounts, tracking, or new learning claims.
- **Don't** use Yuji Syuku for romaji, English copy, readings, labels, or controls.
