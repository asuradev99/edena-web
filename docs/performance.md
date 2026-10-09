# Performance work — September 2026

These measurements cover shared rendering, text and geometry work. The direct n-body simulation is
one GPU benchmark; it is not a substitute for measuring visualization costs.

## Measured changes

Browser runs used Chrome Beta 155, Vulkan, and the reported AMD `rdna-2` adapter. CPU results are
medians after warmup and fluctuate with background load. GPU values use timestamp queries. These
are local comparisons, not portable frame-rate guarantees.

| Workload | Before | After |
| --- | ---: | ---: |
| 10,000 static visual objects, CPU/frame | 4.1 ms | 1.4 ms |
| 10,000 moving visual objects, CPU/frame | 11 ms | ~5 ms |
| 10,000 translucent objects, repeated drawing, CPU/frame | 24.3 ms | 7.0 ms |
| Generate a 10,000-point tube | 69 ms | 11.8 ms |
| Generate a 100 × 100 surface | 12 ms | 9.5 ms |
| Merge 500 meshes with outlines | 25 ms | 1.1 ms |
| Extract a sphere on a 48³ grid | 23 ms | 11.8 ms |
| Extract an empty 48³ field | 35 ms | 4.5 ms |
| GPU oscillator, 50,000 particles | 0.022 ms/step | 0.022 ms/step |
| Direct gravity, 8,192 bodies | 0.478 ms/step | 0.478 ms/step |
| Direct gravity, 32,768 bodies | 3.65 ms/step | 3.65 ms/step |

The latest text benchmark renders 100 world-space labels with full scene transforms: about 0.4 ms CPU/frame while static, with **zero GPU
submissions**, and 0.6 ms during camera movement. A separate regression verifies that unchanged text
causes zero texture uploads. Label uniforms share one aligned GPU buffer and one upload per changed
frame. Fixed-size text edits now reuse the texture and binding: eleven readout updates previously
allocated eleven of each, and now allocate zero. The scratch canvas is reused as well. Empty text
clears its previous glyphs, and views on one device share the text pipeline and sampler.
Twenty identical plot-frame rebuilds retain their labels and upload zero glyph textures.
Distant text uses GPU-generated mipmaps with anisotropic filtering. Mip passes run only when glyph
pixels change, share the scene command submission, and reuse their bindings. Camera motion adds no
mip generation or glyph uploads. `antialias: 'high'` raises canvas pixel density 2× per axis and therefore
has a fourfold pixel cost; keep ordinary MSAA or `?samples=1&dpr=1` for throughput measurements.
Depth/MSAA targets are allocated on demand and released for offscreen canvases.
Matching translucent instances now use one draw instead of one per object; reusable sort
records retain mixed materials' global back-to-front order without per-frame record allocation.

## What changed

- Unchanged frames skip command encoding and submission. Public transform arrays and material
  properties remain directly mutable; no caller-managed dirty flags are required.
- Material keys, world transforms and instance data are cached. Translation-only changes reuse the
  basis, identity transforms avoid unnecessary multiplication, and static instances avoid repacking.
- Views sharing a device share immutable pipelines. Replaced geometry reuses retired vertex buffers
  when their capacity fits, and tint changes reuse batch buffers.
- Tubes precompute ring angles and write packed arrays. Mesh outlines merge in linear time instead
  of repeatedly copying the accumulated result. Surface and field generation avoid temporary arrays.
- Field extraction rejects non-crossing cells before visiting tetrahedra and reuses corner storage.
- Bulk scene additions and removals avoid repeated whole-array searches or shifts.
- Grid strokes expand endpoint pairs into two antialiased triangles on the GPU, replacing eight-triangle tubes.
  Mesh contours share this path; stroke buffers are reused when animated geometry is replaced.
- Scene text inherits ordinary object and parent transforms, including perspective size and
  foreshortening, and uses the actual depth buffer for partial glyph coverage. Browser typography
  and MathML are cached; magnification upgrades texture resolution in buckets rather than every
  frame. Text matrices are reused when camera and world transforms are unchanged. Explicit
  billboards use `billboard: true`; overlay captions use `occlude: false`.
- Basics and academy panels suspend their simulation and geometry updates outside the viewport and
  resume their local clocks on return. Resolution diagnostics apply to all their views.
- Particle dispatches share a compute pass; normal animation no longer allocates a CPU readback
  buffer. Gravity stays as a direct all-pairs reference calculation.

## Reproduce

Build with `npm run build`, run `node scripts/serve.mjs`, and use a Chrome debugging session with
hardware WebGPU enabled. Pass its CDP port (default `9444`) to browser scripts:

```sh
node scripts/benchmark.mjs 9444
node scripts/benchmark-geometry.mjs
node scripts/check-renderer.mjs 9444
node scripts/check-text-depth.mjs 9444
node scripts/check-text-transform.mjs 9444
node scripts/check-text-updates.mjs 9444
node scripts/check-visual-quality.mjs 9444
node scripts/check-transparency.mjs 9444
node scripts/check-particles.mjs 9444
npm test
```

The browser benchmark separates static scenes, camera movement, moving transforms, translucent
rendering, text and particle integration. Geometry timings include mesh construction and validation.
Do not run timing comparisons concurrently with other GPU benchmarks or browser interaction checks.

The pixel checks exercise partial occlusion, front/behind placement, MathML fractions, color edits,
opacity, display changes, alpha blending order and mixed wireframe settings. Force-reference checks
include 1, 7, 8, 9, 63, 64, 65 and 129 particles and compare batched versus separate submissions.
Tube, surface and isosurface outputs were also compared byte-for-byte with the original generators,
including invalid samples and degenerate segments.

Transparent geometry still sorts by object origin; intersecting transparent surfaces are not an
order-independent transparency system. CPU extraction remains synchronous. Textures use browser
SVG/MathML rasterization, with a DOM fallback if a browser cannot rasterize particular content.

### Side columns, text, and DOS interaction (September 2026)

Controls now consume a layout column; the canvas and its projection/picking dimensions use only
that remaining viewport. Basics pauses simulation and label work outside the visible region instead
of updating all 25 panels. Initial visibility is seeded from canvas bounds to avoid allocating all
25 render targets at startup. MSAA remains enabled; demo supersampling is opt-in (`?quality=high`).

Chrome 155 on the RDNA2 adapter, a 15-step curvature slider sweep spaced 100 ms apart:
before this pass, the worst observed frame was 33.3 ms; afterwards it was 16.8 ms (one run each,
not a universal hardware guarantee). CPU sampling identified repeated numerical integration,
mesh construction and text uploads. The DOS plot now retains its labels and scene objects,
reuses the scaled-coordinate integral when only curvature changes, and keeps the surface when
only broadening changes. Contours use the library's antialiased line segments instead of tubes.
The numerical quadrature and its resolution are unchanged. Static #25 measured approximately
60 fps after off-screen update gating on the same machine.

The shared colored-surface builder caches each sample's color and writes directly into preallocated
triangle buffers. A 96×96 sinusoidal surface took 5.68 ms before versus 3.03 ms afterwards in an
interleaved seven-batch median (10 builds per batch, Node 26). Both versions used the current
Geometry constructor for this comparison. Geometry's finite-coordinate validation also uses a
simple typed-array loop, retaining the same validation and ownership semantics.

### Tight-binding workbench and project workspace (October 2026)

The main page now selects a scene instead of displaying a collection of canvases. Basics and
Academy use factory registries: a selected project creates one view, instead of constructing all
25 or 20 demonstrations. Switching projects replaces the document, invoking the old project's
cleanup. Older multi-view collections retain their original initialization code but present only
the selected scene in the workspace; their visibility checks suppress hidden rendering.

Tight-binding k-grid sampling runs in a dedicated worker, terminated when a newer model supersedes
it. Chemical-potential changes reuse the sampled bands. Contour generation skips cells that cannot
cross the requested energy, and filling uses a cached sorted list with a binary search. Evolution
updates at most 30 times per second, while camera rendering stays responsive.

Local Node 26 CPU measurements at 64×64 (one sampling run, median of 30 contour updates):

| Model | Sampling | Contours + filling update |
| --- | ---: | ---: |
| One-atom hexagonal | 9.7 ms | 0.49 ms |
| Square | 5.6 ms | 0.30 ms |
| Honeycomb | 9.8 ms | 0.30 ms |
| Kagome | 34.4 ms | 0.29 ms |

These measure numerical work, not GPU frame time. Live browser checks for this pass could not run
in the restricted environment: local server binding was denied and Chromium could not launch.
Use `node scripts/check-workspace.mjs 9444` with a running browser and development server to check
project switching, the single visible canvas, side-column separation, and tight-binding views.
