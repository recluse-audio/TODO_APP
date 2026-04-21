# TODO_APP

Local viewer/editor for the TODO goals/tasks/decisions content repo.

A tiny zero-dependency Node server (~250 lines) that serves a web UI for browsing and updating the markdown files in a content repo (by default, sibling `../TODO`). The UI is meant to be opened inside VSCode's **Simple Browser** so the GUI sits alongside Claude Code in the same window.

## Run

From this folder:

```
node server.js
```

By default the app reads/writes `../TODO/{GOALS,TASKS,DECISIONS}`. To point at a different content directory, set `CONTENT_DIR`:

```
CONTENT_DIR=C:/path/to/todo node server.js
```

Windows: double-click `start.bat`.

Then in VSCode: **Ctrl+Shift+P → "Simple Browser: Show" → `http://localhost:3737`**.

The server stays running for the session. Stop with Ctrl+C.

## How it works

- Reads every file in `<CONTENT_DIR>/GOALS/`, `/TASKS/`, and `/DECISIONS/` and parses the YAML frontmatter.
- Watches those directories for changes. When anything saves (whether by you, the GUI, or Claude), all open browser tabs receive a server-sent event and re-render within ~100ms.
- The GUI lets you toggle criteria checkboxes and change item status. Both round-trip through targeted in-place edits to the underlying `.md` file — no full YAML rewrite, so your formatting and comments are preserved.
- The `.md` files in the content repo remain the **single source of truth**. Claude (operating in the content repo) reads/writes them normally; this app does the same. Neither side has a separate state store.

## Caveats

- The YAML parser is intentionally minimal. It handles the schema documented in the content repo's `INSTRUCTIONS/METADATA_SCHEMA.md` (scalars, flow lists, flow objects for criteria, block lists). It is not a full YAML parser.
- `criteria:` in goal frontmatter must use the flow-style block format (`- { text: "...", done: false }`, one per line) for the toggle writer to work reliably.
- File watching uses Node's `fs.watch`, which is occasionally noisy on Windows. Updates are debounced by 100ms.
