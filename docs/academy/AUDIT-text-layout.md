# Text-layout audit (source-level)

**Author:** deepcode (academy lane) · **Date:** 2026-09-25
**Method:** reading the demo sources and the live build while writing the academy. This is a
*source-level* audit: each item names the code that places the text relative to the geometry it
annotates. It is deliberately not a pixel-level check — `scripts/check-basics.mjs` already measures
the stages, and the typography lane owns live verification of its fixes. Treat the proposed fixes as
suggestions for the owner, not as applied changes.

This lane did not edit any file outside `academy.*`, `docs/academy/`, `scripts/check-academy.mjs`,
`tests/academy.test.mjs`, `src/examples/academy*.ts` (and the three MIME lines in `scripts/serve.mjs`).

## 1 · `basics.html` demo 24 (`contrast`) — caption over the surface

`src/examples/basics.ts`, `contrastDemo`. The range caption is added with `labels.addHTML(..., () =>
[...])` at a world anchor near the surface's centre, while the surface is a `colorMappedSurface`
spanning the stage. Text is drawn over the thing it annotates.

- **Confirmed by:** source — the anchor is inside the same world box as the surface.
- **Already reported by deepseek** at 22:00 ("demo 24 prints its `range` caption across the middle of
  the surface"). Fix belongs to the typography lane.
- **Suggested direction:** anchor the caption to a stage corner in screen space (a DOM overlay), or
  reserve a margin in the camera framing for it, the way the plot demos anchor left/right.

## 2 · `basics.html` demo 07 (`colour`) — ribbon end labels can overhang

`src/examples/basics.ts`, `colourDemo`. The `viridis(t)` end labels are anchored at the ribbon's
world-space ends with the default `'center'` anchor. On a narrow stage the label is wider than the
margin between the ribbon end and the panel edge, so half of it hangs off the canvas.

- **Confirmed by:** source — the anchor has no edge bias and no `thin(...)` on narrow stages.
  (deepseek reported the same label as "floating off its ribbon".)
- **Suggested direction:** use the `'left'`/`'right'` anchors at the two ends, or a `container-type`
  font-size cap (the academy uses `clamp(8.5px, 1.5cqw, 13.5px)` for the same reason).

## 3 · `basics.html` demo 23 (`measure`) — captions vs the angle arc

`src/examples/basics.ts`, `measureDemo`. The labels are computed from the same two points as the
geometry (good), but the caption offsets are fixed world lengths, so as `θ` shrinks the `A`, `B`,
`|AB|` and `θ` captions crowd the arc and each other.

- **Confirmed by:** source — fixed offsets, no collision term.
- **Already reported by deepseek** (the labels also do not follow the turning `Group`; that is the
  more serious half and is theirs to fix).
- **Suggested direction:** scale the offset by the chord length (a smaller figure gets a
  proportionally smaller caption offset), and hide every other caption when the stage is narrow.

## 4 · `basics.html` demo 25 (`secant`) — right-edge readout vs the curve

`src/examples/basics.ts`, `secantDemo`. The numeric readout is anchored at the right edge of the
domain. For large `x` the curve's endpoint and the readout occupy the same corner; neither computes
the other's extent, so they can overlap.

- **Confirmed by:** source — independent anchors, no mutual exclusion.
- **Suggested direction:** move the readout to the top-left of the plot area (the curve at the left
  edge is low for this function), or fade it when the marker is in the last fifth of the domain.

## 5 · `academy.html` panel 01 — projected labels at extreme distances

`src/examples/academy.ts`, `projectionDemo`. The `near`/`far` labels are anchored a fixed world
offset up-and-right of their boxes. Because labels are DOM overlays projected by the camera, at the
extreme end of the distance slider a label can be projected off the stage. This is a limit of
projected labels shared with every page here, recorded rather than hidden.

- **Confirmed by:** source, and by construction of `LabelLayer` (it projects and positions, it does
  not clamp to the stage).
- **Suggested direction:** clamp the resolved screen position to the stage rectangle in
  `LabelLayer.update` — a library change, so it is a suggestion for the owner of `view.ts`, not a
  change made here.

## Not a defect, but worth knowing

- `mathtext.paren` returning three top-level nodes and the `Derivation` cancellation behaviour are
  **library** bugs the typography lane is fixing; they are not text *placement*, so they are out of
  scope for this audit. The academy typography avoids `paren` as a script base.
- The academy page lists local math faces (`DejaVu Math TeX Gyre`, `Noto Sans Math`) before the
  webfont on purpose: the browser checks run without reliable network, and an unloaded webfont should
  degrade to a real math face rather than a generic serif.
