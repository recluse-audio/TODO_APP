#!/usr/bin/env node
// TODO viewer — local server for the goals/tasks/decisions GUI.
// Run: node tools/server.js
// Then open http://localhost:3737 (in VSCode: Ctrl+Shift+P → "Simple Browser: Show").

const http = require('http');
const fs = require('fs');
const { PORT, GOALS_DIR, TASKS_DIR, DECISIONS_DIR } = require('./lib/config.js');
const { watchDir } = require('./lib/sse.js');
const handler = require('./lib/routes.js');

if (!fs.existsSync(DECISIONS_DIR)) fs.mkdirSync(DECISIONS_DIR, { recursive: true });
watchDir(GOALS_DIR);
watchDir(TASKS_DIR);
watchDir(DECISIONS_DIR);

http.createServer(handler).listen(PORT, () => {
  console.log(`TODO viewer running at http://localhost:${PORT}`);
  console.log(`In VSCode: Ctrl+Shift+P → "Simple Browser: Show" → paste URL`);
});
