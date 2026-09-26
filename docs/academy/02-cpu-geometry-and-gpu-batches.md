# 02 · CPU meshes, GPU batches

Live lab: [`academy.html#ch-mesh`](../../academy.html#ch-mesh) ·
model: [`surfaceCost`, `fieldCost`](../../src/examples/academy-model.ts) ·
library: [`src/lib/geometry.ts`](../../src/lib/geometry.ts), [`src/lib/view.ts`](../../src/lib/view.ts)

## What the code does

`functionSurface(f, x, y, resolution)` is a one-line wrapper over `parametricSurface`:

```ts
parametricSurface((u, v) => [u, f(u, v), v], x, y, resolution);
```

`parametricSurface` evaluates `f` on an `(nu+1) × (nv+1)` lattice, then emits two triangles per quad:
`a c b` and `b c d`, wound so the normal is `+du × +dv`. The result is an immutable `Geometry`
holding a flat `Float32Array` of vertices (and, for `colorMappedSurface`, a parallel colour array).

The renderer keys its buffers by `Geometry` identity. One mesh shared by a hundred `Visual`s is one
position buffer and one instanced draw; the per-instance model matrix and opacity live in the
instance buffer. That is why "one mesh, many copies" is cheap and "one mesh per copy" is not.

## What is exact

The cost arithmetic, and it is where two different counters hide:

| Builder | Guard counts | A square grid is legal to |
|---------|--------------|---------------------------|
| `parametricSurface` / `functionSurface` / `colorMappedSurface` | **quads** `nu·nv` | `500 × 500` = 250 000 quads |
| `isosurface` | **samples** `(nx+1)(ny+1)(nz+1)` | `61³` = 238 328 samples |

The trap is that a surface *evaluates* `(nu+1)(nv+1)` samples but is refused on its quad count, so
`500×500` is fine even though it evaluates 251 001 points, while the isosurface — which also quotes
a 250 000 budget — refuses `62³` (250 047 samples) and allows `61³`. The lab prints both, and the
probe button asks `functionSurface` for `501×501` to show the guard firing before any sampling
happens.

The triangle count is exactly `2·nu·nv`; a `240×240` grid is 57 600 quads and 115 200 triangles.

## What is approximate

- The timing the lab prints is a single `performance.now()` around the rebuild. It is real but
  noisy: a cold allocator or a busy frame moves it by a millisecond or two. It is a stall estimate,
  not a benchmark.
- The colormap used by `colorMappedSurface` is interpolated from a handful of stops, so the cost of
  colouring is small and roughly constant per vertex, not proportional to palette fidelity.

## Limits

- Mesh generation is synchronous and single-threaded on the main thread. A big slider jump is a
  visible stall; there is no worker or incremental path in the library.
- Geometry is treated as immutable for buffer management. Changing topology means a new Geometry,
  which is exactly what the slider does — the old buffer is released on a later render, not
  immediately.
- The budget is a hard refusal, not a downgrade: past it the call throws
  `Surface resolution exceeds budget` (surfaces) or `Field resolution exceeds sample budget`
  (isosurface). Nothing silently decimates.
- Non-finite samples drop their quad (surfaces) or their cell (isosurface); whole-cell suppression
  means an isosurface can lose a feature that touches a single `NaN`.

## Where to look

- [`src/lib/geometry.ts`](../../src/lib/geometry.ts) — `parametricSurface`, `functionSurface`,
  `merge`, the primitives.
- [`src/lib/field.ts`](../../src/lib/field.ts) — `isosurface` and its sample guard.
- [`src/lib/view.ts`](../../src/lib/view.ts) — buffer ownership and instanced batching.
