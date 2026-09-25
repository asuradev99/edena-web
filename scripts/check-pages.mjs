// node scripts/check-pages.mjs [port]
//
// Every page in the showcase should load, draw, and complain about nothing. This is the broad,
// shallow check — one page at a time, no interaction — and it is the one to run after touching a
// shared library module, because a fault there shows up everywhere.
//
// It needs a browser: start one with a debugging port (see README) and a static server, then
//   node scripts/serve.mjs &
//   node scripts/check-pages.mjs 9444
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';

const port = Number(process.argv[2] ?? 9444);
const origin = process.env.EDENA_ORIGIN ?? 'http://127.0.0.1:5173';
const pages = readdirSync('.').filter(name => name.endsWith('.html')).sort();

/** A page is healthy if it has no exception, no console error, no severe log entry, and drew. */
async function healthy(page) {
  const target = await fetch(`http://localhost:${port}/json/new?about:blank`, { method: 'PUT' }).then(response => response.json());
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = () => reject(new Error('Chrome refused the debugging connection'));
    setTimeout(() => reject(new Error('Chrome did not answer on the debugging port')), 10000);
  });

  let nextId = 1;
  const pending = new Map();
  const events = [];
  socket.onmessage = message => {
    const payload = JSON.parse(message.data);
    if (payload.id && pending.has(payload.id)) {
      const { resolve } = pending.get(payload.id);
      pending.delete(payload.id);
      resolve(payload.result);
    } else if (payload.method) events.push(payload);
  };
  const call = (method, params = {}, timeout = 30000) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending.delete(id)) reject(new Error(`${method} timed out`)); }, timeout);
  });
  const evaluate = async expression => {
    const { result } = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    return result?.value;
  };

  try {
    await call('Runtime.enable');
    await call('Log.enable');
    await call('Page.enable');
    await call('Network.enable');
    // Always test the build in front of us: a cached bundle once hid a fix from a check.
    await call('Network.setCacheDisabled', { cacheDisabled: true });
    await call('Page.navigate', { url: `${origin}/${page}` });
    await new Promise(resolve => setTimeout(resolve, 4000));

    const drawn = await evaluate(`(() => {
      let canvases = 0, painted = 0;
      for (const canvas of document.querySelectorAll('canvas')) {
        canvases++;
        const rect = canvas.getBoundingClientRect();
        if (rect.width > 20 && rect.height > 20 && canvas.width > 0 && canvas.height > 0) painted++;
      }
      // Pages differ: some hide the status line entirely, some show it as an info bar, and only
      // symmetry.html marks its state. An error state is the thing worth failing on.
      const status = document.getElementById('status');
      const errored = status ? status.dataset.state === 'error'
        || (!status.hidden && /error|failed|cannot/i.test(status.textContent)) : false;
      return { canvases, painted, title: document.title, errored };
    })()`);
    const complaints = events
      .filter(event => event.method === 'Runtime.exceptionThrown'
        || (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error')
        || (event.method === 'Log.entryAdded' && event.params.entry.level === 'error'))
      .map(event => event.params.exceptionDetails?.text ?? event.params.entry?.text
        ?? event.params.args?.map(argument => argument.value).join(' ') ?? event.method);
    return { ...drawn, complaints };
  } finally {
    await call('Target.closeTarget', { targetId: target.id }).catch(() => {});
    socket.close();
  }
}

const report = [];
for (const page of pages) {
  const result = await healthy(page);
  assert.ok(result.title.length > 0, `${page} has no title`);
  assert.ok(result.painted >= 1, `${page} drew nothing (${result.canvases} canvases)`);
  assert.ok(!result.errored, `${page} is showing an error banner`);
  assert.deepEqual(result.complaints, [], `${page} complained: ${result.complaints.join(' | ')}`);
  report.push(`${page} (${result.painted}/${result.canvases} canvases drawing)`);
}

console.log(`PASS: ${pages.length} pages load, draw and stay quiet —`, report.join(', '));
