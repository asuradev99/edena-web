# 10 · Surfaces and winding

**Code:** `src/lib/geometry.ts` (`parametricSurface`, `functionSurface`, `sphere`, `box`, `cylinder`,
`sphericalWedge`).

## From a map to triangles

A parametric surface is a map `S(u, v) → (x, y, z)`. `parametricSurface` samples it on an `nu × nv`
grid and emits two triangles per quad:

```ts
const a = grid[i][j], b = grid[i+1][j], c = grid[i][j+1], d = grid[i+1][j+1];
triangle(out, a, c, b); triangle(out, b, c, d);      // wound so that normal = +du × +dv
```

`functionSurface(f, x, y, resolution)` is that with `S(u, v) = (u, f(u, v), v)`. `sphere` is the same
call on the spherical map; `parametricSurface` is the single implementation every curved primitive
shares.

## Why the winding is not cosmetic

Nothing in the renderer culls back faces or lights the mesh, so the *order* of the three vertices
looks irrelevant — but it is not. It fixes the surface normal, and every closed solid in the module is
wound **outward**, so the divergence theorem gives a positive signed volume:

```
V = ∮ x·n/3 dA  =  Σ_triangles  a · (b × c) / 6
```

A test computes that sum for `box`, `cylinder`, `cone`, `sphere`, `shadedSphere`, `torus` and the
wedge, and asserts each is positive. It catches exactly the class of bug the library had once, when
`parametricSurface` was wound opposite to the spheres.

The lab prints the sum beside the closed form `2π²Rr²` for a torus, so convergence is visible as you
raise the resolution.

## Budgets

The guard counts **quads**: `nu · nv ≤ 250 000` by default, so a square grid is legal to exactly
500 × 500. It throws rather than decimating. Cells with a non-finite corner are skipped, which leaves
a hole rather than a repair.

## Flat shading and the wireframe

A surface built here has no per-vertex colours, so it renders in one flat colour — and the renderer
draws its wireframe over it, because `Geometry.wireframe` is set by these constructors. That is the
library's default look for a 3-D object. `shadedSphere` is the opt-in exception: it carries a
greyscale light model in `Geometry.colors`, so it is excluded twice over (coloured *and* not the
default).

## Limits

- Uniform grids: a surface that curves sharply in one corner pays for resolution everywhere.
- Single-threaded, synchronous generation; a large rebuild is a visible stall.
- No normals are stored, so there is no lighting pipeline to feed them to.
- Winding is a convention the module keeps, not something the renderer enforces; hand-built
  `Geometry` outside these constructors can be inside-out with no warning.

## Try it

Academy chapter 10: a torus whose signed volume is recomputed and compared with the exact value as
you change the resolution.
