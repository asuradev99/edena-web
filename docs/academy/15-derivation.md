# 15 · An animated derivation

**Code:** `src/lib/derivation.ts` — `DerivationToken`, `DerivationMark`, `DerivationBeat`,
`DerivationStep`, `Step` validation (`checkStep`), `strikeRuns`, `lineOffsets`, `locate`, and the
`Derivation` widget.

## The model

```ts
type DerivationToken = { id: string; math: M; text?: string; colour?: string };
type DerivationMark =
  | { kind: 'highlight'; ids: string[]; colour?: string }
  | { kind: 'cancel';    ids: string[]; colour?: string }
  | { kind: 'recolour';  ids: string[]; colour: string }
  | { kind: 'bracket';   ids: string[]; colour?: string; note?: M }
  | { kind: 'note';      id: string; math: M; colour?: string };
type DerivationBeat = { marks: DerivationMark[]; note?: M };
type DerivationStep = { tokens: DerivationToken[]; beats?: DerivationBeat[]; note?: M };
```

A mark refers to tokens **by id**, so the line is typeset once and the explanation only ever adds a
class, a colour, or a measured overlay. That is why a highlight survives a resize: nothing is rebuilt,
the decoration is positioned from `getBoundingClientRect()` of the tokens it names.

## Validation as a feature

`checkStep(step, where)` throws when

- two tokens share an id, or an id is empty;
- a mark names an id that is not in the line;
- a `note` mark names a missing token;
- a `bracket` over fewer than one token.

Those are typos that would otherwise fail *silently* — the page would simply not animate that beat. The
academy's probe trips it deliberately and prints the message.

## Cancellation runs

A cancel is drawn as one stroke per **contiguous run** of the named tokens:

```ts
strikeRuns(['a', 'x', 'b'], ['a', 'b'])   // → [['a'], ['b']]
strikeRuns(['a', 'b'], ['a', 'b'])        // → [['a', 'b']]
```

The first version drew a single stroke from the first named token to the last, which printed a
diagonal across every term *between* two cancellations — visibly wrong, and fixed with an O(n) scan
that tracks the previous index. The stroke is centred on the marked tokens (`offsetTop +
offsetHeight / 2`), not on the row, so it sits on the glyphs rather than through them.

## Playback

`seek(index, animate)` shows a position; `play()`/`pause()` step through beats on an interval;
`next()`/`previous()` move one beat. An `aria-live` region carries the plain-text form of the current
line, because a changing `aria-label` is not announced and the state a reader hears has to be content
that changes.

## Limits

- Marks are per line: a term that moves between lines cannot be followed by id.
- The timer is not a `Timeline`; there is no scrub to an arbitrary fraction of a beat, only `seek`.
- A token without `text` contributes nothing to the accessible description.
- `bracket` geometry is measured in the DOM, so a mark animates only after layout is settled.
