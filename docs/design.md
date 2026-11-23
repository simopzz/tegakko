# tegakko design

The visual system is **The Morning Writing Desk**, documented in [DESIGN.md](../DESIGN.md) and implemented through the tokens in `src/app/theme.css`. Warm paper sheets sit on a desk-toned ground; deep green marks navigation and primary or selected actions; terracotta identifies the active bookmark and selected accuracy emphasis. Yuji Syuku is reserved for actual Japanese graphemes.

The six screens are First Run, Scope Picker, Drill, Session Summary, History, and Settings. Secondary screens share the responsive paper sheet and context bookmark. First Run makes the pressure check optional and offers continuation without checking. Scope Picker keeps at least one writing system and one group selected, defaults to all available cards, and shows a selected-scope recap before starting. Drill keeps the recall canvas blank, the prompt clear, queue progress visible, and grading controls reachable. Settings gives the ink-width try pad the full section width, with Clear above the drawing area, and groups Download and Import together under Backup. History and Settings return to the Scope picker or Session summary that opened them. Preserve the existing self-grade, separate Reveal reference, time-bounded Undo, session closure, weakness-biased sampling, local backup, and accessible status announcement behavior when changing their presentation.

Architecture and behavior decisions:

- [ADR-0002: Ink adapter owns its canvas](adr/0002-ink-adapter-owns-its-canvas.md)
- [ADR-0003: Import replaces, never merges](adr/0003-import-replaces-never-merges.md)
- [ADR-0004: Session sampled once by weakness](adr/0004-session-sampled-once-by-weakness.md)
