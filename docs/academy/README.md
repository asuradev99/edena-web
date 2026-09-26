# The Edena academy

Twenty-two chapters on how this library turns mathematics into a picture — one for every module in
`src/lib`. Each chapter has a live lab on [`academy.html`](../../academy.html); where a lab's number is
a *claim* rather than a measurement it comes from the pure model in
[`src/examples/academy-model.ts`](../../src/examples/academy-model.ts), so `tests/academy.test.mjs` can
check it instead of the reader taking it on trust. Where the number comes from the library — a signed
volume, a composed matrix, a screen distance — the lab reads the library's own value back out of the
scene or the geometry, so the readout cannot drift from the picture.

| # | Chapter | Live lab | The question it answers |
|---|---------|----------|-------------------------|
| 01 | [Coordinate spaces and projection](01-coordinate-spaces.md) | `#ch-projection` | Why does perspective shrink with distance and orthographic not? |
| 02 | [CPU meshes, GPU batches](02-cpu-geometry-and-gpu-batches.md) | `#ch-mesh` | What does a surface cost before it reaches the GPU, and what is the budget? |
| 03 | [Colour as data](03-colour-as-data.md) | `#ch-colour` | Where does a colormap get its range, and what does clamping hide? |
| 04 | [Integration and error budgets](04-integration-and-error.md) | `#ch-integration` | How do Euler and RK4 differ, and how do you *measure* an order? |
| 05 | [The simulation seam and GPU compute](05-simulation-seam-and-gpu-compute.md) | `#ch-simulation` | What is renderer-agnostic stepping, and why move it to the GPU? |
| 06 | [Symmetry and tolerance](06-symmetry-and-tolerance.md) | `#ch-symmetry` | Which atoms does an operation fix, and what does "symmetric" mean numerically? |
| 07 | [The transform stack](07-transform-stack.md) | `#ch-transform` | How does a local move become a world position? |
| 08 | [Time, interpolation and easing](08-time-and-easing.md) | `#ch-time` | Why is a cue a function of absolute time, and what does easing not change? |
| 09 | [Curves and tubes](09-curves-and-tubes.md) | `#ch-curves` | There are no lines in the renderer — so what is a curve, and what does it cost? |
| 10 | [Surfaces and winding](10-surfaces-and-winding.md) | `#ch-surfaces` | Why does vertex order matter when nothing is culled, and how do you check it? |
| 11 | [Marching tetrahedra](11-marching-tetrahedra.md) | `#ch-isosurface` | How is a level set extracted, and which counter does the budget use? |
| 12 | [Streamlines by RK4](12-streamlines.md) | `#ch-streamlines` | What equation does a field line actually solve, and when does a line stop? |
| 13 | [Axes, ticks and the plot frame](13-plot-frames.md) | `#ch-plotframe` | How does a chart choose round numbers, and how are they typeset? |
| 14 | [Typesetting mathematics](14-typesetting.md) | `#ch-typeset` | Why are formulas built by functions, and what is the operand rule? |
| 15 | [An animated derivation](15-derivation.md) | `#ch-derivation` | How does a mark find a term, and why can a cancellation need two strokes? |
| 16 | [Picking and dragging](16-picking.md) | `#ch-picking` | How does a pixel become a world point, and what is locked while you drag? |
| 17 | [Depth, transparency and draw order](17-depth-and-order.md) | `#ch-depth` | Why can a translucent surface not hide itself? |
| 18 | [Instancing and the upload contract](18-instancing.md) | `#ch-instancing` | What travels per object, and how many bytes move when one thing moves? |
| 19 | [Crystal files](19-crystal-files.md) | `#ch-crystal` | What does a POSCAR mean, and what is a negative scale? |
| 20 | [Element appearance](20-elements.md) | `#ch-elements` | Where do the radii and colours come from, and what happens to an unknown symbol? |
| 21 | [Area and quadrature](21-area-and-quadrature.md) | `#ch-area` | What rule is the shaded area, and how fast does its error fall? |
| 22 | [The secant limit](22-secant-limit.md) | `#ch-limit` | Why does a chord slope approach the derivative linearly, and where does it stop? |

There is also [a text-layout audit](AUDIT-text-layout.md) of the existing demo pages, kept here because
building the academy meant reading those pages closely. Four of its five findings have since been fixed
by the typography lane, and the fifth is a property of projected labels rather than a defect; the
verdicts are in the audit, and the audit block on `academy.html` repeats them for a reader who never
opens these files.

## How to read a chapter

Each note follows the same shape:

- **What the code does** — the identifiers, in the order a value travels through them.
- **What is exact** — the arithmetic or algebra that has a definite answer.
- **What is approximate** — the estimate, tolerance or interpolation, and its size.
- **Limits** — the behaviour that is deliberate rather than a bug.
- **Where to look** — the source files.

## Running the checks

```sh
npm run typecheck         # the model and the page both have to compile
npm test                  # includes tests/academy.test.mjs: the model's claims
node scripts/check-links.mjs
node scripts/check-pages.mjs 9444      # needs a server + a debugging Chrome
node scripts/check-academy.mjs 9444    # draws every chapter and moves every control
```
