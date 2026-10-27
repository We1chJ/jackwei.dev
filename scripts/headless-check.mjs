#!/usr/bin/env node
// Real-time headless check of a page via the Chrome DevTools Protocol (no deps; Node >= 22).
// Usage: node scripts/headless-check.mjs <url> [--wait ms] [--shot out.png] [--eval "expr"]
// Prints the result of --eval (default: body dataset) as JSON after --wait milliseconds.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const url = args[0];
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const waitMs = Number(opt('--wait', 8000));
const shot = opt('--shot', null);
const expr = opt('--eval', 'JSON.stringify({ ...document.body.dataset, count: document.querySelector(".count")?.textContent, card: document.querySelector(".card")?.className })');
const port = 9333 + Math.floor(Math.random() * 500);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--disable-gpu-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
  '--hide-scrollbars', '--no-first-run', '--allow-file-access-from-files', `--remote-debugging-port=${port}`, '--window-size=1280,900', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  let version = null;
  for (let i = 0; i < 50 && !version; i++) { await sleep(200); try { version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { /* not up yet */ } }
  if (!version) throw new Error('chrome did not start');
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pending = new Map(); const errors = [];
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text); else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(m.params.entry.text); };
  const send = (method, params = {}, sessionId) => new Promise((r) => { const mid = ++id; pending.set(mid, r); ws.send(JSON.stringify({ id: mid, method, params, sessionId })); });
  const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
  const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId); await send('Runtime.enable', {}, sessionId); await send('Log.enable', {}, sessionId);
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await send('Page.navigate', { url }, sessionId);
  await sleep(waitMs);
  const evalRes = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sessionId);
  if (shot) { const { result: { data } } = await send('Page.captureScreenshot', { format: 'png' }, sessionId); writeFileSync(shot, Buffer.from(data, 'base64')); }
  console.log(JSON.stringify({ value: evalRes.result?.result?.value ?? evalRes.result, errors }, null, 1));
  ws.close();
} finally { chrome.kill(); }
