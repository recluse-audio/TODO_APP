const path = require('path');
const url = require('url');
const { WEB_DIR } = require('./config.js');
const { Goal, Task, Decision, snapshot, kindOrThrow } = require('./models/index.js');
const { sendJson, sendStatic, readBody } = require('./http-helpers.js');
const { sseClients } = require('./sse.js');

function handler(req, res) {
  const u = url.parse(req.url, true);
  (async () => {
    try {
      if (u.pathname === '/' || u.pathname === '/index.html') {
        return sendStatic(res, path.join(WEB_DIR, 'index.html'));
      }
      if (u.pathname.startsWith('/static/')) {
        const safe = u.pathname.replace(/^\/static\//, '').replace(/\.\./g, '');
        return sendStatic(res, path.join(WEB_DIR, safe));
      }
      if (u.pathname === '/api/data' && req.method === 'GET') {
        return sendJson(res, 200, snapshot());
      }
      if (u.pathname === '/api/criteria/toggle' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req));
        Goal.load(body.goalId).toggleCriterion(body.idx);
        return sendJson(res, 200, { ok: true });
      }
      if (u.pathname === '/api/status' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req));
        kindOrThrow(body.kind).load(body.id).setStatus(body.status);
        return sendJson(res, 200, { ok: true });
      }
      if (u.pathname === '/api/goal/delete' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req));
        Goal.load(body.id).delete();
        return sendJson(res, 200, { ok: true });
      }
      if (u.pathname === '/api/task/delete' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req));
        Task.load(body.id).delete();
        return sendJson(res, 200, { ok: true });
      }
      if (u.pathname === '/api/criteria/delete' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req));
        Goal.load(body.goalId).deleteCriterion(body.idx);
        return sendJson(res, 200, { ok: true });
      }
      if (u.pathname === '/api/goal/create' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req));
        const id = Goal.create(body);
        return sendJson(res, 200, { ok: true, id });
      }
      if (u.pathname === '/api/task/create' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req));
        const id = Task.create(body);
        return sendJson(res, 200, { ok: true, id });
      }
      if (u.pathname === '/api/decision/create' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req));
        const id = Decision.create(body);
        return sendJson(res, 200, { ok: true, id });
      }
      if (u.pathname === '/api/decision/delete' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req));
        Decision.load(body.id).delete();
        return sendJson(res, 200, { ok: true });
      }
      if (u.pathname === '/api/choices/select' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req));
        Decision.load(body.decisionId).selectChoice(body.idx);
        return sendJson(res, 200, { ok: true });
      }
      if (u.pathname === '/api/choices/delete' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req));
        Decision.load(body.decisionId).deleteChoice(body.idx);
        return sendJson(res, 200, { ok: true });
      }
      if (u.pathname === '/api/events' && req.method === 'GET') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });
        res.write(`data: ${JSON.stringify({ type: 'hello', snapshot: snapshot() })}\n\n`);
        sseClients.add(res);
        req.on('close', () => sseClients.delete(res));
        return;
      }
      res.writeHead(404); res.end('Not found');
    } catch (err) {
      console.error(err);
      sendJson(res, 500, { error: err.message });
    }
  })();
}

module.exports = handler;
