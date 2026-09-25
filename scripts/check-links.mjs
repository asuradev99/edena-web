// node scripts/check-links.mjs
//
// The showcase is a set of standalone pages, and the tour is meant to be where a reader starts, so
// two things are worth checking mechanically: that every local link still resolves, and that every
// page can reach basics.html. Neither needs a browser.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';

const pages = readdirSync('.').filter(name => name.endsWith('.html')).sort();
assert.ok(pages.includes('index.html') && pages.includes('basics.html'), 'the landing page and the tour must exist');

const isLocal = href => !/^(https?:|mailto:|tel:|data:|javascript:|#)/.test(href);
const resolve = href => {
  const path = href.split('#')[0].split('?')[0];
  if (path === '' || path === '/' || path === './') return 'index.html';
  return path.replace(/^\//, '');
};

let checked = 0;
for (const page of pages) {
  const text = readFileSync(page, 'utf8');
  const hrefs = [...new Set([...text.matchAll(/href\s*=\s*"([^"]+)"/g)].map(match => match[1]).filter(isLocal))];
  for (const href of hrefs) {
    const target = resolve(href);
    assert.ok(existsSync(target), `${page} links to ${href}, which does not exist`);
    checked++;
  }
  if (page !== 'basics.html') {
    assert.ok(hrefs.some(href => resolve(href) === 'basics.html'), `${page} cannot reach the basics tour`);
  }
}

// The tour is a list of panels and a table of contents that names them. Adding a demo by inserting it
// before another one silently put the page out of order once; this keeps the ids in step.
const tour = readFileSync('basics.html', 'utf8');
const tocOrder = [...tour.matchAll(/<li><a href="#([a-z]+)">([0-9]+) ·/g)].map(match => [match[1], Number(match[2])]);
const panelOrder = [...tour.matchAll(/<section class="panel[^"]*" id="([a-z]+)"[\s\S]*?<span class="index">([0-9]+)<\/span>/g)]
  .map(match => [match[1], Number(match[2])]);
assert.equal(panelOrder.length, tocOrder.length, 'every table-of-contents entry should have a panel');
assert.deepEqual(panelOrder.map(([id]) => id), tocOrder.map(([id]) => id),
  'the table of contents should list the panels in the order the page presents them — run node scripts/tidy-panels.mjs');
assert.deepEqual(panelOrder.map(([, index]) => index), panelOrder.map((_, position) => position + 1),
  'panel numbering should run 1, 2, 3 … with no gaps or repeats');

// Every page that loads a script must load one that the build produces.
for (const page of pages) {
  const text = readFileSync(page, 'utf8');
  for (const [, source] of text.matchAll(/<script[^>]+src\s*=\s*"([^"]+)"/g)) {
    if (/^https?:/.test(source)) continue;
    assert.ok(existsSync(source), `${page} loads ${source}, which does not exist — run npm run build`);
  }
}

console.log(`PASS: ${pages.length} pages, ${checked} local links, every page reaches the basics tour, every script present`);
