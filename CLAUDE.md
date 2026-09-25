# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working with other agents

More than one agent shares this directory. Before you start, read the team channel:

```sh
node team/note.mjs --read     # conversation thread (append-only)
cat team/state.md             # current shared facts; keep it updated when you finish things
cat team/welcome-astra.md     # handoff note for Astra
```

- **Claim files before editing them**, and do not touch a file another agent has claimed
  in an unanswered message. One writer per file at a time; text files do not merge.
- Post updates with `node team/note.mjs --from <your-handle> --subject "..." "body"`.
- Never rewrite `team/log.md` — append only. See `team/README.md` for the full protocol.
- Leave the tree green (`npm run typecheck`, `npm test`) or say in the log that it is not.

## Commands

```bash
npm run typecheck   # tsc -p tsconfig.library.json --noEmit
npm test            # build, then node --test tests/*.test.mjs
npm run build       # compile the library, showcase, and demo into build/
npm run dev         # build, then serve the repo on http://localhost:5173
```

Plain `npx tsc` (`tsconfig.json`) compiles all of `src/` — including the legacy prototype — into `dist/`; the library workflow uses `tsconfig.library.json`, whose output is `build/` with declarations.

## Architecture

Edena is a WebGPU mathematical-visualization library plus a landing showcase, focused examples, and an archived animatic. The library is `src/lib`, re-exported from `src/index.ts`; applications consume it through `build/`.

### Library

| File | Role |
|------|------|
| `src/lib/math.ts` | `Vec3`/`Color`, clamp/lerp/smooth, column-major mat4 helpers, `rgba` |
| `src/lib/geometry.ts` | Immutable `Geometry` (unindexed triangles, optional per-vertex `colors`) and constructors: `polyline` tubes, `circle`, `sphere`, `wireSphere`, `arrow`, `functionCurve`, `parametricSurface`/`functionSurface`, `merge` (carries colors) |
| `src/lib/colormap.ts` | `ramp`/`viridis`/`plasma` and `colorMappedSurface(f, x, y, colorOf, resolution?, range?)` |
| `src/lib/plot.ts` | Plot helpers: `niceStep`/`tickValues`/`formatTick`, `plotFrame` (axes/ticks/grid/label anchors), `axes3d`, `boundsBox` |
| `src/lib/field.ts` | `isosurface(field, bounds, isovalue, resolution)` — CPU marching-tetrahedra extraction of one scalar-field level |
| `src/lib/world.ts` | `Visual`/`Group`/`World` scene graph: transforms, opacity, visibility, `reveal` |
| `src/lib/camera.ts` | `OrbitCamera` with pointer/wheel interaction, `project`/`projectWith`, and `projection: 'orthographic'` (default) `| 'perspective'` |
| `src/lib/view.ts` | `WebGPUView` (two pipelines: flat and per-vertex color; MSAA/depth targets, batching, resize, device-loss reporting) and `LabelLayer` |
| `src/lib/timeline.ts` | Absolute-time `Timeline` with cues and `tween` |
| `src/lib/simulation.ts` | Renderer-agnostic particle data and stepping seam: `createParticleState`, `stepParticles`, `ParticleSimulation`, `ParticleAcceleration`. No GPU or renderer dependency; application code drives it and feeds the resulting state into visuals |
| `src/lib/particles.ts` | `GpuParticleSimulation`: GPU-resident counterpart — ping-pong storage buffers, one compute dispatch per step (semi-implicit Euler, no atomics), a render pipeline that instances directly from the storage buffer, optional timestamp-query timing (`measure()`, `timingError`). Caller owns submission and the render pass (no depth attachment) |
| `src/lib/crystal.ts` | Crystal data parsing: `parsePOSCAR` (VASP 4/5, scale incl. negative-as-volume, Direct/Cartesian, Selective dynamics) and `parsePhonopySymmetry` (bracketed or flat row-oriented `symmetry.yaml`, translations preserved) |

### Applications

| Path | Role |
|------|------|
| `src/showcase/main.ts` + `index.html` | The landing showcase: three panels (curve, value-colored surface, perspective isosurface) sharing one device, with a frame-time readout |
| `src/examples/field.ts` + `field.html` | Focused single-panel isosurface example |
| `src/examples/particles.ts` + `particles.html` | GPU particle benchmark: oscillator baseline (up to 100 000 particles) and all-pairs `nbody` gravity, with mode/count selectors and GPU-step metrics |
| `src/examples/physics-lab.ts` + `physics-lab.html` | Physics lab: Kepler orbits through the CPU seam, all-pairs GPU gravity, double-pendulum chaos, the Lorenz attractor, two-source interference, and drumhead modes (`functionSurface` + `Group.visible`) |
| `src/examples/symmetry.ts` + `symmetry.html` | Crystal viewer: drag/drop POSCAR/CONTCAR + phonopy symmetry uploads, species-coloured and radius-scaled atoms with a legend, and symmetry operations animated on the loaded structure |
| `src/demo/*` + `electrostatics.html` + `demo.css` | Archived 3:12 charged-ball animatic |
| `src/*.ts`, `dist/`, `legacy.html` | The earlier physics prototype, kept for reference and excluded from the library build |

### Rendering details

- Draw path is unlit triangles with alpha blending, 4× MSAA (or `samples: 1`), and `depth24plus` **without depth writes**. Two pipelines: flat uniform color, and per-vertex color for `Geometry.colors`.
- Geometry is batched per (geometry, color) pair; each shared `Geometry` owns a position buffer (plus a color buffer when colored) and instances carry the model matrix and opacity.
- Labels are DOM overlays projected through the camera and never occlude behind geometry.
- `Visual.rotation` rotates about Y only. The camera is orthographic unless a view opts into `projection = 'perspective'`. Geometry is treated as immutable — allocate a new `Geometry`/`Visual` for changed topology.
- A view owns its GPU resources and releases removed objects on later renders; dispose borrowing views before their device owner.
- Performance contract: `render()` reads `canvas.clientWidth` only when the `ResizeObserver` fired or the DPR changed, and reuses each batch's instance `Float32Array`. `LabelLayer.update()` reads layout once and projects with a single cached camera matrix. Do not reintroduce per-frame layout reads inside loops — repeated `clientWidth` reads interleaved with style writes force a reflow each time and are the main source of jank.

### Conventions

- Coordinates are right-handed with +Y up. `functionCurve` produces `[x, f(x), 0]`; `functionSurface` produces `[x, f(x, y), y]`.
- Timeline cues run on absolute time and fire on **every** seek, so they must set absolute state.
- `isosurface` samples a bounded box on the CPU, is capped by a sample budget (default 250 000 samples), and suppresses cells that touch a non-finite value.
- `Geometry.colors` is optional; when present, the renderer uses the colored pipeline and the `Visual` color acts as a **tint** (pass white to show a colormap at full strength). `merge` fills white for uncolored inputs.
- `OrbitCamera.projection` defaults to `'orthographic'`; in perspective mode `distance`/`fovY` replace `height`, and wheel zoom adjusts the matching parameter.
- Application code owns the frame loop; the library does not create a `requestAnimationFrame` loop per object.

See `VISUALIZATION_LIBRARY_PLAN.md` for the roadmap and `README.md` for the consumer-facing API summary and limitations.
