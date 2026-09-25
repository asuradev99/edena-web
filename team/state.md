# Shared state

Last updated: 2026-09-25 by **deepcode** (the basics tour: twenty-three small demos, one library idea each, with a pixel-level browser check that audits every control; plus `box`/`cylinder` solids, a unified outward winding rule, an optional Euler `orientation` on `Visual`/`Group`, a page-health check for the whole showcase, a favicon, and an honestly retired legacy page). Prior: (crystal viewer: centred-lattice animation, element folding, camera-only stage with a reset, per-family moves, picker grouped by family, consistent counts and states; lattice isometry API, 100% line coverage, and a browser harness that audits all 48 operations). Prior: lattice/streamline/MathML library layer, crystal viewer rewrite, electromagnetism upgrade, interactive field example, showcase typesetting; color lane, Phase 6 docs, simulation cleanup, all-pairs n-body + physics lab, crystal docs; **astra** (perspective camera, Phase 5 seam, landing gallery, crystal viewer uploads). Update the date and author when you change this.

## Where things stand

- Branch `main`, tree **clean**. This line of work is committed: `451ed82` (legend element folding),
  `c300957` (centred, correct operation animation; halos and clicking removed), `8804a30`
  (lattice isometry API + tests), `a333247` (supercell trail legibility), `ed22831` (docs + harness), `fda9879` (auto-play, outlined markers), `1b41ff4` (per-family animation), `1cea681`
  (swatch/transport polish), `dddf686`, `cea41f5`, `00834b2`, `6276022` (performance), `cd10b3e` (coverage), `4ab8e75` (refit on
  reshape), `7925ff1`..`096e535` (counts, toggle caps, status states, a11y, reduced motion, the relative
  point-group tolerance, phonopy-file persistence, drop anywhere, and the pixel-level animation
  checks). Earlier: `3054fd1`
  (library + pages), `5bb690a`, `5e28935`, `134ff03`, `edad9c1`, `f83ee5e`.
- `npm run typecheck` → clean. `npm test` → **70/70** pass (~1.5 s; the sample-budget boundary
  test alone costs ~0.9 s). `npm run build` → `build/`.
- Pages all serve 200 from `npm run dev` (http://localhost:5173): `/`, `/basics.html`, `/field.html`,
  `/particles.html`, `/physics-lab.html`, `/symmetry.html`, `/electrostatics.html`, `/legacy.html`.
  `scripts/check-pages.mjs` loads all eight over CDP and asserts each has a title, drew every canvas
  it declares, shows no error state, and logs nothing — all eight pass, and it found two real
  faults the first time it ran (below).
- **The basics tour** (`basics.html`) is where a reader starts: twenty-three demos, each isolating one
  fundamental idea, one device and one render loop, `?samples=1`/`?dpr=1` for diagnostics,
  `prefers-reduced-motion` respected. `scripts/check-basics.mjs` drives every control on every demo
  against compositor screenshots measured back inside the page, and reports
  `23 of 23 canvases drawing · 60 fps`.
- Rendering verified in Chrome Beta 155 on the Vulkan path (`--headless=new`, CDP 9444, real AMD
  rdna-2 adapter): 61 fps on `symmetry.html` from 1x1x1 to a 1600-atom cell, no console/WebGPU
  errors. A 400-atom POSCAR loads in ~0.5 s and a 1600-atom one in ~1.1 s; changing operation is
  4 ms at 1x1x1, 30 ms at 3x3x3 and 4 ms at 1600 sites. `scripts/check-depth.mjs` drives all 48
  operations and audits the captions, the picker counts, the transport locks, the camera reset, the
  switch budget, a hexagonal lattice (24 operations), rutile (the 8 point operations it really has),
  a phonopy file surviving a structure load, a rejected file, and — measured from the pixels — the
  shape of the drawn animation: a rotation to a projected circle (0.25 px worst), a mirror and an
  inversion to straight chords (0.62 and 0.94 px, the inversion's through the box centre), and a
  roto-reflection to that circle then a straight fold (0.55 and 2.79 px). It fails if the page
  throws or logs an error anywhere in its 30 s run. Performance holds under abuse: 576 operation
  switches across every supercell size leave a forced-GC heap at 6 MB (from 4), the DOM node count
  at 260 and the frame rate at 61; a 46 s soak with 30 operation changes, supercell changes and
  camera drags renders 2,726 frames with no error.

## Layout

| Path | What it is |
|------|------------|
| `src/lib/*.ts` | The library, re-exported by `src/index.ts` |
| `src/index.ts` | Public entry point (exports math, geometry, colormap, plot, field, world, camera, view, timeline, simulation) |
| `src/examples/basics.ts` + `basics.html` | The basics tour: twenty-three demos, one idea each (frame, interpolation, transparent solids, primitives, groups, labels, colour, plot, depth, batching, camera, simulation, implicit surface, streamlines, story, diagram, path, normals, layers, chart, follow, transform, measure). Each is a self-contained factory returning its own `update`; the page shares one device, skips drawing for off-screen views, and isolates a throwing demo. |
| `scripts/check-{links,pages,basics,depth}.mjs` | The four checks: static links, page health, the tour, and the renderer + crystal viewer |
| `src/showcase/main.ts` + `index.html` (**astra**, do not edit) | Landing gallery: Fourier harmonics curve, palette/frequency surface, level-set shapes with a projection switch, lattice assembly timeline, plus inline-launching experiment embeds |
| `src/examples/field.ts` + `field.html` | Focused single-panel isosurface example |
| `src/examples/physics-lab.ts` + `physics-lab.html` | Five experiments: Kepler orbits via the CPU seam, all-pairs GPU gravity, double pendulum, Lorenz attractor, two-source interference |
| `src/examples/particles.ts` + `particles.html` | Particle benchmark page: oscillator and all-pairs `nbody` modes, count selector, GPU-step timing |
| `src/demo/*` + `electrostatics.html` + `demo.css` | Archived 3:12 charged-ball animatic |
| `src/lib/crystal.ts` (**chatgpt**) + `tests/crystal.test.mjs` | Crystal data: POSCAR and phonopy symmetry parsers |
| `symmetry.html` + `src/examples/symmetry.ts` | Crystal viewer: drag/drop POSCAR/CONTCAR + phonopy symmetry uploads, species-coloured atoms with periodic ghost neighbours and two-tone bonds, supercell 1–3 drawn centred on a lattice point, arc-animated operations with orbit trails, live site-mapping report, and a legend that folds elements in and out. Camera-only (no picking/measurement) |
| `src/*.ts`, `dist/`, `legacy.html` | Older physics prototype; excluded from the library build |
| `tests/*.test.mjs` | `core.test.mjs` (physics/geometry/timeline), `plot.test.mjs` (ticks/isosurface/colors/budgets), `camera.test.mjs` (projection), `simulation.test.mjs` (CPU seam), `particles.test.mjs` (GPU option validation) |
| `team/` | This coordination channel |

## Public API additions from this session

- `src/lib/geometry.ts` (new in this pass): `box(min, max)` and `cylinder(radius, height, sides, topRadius, capTop, capBottom)` (a frustum or cone), and every closed solid is now wound **outward** — the divergence-theorem signed volume is positive, and a test asserts it for box, cylinder, cone, sphere, shaded sphere and torus.
- `src/lib/math.ts` / `src/lib/world.ts` (new in this pass): `orientationMatrix(x, y, z)` and `applyMatrix(matrix, point)`, with an optional Euler `orientation` on `Visual` and `Group` (rotations apply x→y→z, then the node's own y-rotation, then scale in the node's frame). Passing no orientation is byte-identical to the old matrix, which a test pins.
- `src/lib/plot.ts`: `niceStep`, `tickValues`, `formatTick`, `plotFrame`, `axes3d`, `boundsBox`
- `src/lib/field.ts`: `isosurface(field, bounds, isovalue, resolution, options)`
- `src/lib/crystal.ts`: `parsePOSCAR` (VASP 4/5, negative scale as target volume, Direct/Cartesian,
  Selective dynamics) and `parsePhonopySymmetry` (bracketed and flat row-oriented `symmetry.yaml`,
  translations preserved for screw/glide operations)
- `src/lib/colormap.ts`: `ramp`, `viridis`, `plasma`, `colorMappedSurface`
- `src/lib/lattice.ts`: `cellFromParameters`, `fractionalToCartesian`/`cartesianToFractional`,
  `periodicDistance`, `supercell`, `latticeSites` (sc/bcc/fcc/diamond/rock-salt/perovskite),
  `bonds` (every periodic image within the cutoff), `nearestNeighbours`, `millerPlane`,
  `CUBIC_OPERATIONS` (all 48), `applyOperation`, `mapsOntoSelf`, `siteMapping`, `symmetryOrbits`,
  `cartesianOperation`/`axisAngle`/`rotateAboutAxis`, `structureBounds`, `shortestDistance`, `isCubic`
- `src/lib/lattice.ts` (new in this pass): `operationIsometry(lattice, operation)` decomposes an
  operation into the rotation `R(θ, n)`, or the **rotoreflection** `S(θ, n) = R(θ, n)·σ_n` it
  actually is (`{ axis, angle, improper, inversion, translation, trivial }`); `isometryPoint(iso, p, t)`
  evaluates that map part-way from the identity; `isometryTarget(iso, p, lattice)` gives the image
  slid into the origin-centred cell only when it leaves one; `improperNormal(m)` is the mirror-plane
  normal. Two bugs came out of writing the tests: the sign of θ was being dropped (the trace fixes
  |θ| only, and σ_n does not distinguish ±n, so M − Mᵀ supplies it), and an image landing exactly on
  a box face was being nudged a whole cell by float noise.
- `src/lib/vectorfield.ts`: `streamline`/`streamlines` (RK4, arc-length stepping) and `sphereSeeds`
- `src/lib/elements.ts`: `ELEMENTS` + `appearanceFor` (CPK-brightened colours, covalent radii)
- `src/lib/mathtext.ts`: MathML builders (`mi`/`mn`/`mo`/`row`/`frac`/`msup`/`msub`/`sqrt`/`vec`/
  `hat`/`matrix`/`integral`/`summation`/`mathml`, …) — note `msub`/`msup` are prefixed to avoid the
  `math.sub` clash
- `src/lib/geometry.ts`: **also** `sphericalPoint`, `sphericalWedge`, `sphericalWedgeOutline`,
  `boxEdges`
- `src/lib/view.ts`: `LabelLayer.addHTML(html, point, color, className)` typesets MathML over the
  canvas; `Visual.geometry` is writable for animated shapes
- `src/lib/geometry.ts`: `Geometry.vertices` + optional `Geometry.colors`; `merge` carries colors
- `src/lib/camera.ts`: `projection: 'orthographic' | 'perspective'` (ortho default), `fovY`,
  `near`, `far`, `distance`, `projectWith(matrix, point, w, h)` (perspective-correct)
- `src/lib/view.ts`: options `samples` (1|4), `alphaMode`, `maxDpr`; fields `adapterInfo`,
  `isFallbackAdapter`; second `vertexColored` pipeline for per-vertex colors; now requests the
  optional `timestamp-query` feature when the adapter has it, so GPU timing works on a view's device
- `src/lib/simulation.ts` (**astra**): `createParticleState`, `ParticleState`,
  `stepParticles`, `ParticleSimulation`, `ParticleAcceleration` — renderer-agnostic particle
  data plus an explicit stepping hook. `stepParticles` takes an explicit `time`, the hook
  returns an **acceleration** per axis (not a force — `masses` is carried but never read), the
  hook receives private copies of the position/velocity arrays, and the loop allocates nothing
  per particle. `ParticleSimulation` adds elapsed time and `reset()`.

## Known limits (do not "fix" these by accident — they are documented behaviour)

- Opaque geometry writes depth. Translucent objects render afterward, sorted by projected object origin; intersecting transparent meshes still require more advanced transparency handling.
- `Visual.rotation` rotates about Y only.
- The camera defaults to orthographic; perspective is opt-in per view.
- Isosurfaces are CPU-extracted, single-threaded, 250 000-sample budget by default.
- `stepParticles` reuses the arrays it hands the hook, so hook authors must copy what they keep.
- The showcase's readout shows `GPU (<architecture>) · msaa×N · dpr≤N`; if it says
  `software GPU`, frame rate will be poor — that is the backend, not the code.

## In flight (claimed)

- **deepcode** — just landed the crystal viewer pass and the lattice isometry layer; tree is clean and
  everything below is free to edit. Available for docs or another page.
- **astra** — earlier: `symmetry.html`, `src/examples/symmetry.ts`, `src/lib/view.ts`, `particles.*`,
  `index.html`, `src/showcase/main.ts`, `src/examples/field.ts`. Those claims are now released:
  deepcode edited `symmetry.html` and `src/examples/symmetry.ts` in this pass.
- **chatgpt** — `src/lib/crystal.ts` (parsing done; the `src/lib/lattice.ts` geometry layer is now
  built out as well).
- Everything else is free. Post before you edit so we do not collide.

## Open items / good next steps

1. Tree is clean and committed; `npm test` is 70/70, and all four checks pass.
1a. **The tracked `dist/` is a fossil:** 22 files from an older layout, built from a version of
   `src/main.ts` whose `editor`/`types` modules were never committed. Nothing loads it now, but it
   shadows the old page and confuses a search. Deleting it is a call for its author; it is documented
   here rather than removed.
2. **astra:** Phase 5 remainder in `src/lib/simulation.ts` — fixed-step accumulation, pause,
   and single-step as explicit runtime policies. Unclaimed by deepcode.
3. Spatial interaction kernels (neighbour search, Barnes-Hut, all-pairs) are explicitly **out of
   scope** for the current baseline; the user asked for the simplest raw throughput baseline first.
4. Phase 6 remainder: API naming decisions and measurement notes.
   See `VISUALIZATION_LIBRARY_PLAN.md` and `README.md`.
5. Crystal viewer: `scripts/check-depth.mjs` is refreshed — it now drives all 48 operations and
   checks each caption, and passes against the live page (it was asserting against the pre-rewrite
   `c4`/`mirror` select values). `structureBounds` is no longer used by the viewer, which computes the
   bounds of the drawn box instead.

## Landed recently

- **Basics tour (deepcode, 2026-09-25, third session).** The user asked to start from the basics: one
  small demo per fundamental library feature, working on the showcase as a whole, and to keep adding
  demos. Twenty-three are live, each a self-contained factory: the coordinate frame; interpolation with a
  seekable `Timeline`; solids with transparent sides; the geometry primitives; nested groups; typeset
  maths riding a point; colour from data; a chart in 3D; depth and draw order; one mesh instanced many
  times; a camera move; a hand-stepped simulation; an implicit surface at a level you move; streamlines
  in a vector field; a story built from four cues; a vector diagram; a Bézier path with its control
  polygon; surface normals from central differences; layers switched with `visible`; a 3D bar chart whose sort eases; a camera that follows a marker; a node's own transform matrix read back and typeset; and a measurement figure whose labels are recomputed from the same two points as the geometry. `check-links.mjs` now also asserts that the table of contents lists the panels in the order the page presents them (`scripts/tidy-panels.mjs` is the repair). The panels are in the order the table of contents lists them, which an audit of TOC-against-panel order now checks.
  - **Two library gaps the demos exposed**, both fixed with tests: there was no `box` or `cylinder`
    primitive (and `parametricSurface` was wound the opposite way from the spheres), and `rotation` was
    a single y-angle, so nothing could tumble — hence the optional Euler `orientation`.
  - **The check found the bugs worth having.** `check-basics.mjs` measures each stage's region from a
    compositor screenshot, re-measured inside the page (a WebGPU canvas cannot be read after
    presentation), and asserts that every control moves its own stage more than that stage drifts on
    its own — which is how a *disconnected* control is caught. Two of its assertions were themselves
    wrong first: an early version compared counts that never reached the assertion (vacuous), and a
    spin test passed on drift alone until it was compared against the stage's own still drift.
  - **Three real defects found while building, all kept:**
    the first animation frame can carry a timestamp from *before* the loop started, so the frame delta
    could be negative and `stepParticles` rejected it (delta is now clamped at zero); that throw froze
    the whole page, so each demo's `update` is now isolated, reported once, and skipped; and the
    browser had cached a stale bundle, hiding a fix — both browser checks now disable the cache.
  - **Page-health pass.** `check-pages.mjs` found that `legacy.html` had always loaded a bundle
    importing `dist/editor.js`, a module that was never committed (a black canvas and a console 404,
    with no explanation) — the page now says what it is and points at the tour. It also found that no
    page declared an icon, so every page logged a 404 for `favicon.ico`; there is now a small SVG mark
    linked from all eight pages.
  - **Check hygiene:** the browser checks opened a tab per run and never closed it — sixty leftover
    pages were competing with the one under test and the tour had fallen to 36 fps. They now close
    their tab and time out if Chrome never answers on the debugging port.
  - Verified in Chrome Beta 155 (headless Vulkan, CDP 9444, AMD rdna-2): 60 fps with all twenty-three
    demos, ~30–100k triangles depending on the settings left behind, no console errors, `npm test`
    70/70, and `check-basics` passing in ~2.5 min.

- **Crystal viewer pass (deepcode, 2026-09-25, second session).** The user's brief was "don't add
  tools, make what is there beautiful, and the operations are disgusting and sometimes wrong".
  - **The animation bug.** The scene was laid out with the cell corner at the origin while the
    symmetry element was drawn at the cell centre, so rotations pivoted about a corner of the box and
    atoms swept in wide arcs across it. The scene is now drawn in a frame centred on a lattice point
    (the cell spans `[-n/2, n/2]`), which puts every element — they all pass through the origin — in
    the middle of the picture, where the crystal now turns.
  - **The "sometimes wrong" bug.** `mirrorNormal` read the *longest* column of `M + I`, which lies in
    the mirror plane, so diagonal mirrors were labelled and drawn with the wrong normal (and `S₄`/`S₆`
    were reported as `S₃`). The normal now comes from the cross product of the columns of `M + I`,
    and every improper operation is decomposed as the rotoreflection it is.
  - **The loop bug.** Ending an atom at the image *nearest its start* meant a site on a lattice point
    was dragged home along a straight chord after sweeping its arc. An atom now ends at the
    operation's own image, corrected by a lattice vector only if it leaves the box — which a cubic
    cell never needs, so each atom travels its true arc.
  - **Every family animates as its own geometric move** (user follow-up: "actually do the matrix;
    don't just interpolate"). `isometryPoint` used to fold and spin an improper operation at once — an
    interpolation invented for the occasion. A proper rotation turns about the operation's own axis; a
    mirror slides straight through its plane; an inversion slides straight through the centre; and a
    roto-reflection runs as **two moves in sequence** — the whole rotation, then the whole fold —
    because that is literally how `R(θ, n)·σ_n` acts. At t = ½ the rotation is complete and the fold
    has not begun, so the label names both moves in the order they play.
  - **Removed** the transparent halo behind every atom and all click-to-select/measurement UI: the
    stage is camera-only. The legend still folds elements in and out, the "before" markers are wire
    outlines, and dense supercell trails thin out so 38 orbit arcs stay legible. Choosing an operation
    plays it immediately, the caption says how many sites the element pins, rotoreflections are named
    by their power (S4 vs S4 cubed) with the signed spin drawn, and a ResizeObserver re-fits the
    camera when the stage changes shape without discarding the zoom.
  - Verified in Chrome Beta 155 (headless, CDP 9444, AMD rdna-2): 61 fps, no console errors, frame
    montages per operation (`/tmp/edena/montage-*.png`), `npm test` 45 → **61/61** (and `lattice.ts` is now at 100% line and function coverage).
  - **Performance (found while checking a large upload).** `symmetryOrbits` called `siteMapping`
    inside its walk, rebuilding the O(n²) table for every (site, operation) pair: 6.5 s for a
    400-atom cell, 23 ms now. The "before" wire markers each built their own wireframe geometry, and
    a CPU profile then showed the per-vertex-shaded sphere being rebuilt per element on every
    rebuild — the largest single cost of choosing an operation. Bond finding, the nearest-neighbour
    distance, the atom mesh, the bond geometry and the cell-preserving operation list describe the
    crystal rather than the chosen operation, so all of them are cached across operation changes.
    A 400-atom SrTiO3 POSCAR loads in **473 ms** (was ~13 s) and renders at 61 fps; choosing an
    operation rebuilds in **4 ms** at 1x1x1, 30 ms at 3x3x3 (was 55-95 ms and 78 ms).
- **Crystal viewer, library layer (chatgpt):** `src/lib/crystal.ts` — `parsePOSCAR` (VASP 4/5,
  selective dynamics, Cartesian or direct, negative scale as target volume) and
  `parsePhonopySymmetry`, exported through `src/index.ts` with `tests/crystal.test.mjs`.
- **Blocker fixed by deepcode (one character):** `parsePOSCAR` rejected every file because the
  `vec` helper used a regex **literal** with string-style double escaping
  (`/[\\s,]+/` matches a backslash or `s`, not whitespace). Corrected to `/[\s,]+/`.
  Suite went **25/27 → 27/27**. Reported to chatgpt with the general rule (literals need one
  backslash, string-built patterns need two).
- **Both crystal defects fixed by astra:** the canonical phonopy `symmetry.yaml` (flat 9-number
  rows wrapped over three lines) now parses, and translations are preserved **and** included in the
  dedupe key, so non-symmorphic operations (screw/glide, e.g. diamond's `[0.25, 0.25, 0.25]`)
  survive instead of collapsing and reporting a zero translation. Locked in `tests/crystal.test.mjs`
  (suite now 29/29).
- **Crystal viewer uploads + appearance (astra):** `symmetry.html` + `src/examples/symmetry.ts`
  accept a POSCAR/CONTCAR and a phonopy symmetry file by drag/drop or the combined multi-file input
  (content-sniffed by header/name), list the loaded files, and colour/scale atoms by species with a
  legend. Re-verified end-to-end by deepcode against the live page: a 5-atom SrTiO₃ POSCAR loads
  (`Sr, Ti, O`), the three oxygens now share one colour instead of three palette colours, and the
  console is clean (`/tmp/crystal-{before,after}-{default,perovskite}.png`).
- **Offered to chatgpt:** a separate `src/lib/lattice.ts` geometry layer (cell parameters →
  vectors, fractional↔Cartesian, SC/BCC/FCC/diamond site generation, bonds, neighbour search,
  Miller-plane polygons, the 48 generated cubic operations, and an exact `mapsOntoSelf` test in
  fractional space). Awaiting their answer so we keep one writer per file.

- **Depth / occlusion fix (astra, user-reported):** `src/lib/view.ts` now uses depth writes for
  opaque pipelines (`depth24plus`, `less-equal`) with separate non-writing pipelines for
  translucent geometry. Verified against my pages: `physics-lab.html` unchanged at 60 fps with no
  console errors, the **Lorenz attractor now self-occludes** (it used to read as a tangle under
  painter order), and the drumhead's nodal lines survive because equal depth still passes
  `less-equal`.
- **Joint end-to-end check (deepcode):** landing + inline `physics-lab.html` iframe running at the
  same time — 4 + 6 = 10 WebGPU views, 176 868 triangles, **both at 60 fps**, empty error status on
  both, lab GPU timing live (8 192 bodies · 1.30 ms/step). The embedded flow is clean, not just the
  standalone page.

## Depth caveats (know before changing the depth state)

- The drumhead panel (lab 06) draws nodal lines *coincident* with the surface's zero crossings.
  They are visible only while `depthCompare` allows equal depth; switching to strict `'less'` would
  hide them (easily fixed on my side by offsetting the lines).
- `GpuParticleSimulation` deliberately renders **without a depth attachment**: 50 000 unsorted
  translucent sprites that wrote depth would occlude each other with hard edges.

- **All-pairs gravity in the GPU core (deepcode):** `mode: 'nbody'` — one thread per body loops
  over every other body, Plummer softening, `layout: 'disc'` with exact circular-orbit initial
  velocities, plus `orbitPeriod` deriving G = 4π²R³/(T²N) for a uniform disc.
  Measured: 8 192 bodies ≈ 0.5 ms/step, 32 768 bodies ≈ 3.7 ms/step (60 fps), deterministic.
  O(N²) above 32 768 bodies is rejected up front. Verified: the disc stays round (lit-box ratio
  0.95–1.03) over a quarter orbit and grows real spiral arms.
- **`physics-lab.html` + `src/examples/physics-lab.ts` (deepcode, embedded by astra):** six live
  experiments — Kepler orbits through `createParticleState`/`ParticleSimulation`/`reset`, an
  all-pairs GPU n-body disc with live timestamp timing, two double pendulums 0.1° apart coloured
  by time through a custom `ramp` + `merge`, the Lorenz attractor with an interactive ρ,
  two-source interference as a `colorMappedSurface`, and drumhead modes built with
  `functionSurface` plus a `Group.visible` toggle. 60 fps, 54 136 triangles, no console errors.
  This closes the last coverage gaps: `functionSurface`, `Group.visible` and the view's
  `alphaMode` option (now reachable with `?alpha=opaque`) were demonstrated nowhere else.
- **Landing gallery (astra):** four panels (Fourier harmonics, palette/frequency surface,
  level-set shape + projection switch, seekable lattice assembly) plus inline-launching embeds.
  122 732 triangles at 60 fps.
- **Particle benchmark (deepcode):** `particles.html` now switches between the oscillator baseline
  (50 000 particles, 0.02 ms/step) and all-pairs `nbody` (32 768 bodies, 3.77 ms/step).
- `simulation.ts`: hook-result local renamed to `vector`, `masses` documented as carried-not-read,
  in-place mutation documented, and the step loop went from 2N allocations per step to 2
  (A/B: N=2000 1929 ms → 21 ms per 600 steps). Redundant `timedAcceleration` closure removed.
  Regression test added. — deepcode
- `plotFrame` no longer double-labels the origin (was `0.0` over `0`); locked in
  `tests/plot.test.mjs` and verified visually. — deepcode
- `ParticleSimulation.reset()` and the explicit `time` parameter, with tests. — astra
- **Phase 6 pass (deepcode):** public surface audited (no accidental exports); prose and
  comments normalized to the identifier spelling `color` (only `team/log.md`, which is
  append-only, and the legacy `scripts/gen-default-config.mjs` keep the old spelling);
  a measured **Performance and limits** section added to `README.md` with verified budget
  boundaries (isosurface 61³, surfaces 250 000 quads, curves/tubes 100 000).
- **Bug found by that verification:** `functionCurve` advertised 100 000 samples but threw at
  exactly 100 000 with `polyline`'s unrelated "Invalid line resolution or width" error (its
  point cap collided with the sample budget). Long runs are now chunked at the shared
  `MAX_LINE_POINTS` constant with the joint repeated, so the budget is reachable; locked by a
  boundary test. — deepcode
- **GPU particle baseline core (`src/lib/particles.ts`, deepcode):** `GpuParticleSimulation` —
  `create`/`step`/`render`/`setCamera`/`reset`/`measure`/`checksum`/`destroy`. Ping-pong storage
  buffers, one compute dispatch per step, instanced-from-storage rendering, optional
  timestamp-query timing. Verified on the Vulkan path: 50 000 particles, **~0.022 ms GPU per
  step (~45 000 steps/s)**, 60 fps in the page, deterministic checksums, no validation errors.
  Note: Chrome does **not** implement `GPUQueue.getTimestampPeriod()`; the code falls back to
  nanoseconds and records `timingError` when a measurement fails.
- **Bug fixed in the same lane:** the initial velocity was purely tangential about Y, so every
  particle's out-of-plane motion shared one phase and the whole cloud periodically flattened
  into a pancake (measured height/width 0.26 on screen). A seeded isotropic jitter per particle
  decorrelates the phases; the on-screen ratio now stays ~0.95–1.03. — deepcode
- **`src/examples/particles.ts` + `particles.html` (astra):** the benchmark page — frame time,
  GPU step time, pause, and a particle-count selector.
- **Upgrade session (deepcode, 2026-09-25):** library layer `lattice.ts`/`vectorfield.ts`/
  `elements.ts`/`mathtext.ts` + `sphericalWedge`/`boxEdges` and `LabelLayer.addHTML`; the crystal
  viewer rewritten around bonds/periodic ghosts/supercells/arc-animated operations/orbit trails/a
  site-mapping report/a spherical `dV` readout (click a site); the electromagnetism animatic given
  an animated `dq` wedge with `ds`, `s dθ`, `s sinθ dφ` edges and a φ-sweep ring, RK4 field lines,
  equipotential shells, MathML labels and an element explorer; `field.html` made interactive
  (field/isovalue/resolution/melt); the showcase typeset in MathML with a point riding the curve.
  Two real lattice bugs fixed: `periodicDistance` misread fractional sites as Cartesian (bonds were
  empty), and `bonds` kept only the closest periodic image (an octahedral Ti lost three oxygens).
  Verified in Chrome/Vulkan, no console errors; suite 29 → **45/45**.
