// Headless Chrome check of the running game (served on :8124), independent of the IDE browser:
//   node tools/shot.mjs <script.js> [out-prefix] [setup-js]
// The script is the body of an async function that receives `g` (window.__game) and returns an
// image data URL or an array of them; each is saved as <out-prefix>-<n>.jpg, other values are
// printed. `setup-js` runs first (e.g. to pass parameters). The game's own requestAnimationFrame
// loop is disabled, so frames only advance through g.frame().
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [scriptPath, outPrefix = path.join(os.tmpdir(), 'shot'), setup = ''] = process.argv.slice(2);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'idf-cdp-'));
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--window-size=960,540',
  '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist',
  '--no-first-run', '--no-default-browser-check', '--mute-audio', 'about:blank',
], { stdio: 'ignore' });
const done = (code) => { try { chrome.kill(); } catch {} process.exit(code); };
setTimeout(() => { console.log('timed out'); done(2); }, 240000).unref();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function devtools(url, method) {
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(url, { method }); if (r.ok) return r.json(); } catch {}
    await sleep(200);
  }
  throw new Error('no DevTools endpoint');
}

const target = await devtools(`http://127.0.0.1:${PORT}/json/new?about:blank`, 'PUT');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let nextId = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') console.log('page error:', m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') console.log('console error:', m.params.args.map((a) => a.value ?? a.description).join(' '));
};
const send = (method, params = {}) => new Promise((resolve) => {
  const id = ++nextId;
  pending.set(id, resolve);
  ws.send(JSON.stringify({ id, method, params }));
});

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: "window.requestAnimationFrame = () => 0; localStorage.setItem('idf-quality', 'low'); localStorage.setItem('idf-bots', '0');",
});
await send('Page.navigate', { url: 'http://localhost:8124/' });

// Optional third argument: JS run before the script, e.g. to hand it parameters.
const body = setup + '\n' + fs.readFileSync(scriptPath, 'utf8');
const expression = `(async () => {
  let g = null;
  for (let i = 0; i < 720 && !(window.__game && window.__game.body); i++) await new Promise((r) => setTimeout(r, 250));
  g = window.__game;
  if (!g || !g.body) throw new Error('game did not finish loading');
  ${body}
})()`;
const t0 = Date.now();
const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, timeout: 200000 });
console.log(`evaluated in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (res.result?.exceptionDetails) {
  console.log('script error:', res.result.exceptionDetails.exception?.description ?? res.result.exceptionDetails.text);
  done(1);
}
const value = res.result?.result?.value;
const list = Array.isArray(value) ? value : [value];
let n = 0;
for (const v of list) {
  if (typeof v === 'string' && v.startsWith('data:image')) {
    const file = `${outPrefix}-${n++}.jpg`;
    fs.writeFileSync(file, Buffer.from(v.split(',')[1], 'base64'));
    console.log('wrote', file);
  } else if (v !== undefined) console.log('result:', typeof v === 'string' ? v : JSON.stringify(v));
}
done(0);
