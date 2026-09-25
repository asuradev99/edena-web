// node scripts/tidy-panels.mjs
//
// Put the basics tour's panels in the order the table of contents lists them. Panels are added by
// inserting a new <section> before an existing one, which silently reorders the page; check-links.mjs
// asserts the two orders match, and this is the one-line repair it points at.
import { readFileSync, writeFileSync } from 'node:fs';

const file = 'basics.html';
const text = readFileSync(file, 'utf8');
const pattern = /[ \t]*<section class="panel[^"]*"[^>]*>[\s\S]*?<\/section>/g;
const blocks = [...text.matchAll(pattern)];
if (!blocks.length) throw new Error('no panels found in ' + file);

const indexOf = block => {
  const match = /<span class="index">([0-9]+)<\/span>/.exec(block);
  if (!match) throw new Error('a panel has no index');
  return Number(match[1]);
};
const order = blocks.map(block => indexOf(block[0]));
const sorted = blocks.map(block => block[0]).sort((a, b) => indexOf(a) - indexOf(b));
if (order.every((value, position) => value === position + 1)) {
  console.log('already in order:', order.join(' '));
  process.exit(0);
}

const first = blocks[0].index, last = blocks[blocks.length - 1].index + blocks[blocks.length - 1][0].length;
writeFileSync(file, text.slice(0, first) + sorted.join('\n\n') + text.slice(last));
console.log(`reordered ${blocks.length} panels:`);
console.log('  was:', order.join(' '));
console.log('  now:', order.slice().sort((a, b) => a - b).join(' '));
