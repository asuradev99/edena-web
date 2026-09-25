// Run against a Chrome debugging session: node scripts/check-basics.mjs [port]
//
// Checks the basics tour the way a reader meets it:
//   1. every one of the eight demos draws something, and each draws something distinct;
//   2. every control changes its own stage — projection, grid, marker height, opacity, spin, the mesh
//      selector, the group's spread and opacity, and the helix's turn count — and leaves the others be;
//   3. the two moving demos advance on their own, and the transport seeks;
//   4. the page reports a frame rate and never throws or logs an error.
//
// Pixels come from the compositor (`Page.captureScreenshot`) and are measured back inside the page, so
// no image library is needed: a WebGPU canvas cannot be read once it has been presented, but a
// screenshot of it can. Each stage is scrolled into view before it is measured, because the capture is
// viewport-sized.
import assert from 'node:assert/strict';

const port = process.argv[2] ?? '9333';
const url = 'http://127.0.0.1:5173/basics.html?samples=1&dpr=1';
const target = await (await fetch(`http://localhost:${port}/json/new?${url}`, { method: 'PUT' })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve => socket.onopen = resolve);
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

/** Average absolute difference between two normalised 8×8 signatures: 0 is identical. */
const difference = (a, b) => a.grid.reduce((sum, value, index) => sum + Math.abs(value - b.grid[index]), 0) / a.grid.length;

try {
  await call('Runtime.enable');
  await call('Log.enable');
  await call('Page.enable');
  await call('Page.navigate', { url });
  await wait(4000);

  // The measurement lives in the page: it decodes a screenshot, draws it, and averages a region.
  await evaluate(`(() => {
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
      // Normalising by the overall brightness makes the signature describe the shape of the picture
      // rather than how much of it is lit, which is what tells two demos apart.
      return { mean, bright, grid: grid.map((value, index) => value / (counts[index] || 1) / (mean || 1)) };
    };
    window.__set = (id, value) => {
      const input = document.getElementById(id);
      if (input.type === 'checkbox') input.checked = value;
      else input.value = String(value);
      // Both, so the helper works whichever event a control listens for.
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    return true;
  })()`);

  /** Scroll a demo's stage into view, capture, and measure that region. */
  const region = async stageId => {
    const rect = await evaluate(`(async () => {
      const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
      const stage = document.getElementById(${JSON.stringify(stageId)}).querySelector('.stage');
      stage.scrollIntoView({ block: 'center' });
      await pause(450);
      const r = stage.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
    })()`);
    const shot = (await call('Page.captureScreenshot', { format: 'png' })).data;
    return evaluate(`window.__measureRegion(${JSON.stringify(shot)}, ${JSON.stringify(rect)})`);
  };

  const stageIds = ['coordinates', 'interpolation', 'transparency', 'shapes', 'groups', 'labels', 'colour', 'plot'];
  const startup = await evaluate(`({ stats: document.getElementById('stats').textContent, status: document.getElementById('status').hidden, labels: document.querySelectorAll('.labels span').length })`);
  assert.ok(startup.status, `the page reported an error: ${await evaluate('document.getElementById("status").textContent')}`);
  assert.match(startup.stats, /fps/);
  assert.ok(startup.labels > 20, `expected the demos to project labels, saw ${startup.labels}`);

  // 1. Every demo draws, and no two look alike.
  const signatures = {};
  for (const stageId of stageIds) {
    const measured = await region(stageId);
    assert.ok(measured.mean > .01, `${stageId} looks blank (mean ${measured.mean.toFixed(4)})`);
    assert.ok(measured.bright > 150, `${stageId} has only ${measured.bright} lit pixels`);
    signatures[stageId] = measured;
  }
  for (let a = 0; a < stageIds.length; a++) for (let b = a + 1; b < stageIds.length; b++) {
    assert.ok(difference(signatures[stageIds[a]], signatures[stageIds[b]]) > .1, `${stageIds[a]} and ${stageIds[b]} look the same`);
  }

  // 2. Every control moves its own stage, and leaves the others alone.
  const changes = [
    ['coordinates-projection', 'orthographic', 'coordinates'],
    ['coordinates-grid', false, 'coordinates'],
    ['coordinates-height', .4, 'coordinates'],
    ['transparency-opacity', 1, 'transparency'],
    ['shapes-kind', 'wave', 'shapes'],
    ['shapes-spin', 60, 'shapes'],
    ['groups-scale', 1.8, 'groups'],
    ['groups-opacity', .25, 'groups'],
    ['labels-turns', 5, 'labels'],
    ['colour-palette', 'plasma', 'colour'],
    ['colour-amplitude', 1.3, 'colour'],
    ['plot-function', 'damped', 'plot'],
  ];
  // Stop the demos that spin, so every control can be judged against a still picture. The spin buttons
  // themselves are checked afterwards, by measuring exactly this drift.
  await evaluate(`document.getElementById('transparency-spin').click(); document.getElementById('groups-spin').click();`);
  await wait(500);
  // Only these hold still on their own, so only they can prove that a control left them alone.
  const still = new Set(['coordinates', 'shapes', 'groups', 'colour', 'plot']);
  for (const [control, value, stageId] of changes) {
    // The helix keeps moving, so stop it first: then the turn count is the only thing that changes.
    if (control === 'labels-turns') { await evaluate(`document.getElementById('labels-play').click()`); await wait(300); }
    // Measure everything fresh: earlier controls have already changed the other stages, and some demos
    // animate on their own, so each stage is compared against itself a moment before the change.
    const before = await region(stageId);
    const neighbours = {};
    for (const other of stageIds.filter(candidate => candidate !== stageId && still.has(candidate))) neighbours[other] = await region(other);
    const drift = difference(before, await region(stageId));
    if (value === 'click') await evaluate(`document.getElementById(${JSON.stringify(control)}).click()`);
    else await evaluate(`window.__set(${JSON.stringify(control)}, ${JSON.stringify(value)})`);
    const after = await region(stageId);
    const moved = difference(before, after);
    assert.ok(moved > Math.max(.02, drift * 2), `${control} did not change ${stageId} (moved ${moved.toFixed(5)}, drifted ${drift.toFixed(5)} alone)`);
    for (const [other, beforeOther] of Object.entries(neighbours)) {
      const creep = difference(beforeOther, await region(other));
      assert.ok(creep < .05, `${control} reached into ${other} (difference ${creep.toFixed(5)})`);
    }
  }

  // The spin button is a state rather than a nudge: prove it by holding the stage still, then letting
  // it go again. A rotating scene drifts on its own, which is exactly what this measures.
  for (const [button, stageId] of [['transparency-spin', 'transparency'], ['groups-spin', 'groups']]) {
    const heldStill = difference(await region(stageId), await region(stageId));
    assert.ok(heldStill < .04, `${stageId} should hold still once stopped (drift ${heldStill.toFixed(5)})`);
    await evaluate(`document.getElementById(${JSON.stringify(button)}).click()`);
    await wait(400);
    const spinning = difference(await region(stageId), await region(stageId));
    assert.ok(spinning > .05, `${stageId} should move again once started (drift ${spinning.toFixed(5)})`);
    await evaluate(`document.getElementById(${JSON.stringify(button)}).click()`);
    await wait(300);
  }

  // 3. Motion: the helix label advances on its own, and the transport seeks and resumes.
  const liveTime = () => evaluate(`document.querySelectorAll('#labels-stage-labels span')[1]?.textContent ?? ''`);
  // The control sweep stopped the helix to measure the turn count, so set it going again.
  if (await evaluate(`document.getElementById('labels-play').textContent`) === 'Play') { await evaluate(`document.getElementById('labels-play').click()`); await wait(400); }
  const before = await liveTime();
  await wait(900);
  assert.notEqual(before, await liveTime(), `the helix marker should advance (stuck at ${before})`);
  await evaluate(`window.__set('interpolation-time', 1)`);
  await wait(400);
  assert.match(await evaluate(`document.getElementById('interpolation-time-value').textContent`), /^1\.0[0-9] s$/, 'the transport should seek');
  await evaluate(`document.getElementById('interpolation-play').click()`);
  await wait(700);
  const resumed = Number(/^([0-9.]+) s$/.exec(await evaluate(`document.getElementById('interpolation-time-value').textContent`))?.[1] ?? 0);
  await wait(700);
  const later = Number(/^([0-9.]+) s$/.exec(await evaluate(`document.getElementById('interpolation-time-value').textContent`))?.[1] ?? 0);
  assert.ok(resumed > 1 && later > resumed, `play should resume from the sought time (${resumed} then ${later})`);

  // 4. Frame rate and console hygiene.
  const stats = await evaluate(`document.getElementById('stats').textContent`);
  const fps = Number(/· (\d+) fps/.exec(stats)?.[1] ?? 0);
  assert.ok(fps >= 50, `expected a healthy frame rate, saw ${stats}`);
  assert.match(stats, /8 views/);
  const problems = events.filter(event => event.method === 'Runtime.exceptionThrown' || (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') || (event.method === 'Log.entryAdded' && event.params.entry.level === 'error'));
  assert.equal(problems.length, 0, `the page reported ${problems.length} problem(s): ${JSON.stringify(problems[0]?.params ?? {}).slice(0, 300)}`);

  console.log('PASS: eight demos drawing distinct scenes, every control moving its own stage alone,');
  console.log('      the helix and the timeline running, the transport seeking and resuming,', stats);
  console.log('     ', JSON.stringify(Object.fromEntries(stageIds.map(stageId => [stageId, Number(signatures[stageId].mean.toFixed(3))]))));
} finally {
  socket.close();
}
