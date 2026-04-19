const fs = require('fs');
const { snapshot } = require('./models/index.js');

const sseClients = new Set();

function broadcast(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of sseClients) {
    try { res.write(data); } catch (e) { /* ignore */ }
  }
}

let pendingBroadcast = null;
function scheduleBroadcast() {
  if (pendingBroadcast) clearTimeout(pendingBroadcast);
  pendingBroadcast = setTimeout(() => {
    pendingBroadcast = null;
    broadcast({ type: 'update', snapshot: snapshot() });
  }, 100);
}

function watchDir(dir, recursive = false) {
  if (!fs.existsSync(dir)) return;
  fs.watch(dir, { recursive }, () => scheduleBroadcast());
}

module.exports = { sseClients, broadcast, scheduleBroadcast, watchDir };
