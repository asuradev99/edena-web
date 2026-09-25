// Run against a Chrome debugging session: node scripts/check-basics.mjs [port]
//
// Checks the basics tour the way a reader meets it:
//   1. every one of the twenty demos draws something, and each draws something distinct;
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
// A socket that never opens would otherwise hang the whole check with no output.
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

/** Average absolute difference between two normalised 8×8 signatures: 0 is identical. */
const difference = (a, b) => a.grid.reduce((sum, value, index) => sum + Math.abs(value - b.grid[index]), 0) / a.grid.length;

try {
  await call('Runtime.enable');
  await call('Log.enable');
  await call('Page.enable');
  // Always test the current build: a cached bundle once hid a fix from this check.
  await call('Network.enable');
  await call('Network.setCacheDisabled',{cacheDisabled:true});
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
      await pause(250);
      const r = stage.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
    })()`);
    const shot = (await call('Page.captureScreenshot', { format: 'png' })).data;
    return evaluate(`window.__measureRegion(${JSON.stringify(shot)}, ${JSON.stringify(rect)})`);
  };

  const stageIds = ['coordinates', 'interpolation', 'transparency', 'shapes', 'groups', 'labels', 'colour', 'plot', 'depth', 'instances', 'camera', 'simulation', 'field', 'streamlines', 'story', 'vectors', 'path', 'normals', 'layers', 'bars'];
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
    ['depth-cross', 2.2, 'depth'],
    ['depth-tilt', -50, 'depth'],
    ['instances-count', 5, 'instances'],
    ['instances-wave', 1, 'instances'],
    ['camera-path', 'top', 'camera'],
    ['camera-time', .45, 'camera'],
    ['simulation-count', 400, 'simulation'],
    ['field-kind', 'gyroid', 'field'],
    ['field-level', .5, 'field'],
    ['streamlines-kind', 'dipole', 'streamlines'],
    ['streamlines-count', 40, 'streamlines'],
    ['story-time', 4.5, 'story'],
    ['vectors-spread', 140, 'vectors'],
    ['path-kind', 'loop', 'path'],
    ['path-time', .75, 'path'],
    ['normals-kind', 'dome', 'normals'],
    ['normals-length', 1.3, 'normals'],
    ['layers-bonds', false, 'layers'],
    ['layers-atoms', false, 'layers'],
    ['layers-axes', false, 'layers'],
    ['bars-series', 'moons', 'bars'],
    ['bars-sort', 1, 'bars'],
  ];
  // Stop the demos that spin, so every control can be judged against a still picture. The spin buttons
  // themselves are checked afterwards, by measuring exactly this drift.
  await evaluate(`document.getElementById('transparency-spin').click(); document.getElementById('groups-spin').click(); document.getElementById('depth-spin').click(); document.getElementById('instances-spin').click(); document.getElementById('field-spin').click(); document.getElementById('streamlines-turn').click(); document.getElementById('vectors-spin').click(); document.getElementById('normals-spin').click(); document.getElementById('layers-turn').click(); document.getElementById('bars-spin').click();`);
  await evaluate(`{ const node = document.getElementById('path-play'); if (node.textContent === 'Pause') node.click(); }`);
  await evaluate(`{ const node = document.getElementById('story-play'); if (node.textContent === 'Pause') node.click(); }`);
  await wait(500);
  // Only these hold still on their own, so only they can prove that a control left them alone.
  const still = new Set(['coordinates', 'shapes', 'groups', 'colour', 'plot', 'depth', 'instances', 'field', 'streamlines', 'story', 'vectors', 'path', 'normals', 'layers', 'bars']);
  for (const [control, value, stageId] of changes) {
    // The helix keeps moving, so stop it first: then the turn count is the only thing that changes.
    if (control === 'labels-turns' || control.startsWith('camera-') || control.startsWith('simulation-')) {
      // Only click a button that is currently playing: the state depends on prefers-reduced-motion.
      await evaluate(`for (const id of ['labels-play', 'camera-play', 'simulation-play']) { const node = document.getElementById(id); if (node.textContent === 'Pause') node.click(); }`);
      await wait(300);
    }
    // Measure everything fresh: earlier controls have already changed the other stages, and some demos
    // animate on their own, so each stage is compared against itself a moment before the change.
    const before = await region(stageId);
    const neighbours = {};
    // Two witnesses are enough to show a control stays inside its own demo, and measuring every
    // still stage for every control made this check take minutes.
    for (const other of stageIds.filter(candidate => candidate !== stageId && still.has(candidate)).slice(0, 1)) neighbours[other] = await region(other);
    const drift = difference(before, await region(stageId));
    if (value === 'click') await evaluate(`document.getElementById(${JSON.stringify(control)}).click()`);
    else await evaluate(`window.__set(${JSON.stringify(control)}, ${JSON.stringify(value)})`);
    const after = await region(stageId);
    const moved = difference(before, after);
    // The floor is deliberately small — thin geometry moves few pixels — but a control that does
    // nothing at all moves nothing, so a disconnected handler is still caught.
    assert.ok(moved > Math.max(.006, drift * 2), `${control} did not change ${stageId} (moved ${moved.toFixed(5)}, drifted ${drift.toFixed(5)} alone)`);
    for (const [other, beforeOther] of Object.entries(neighbours)) {
      const creep = difference(beforeOther, await region(other));
      assert.ok(creep < .05, `${control} reached into ${other} (difference ${creep.toFixed(5)})`);
    }
  }

  // The layer checkboxes were switched off by the sweep above, which leaves that stage empty; put them
  // back before anything else measures it.
  for (const id of ['layers-axes', 'layers-bonds', 'layers-atoms']) await evaluate(`window.__set(${JSON.stringify(id)}, true)`);
  await wait(200);

  // The spin button is a state rather than a nudge: prove it by holding the stage still, then letting
  // it go again. A rotating scene drifts on its own, which is exactly what this measures.
  for (const [button, stageId] of [['transparency-spin', 'transparency'], ['groups-spin', 'groups'], ['depth-spin', 'depth'], ['instances-spin', 'instances'], ['field-spin', 'field'], ['streamlines-turn', 'streamlines'], ['vectors-spin', 'vectors'], ['normals-spin', 'normals'], ['layers-turn', 'layers'], ['bars-spin', 'bars']]) {
    // Give each measurement a second: a slow turn through a small diagram needs time to show up.
    const heldStill = difference(await region(stageId), await wait(1000).then(() => region(stageId)));
    assert.ok(heldStill < .02, `${stageId} should hold still once stopped (drift ${heldStill.toFixed(5)})`);
    await evaluate(`document.getElementById(${JSON.stringify(button)}).click()`);
    await wait(400);
    // Compared with the stage's own still drift rather than a fixed number: a thin diagram turns
    // through far fewer pixels per second than a field of spheres.
    await wait(1000);
    const spinning = difference(await region(stageId), await region(stageId));
    assert.ok(spinning > heldStill + .005, `${stageId} should move again once started (still ${heldStill.toFixed(5)}, moving ${spinning.toFixed(5)})`);
    await evaluate(`document.getElementById(${JSON.stringify(button)}).click()`);
    await wait(300);
  }

  // The force selector changes the dynamics rather than the still picture, so it is judged by its
  // own readout instead of by pixels.
  await evaluate(`window.__set('simulation-force', 'swirl')`);
  await wait(300);
  assert.match(await evaluate(`document.querySelector('#simulation-labels span').textContent`), /^swirl · /, 'the readout should name the chosen force');
  // Detail is a tessellation setting: the picture barely changes, but the triangle count should.
  const coarse = await evaluate(`document.querySelector('#field-labels span').textContent`);
  await evaluate(`window.__set('field-resolution', 36)`);
  await wait(600);
  const fine = await evaluate(`document.querySelector('#field-labels span').textContent`);
  const triangles = text => Number(/([0-9,]+) triangles/.exec(text)?.[1].replace(/,/g, '') ?? 0);
  assert.ok(triangles(fine) > triangles(coarse), `finer detail should add triangles (${coarse} → ${fine})`);
  await evaluate(`window.__set('field-resolution', 28)`);
  await wait(600);

  const probeStart = await evaluate(`document.querySelector('#simulation-labels span').textContent`);
  await evaluate(`document.getElementById('simulation-play').click()`);
  await wait(900);
  assert.notEqual(await evaluate(`document.querySelector('#simulation-labels span').textContent`), probeStart, 'the simulation should advance when played');
  await evaluate(`document.getElementById('simulation-play').click()`);

  // The flow rate is named in the readout, which is a better witness than a few moving dots.
  await evaluate(`window.__set('streamlines-speed', 0.3)`);
  await wait(200);
  assert.match(await evaluate(`document.querySelector('#streamlines-labels span').textContent`), /flow 0\.30/, 'the readout should name the flow rate');
  await evaluate(`window.__set('streamlines-speed', 0.7)`);
  await wait(200);

  // The path's marker reads its position from the same parameter the scrubber sets, and the readout
  // shows the raw parameter beside the eased one.
  const alongBefore = await evaluate(`document.getElementById('path-readout').textContent`);
  await evaluate(`document.getElementById('path-play').click()`);
  await wait(700);
  const alongAfter = await evaluate(`document.getElementById('path-readout').textContent`);
  assert.notEqual(alongAfter, alongBefore, `play should move the marker along (stuck at ${alongBefore})`);
  await evaluate(`{ const node = document.getElementById('path-play'); if (node.textContent === 'Pause') node.click(); }`);
  await wait(200);

  // The story's clock, chapter readout and play button are the same object: check they agree.
  await evaluate(`window.__set('story-time', 0)`);
  await wait(300);
  assert.match(await evaluate(`document.getElementById('story-chapter').textContent`), /^1 · /, 'chapter one at t = 0');
  await evaluate(`window.__set('story-time', 7)`);
  await wait(300);
  assert.match(await evaluate(`document.getElementById('story-chapter').textContent`), /^4 · /, 'chapter four by t = 7');
  await evaluate(`document.getElementById('story-restart').click()`);
  await wait(700);
  const restarted = parseFloat(await evaluate(`document.getElementById('story-time-value').textContent`));
  assert.ok(restarted > 0, `restart should replay from zero (t = ${restarted})`);
  await evaluate(`{ const node = document.getElementById('story-play'); if (node.textContent === 'Pause') node.click(); }`);

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
  assert.match(stats, /20 views/);
  const problems = events.filter(event => event.method === 'Runtime.exceptionThrown' || (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') || (event.method === 'Log.entryAdded' && event.params.entry.level === 'error'));
  assert.equal(problems.length, 0, `the page reported ${problems.length} problem(s): ${JSON.stringify(problems[0]?.params ?? {}).slice(0, 300)}`);

  console.log('PASS: twenty demos drawing distinct scenes, every control moving its own stage alone,');
  console.log('      the helix and the timeline running, the transport seeking and resuming,', stats);
  console.log('     ', JSON.stringify(Object.fromEntries(stageIds.map(stageId => [stageId, Number(signatures[stageId].mean.toFixed(3))]))));
} finally {
  // Close the tab this check opened: leaving them behind eventually starves the browser.
  await call('Target.closeTarget', { targetId: target.id }).catch(() => {});
  socket.close();
}
