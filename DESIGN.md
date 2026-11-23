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
  mark: "#a95837"
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

<!-- impeccable:design-map -->
Name: tegakko — The Morning Writing Desk
Colors: primary: accent #385148; secondary: positive-bg #dfe8d8; tertiary: mark #a95837; neutral: desk #e8d6b9; primary: accent-strong #293f37; secondary: positive-fg #344b3d (+14 more in the sidecar)
Fonts: Noto Serif JP (display, heading); Figtree (body, label); Yuji Syuku (glyph-ink)
Spacing: 1 8px, 2 12px, 3 18px, 4 24px, 5 32px, 6 40px, 7 56px, 8 72px
Radius: sm 6px, md 8px, lg 12px, xl 16px, full 9999px
North Star: "The Morning Writing Desk"
Don't:
- Don't bring back the previous persimmon-only palette or warm cream full-viewport ground; the implemented system uses green structure and paper sheets on a desk ground.
- Don't add texture or decoration to the active writing cell.
- Don't turn the experience into a generic card dashboard or decorative notebook scene.
- Don't add streaks, pressure notifications, cloud accounts, tracking, or new learning claims.
- Don't use Yuji Syuku for romaji, English copy, readings, labels, or controls.
Do:
- Do use the actual CSS custom properties in `src/app/theme.css` as the color source of truth.
- Do keep deep green for primary structure and actions, terracotta for bookmark and selected emphasis, and warm paper for the sheet surfaces.
- Do keep the writing area blank during recall and show references separately after Reveal.
- Do preserve the existing self-grading, Undo, sampling, backup, and accessible status-announcement behavior when changing screens.
- Do reserve Yuji Syuku for actual Japanese glyphs.
- Do keep status meaning legible in text as well as color and preserve visible keyboard focus.
Map: src/app/theme.css
Full: .impeccable/design-full.md (read a section when you need its detail)
