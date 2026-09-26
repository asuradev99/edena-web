# 09 · Curves and tubes

**Code:** `src/lib/geometry.ts` (`polyline`, `functionCurve`, `merge`, `MAX_LINE_POINTS`).

## There are no lines

The renderer draws one primitive: a triangle list. A "line" is therefore a tube. `polyline` sweeps a
ring of `sides` vertices along the path and joins consecutive rings with quads:

```ts
for each segment (a → b):
  for j in 0..sides-1:
    p = ring(a, j), q = ring(a, j+1), r = ring(b, j), s = ring(b, j+1)
    triangle(p, q, r); triangle(q, s, r)     // 2·sides triangles per segment
```

At the default `sides = 4` that is **8 triangles per segment**. The ring is built from a frame at each
end — `n = normalize(cross(d, up))`, `v = normalize(cross(d, n))` — so the tube keeps a consistent
world-space width whatever direction the path runs. That is why a curve keeps its thickness when you
zoom, unlike a screen-space line.

## Sampling a function

`functionCurve(fn, domain, samples, width)` evaluates `fn` at `samples + 1` uniform `x` values, splits
the run wherever `fn` is non-finite or jumps by more than `maxJump`, and passes each run to `polyline`.
The output is a `Geometry` with no per-vertex colours, so the renderer treats it as flat geometry —
and, because a tube is line art rather than a mesh, it does **not** draw a wireframe over it.

## The budget, and the bug it caused

Two caps meet here: `samples ≤ 100 000` in the sampler, and `polyline`'s own `MAX_LINE_POINTS`. They
used to collide at exactly 100 000, where `functionCurve` promised a `samples` budget it could not
reach and threw `polyline`'s unrelated "Invalid line resolution or width". Long runs are now **chunked**
at `MAX_LINE_POINTS` with the shared joint repeated, so the seam is a continuous tube and the
advertised budget is reachable. A boundary test pins it.

## Cost model

| samples | segments | default tube triangles |
|--------:|---------:|-----------------------:|
| 240     | 239      | 1 912                  |
| 2 000   | 1 999    | 15 992                 |
| 100 000 | 99 999   | 799 992                |

Triangle count is linear in the sample count, so this is a quality/size dial. There is no adaptive
refinement.

## Limits

- Uniform sampling in `x`: a sharp feature between two samples is simply missed.
- The width is a world-space radius; there is no screen-space or end-cap styling, and joins are not
  mitred.
- A path with fewer than two finite points produces an empty `Geometry`, which the renderer skips.
- Curves are rebuilt on the main thread; there is no incremental or worker-built path.

## Try it

Academy chapter 09: choose a function, drag the sample count, watch the triangle estimate, then press
the button that asks for one sample past the cap.
