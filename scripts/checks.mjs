#!/usr/bin/env node
// Browser-level CDP checks for the real rendered SpriteSmith page. No dependencies.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { extname, join, normalize } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const server = createServer((req, res) => {
  let pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = normalize(join(root, pathname));
  if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
  createReadStream(file).pipe(res);
});
await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
const port = server.address().port;

const chromePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!existsSync(chromePath)) {
  console.error(`Chrome not found at ${chromePath}`);
  process.exit(2);
}
const profile = mkdtempSync(join(tmpdir(), 'spritesmith-checks-'));
const chrome = spawn(chromePath, [
  '--headless=new',
  '--mute-audio',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-background-networking',
  '--disable-component-update',
  '--hide-scrollbars',
  '--remote-debugging-port=0',
  `--user-data-dir=${profile}`,
  '--window-size=1440,900',
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
async function shutdown(code) {
  try { server.close(); } catch {}
  if (chrome.exitCode === null) {
    const exited = new Promise((resolveExit) => chrome.once('exit', resolveExit));
    chrome.kill('SIGTERM');
    await Promise.race([exited, sleep(2500)]);
    if (chrome.exitCode === null) chrome.kill('SIGKILL');
  }
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      rmSync(profile, { recursive: true, force: true });
      break;
    } catch (error) {
      if (attempt === 7) console.error(`warning: could not remove temporary Chrome profile: ${error.message}`);
      else await sleep(400);
    }
  }
  process.exit(code);
}
process.on('unhandledRejection', async (error) => { console.error(error); await shutdown(1); });

let cdpPort = null;
for (let i = 0; i < 100 && !cdpPort; i++) {
  await sleep(100);
  const activePort = join(profile, 'DevToolsActivePort');
  if (existsSync(activePort)) cdpPort = readFileSync(activePort, 'utf8').split('\n')[0].trim();
}
if (!cdpPort) {
  console.error('headless Chrome did not expose CDP');
  await shutdown(1);
}

const version = await (await fetch(`http://127.0.0.1:${cdpPort}/json/version`)).json();
const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((resolveOpen, rejectOpen) => { ws.onopen = resolveOpen; ws.onerror = rejectOpen; });

let nextId = 0;
const pending = new Map();
const consoleErrors = [];
const uncaughtExceptions = [];
const send = (method, params = {}, sessionId) => new Promise((resolveSend, rejectSend) => {
  const id = ++nextId;
  pending.set(id, { resolveSend, rejectSend });
  ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
});
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const callbacks = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) callbacks.rejectSend(new Error(message.error.message));
    else callbacks.resolveSend(message.result);
    return;
  }
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
    consoleErrors.push((message.params.args || []).map((arg) => arg.value ?? arg.description ?? arg.type).join(' '));
  }
  if (message.method === 'Runtime.exceptionThrown') {
    const details = message.params.exceptionDetails;
    uncaughtExceptions.push(details.exception?.description || details.text || 'uncaught exception');
  }
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
    consoleErrors.push(`${message.params.entry.source}: ${message.params.entry.text}`);
  }
};

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const page = (method, params = {}) => send(method, params, sessionId);
await page('Page.enable');
await page('Runtime.enable');
await page('Log.enable');
await page('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await page('Emulation.setFocusEmulationEnabled', { enabled: true });

async function evaluate(expression) {
  const result = await page('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}

async function pointerClick(point) {
  await page('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y, button: 'none' });
  await page('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await page('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await sleep(180);
}

async function click(selector) {
  const point = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error('missing ${selector}');
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    if (!(hit === el || el.contains(hit))) throw new Error('click target covered: ${selector} hit ' + (hit ? hit.tagName + '.' + hit.className : 'nothing'));
    return { x, y };
  })()`);
  await pointerClick(point);
}

async function clickFraction(selector, fx, fy) {
  const point = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error('missing ${selector}');
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width * ${fx};
    const y = rect.top + rect.height * ${fy};
    const hit = document.elementFromPoint(x, y);
    if (!(hit === el || el.contains(hit))) throw new Error('click target covered: ${selector} hit ' + (hit ? hit.tagName + '.' + hit.className : 'nothing'));
    return { x, y };
  })()`);
  await pointerClick(point);
}

let total = 0;
let failed = 0;
function reportChecks(checks, phase) {
  for (const item of checks) {
    total += 1;
    if (item.pass) console.log(`ok ${total} - ${phase}: ${item.name}`);
    else {
      failed += 1;
      console.log(`not ok ${total} - ${phase}: ${item.name}${item.detail ? ` (${item.detail})` : ''}`);
    }
  }
}

await page('Page.navigate', { url: `http://127.0.0.1:${port}/` });
await sleep(1400);
await evaluate('document.fonts.ready');

reportChecks(await evaluate(`(() => {
  const checks = [];
  const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), detail: detail || '' });
  const project = window.__spritesmith.getProject();
  const canvas = document.querySelector('#sprite-canvas');
  const ctx = canvas.getContext('2d');
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let alphaPixels = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) alphaPixels += 1;
  check('document title is SpriteSmith', document.title === 'SpriteSmith', document.title);
  check('standalone title rendered once', document.querySelectorAll('h1').length === 1 && document.querySelector('h1').textContent.trim() === 'SpriteSmith');
  check('sample walk cycle ships with four frames', project.frames.length === 4, String(project.frames.length));
  check('sample frames are painted', project.frames.every((frame) => frame.pixels.some(Boolean)), project.frames.map((frame) => frame.pixels.filter(Boolean).length).join(','));
  check('fixed palette renders sixteen slots', document.querySelectorAll('.swatch').length === 16, String(document.querySelectorAll('.swatch').length));
  check('timeline renders four thumbnails', document.querySelectorAll('.frame-thumb').length === 4, String(document.querySelectorAll('.frame-thumb').length));
  check('constraint checker starts clean', document.querySelector('#constraint-count').textContent.trim() === 'clean', document.querySelector('#constraint-count').textContent);
  check('main canvas visibly paints the sprite', alphaPixels > 2000, String(alphaPixels));
  check('atlas preview is present', document.querySelector('#atlas-preview').textContent.includes('"frames"'), document.querySelector('#atlas-preview').textContent.slice(0, 80));
  check('page resources stay on the demo origin', performance.getEntriesByType('resource').every((entry) => new URL(entry.name).origin === location.origin), performance.getEntriesByType('resource').map((entry) => entry.name).join('|'));
  return checks;
})()`), 'initial render');

const initialPainted = await evaluate(`window.__spritesmith.getProject().frames[0].pixels.filter(Boolean).length`);
await click('button[data-color="15"]');
await clickFraction('#sprite-canvas', 0.03125, 0.03125);
reportChecks(await evaluate(`(() => {
  const project = window.__spritesmith.getProject();
  const painted = project.frames[0].pixels.filter(Boolean).length;
  return [{
    name: 'real canvas click paints with the selected indexed slot',
    pass: painted === ${initialPainted + 1} && project.frames[0].pixels[0] === 15,
    detail: 'painted ' + painted + ' first ' + project.frames[0].pixels[0],
  }];
})()`), 'drawing');

await click('#duplicate-frame-button');
reportChecks(await evaluate(`(() => {
  const project = window.__spritesmith.getProject();
  return [{
    name: 'duplicate frame inserts a painted copy after the current frame',
    pass: project.frames.length === 5 && project.selectedFrame === 1 && project.frames[1].pixels.some(Boolean),
    detail: project.frames.length + ' frames, selected ' + project.selectedFrame,
  }];
})()`), 'timeline duplication');

await click('#undo-button');
await click('#redo-button');
reportChecks(await evaluate(`(() => {
  const project = window.__spritesmith.getProject();
  return [{
    name: 'undo and redo round trip the duplication',
    pass: project.frames.length === 5 && project.selectedFrame === 1,
    detail: project.frames.length + ' frames, selected ' + project.selectedFrame,
  }];
})()`), 'history controls');

await click('#add-frame-button');
reportChecks(await evaluate(`(() => {
  const text = document.querySelector('#constraint-list').textContent;
  return [{
    name: 'adding a blank frame produces an empty-frame violation with a fix hint',
    pass: document.querySelector('#constraint-count').textContent.includes('1 issue') && text.includes('no painted pixels') && text.includes('Paint at least one pixel'),
    detail: document.querySelector('#constraint-count').textContent + ' | ' + text.slice(0, 120),
  }];
})()`), 'constraint violation');

await click('#delete-frame-button');
reportChecks(await evaluate(`(() => {
  const project = window.__spritesmith.getProject();
  return [{
    name: 'deleting the blank frame restores the five-frame timeline',
    pass: project.frames.length === 5 && project.frames.every((frame) => frame.pixels.some(Boolean)),
    detail: project.frames.length + ' frames',
  }];
})()`), 'frame deletion');

await evaluate(`(() => {
  const maxWidth = document.querySelector('#max-width-input');
  maxWidth.value = '40';
  maxWidth.dispatchEvent(new Event('change', { bubbles: true }));
  const layout = document.querySelector('#layout-select');
  layout.value = 'grid';
  layout.dispatchEvent(new Event('change', { bubbles: true }));
})()`);
await sleep(250);
await click('#forge-button');
reportChecks(await evaluate(`(() => {
  const sheet = window.__spritesmith.getForgedSheet();
  const atlas = JSON.stringify(window.__spritesmith.getAtlas());
  const checks = [];
  const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), detail: detail || '' });
  check('grid forge produces exact 32 by 48 sheet math for five frames', sheet && sheet.width === 32 && sheet.height === 48 && sheet.columns === 2 && sheet.rows === 3 && sheet.frameCount === 5, JSON.stringify(sheet));
  check('forge enables PNG and JSON export buttons', !document.querySelector('#download-png-button').disabled && !document.querySelector('#download-json-button').disabled);
  check('sheet stats display exact pixel math', document.querySelector('#sheet-stats').textContent.includes('32 x 48px'), document.querySelector('#sheet-stats').textContent);
  check('atlas preview carries frame rects and no GIF claim', atlas.includes('"frame"') && atlas.includes('"gifExported":false'), atlas.slice(0, 160));
  return checks;
})()`), 'forge workflow');

await click('#play-button');
await sleep(420);
reportChecks(await evaluate(`(() => {
  return [{
    name: 'timeline playback advances on the real clock',
    pass: document.querySelector('#play-button').textContent.trim() === 'Pause' && !document.querySelector('#time-readout').textContent.startsWith('0 ms'),
    detail: document.querySelector('#play-button').textContent + ' | ' + document.querySelector('#time-readout').textContent,
  }];
})()`), 'playback');
await click('#play-button');

reportChecks([{
  name: 'no browser console errors or uncaught exceptions',
  pass: consoleErrors.length === 0 && uncaughtExceptions.length === 0,
  detail: [...consoleErrors, ...uncaughtExceptions].join(' | '),
}], 'browser hygiene');

try { ws.close(); } catch {}
if (failed) {
  console.error(`${failed} browser check(s) failed`);
  await shutdown(1);
}
console.log(`${total} browser checks passed`);
await shutdown(0);
