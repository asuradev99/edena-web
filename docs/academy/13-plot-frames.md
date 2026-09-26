# 13 · Axes, ticks and the plot frame

**Code:** `src/lib/plot.ts` (`niceStep`, `tickValues`, `tickDecimals`, `formatTick`, `tickMath`,
`plotFrame`, `axes3d`, `boundsBox`), `src/lib/mathtext.ts` (`number`, `MATH_FONT_STACK`).

## Choosing round numbers

A gridline is useful only if a reader can divide it mentally. `niceStep(span, count)` picks the
smallest step of the form `1, 2, 5 × 10ⁿ` that fits `count` intervals into `span`:

```ts
const raw = span / count, power = 10 ** Math.floor(Math.log10(raw)), error = raw / power;
return (error >= 5 ? 5 : error >= 2 ? 2 : 1) * power;
```

`tickValues(min, max, count)` then walks the integer multiples of that step inside the range. The
consequence is that a requested tick count is only a **request**: ask for more ticks than the span can
hold at a nice step, and you get the same step — the round number wins. The academy readout prints the
ticks it chose so the rule is visible.

`tickDecimals(step)` returns the decimals needed to print a step without floating-point noise:
`max(0, −⌊log₁₀ step⌋)`.

## Printing numbers as mathematics

Two renderings of the same tick exist, deliberately:

- `formatTick(value, step)` — plain text, for a caller with no typesetter. A genuine minus sign
  (U+2212, never a hyphen), and scientific notation at the extremes.
- `tickMath(value, step)` — MathML, via `mathtext.number`, which groups digits with a thin space and
  emits a real `msup` exponent.

Both share the same "snap to zero" rule: a value within `step·1e-9` of zero prints as `0`, so
`-1.7e-16` never appears on an axis.

## The frame

`plotFrame(x, y, options)` returns geometry plus anchors:

| field        | what it is |
|--------------|------------|
| `axes`       | two arrows, meeting at the clamped origin |
| `ticks`      | major tick marks |
| `minor`      | exact subdivisions of the major step, skipping the majors |
| `grid`       | major gridlines |
| `minorGrid`  | minor gridlines |
| `labels`     | `{ text, math, position }` per tick, carrying plain text **and** MathML |
| `titles`     | axis titles, placed clear of the tick labels |

The origin is clamped into the domain (`clamp(0, x[0], x[1])`), so a plot of `[2, 8]` puts the y axis
at the left edge rather than off screen, and the origin label is emitted once instead of twice.

## Typesetting

Every maths page loads a maths face with an OpenType `MATH` table *first* in the stack — `STIX Two
Math`, then `Cambria Math`, `Latin Modern Math`, `Noto Sans Math` — before any prose face. Only a
`MATH` table stretches a delimiter or places a limit; a prose face in the middle of the stack would
strand the fallback, which is why the ordering is asserted by a test rather than left to taste.

## Limits

- Minor ticks divide the major step by a fixed integer (five by default) and skip the majors.
- Titles use a fixed offset from the axis end, so an unusually long tick label can still crowd one.
- The frame is immutable geometry: changing a range means building a new frame, which is what the
  `onResize` re-fit in the plot demo does.
- `plotFrame` is 2-D (the `z` channel is 0); `axes3d`/`boundsBox` are the 3-D counterparts.

## Try it

Academy chapter 13: the requested tick count against the step the library actually chose, with the
ticks printed and the plot re-framed on resize.
