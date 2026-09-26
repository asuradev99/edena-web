# 03 · Colour as data

Live lab: [`academy.html#ch-colour`](../../academy.html#ch-colour) ·
model: [`normalise`, `clamped`](../../src/examples/academy-model.ts) ·
library: [`src/lib/colormap.ts`](../../src/lib/colormap.ts)

## What the code does

`Geometry.colors` is optional. When present, the renderer uses its per-vertex pipeline and the
`Visual`'s own colour becomes a **tint**: pass white and the colormap shows at full strength, pass a
darker colour and the whole surface darkens. `colorMappedSurface` builds the geometry directly:

```ts
colorMappedSurface(f, x, y, colorOf, resolution = [32, 32], range?)
```

It samples `f` on the same quad grid as `functionSurface`, maps each vertex's value through

```
t = (value − lo) / (hi − lo)
```

and calls `colorOf(t)` once per vertex. `viridis` and `plasma` are `ramp(...)` with nine measured
stops; `ramp` requires strictly increasing stops and **clamps** outside its domain, returning the
first or last colour rather than extrapolating.

## What is exact

- The normalisation `t` for a value inside the range: the model's
  [`normalise(value, range)`](../../src/examples/academy-model.ts) is the same expression the
  colormap uses, and the test pins it at the endpoints (`lo → 0`, `hi → 1`).
- The set of values that are clamped: everything with `value < lo || value > hi`. The lab counts
  that set on a 41×41 sample of the same field, so "37% pinned" is a measured fraction of the
  picture, not an estimate.
- With no `range`, `colorMappedSurface` uses the sampled minimum and maximum. Those are exact for
  the sampled grid, and the lab prints them next to your chosen range so you can see the difference.

## What is approximate

- `viridis`/`plasma` are **approximations**: nine stops with linear interpolation between samples of
  the real maps. The error is small and mostly invisible, but a true lookup table would be smoother.
- A 48×48 colour grid is itself a sample of a continuous field; a narrow spike of `f` between two
  grid points is simply not coloured.
- Blending is linear in the canvas' preferred format with no gamma handling. A physically correct
  ramp would be converted to linear light before interpolating; this library does not.

## The honest part: what clamping hides

Two values on opposite sides of the range receive the *same* end colour, so the picture stops
distinguishing them. Pull the high slider down until it crosses the field's maximum and watch the
pinned fraction jump to 100%: at that point the render is a single colour and carries no data at
all. The range is a choice about which differences you are willing to lose, and printing it next to
the picture is the minimum honest thing to do about it.

## Limits

- `ramp` throws on fewer than two stops or on non-increasing stops, and clamps outside its domain;
  it never extrapolates.
- Colour arrays are parallel to the position array and must have the same vertex count; `merge`
  fills white for any uncoloured input, which tints those vertices rather than leaving them grey.
- There is no colour legend, no gamma control, and no wide-gamut or HDR handling in the library.

## Where to look

- [`src/lib/colormap.ts`](../../src/lib/colormap.ts) — `ramp`, `viridis`, `plasma`,
  `colorMappedSurface`.
- [`src/lib/geometry.ts`](../../src/lib/geometry.ts) — `Geometry` and `merge`.
- [`src/lib/view.ts`](../../src/lib/view.ts) — the per-vertex pipeline and the tint rule.
