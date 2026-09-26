# Performance work — September 2026

These measurements cover shared rendering, text and geometry work. The direct n-body simulation is
one GPU benchmark; it is not a substitute for measuring visualization costs.

## Measured changes

Browser runs used Chrome Beta 155, Vulkan, and the reported AMD `rdna-2` adapter. CPU results are
medians after warmup and fluctuate with background load. GPU values use timestamp queries. These
are local comparisons, not portable frame-rate guarantees.

| Workload | Before | After |
| --- | ---: | ---: |
| 10,000 static visual objects, CPU/frame | 4.1 ms | 1.3 ms |
| 10,000 moving visual objects, CPU/frame | 11 ms | ~5 ms |
| 10,000 translucent objects, repeated drawing, CPU/frame | 24.3 ms | 5.9 ms |
| Generate a 10,000-point tube | 69 ms | 11–14 ms |
| Generate a 100 × 100 surface | 12 ms | ~9 ms |
| Merge 500 meshes with outlines | 25 ms | ~1 ms |
| Extract a sphere on a 48³ grid | 23 ms | 13 ms |
| Extract an empty 48³ field | 35 ms | 9 ms |
| GPU oscillator, 50,000 particles | 0.022 ms/step | 0.022 ms/step |
| Direct gravity, 8,192 bodies | 0.478 ms/step | 0.253 ms/step |
| Direct gravity, 32,768 bodies | 3.65 ms/step | 3.07 ms/step |

The text benchmark renders 100 labels: about 0.3 ms CPU/frame while static, with **zero GPU
submissions**, and 0.5 ms during camera movement. A separate regression verifies that unchanged text
causes zero texture uploads. Matching translucent instances now use one draw instead of one per
object; mixed materials retain their global back-to-front order.

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
- Scene text uses the actual depth buffer, including partial glyph coverage. Browser typography and
  MathML are rasterized only when needed; accessible DOM copies remain. Explicit overlay captions
  still use `occlude: false`.
- Basics and academy panels suspend their simulation and geometry updates outside the viewport and
  resume their local clocks on return. Resolution diagnostics apply to all their views.
- Particle dispatches share a compute pass; normal animation no longer allocates a CPU readback
  buffer. The retained gravity change preserves interaction order and deterministic checksums.

## Reproduce

Build with `npm run build`, run `node scripts/serve.mjs`, and use a Chrome debugging session with
hardware WebGPU enabled. Pass its CDP port (default `9444`) to browser scripts:

```sh
node scripts/benchmark.mjs 9444
node scripts/benchmark-geometry.mjs
node scripts/check-renderer.mjs 9444
node scripts/check-text-depth.mjs 9444
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
