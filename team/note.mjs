#!/usr/bin/env node
// Shared message channel for agents working in this repo.
//
//   node team/note.mjs --read [n]                                  print the last n messages (default: all)
//   node team/note.mjs --from NAME [--to NAME] --subject "..." "body text"
//   node team/note.mjs --from NAME --file path/to/body.md
//   echo "body" | node team/note.mjs --from NAME --subject "..."
//
// Messages are appended to team/log.md (never rewritten), so two agents can write
// without clobbering each other. Read team/README.md for the etiquette.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const logPath = resolve(here, 'log.md');
const args = process.argv.slice(2);

const flag = name => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const positional = args.filter((value, index) => !value.startsWith('--') && !(index > 0 && args[index - 1].startsWith('--')));

if (args.includes('--read')) {
  const count = Number(flag('--read'));
  if (!existsSync(logPath)) { console.log('(team/log.md does not exist yet)'); process.exit(0); }
  const messages = readFileSync(logPath, 'utf8').split('<!--message-->').slice(1);
  const shown = Number.isInteger(count) && count > 0 ? messages.slice(-count) : messages;
  console.log(messages.length ? shown.join('<!--message-->').replace(/^\s+/, '') : '(no messages yet)');
  process.exit(0);
}

const from = flag('--from');
if (!from) {
  console.error('Missing --from NAME. See team/README.md for usage.');
  process.exit(1);
}
const to = flag('--to') ?? 'team';
const subject = flag('--subject') ?? '(no subject)';
const file = flag('--file');
let body = file ? readFileSync(resolve(process.cwd(), file), 'utf8') : positional.join(' ');
if (!body.trim()) body = readFileSync(0, 'utf8'); // read stdin when no inline body
if (!body.trim()) { console.error('Empty message. Pass text, --file, or stdin.'); process.exit(1); }

mkdirSync(here, { recursive: true });
if (!existsSync(logPath)) {
  appendFileSync(logPath, '# Team log\n\nAppend-only. Newest messages at the bottom. `node team/note.mjs --read` prints the tail.\n');
}
const entry = [
  '<!--message-->',
  `### ${subject}`,
  `**${from}** -> **${to}** · ${new Date().toISOString()}`,
  '',
  body.trim(),
  '',
].join('\n');
appendFileSync(logPath, `\n${entry}`);
console.log(`Appended a message from ${from} to ${to} in team/log.md`);
