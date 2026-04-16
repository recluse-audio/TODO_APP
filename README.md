# tools/

Local utilities for the TODO repo.

## `server.js` — interactive viewer

A tiny zero-dependency Node server (~250 lines) that serves a web UI for browsing and updating goals/tasks. The UI is meant to be opened inside VSCode's **Simple Browser** so the GUI sits alongside Claude Code in the same window.

### Run

From an integrated terminal in the repo root:

```
node tools/server.js
```

(or double-click `tools/start.bat` on Windows.)

Then in VSCode: **Ctrl+Shift+P → "Simple Browser: Show" → `http://localhost:3737`**.

The server stays running for the session. Stop with Ctrl+C.

### How it works

- Reads every file in `GOALS/` and `PROJECTS/<CATEGORY>/` and parses the YAML frontmatter.
- Watches both directories for changes. When anything saves (whether by you, the GUI, or Claude), all open browser tabs receive a server-sent event and re-render within ~100ms.
- The GUI lets you toggle criteria checkboxes and change item status. Both round-trip through targeted in-place edits to the underlying `.md` file — no full YAML rewrite, so your formatting and comments are preserved.
- The `.md` files remain the **single source of truth**. Claude reads/writes them normally; the GUI does the same. Neither side has a separate state store.

### Caveats

- The YAML parser is intentionally minimal. It handles the schema documented in `INSTRUCTIONS/METADATA_SCHEMA.md` (scalars, flow lists, flow objects for criteria, block lists). It is not a full YAML parser.
- `criteria:` in goal frontmatter must use the flow-style block format (`- { text: "...", done: false }`, one per line) for the toggle writer to work reliably.
- File watching uses Node's `fs.watch`, which is occasionally noisy on Windows. Updates are debounced by 100ms.
