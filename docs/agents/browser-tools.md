# Browser tools

Two MCP servers drive a browser, both installed at user scope rather than in this repo (`~/.config/opencode/opencode.json`, and `~/.claude.json` for Claude Code). Pick by the question you're asking:

| You want to | Use |
|---|---|
| Click through a page, take a screenshot, check a change looks right in the user's own Brave | `playwright-brave`: it asks the user which tab to take over |
| Find out *why*: a style that doesn't apply, a slow load, an accessibility failure, a leak | `chrome-devtools`: DevTools in a Chromium of its own |

Run the app with `mise run dev` (Vite prints the URL). The app's state lives in the browser's IndexedDB, per browser profile: what one browser shows says nothing about the other's data.

Tools are named `<server>_<tool>`, so `chrome-devtools_get_css_styles`, or `tools.chrome_devtools.get_css_styles(...)` inside Code Mode's `execute`. In Claude Code they are `mcp__chrome-devtools__*`, deferred behind ToolSearch. If they're missing, ask the user to check `/mcps` (OpenCode) or `/mcp` (Claude Code).

## Local screen-state captures

When `playwright-brave` is unavailable, use the repository capture workflow instead of stopping at the default First Run screen. Start the app with `mise run dev`, then run `npm run capture:ui` in another terminal. It launches `/usr/bin/chromium` in isolated browser contexts, seeds only the local practice settings needed to reach the Scope Picker, walks the main screen flow, and saves phone and tablet captures under `.impeccable/review/routes/`. Set `CHROME_PATH` when Chromium lives elsewhere. The workflow does not use or change the user's normal browser profile.

## chrome-devtools

It launches `/usr/bin/chromium` on its first tool call (`new_page`, `navigate_page`), not before, with a profile kept in `~/.cache/chrome-devtools-mcp/chrome-profile`, so IndexedDB data survives between sessions.

Which tool answers which question:

- **A style that doesn't apply**: `get_css_styles` on the element's `uid` (from `take_snapshot`). It returns the cascade: every matching rule, which declaration wins, and what's inherited. Check it against `docs/design.md` and the tokens in `src/app/theme.css` before changing CSS.
- **Accessibility, best practices, PWA**: `lighthouse_audit`, either in `navigation` mode (it reloads the page) or in `snapshot` mode, which audits the page as it is now.
- **Speed**: `performance_start_trace` with `reload` for a page load, or start it, do the interaction (a stroke on the canvas), then `performance_stop_trace`. Drill into an insight (`LCPBreakdown`, `INPBreakdown`) with `performance_analyze_insight`. To see what a slow tablet gets, set `emulate` with `cpuThrottlingRate: 4` first. `emulate` replaces every earlier setting, so pass all of them in one call.
- **A request or console error**: `list_network_requests` / `get_network_request` and `list_console_messages` with `includeStackTraces`.
- **Leaks**: `take_heapsnapshot` before and after repeating the suspect interaction. Comparing the two and finding what retains an object needs the server started with `--memory-debugging`.

Trace, heap and Lighthouse files go to the OS temp directory unless you give a `filePath` there.
