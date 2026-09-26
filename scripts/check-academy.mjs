// node scripts/check-academy.mjs [port]
//
// Drives academy.html in a real browser the way a reader meets it:
//   1. the page loads, draws every chapter canvas, reports a frame rate, and stays quiet;
//   2. every control changes its own chapter — measured from a compositor screenshot, because a
//      WebGPU canvas cannot be read after it has been presented — and does so more than an
//      untouched neighbour drifts on its own, which is what a disconnected control would fail;
//   3. the simulation chapter advances without any input, so it is not a still picture;
//   4. the chapter and source links resolve (the static half is in tests/academy.test.mjs).
//
// It needs a Chrome with a debugging port and the dev server, like the other browser checks:
//   npm run dev
//   node scripts/check-academy.mjs 9444
//
// Use a dedicated browser if another check is running; background-tab throttling can starve a
// second tab on the same instance.
import assert from 'node:assert/strict';

const port = process.argv[2] ?? '9444';
const origin = process.env.EDENA_ORIGIN ?? 'http://127.0.0.1:5173';
const url = `${origin}/academy.html?samples=1&dpr=1`;
const target = await (await fetch(`http://localhost:${port}/json/new?${url}`, { method: 'PUT' })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.onopen = resolve;
  socket.onerror = () => reject(new Error('Chrome refused the debugging connection'));
  setTimeout(() => reject(new Error('Chrome did not answer on the debugging port')), 10000);
});
let id = 0;
const pending = new Map();
const events = [];
socket.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.id) pending.get(message.id)?.(message);
  else events.push(message);
};
const call = (method, params) => new Promise((resolve, reject) => {
  const key = ++id;
  const timer = setTimeout(() => reject(new Error(`Browser check timed out on ${method}`)), 30000);
  pending.set(key, message => { clearTimeout(timer); pending.delete(key); message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result); });
  socket.send(JSON.stringify({ id: key, method, params }));
});
const evaluate = async expression => (await call('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression })).result.value;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Signature of a measured region: an 8×8 normalised brightness grid plus a lit-pixel count. */
const shape = measured => {
  const total = measured.grid.reduce((sum, value) => sum + value, 0) || 1;
  return measured.grid.map(value => value / total);
};
const difference = (a, b) => {
  const left = shape(a), right = shape(b);
  const spread = left.reduce((sum, value, index) => sum + Math.abs(value - right[index]), 0) / left.length;
  const lit = Math.abs(a.bright / (a.mean * a.grid.length || 1) - b.bright / (b.mean * b.grid.length || 1));
  return spread + Math.min(1, lit) * .5;
};

const panels = [
  'projection', 'mesh', 'colour', 'integration', 'simulation', 'symmetry',
  'transform', 'time', 'curve', 'surface', 'field', 'streamline', 'plotframe',
  'typeset', 'derivation', 'picking', 'depth', 'instancing', 'crystal', 'elements',
  'area', 'limit',
];
/** Chapters with no canvas: their stage is a DOM lab, so they are measured but not counted. */
const domPanels = ['typeset', 'derivation'];
const canvasPanels = panels.filter(name => !domPanels.includes(name));

/** The control to exercise per chapter, the value to set, and one neighbour that must stay put. */
const sweeps = [
  { stage: 'projection', control: 'projection-mode', value: 'perspective', neighbour: 'mesh' },
  { stage: 'mesh', control: 'mesh-resolution', value: '160', neighbour: 'colour' },
  { stage: 'colour', control: 'colour-low', value: '-0.2', neighbour: 'integration' },
  { stage: 'integration', control: 'integration-dt', value: '0.025', neighbour: 'symmetry' },
  { stage: 'simulation', control: 'simulation-count', value: '1024', neighbour: 'projection' },
  { stage: 'symmetry', control: 'symmetry-lattice', value: 'perovskite', neighbour: 'mesh' },
  // The added chapters. A panel that animates by itself drifts on its own, so each of those is
  // compared against a still neighbour ('curve' and 'plotframe' never move without input).
  { stage: 'transform', control: 'transform-joint-2', value: '1.2', neighbour: 'curve' },
  { stage: 'time', control: 'time-scrub', value: '3.2', neighbour: 'plotframe' },
  { stage: 'curve', control: 'curve-samples', value: '900', neighbour: 'plotframe' },
  { stage: 'surface', control: 'surface-resolution', value: '70', neighbour: 'curve' },
  { stage: 'field', control: 'field-resolution', value: '40', neighbour: 'plotframe' },
  { stage: 'streamline', control: 'streamline-step', value: '0.15', neighbour: 'curve' },
  { stage: 'plotframe', control: 'plotframe-ticks', value: '3', neighbour: 'curve' },
  { stage: 'typeset', control: 'typeset-kind', value: 'matrix', neighbour: 'curve' },
  { stage: 'derivation', control: 'derivation-step', value: '2', neighbour: 'curve' },
  { stage: 'picking', control: 'picking-echo', value: '-1.6', neighbour: 'curve' },
  { stage: 'depth', control: 'depth-order', value: 'shells-only', neighbour: 'curve' },
  { stage: 'instancing', control: 'instancing-count', value: '64', neighbour: 'curve' },
  { stage: 'crystal', control: 'crystal-source', value: 'rocksalt, volume scale', neighbour: 'curve' },
  { stage: 'elements', control: 'elements-group', value: 'noble gases', neighbour: 'curve' },
  { stage: 'area', control: 'area-steps', value: '120', neighbour: 'curve' },
  { stage: 'limit', control: 'limit-h', value: '0.95', neighbour: 'curve' },
];

try {
  await call('Runtime.enable');
  await call('Log.enable');
  await call('Page.enable');
  await call('Network.enable');
  await call('Network.setCacheDisabled', { cacheDisabled: true });
  await call('Page.navigate', { url });
  await wait(4500);

  const install = () => evaluate(`(() => {
    const frame = document.createElement('canvas');
    const context = frame.getContext('2d', { willReadFrequently: true });
    window.__measureRegion = async (base64, rect) => {
      const image = new Image();
      image.src = 'data:image/png;base64,' + base64;
      await image.decode();
      frame.width = image.width; frame.height = image.height;
      context.clearRect(0, 0, frame.width, frame.height);
      context.drawImage(image, 0, 0);
      const data = context.getImageData(rect.x, rect.y, rect.width, rect.height).data;
      const columns = Math.min(8, rect.width), rows = Math.min(8, rect.height);
      const grid = new Array(64).fill(0), counts = new Array(64).fill(0);
      let sum = 0, bright = 0;
      for (let i = 0; i < data.length; i += 4) {
        const pixel = i / 4, x = pixel % rect.width, y = (pixel / rect.width) | 0;
        const value = (data[i] + data[i + 1] + data[i + 2]) / 3 / 255;
        sum += value;
        if (value > .1) bright++;
        const cell = Math.min(rows - 1, (y / rect.height * rows) | 0) * 8 + Math.min(columns - 1, (x / rect.width * columns) | 0);
        grid[cell] += value; counts[cell]++;
      }
      const mean = sum / (data.length / 4);
      return { mean, bright, grid: grid.map((value, index) => value / (counts[index] || 1) / (mean || 1)) };
    };
    window.__set = (id, value) => {
      const input = document.getElementById(id);
      input.value = String(value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    return true;
  })()`);
  await install();

  /** Scroll a chapter's stage into view, capture the viewport, and measure that region. */
  const region = async stage => {
    const rect = await evaluate(`(async () => {
      const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
      const element = document.getElementById(${JSON.stringify(stage)} + '-stage');
      element.scrollIntoView({ block: 'center' });
      await pause(300);
      const r = element.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
    })()`);
    const shot = (await call('Page.captureScreenshot', { format: 'png' })).data;
    return evaluate(`window.__measureRegion(${JSON.stringify(shot)}, ${JSON.stringify(rect)})`);
  };

  // 0. The page is healthy before anything is driven.
  const startup = await evaluate(`({ title: document.title, stats: document.getElementById('stats').textContent,
    statusHidden: document.getElementById('status').hidden, labels: document.querySelectorAll('.labels span').length,
    canvases: document.querySelectorAll('canvas').length })`);
  assert.equal(startup.title, 'Edena · academy');
  assert.ok(startup.statusHidden, `the page reported an error: ${await evaluate('document.getElementById("status").textContent')}`);
  assert.match(startup.stats, /fps/, `expected a frame-rate readout, saw "${startup.stats}"`);
  assert.ok(startup.labels > 10, `expected the chapters to project labels, saw ${startup.labels}`);
  assert.ok(startup.canvases >= canvasPanels.length, `expected ${canvasPanels.length} canvases, saw ${startup.canvases}`);

  // 1. Every chapter draws something.
  const signatures = {};
  for (const panel of panels) {
    const measured = await region(panel);
    assert.ok(measured.mean > .01, `${panel} looks blank (mean ${measured.mean.toFixed(4)})`);
    assert.ok(measured.bright > 120, `${panel} has only ${measured.bright} lit pixels`);
    signatures[panel] = measured;
  }
  // The chapters must not be the same picture many times over.
  const distinct = new Set();
  for (const panel of panels) distinct.add(shape(signatures[panel]).map(value => Math.round(value * 50)).join(','));
  assert.ok(distinct.size >= 4, `expected the chapters to look different, got ${distinct.size} distinct signatures`);

  // 2. Each control moves its own chapter more than an untouched neighbour drifts.
  for (const { stage, control, value, neighbour } of sweeps) {
    const before = await region(stage);
    const neighbourBefore = await region(neighbour);
    await evaluate(`window.__set(${JSON.stringify(control)}, ${JSON.stringify(value)})`);
    await wait(700);
    const drift = difference(before, await region(stage));
    const after = await region(stage);
    const moved = difference(before, after);
    const creep = difference(neighbourBefore, await region(neighbour));
    assert.ok(moved > creep * 1.5 + .005,
      `#${control} changed ${stage} by ${moved.toFixed(3)}, but ${neighbour} drifted ${creep.toFixed(3)}`);
    assert.ok(drift >= 0 && Number.isFinite(drift));
  }

  // 3. The simulation advances on its own; a still picture would fail this.
  await evaluate(`(() => { const button = document.getElementById('simulation-play'); if (button.getAttribute('aria-pressed') === 'false') button.click(); })()`);
  await wait(300);
  const movingBefore = await region('simulation');
  await wait(900);
  const movingAfter = await region('simulation');
  assert.ok(difference(movingBefore, movingAfter) > .005, 'the simulation chapter does not appear to animate');

  // 4. Nothing threw or logged an error during any of that.
  const complaints = events.filter(event => event.method === 'Runtime.exceptionThrown'
    || (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error')
    || (event.method === 'Log.entryAdded' && event.params.entry.level === 'error'))
    .map(event => event.params.exceptionDetails?.text ?? event.params.entry?.text ?? event.method);
  assert.deepEqual(complaints, [], `the page complained: ${complaints.join(' | ')}`);

  console.log(`PASS: ${panels.length} chapters drew, ${sweeps.length} controls moved their own stage, the simulation advanced, no complaints`);
} finally {
  await call('Target.closeTarget', { targetId: target.id }).catch(() => {});
  socket.close();
}
