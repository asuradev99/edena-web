# Shared state

Last updated: 2026-09-25 by **deepcode** (lattice/streamline/MathML library layer, crystal viewer rewrite, electromagnetism upgrade, interactive field example, showcase typesetting). Prior: color lane, Phase 6 docs, simulation cleanup, all-pairs n-body + physics lab, crystal docs; **astra** (perspective camera, Phase 5 seam, landing gallery, crystal viewer uploads). Update the date and author when you change this.

## Where things stand

- Branch `main`, tree **clean**. The session is committed: `3054fd1` (library + pages), `5bb690a`
  (first log note), `5e28935` (lattice/vectorfield/mathtext foundations), `134ff03` (crystal viewer
  rewrite), `edad9c1` (electromagnetism upgrade), `f83ee5e` (field example + showcase typesetting).
- `npm run typecheck` → clean. `npm test` → **45/45** pass (~1.2 s; the sample-budget boundary
  test alone costs ~0.9 s). `npm run build` → `build/`.
- Pages all serve 200 from `npm run dev` (http://localhost:5173): `/`, `/field.html`,
  `/particles.html`, `/physics-lab.html`, `/symmetry.html`, `/electrostatics.html`, `/legacy.html`.
- Rendering verified in Chrome Beta on the Vulkan path: 60 fps vsync-capped,
  ~1450 fps uncapped at DPR 1 and 2, ~0.4 ms CPU/frame, no console/WebGPU errors.

## Layout

| Path | What it is |
|------|------------|
| `src/lib/*.ts` | The library, re-exported by `src/index.ts` |
| `src/index.ts` | Public entry point (exports math, geometry, colormap, plot, field, world, camera, view, timeline, simulation) |
| `src/showcase/main.ts` + `index.html` (**astra**, do not edit) | Landing gallery: Fourier harmonics curve, palette/frequency surface, level-set shapes with a projection switch, lattice assembly timeline, plus inline-launching experiment embeds |
| `src/examples/field.ts` + `field.html` | Focused single-panel isosurface example |
| `src/examples/physics-lab.ts` + `physics-lab.html` | Five experiments: Kepler orbits via the CPU seam, all-pairs GPU gravity, double pendulum, Lorenz attractor, two-source interference |
| `src/examples/particles.ts` + `particles.html` | Particle benchmark page: oscillator and all-pairs `nbody` modes, count selector, GPU-step timing |
| `src/demo/*` + `electrostatics.html` + `demo.css` | Archived 3:12 charged-ball animatic |
| `src/lib/crystal.ts` (**chatgpt**) + `tests/crystal.test.mjs` | Crystal data: POSCAR and phonopy symmetry parsers |
| `symmetry.html` + `src/examples/symmetry.ts` (**astra**) | Crystal viewer: drag/drop POSCAR/CONTCAR + phonopy symmetry uploads, species-coloured atoms, animated symmetry operations |
| `src/*.ts`, `dist/`, `legacy.html` | Older physics prototype; excluded from the library build |
| `tests/*.test.mjs` | `core.test.mjs` (physics/geometry/timeline), `plot.test.mjs` (ticks/isosurface/colors/budgets), `camera.test.mjs` (projection), `simulation.test.mjs` (CPU seam), `particles.test.mjs` (GPU option validation) |
| `team/` | This coordination channel |

## Public API additions from this session

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

- **deepcode** — docs only right now (`README.md`, `CLAUDE.md`, this board). The GPU particle core
  (`src/lib/particles.ts`) and the physics lab are landed and free.
- **astra** — `symmetry.html`, `src/examples/symmetry.ts`, `src/lib/view.ts` (crystal uploads +
  atom appearance just landed); earlier: `particles.html`, `src/examples/particles.ts`,
  `index.html`, `src/showcase/main.ts`, `src/examples/field.ts`.
- **chatgpt** — `src/lib/crystal.ts` (parsing done; the `src/lib/lattice.ts` geometry layer deepcode
  offered is still unclaimed pending their answer).
- Everything else is free. Post before you edit so we do not collide.

## Open items / good next steps

1. Commit the current work (nobody has committed this session).
2. **astra:** Phase 5 remainder in `src/lib/simulation.ts` — fixed-step accumulation, pause,
   and single-step as explicit runtime policies. Unclaimed by deepcode.
3. Spatial interaction kernels (neighbour search, Barnes-Hut, all-pairs) are explicitly **out of
   scope** for the current baseline; the user asked for the simplest raw throughput baseline first.
4. Phase 6 remainder: API naming decisions and measurement notes.
   See `VISUALIZATION_LIBRARY_PLAN.md` and `README.md`.
5. Crystal viewer follow-ups: the `src/lib/lattice.ts` geometry layer (cell parameters,
   SC/BCC/FCC/diamond sites, bonds, Miller planes, the 48 generated cubic operations,
   `mapsOntoSelf`) is offered but unclaimed until chatgpt answers; the page currently derives
   atom sites straight from the parsed POSCAR positions.

## Landed recently

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
