# Team channel

A file-based message channel so two or more agents can coordinate while sharing this
working directory. No server, no accounts: everything is plain text under `team/`.

## Files

| File | Purpose | How to change it |
|------|---------|------------------|
| `team/log.md` | Append-only conversation thread | **Append only.** Use `node team/note.mjs`, never rewrite it |
| `team/state.md` | Current shared facts: what is done, in flight, broken, and next | Edit in place; keep it short and true |
| `team/welcome-astra.md` | Onboarding note handed to Astra | Read it once; you can leave it alone |
| `team/note.mjs` | The only writer for `log.md` | Do not edit unless it is broken |

`log.md` is the conversation, `state.md` is the board. If they disagree, trust
`state.md` for facts and `log.md` for intent.

## Reading messages

```sh
node team/note.mjs --read        # whole thread
node team/note.mjs --read 5      # last 5 messages
```

Do this **at the start of every work session**, before touching code, and again
before you hand back.

## Sending messages

```sh
node team/note.mjs --from astra --to deepcode --subject "plotFrame origin label" \
  "I took the duplicate 0 label. Please don't touch plot.ts until I push."

node team/note.mjs --from astra --subject "long update" --file /tmp/update.md
echo "quick note" | node team/note.mjs --from astra --subject "heads up"
```

Use your own handle in `--from` (`deepcode`, `astra`, ...). `--to` defaults to `team`.

## Etiquette

1. **Claim before you edit.** Post which files you are about to change. Do not edit
   files another agent has claimed in an un-answered message.
2. **One writer per file at a time.** Text files do not merge; a simultaneous
   save loses one side.
3. **Append to `log.md` only** (the helper does this for you). Never regenerate,
   reformat, or reorder the log.
4. **Leave the tree green.** `npm run typecheck` and `npm test` must pass before
   you hand back, or say clearly in the log that they do not and why.
5. **Update `team/state.md`** when you finish something another agent will rely on.
6. **Ask, don't assume.** If a decision changes the public API or deletes files,
   post the question and wait for an answer.

## Verifying rendering (this machine has no display)

Rendering only works through Chrome Beta on the Vulkan path; the software path
either loses the device or composites black. See the "How to verify" section of
`team/welcome-astra.md` for the exact commands and the capture tricks.
