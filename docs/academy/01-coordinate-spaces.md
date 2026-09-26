# 01 · Coordinate spaces and projection

Live lab: [`academy.html#ch-projection`](../../academy.html#ch-projection) ·
model: [`relativeSize`](../../src/examples/academy-model.ts) ·
library: [`src/lib/camera.ts`](../../src/lib/camera.ts)

## What the code does

A point starts in **model space**, is multiplied by the node's transform into **world space**, then
by the camera's view matrix into **eye space**, then by the projection into **clip space**, and the
GPU finally divides by the clip-space `w`. `OrbitCamera.matrix(aspect)` builds view · projection;
`OrbitCamera.projectWith(matrix, point, width, height)` does the last two steps on the CPU so a DOM
label can be placed over the same point the triangles are drawn at.

In code, the projection is the only place the two modes differ:

```ts
// orthographic: height is the whole vertical world the viewport shows
proj[0] = 2 / (height * aspect);  proj[5] = 2 / height;

// perspective: f = 1/tan(fovY / 2)
proj[0] = f / aspect;  proj[5] = f;  proj[11] = -1;
```

The `proj[11] = -1` is the entire trick. It makes the clip-space `w` equal to the eye-space depth,
so the GPU's `xyz / w` divides by distance. Orthographic never touches `w`, which stays 1.

## What is exact

For an object at eye-space depth `d`, the perspective scale is proportional to `1/d`. Two identical
objects at depths `d₁` and `d₂` therefore have on-screen sizes in the ratio `d₂ / d₁` exactly. Under
orthographic projection the ratio is exactly 1 for every pair of depths. The lab measures both
widths from the picture with `camera.project`, so the printed ratio and the drawn ratio are the same
function of the camera state; there is nothing to drift.

The model's [`relativeSize(near, far, projection)`](../../src/examples/academy-model.ts) encodes
that: `far / near` for perspective, `1` for orthographic.

## What is approximate

Nothing in the projection itself, but the *picture* is quantised: `camera.project` returns CSS
pixels, and the ratio is printed to two decimals. At small canvas sizes the difference between
orthographic's 1.00× and perspective's ratio can be a couple of pixels, so the lab tints the labels
gold when the far box is actually larger than the near one (which orthographic allows at the
default framing when the rail tilts toward the camera).

## Limits

- Perspective has a `near` and `far` plane (`0.01` and `1000` by default). Geometry outside is
  clipped; a very small `near` relative to `far` costs depth precision.
- `camera.fovY` is public and defaults to π/4. Changing it is a zoom in perspective mode; it does
  nothing in orthographic mode, where `height` is the framing control.
- Labels are projected through the same matrix, so a point behind the camera produces an off-canvas
  position rather than a mirrored one. The renderer does not try to rescue it.

## Where to look

- [`src/lib/camera.ts`](../../src/lib/camera.ts) — `OrbitCamera`, `matrix`, `projectWith`, `ray`.
- [`src/lib/math.ts`](../../src/lib/math.ts) — the column-major mat4 helpers the projection uses.
- [`src/examples/academy-model.ts`](../../src/examples/academy-model.ts) — `relativeSize`.
