# 11 · Marching tetrahedra

**Code:** `src/lib/field.ts` (`isosurface`, `FieldBounds`, `IsosurfaceOptions`).

## The problem

Given a scalar field `w = f(x, y, z)` and a level `c`, draw `{p : f(p) = c}`. There is no closed form
in general, so the surface is *sampled*: evaluate `f` on a lattice, and inside each cell decide which
edges the level crosses.

## Why tetrahedra

A cube has 256 inside/outside corner patterns, and several are ambiguous — the same pattern admits
two genuinely different surfaces, so a naive table can leave holes. Splitting each cube into six
**Kuhn tetrahedra** removes the ambiguity: a tetrahedron has 16 patterns, all of them unambiguous,
because four points in general position can be separated by a plane in only one way. The library uses
the six tetrahedra that all share corners 0 and 7, which tiles a cube without gaps:

```
TETS = [[0,1,3,7], [0,1,5,7], [0,2,3,7], [0,2,6,7], [0,4,5,7], [0,4,6,7]]
```

For each tetrahedron the 4-bit inside mask indexes `TET_TABLE`, which returns the tetrahedron edges to
walk: none (0 or 4 inside), a single triangle (1 or 3 inside), or a quad as two triangles (2 inside).
Each crossing point is linearly interpolated: `t = (c − f(p)) / (f(q) − f(p))`.

## Cost model

An `n³` grid evaluates `(n+1)³` samples, and the default budget is **250 000 samples**:

| resolution | samples   |
|-----------:|----------:|
| 32³        | 35 937    |
| 48³        | 117 649   |
| 61³        | 238 328   |
| 62³        | 250 047 (over) |

Note this is the *opposite* counter from the surface builders, which count quads. A cubic field
therefore tops out at 61³.

## Determinism and honesty

Triangle order is deterministic: the tetrahedra are visited in a fixed order and the table is fixed, so
the same field and lattice always produce the same `Float32Array` — which is what makes it testable
(an analytic sphere is compared against the extractor's own triangles). Cells with a non-finite sample
are suppressed, so a singularity in the field becomes a hole rather than a spray of NaN geometry.

## Limits

- Single-threaded and synchronous on the main thread; a large rebuild is a visible stall, measured in
  the lab in milliseconds.
- The budget is a hard refusal, not a downgrade.
- The surface is exact at grid edges and linear between them; the error is second order in the cell
  size and there is no adaptive refinement.
- Field evaluation dominates the cost, so a cheap `f` and a large lattice are the only ways to buy
  quality.

## Try it

Academy chapter 11: two metaballs, a level slider that melts them together, and a resolution slider
with the lattice count and the triangle count printed beside the build time.
