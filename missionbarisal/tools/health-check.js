#!/usr/bin/env node
'use strict';
/*
 * Mission Barisal — System Health Check
 * Tests: providers/models/agents (DB), transports (HTTP/SSE/WS/UDS),
 *        agent responses, and MCP tool availability.
 *
 * Usage:
 *   node tools/health-check.js                 # auto-start server if needed
 *   BASE_URL=http://127.0.0.1:5000 node tools/health-check.js
 *   NO_START=1 node tools/health-check.js      # only DB checks + connect (no auto-start)
 *   TEST_PORT=5099 UDS_PORT=5199 node tools/health-check.js
 */
const http = require('http');
const https = require('https');
const net = require('net');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');                 // /home/sahon/api
const DB = path.join(ROOT, 'data', 'models.db');
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5000';
const TEST_PORT = parseInt(process.env.TEST_PORT || '5099', 10);
const UDS_PORT = parseInt(process.env.UDS_PORT || '5199', 10);
const UDS_PATH = process.env.UDS_PATH || '/tmp/zb_test_mcp.sock';
const AUTO_START = !process.env.NO_START;
const WS_OK = (typeof WebSocket !== 'undefined');
const SETTLE_MS = parseInt(process.env.SETTLE_MS || '6000', 10);

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  const tag = ok === 'SKIP' ? 'SKIP' : (ok ? 'PASS' : 'FAIL');
  console.log(`[${tag}] ${name}${detail ? ' — ' + detail : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- low-level HTTP ----------
function parseUrl(u) {
  const url = new URL(u);
  return {
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname + url.search,
  };
}
function httpReq(opts, body, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    const lib = opts.protocol === 'https:' ? https : http;
    const req = lib.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    if (body) req.write(body);
    req.end();
  });
}
// Retry until we get a 2xx (handles the server's async warm-up race).
async function tryUntilOk(opts, body, attempts = 4, gap = 2000, timeoutMs = 25000) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await httpReq(opts, body, timeoutMs);
      if (r.status && r.status >= 200 && r.status < 300) return r;
      last = r;
    } catch (e) { last = { error: e.message }; }
    if (i < attempts - 1) await sleep(gap);
  }
  return last;
}

// ---------- DB helpers ----------
function dbRaw(sql) {
  return new Promise((resolve) => {
    const p = spawn('sqlite3', ['-header', '-column', DB, sql], { cwd: ROOT });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', () => resolve(out));
  });
}
function dbColumn(sql) {
  return new Promise((resolve) => {
    const p = spawn('sqlite3', [DB, sql], { cwd: ROOT });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', () => resolve(out.split('\n').map((s) => s.trim()).filter(Boolean)));
  });
}

// ---------- 1. DB / CONFIG CHECKS ----------
async function dbChecks() {
  console.log('\n=== 1. DB / CONFIG CHECKS ===');
  try {
    const providers = await dbRaw('SELECT DISTINCT provider, provider_name, type FROM models ORDER BY provider;');
    console.log(providers);
    record('Providers listed', true, 'see table above');
  } catch (e) { record('Providers listed', false, e.message); }

  try {
    const agents = await dbRaw('SELECT id, name, role, model, priority FROM agents WHERE enabled=1 ORDER BY priority;');
    console.log(agents);
    record('Agents listed', true, 'see table above');
  } catch (e) { record('Agents listed', false, e.message); }

  try {
    const rows = await dbColumn("SELECT a.id || '|' || a.model FROM agents a WHERE a.enabled=1;");
    const models = await dbColumn('SELECT name FROM models;');
    const bad = [];
    for (const r of rows) {
      const [id, model] = r.split('|');
      if (!models.includes(model)) bad.push(id + '→' + model);
    }
    if (bad.length) record('Agent→model consistency', false, 'unmatched: ' + bad.join(', '));
    else record('Agent→model consistency', true, 'all ' + rows.length + ' agent models resolve to a provider model');
  } catch (e) { record('Agent→model consistency', false, e.message); }
}

// ---------- 2. SERVER READINESS ----------
let child = null;
let startedHere = false;
async function ensureServer() {
  try {
    const r = await httpReq({ ...parseUrl(BASE_URL), method: 'GET' }, null, 3000);
    if (r.status) { record('Server reachable @ ' + BASE_URL, true, 'status ' + r.status); return BASE_URL; }
  } catch (e) { /* down */ }
  if (!AUTO_START) { record('Server reachable', false, 'not up and NO_START set'); return null; }

  console.log('\n[info] Server not up — auto-starting on port ' + TEST_PORT + ' ...');
  const env = { ...process.env, PORT: String(TEST_PORT), UDS_PORT: String(UDS_PORT), UDS_PATH };
  child = spawn('node', ['api.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', () => {});
  child.stderr.on('data', () => {});
  const url = 'http://127.0.0.1:' + TEST_PORT + '/';
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    try {
      const r = await httpReq({ ...parseUrl(url), method: 'GET' }, null, 2000);
      if (r.status) { startedHere = true; record('Server auto-started', true, 'status ' + r.status + ' @ ' + url); return url; }
    } catch (e) { /* retry */ }
  }
  record('Server auto-started', false, 'did not become ready in 60s');
  return null;
}

// ---------- 3. TRANSPORT TESTS ----------
async function transportTests(BASE, udsPath) {
  console.log('\n=== 3. TRANSPORT TESTS ===');

  // HTTP
  try {
    const u = parseUrl(BASE + '/v1/chat/completions');
    const body = JSON.stringify({ model: 'mission', messages: [{ role: 'user', content: 'ping' }], stream: false });
    const r = await tryUntilOk({ ...u, method: 'POST', headers: { 'Content-Type': 'application/json' } }, body);
    record('Transport HTTP (POST /v1/chat/completions)', r && r.status === 200, 'status ' + (r && r.status || '?') + ', bytes ' + (r && r.body ? r.body.length : 0));
  } catch (e) { record('Transport HTTP', false, e.message); }

  // SSE (stream:true) — retry
  try {
    const u = parseUrl(BASE + '/v1/chat/completions');
    const body = JSON.stringify({ model: 'mission', messages: [{ role: 'user', content: 'ping' }], stream: true });
    let got = false;
    for (let i = 0; i < 3 && !got; i++) {
      got = await new Promise((resolve) => {
        const req = http.request({ ...u, method: 'POST', headers: { 'Content-Type': 'application/json' }, timeout: 25000 }, (res) => {
          let buf = ''; let done = false;
          res.on('data', (c) => { buf += c; if (!done && buf.includes('data:')) { done = true; resolve(true); } });
          res.on('end', () => resolve(done));
        });
        req.on('error', () => resolve(false));
        req.setTimeout(25000, () => req.destroy(new Error('timeout')));
        req.write(body); req.end();
        setTimeout(() => resolve(false), 15000);
      });
      if (!got) await sleep(2000);
    }
    record('Transport SSE (stream:true)', got, got ? 'received data: events' : 'no SSE data');
  } catch (e) { record('Transport SSE', false, e.message); }

  // WebSocket
  if (WS_OK) {
    try {
      const wsUrl = BASE.replace(/^http/, 'ws') + '/';
      const got = await new Promise((resolve) => {
        const ws = new WebSocket(wsUrl);
        const t = setTimeout(() => { try { ws.close(); } catch (e) {} }, resolve(false), 8000);
        ws.onopen = () => { clearTimeout(t); try { ws.close(); } catch (e) {} resolve(true); };
        ws.onerror = () => { clearTimeout(t); resolve(false); };
      });
      record('Transport WS (ws://…/)', got, got ? 'opened' : 'no open');
    } catch (e) { record('Transport WS', false, e.message); }
  } else {
    record('Transport WS', 'SKIP', 'global WebSocket unavailable');
  }

  // UDS — verify the unix socket is listening (raw connect; it speaks MCP, not plain HTTP)
  try {
    const fsOk = fs.existsSync(udsPath);
    let connected = false;
    if (fsOk) {
      connected = await new Promise((resolve) => {
        const s = net.connect(udsPath);
        const t = setTimeout(() => { try { s.destroy(); } catch (e) {} resolve(false); }, 4000);
        s.on('connect', () => { clearTimeout(t); try { s.destroy(); } catch (e) {} resolve(true); });
        s.on('error', () => { clearTimeout(t); resolve(false); });
      });
    }
    record('Transport UDS (' + udsPath + ')', fsOk && connected, fsOk ? (connected ? 'socket connectable' : 'file exists, no connect') : 'socket file missing');
  } catch (e) { record('Transport UDS', false, e.message); }
}

// ---------- 4. AGENT RESPONSE TESTS ----------
async function agentTests(BASE) {
  console.log('\n=== 4. AGENT RESPONSE TESTS ===');
  const agentIds = await dbColumn("SELECT id FROM agents WHERE enabled=1 ORDER BY priority;");
  console.log('Testing ' + agentIds.length + ' agents in parallel (requires HTTP 200)...');
  await Promise.all(agentIds.map(async (aid) => {
    try {
      const u = parseUrl(BASE + '/v1/chat/completions');
      const body = JSON.stringify({ model: aid, messages: [{ role: 'user', content: 'say hi' }], stream: false });
      const r = await tryUntilOk({ ...u, method: 'POST', headers: { 'Content-Type': 'application/json' } }, body, 3, 2000, 25000);
      const ok = r && r.status === 200;
      record('Agent responds: ' + aid, ok, 'status ' + (r && r.status || '?') + ', bytes ' + (r && r.body ? r.body.length : 0));
    } catch (e) { record('Agent responds: ' + aid, false, e.message); }
  }));
}

// ---------- 5. TOOL TESTS ----------
async function toolTests(BASE) {
  console.log('\n=== 5. TOOL TESTS ===');
  // MCP clients summary (retry — tools load after MCP client connects)
  try {
    const u = parseUrl(BASE + '/api/mcp-clients');
    const r = await tryUntilOk({ ...u, method: 'GET' }, null, 5, 2000, 10000);
    let json = null; try { json = JSON.parse(r.body); } catch (e) {}
    const toolCount = json && typeof json.tools === 'number' ? json.tools : 0;
    const clients = json && Array.isArray(json.connected_clients) ? json.connected_clients : [];
    const zb = clients.find((c) => /zombiecoder/.test(c.name || ''));
    const zbTools = zb && Array.isArray(zb.tools) ? zb.tools.length : 0;
    record('MCP tools registered', toolCount > 0 && zbTools > 0, 'server tools=' + toolCount + ', zombiecoder tools=' + zbTools);
  } catch (e) { record('MCP tools registered', false, e.message); }

  // MCP tools/list callable
  try {
    const u = parseUrl(BASE + '/mcp');
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
    const r = await tryUntilOk({ ...u, method: 'POST', headers: { 'Content-Type': 'application/json' } }, body, 4, 2000, 15000);
    let json = null; try { json = JSON.parse(r.body); } catch (e) {}
    const tools = json && json.result && Array.isArray(json.result.tools) ? json.result.tools : [];
    record('MCP tools/list callable', tools.length > 0, 'tools=' + tools.length);
  } catch (e) { record('MCP tools/list callable', false, e.message); }
}

// ---------- MAIN ----------
(async () => {
  await dbChecks();
  const BASE = await ensureServer();
  const udsPath = startedHere ? UDS_PATH : '/tmp/zombiecoder/mcp.sock';
  if (BASE) {
    console.log('[info] settling ' + SETTLE_MS + 'ms for async init (MCP connect, routes)...');
    await sleep(SETTLE_MS);
    await transportTests(BASE, udsPath);
    await agentTests(BASE);
    await toolTests(BASE);
  } else {
    record('Transport tests', 'SKIP', 'server not available');
    record('Agent response tests', 'SKIP', 'server not available');
    record('Tool tests', 'SKIP', 'server not available');
  }

  console.log('\n=== SUMMARY ===');
  const pass = results.filter((r) => r.ok === true).length;
  const fail = results.filter((r) => r.ok === false).length;
  const skip = results.filter((r) => r.ok === 'SKIP').length;
  console.log(`PASS=${pass}  FAIL=${fail}  SKIP=${skip}  TOTAL=${results.length}`);
  if (child) {
    try { child.kill('SIGTERM'); } catch (e) {}
    setTimeout(() => { try { child.kill('SIGKILL'); } catch (e) {} }, 2000);
  }
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
