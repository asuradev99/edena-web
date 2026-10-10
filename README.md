<p align="center">

The [project workspace](index.html) opens one selected scene with controls in a reserved side column.
Use the searchable picker to switch among 65 runnable scenes; the Basics and Academy factories create
only the selected view. The original [gallery](gallery.html), teaching tours and
[electrostatics film](electrostatics.html) remain available directly.

New: [2D tight binding](tight-binding.html), defaulting to a one-atom hexagonal Bravais lattice,
one orbital, equal nearest-neighbor hopping and zero onsite energy. Edit lattice vectors, basis sites,
real or complex bonds, site energies and the k path. Switch the canvas between bands, dispersion,
Brillouin zone, Fermi-contour evolution, lattice/bonds and DOS. See
[model conventions and numerical limits](docs/tight-binding.md). Model sampling runs in a worker;
Fermi-energy changes reuse the samples.

  <img src="docs/images/hero.webp" alt="A Viridis colour-mapped surface beside the Fermi surface of a weak periodic potential, both rendered with Edena" width="100%">
</p>

<h1 align="center">Edena</h1>

<p align="center">
  <b>Programmable mathematical visualization, scientific animation, and GPU-resident simulation — on WebGPU.</b>
</p>

<p align="center">
  <a href="#quick-start"><img alt="Build: TypeScript" src="https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript&logoColor=white"></a>
  <img alt="Backend: WebGPU" src="https://img.shields.io/badge/backend-WebGPU-5a2ca0">
  <img alt="No runtime dependencies" src="https://img.shields.io/badge/runtime%20deps-0-success">
  <img alt="License: ISC" src="https://img.shields.io/badge/license-ISC-blue">
</p>

Edena is a small TypeScript library for turning mathematics into pictures. Geometry stays reusable,
simulation state can live entirely on the GPU, and the same primitives power a polished explainer and a
high-throughput experiment. The visual language is borrowed from mathematical animation — dark stages,
restrained typography, bright semantic colours, and motion that explains an idea rather than decorating
it.

It is **dependency-free at runtime** (TypeScript and `@webgpu/types` are dev-only), **renderer-agnostic
where it counts** (the CPU particle seam does not mention a device), and it ships a working gallery:
every image and simulation below is a page in this repository.

---

## Gallery

<table>
  <tr>
    <td width="50%" align="center">
      <img src="docs/images/lorenz.webp" alt="The Lorenz attractor" width="100%"><br>
      <sub><b>The Lorenz attractor</b> — 8,000 RK4 steps drawn as one polyline. <a href="physics-lab.html">Physics lab</a>.</sub>
    </td>
    <td width="50%" align="center">
      <img src="docs/images/particles.webp" alt="50,000 GPU-resident particles" width="100%"><br>
      <sub><b>50,000 particles</b> — state lives in ping-pong storage buffers; the render pass instances straight out of them. <a href="particles.html">GPU particles</a>.</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <img src="docs/images/gyroid.webp" alt="A gyroid isosurface" width="100%"><br>
      <sub><b>A gyroid</b> — <code>isosurface(f, bounds, level, resolution)</code>, CPU marching tetrahedra. <a href="index.html">Landing showcase</a>.</sub>
    </td>
    <td width="50%" align="center">
      <img src="docs/images/transparency.webp" alt="A glass case with a ball and a rod inside" width="100%"><br>
      <sub><b>Depth and transparency</b> — opaque geometry writes depth, translucent faces sort back to front. <a href="basics.html">Basics 03</a>.</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <img src="docs/images/lattice.webp" alt="A cubic lattice built from one instanced sphere" width="100%"><br>
      <sub><b>One mesh, many copies</b> — a cubic lattice of atoms, bonds and projected labels. <a href="index.html">Showcase</a>.</sub>
    </td>
    <td width="50%" align="center">
      <img src="docs/images/drum.webp" alt="A vibrating drumhead mode" width="100%"><br>
      <sub><b>Vibrating drumhead</b> — one of six experiments in the <a href="physics-lab.html">physics lab</a>.</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <img src="docs/images/mobius.webp" alt="A Möbius strip" width="100%"><br>
      <sub><b>A Möbius strip</b> — <code>parametricSurface(u, v)</code>: one half-twist joins two ends into one side. <a href="index.html">Showcase</a>.</sub>
    </td>
    <td width="50%" align="center">
      <img src="docs/images/bands.webp" alt="Bloch band structure over a square Brillouin zone" width="100%"><br>
      <sub><b>Bloch bands</b> — a weak potential opens a gap and reconnects a contour at a saddle. <a href="homework.html">Homework</a>.</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <img src="docs/images/nbody.webp" alt="All-pairs gravity, 8,192 bodies" width="100%"><br>
      <sub><b>All-pairs gravity</b> — raw <code>O(N²)</code> on the GPU: no tree, no grid, no atomics. <a href="physics-lab.html">Physics lab</a>.</sub>
    </td>
    <td width="50%" align="center">
      <img src="docs/images/contrast.webp" alt="A colour-mapped surface with a stated range" width="100%"><br>
      <sub><b>Colour is data</b> — <code>colorMappedSurface</code> with a stated, clampable range. <a href="basics.html">Basics 24</a>.</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <img src="docs/images/electrostatics.webp" alt="An animatic deriving the field of a charged ball" width="100%"><br>
      <sub><b>Electric field of a charged ball</b> — a full animatic: the volume integral, then a Gauss-law check. <a href="electrostatics.html">Electrostatics</a>.</sub>
    </td>
    <td width="50%" align="center">
      <img src="docs/images/derivation.webp" alt="An animated derivation with growing brackets and a cancellation, beside the plot it explains" width="100%"><br>
      <sub><b>Typeset derivations</b> — brackets that grow, terms struck through, MathML that stays addressable. <a href="basics.html">Basics 25</a>.</sub>
    </td>
  </tr>
</table>

---

## Quick start

```sh
npm install
npm run dev        # build, then serve the gallery on http://localhost:5173
```

```ts
import { WebGPUView, Visual, LabelLayer, PlotLayer, functionCurve, plotFrame, rgba } from 'edena-web';

const view = await WebGPUView.create(canvas, { antialias: true });
view.camera.yaw = 0;
view.camera.pitch = 0;

const labels = new LabelLayer(labelHost, view.camera); // positioned over the canvas
const plot = new PlotLayer(view.world, labels,
  plotFrame([-4, 4], [-1.6, 1.6], { xTicks: 8, yTicks: 4 }));
view.world.add(new Visual(functionCurve(Math.sin, [-4, 4], 640, .018), rgba('#ffff00')));

(function frame() { labels.update(); view.render(); requestAnimationFrame(frame); })();
```

A view owns a device, a camera and a `World`. Add `Visual`s, mutate their transforms directly, and call
`view.render()` each frame — unchanged scenes are not resubmitted. Several views can share one device
and reuse its pipelines: `WebGPUView.create(otherCanvas, { device: view.device })`.

> Tested on Chrome Beta (Vulkan, AMD RX 6700 XT) and Firefox Nightly. WebGPU rendering needs a browser
> with **hardware acceleration enabled** — in Firefox, `layers.acceleration.disabled = true` renders
> WebGPU canvases blank.

---

## The showcase

Ten pages, each one a different way of using the same library:

| Page | What it is |
| --- | --- |
| **[Landing showcase](index.html)** | The interactive gallery: Fourier harmonic synthesis, value-coloured standing waves, Möbius strips, gyroid and two-ball isosurfaces, an orthographic/perspective camera, and a reversible cubic-lattice construction. |
| **[Basics](basics.html)** | The place to start. Twenty-five small demos, one library idea each, every panel naming the API it demonstrates. |
| **[Academy](academy.html)** | Twenty-two chapters that follow the mathematics into the implementation — each with a live lab, a measured claim, and a [companion chapter](docs/academy/README.md). |
| **[Physics lab](physics-lab.html)** | Kepler orbits, direct all-pairs GPU gravity, double pendulums, the Lorenz attractor, two-source wave interference, and a vibrating drumhead. |
| **[Crystal symmetry](symmetry.html)** | Drop in a POSCAR and a phonopy `symmetry.yaml`; watch rotations, mirrors, inversions and roto-reflections play on the structure. |
| **[Bloch bands](homework.html)** | A weak periodic potential, folded into a square Brillouin zone: bands, the X-point gap, Fermi-surface topology, the density of states and its van Hove logarithmic divergence. |
| **[GPU particles](particles.html)** | The 50K oscillator baseline beside direct `O(N²)` GPU gravity. |
| **[Electric field](electrostatics.html)** | A complete animatic deriving the field of a uniformly charged ball, including the volume integral and a Gauss-law check. |
| **[3D field](field.html)** | The smallest possible implicit-surface example. |
| **[Legacy](legacy.html)** | The archived first prototype, kept honest and retired. |

---

## The library

Everything is re-exported from `edena-web` (`src/index.ts`).

| Area | Main tools |
| --- | --- |
| **Geometry** | `lineSegments` (antialiased pixel-width strokes), `polyline`, `arrow`, `circle`, `sphere`, `shadedSphere`, `wireSphere`, `box`/`boxEdges`, `cylinder` (frustum, cone), `parametricSurface`, `functionCurve`, `functionSurface`, `merge` — closed solids wound outward, so a signed volume is positive |
| **Plotting** | `PlotLayer` (frame lifecycle and labels), `gridPlane`, `functionRange`, `plotFrame` (major and minor ticks, gridlines, axis titles, anchors carrying plain text *and* MathML), `areaUnder`, `lineThrough`, `secantSlope`, `axes3d`, `boundsBox`, `niceStep`, `tickValues`, `tickMath`, `formatTick` |
| **Fields & vectors** | `isosurface` (marching tetrahedra), `streamlines` (RK4), `sphereSeeds` |
| **Colour** | `ramp`, `viridis`, `plasma`, `colorMappedSurface` |
| **Scene graph** | `Visual`, `Group`, `World` — visibility, opacity, `remove(...nodes)`, transforms (`position`, `scale`, `rotation`, optional Euler `orientation`), `reveal`, and `orientationMatrix`/`applyMatrix` for the same maths outside the graph |
| **Camera & view** | Orbit controls, orthographic or perspective projection, MSAA, alpha mode, DPR cap, transformable `Text`, `MathText`, and `LabelLayer` text, and `onResize` so a demo can re-fit its camera |
| **Animation** | Absolute-time `Timeline` and `tween` |
| **Simulation** | `createParticleState`/`stepParticles`/`ParticleSimulation` (CPU, renderer-agnostic) and `GpuParticleSimulation` (ping-pong storage buffers, compute integration, instanced rendering, timestamps, reset, checksums) |
| **Crystal** | `parsePOSCAR`, `parsePhonopySymmetry`, `cellFromParameters`, `supercell`, `bonds`, `nearestNeighbours`, `latticePointGroup`, `mapsOntoSelf`, `siteMapping`, `symmetryOrbits`, `operationIsometry`/`isometryPoint`/`isometryTarget` |
| **Elements** | `ELEMENTS`, `appearanceFor` (CPK-brightened colours and covalent radii) |
| **Math text** | `mathml`/`mi`/`mn`/`mo`/`frac`/`sqrt`/`msub`/`msup`/`matrix`/`cases`/`vec`/`integral`/`summation`… plus `number` (real minus signs, grouped digits) and `latex('\\frac{a}{b}')` → native MathML |
| **Derivations** | `Derivation` — addressable tokens and *beats*: brackets that grow, terms struck through, colour changes and notes, playable or scrubbable |
| **Pointer picking** | `OrbitCamera.ray`, `rayPlane`, `rayDistance`, `screenDistance`, and `attachHandles`, a drag layer that locks the camera while a handle is held |

<details>
<summary><b>The twenty-five ideas in the basics tour</b></summary>

Each panel is a self-contained factory in [`src/examples/basics.ts`](src/examples/basics.ts) that builds
its own world and returns its own `update`, while the page gives them one device and one render loop.

| # | Idea | What it shows |
| --- | --- | --- |
| 01 | The frame | `axes3d`, `boundsBox`, ticks, a grid, projected labels, orthographic or perspective |
| 02 | Motion | one `Timeline`, three easings, absolute-time seeking |
| 03 | Volume | `box`/`sphere`/`cylinder` faces, per-face alpha, wire outlines, draw-order independence |
| 04 | Shape | the primitive set, ending in a `parametricSurface` and a 3D tumble |
| 05 | Hierarchy | `Group.add`, inherited transforms, opacity that multiplies down the tree |
| 06 | Text | `LabelLayer.addHTML` with MathML, transformable MathML scene text |
| 07 | Colour | per-vertex colour built into a `Geometry`, with `viridis`/`plasma`/`ramp` |
| 08 | Plotting | `plotFrame`, a `functionCurve`, and equation labels |
| 09 | Depth | opaque first, then translucent faces sorted back to front |
| 10 | Sharing | one `Geometry` scaled across hundreds of nodes, bucketed into one draw per geometry and colour |
| 11 | Camera | `yaw`, `pitch` and `distance` driven as a shot and scrubbed like a storyboard |
| 12 | Simulation | the CPU seam: `createParticleState`/`stepParticles` with an acceleration you write |
| 13 | Implicit surfaces | `isosurface` extracting `f(x, y, z) = level` inside a `boundsBox` |
| 14 | Vector fields | `streamlines` integrated with RK4 from `sphereSeeds`, with markers riding them |
| 15 | Story | four cues on one `Timeline`, group opacity and per-visual `reveal` |
| 16 | Diagram | `arrow` plus construction lines, named with the `vec` accent, restated in a readout |
| 17 | Path | a cubic Bézier sampled into a tube, with raw and eased parameters both printed |
| 18 | Normals | a height field sampled on a grid, normals drawn as a comb of arrows |
| 19 | Layers | three groups switched with `visible` |
| 20 | Chart | data scaled into one bar mesh, an axis from `tickValues`/`niceStep`, an eased sort |
| 21 | Follow | `camera.target` animated under a marker while the scene stands still |
| 22 | Transform | a node's own matrix read back and typeset as its scale, yaw and tilt change |
| 23 | Measure | a dimension line, its legs, an angle arc and three live labels |
| 24 | Colour map | `colorMappedSurface` sampling a field once, with a stated, clampable range |
| 25 | Derivation | `Derivation`: growing brackets, cancellations, colour changes, beat by beat, beside a plot that follows the algebra |

</details>

### Plotting, fields, particles

```ts
import { plotFrame, isosurface, colorMappedSurface, viridis, GpuParticleSimulation } from 'edena-web';

const frame = plotFrame([-3, 3], [-1, 1], { grid: true });
const surface = colorMappedSurface((x, y) => Math.sin(x) * Math.cos(y), [-3, 3], [-3, 3], viridis, [48, 48]);
const blob = isosurface((x, y, z) => 0.6 - Math.hypot(x, y, z), { min: [-1, -1, -1], max: [1, 1, 1] }, 0, 48);

const sim = await GpuParticleSimulation.create({ count: 50_000, mode: 'oscillator' });
```

`mode: 'nbody'` runs direct all-pairs gravity with softening and an optional disc layout — a raw
`O(N²)` reference path, capped at 32,768 bodies. The oscillator mode reaches 50,000 particles in the
benchmark page.

### Dragging and picking on the canvas

```ts
import { attachHandles } from 'edena-web';

const detach = attachHandles(canvas, view.camera, () => [
  { at: () => marker, radius: 30, plane: { normal: [0, 1, 0] }, cursor: 'grab', to: point => { marker = point; } },
]);
```

`at()` is read every frame, so a handle can ride a moving scene. `plane: 'view'` slides a handle in the
plane facing the reader; an explicit normal pins it, e.g. to a floor. Grabbing a handle sets
`camera.locked`, so orbiting and dragging never fight over the same gesture.

### Crystal workflow

The symmetry viewer accepts extensionless POSCAR files, VASP 4 and 5 layouts, positive or
target-volume scale factors, Direct or Cartesian positions, Selective Dynamics lines, and phonopy
symmetry files in nested, row-oriented or flat ten-number rotation formats. Files are parsed locally in
the browser: drop them anywhere on the page, or pick them from the card.

```ts
import { parsePOSCAR, parsePhonopySymmetry, operationIsometry, isometryPoint } from 'edena-web';

const structure = parsePOSCAR(await poscarFile.text());
const operations = parsePhonopySymmetry(await symmetryFile.text());

const isometry = operationIsometry(structure.lattice, operations[0]);
const halfway = isometryPoint(isometry, structure.positions[0], 0.5);   // identity at t = 0, the full map at t = 1
```

Tolerances are relative to the crystal, not to absolute units, so a POSCAR rounded to four decimals
keeps the symmetry it has while a genuinely sheared cell is still rejected. Improper operations are
reported and animated as the rotoreflection they are, `S(θ, n) = R(θ, n)·σ_n`: the whole rotation, then
the whole fold.

---

## Rendering behaviour

- **Opaque geometry writes depth**, so front surfaces occlude rear surfaces regardless of submission
  order. Transparent objects render afterward, test against solid depth, and blend back-to-front by
  projected origin; intersecting transparent meshes still need a more advanced technique, so use
  opaque materials for solid scientific plots.
Text can be added directly to a scene, without a label host:

```ts
import { MathText, Group } from 'edena-web';

const equation = new MathText('E = mc^2', { height: .5 });
const group = new Group().add(equation);
view.world.add(group);
group.position = [1, 0, 0];
group.orientation = [0, Math.PI / 4, 0];
group.scale = [2, 2, 2];
```

- **Unchanged scenes submit no GPU work.** Camera, transform, material, text and visibility changes
  trigger a redraw automatically; `view.render(true)` forces one.
- **Instance data stays on the GPU.** Static batches need no repeat uploads, camera motion updates only
  uniforms, and sparse transform changes upload only the changed interval. Mutating a node's `position`,
  `scale` or `orientation` array works — no dirty flag.
- **Text is a scene object.** `Text` and `MathText` lie in their local XY plane and inherit
  position, scale, orientation, opacity, and parent transforms like other visuals. Perspective
  changes their apparent size; geometry can occlude part of a glyph. Browser layout is cached in
  padded, shadow-free glyph textures whose raster resolution tracks the on-screen density in both
  directions: the texture is re-rendered when the projected size crosses a half-step bucket, so glyphs
  stay within a fraction of one texel per screen pixel and read crisply at any zoom, small or large.
  GPU-generated mipmaps and anisotropic filtering (16×) keep distant and oblique text smooth without
  rebuilding it as the camera moves.
  These are textured planes, not tessellated vector outlines. `text.setHTML(...)` and
  `mathText.setMath(...)` retain glyphs when their content is unchanged.
  `LabelLayer` also creates world text by default; pass `{ parent: group }` to attach a label to
  an object, or use `labels.object(element)` to change its scale and orientation.
  `{ faceCamera: true }` keeps text facing the camera while retaining world size and depth.
  `Text.faceCamera` can be changed at runtime; it is equivalent to `text.mode = '2d'`.
  `{ billboard: true }` explicitly keeps a label facing the screen at a fixed pixel size;
  `occlude: false` makes a DOM overlay. `keepInView` applies to billboards only.
- **Grid and contour strokes default to 1.8 CSS pixels**, with analytic edge antialiasing that stays
  consistent while zooming. Use `lineSegments(points, width)` or `gridPlane(x, y, options)` for guides;
  `plotFrame` accepts `gridWidth`. These strokes live in `Geometry.segments`, separate from triangles.
- **Slider-driven rebuilds are coalesced.** A drag can fire `input` several times a frame, and each
  event used to rebuild the same surface or field with one number changed. `coalesce(fn)` (exported by
  the library) folds rapid calls into one per animation frame with the latest arguments; the tours and
  labs route their function, field, colour and geometry sliders through it. The arithmetic is not the
  bottleneck — a 64×64 field is a few thousand evaluations — the cost was rebuilding geometry buffers
  and re-typesetting readouts per event, so the fix is at the event, not the maths.
- **Labels read from the page's label stylesheet.** The shared stylesheet sets
  `body .labels{font-size:clamp(12px,1.85cqw,17px)}`, and world text keeps its size in world units
  (larger labels are genuinely larger in the scene, not just on the DOM overlay). The glyph shader
  lifts coverage slightly (`alpha^0.8`) so thin, small strokes read brighter without a bolder face.
- **Whole-canvas 4× MSAA is enabled by default.** `antialias: 'high'` adds 2× supersampling on
  each axis (four times the pixels). Pass `?quality=high` to opt into supersampling in the demos; viewport-sized render
  targets are created when needed and released when a canvas leaves the viewport. Set `antialias: false` for the cheaper single-sample
  path, or specify `samples: 1 | 4` explicitly. The gallery and teaching tours also accept `?samples=1&dpr=1`.
- **2D is an element mode.** Set `visual.mode = '2d'` or `group.mode = '2d'` to keep the local XY
  plane facing the camera. The origin, axis lengths, perspective size, opacity and depth remain
  part of the scene; child transforms still work inside a 2D group. Use `mode = '3d'` for normal
  world orientation. For a whole flat plot, set `view.camera.mode = '2d'`: this locks a front-facing
  orthographic view, with drag-to-pan and wheel-to-zoom. The library default remains `'3d'`.
- **Canvas-first demo controls.** The shared `canvas-ui.js` and `canvas-ui.css` place native,
  keyboard-accessible controls in reserved side columns beside the drawing viewport. Controls
  collapse on phones, while explanatory notes live in expandable sections. Input widgets remain
  native HTML and never cover the plot. See [Text in space](text.html) for text transforms,
  camera-facing orientation, depth and mathematical typography.
- **PlotLayer owns the frame and its labels.** `plot.update(plotFrame(...))` replaces the frame without
  accumulating old nodes or textures. Unchanged tick text keeps its existing glyphs and scene objects. `plot.dispose()` removes it; `labels.remove(...nodes)` releases
  individual annotations. For custom styling, `labels.addAnchors(frame.labels)` applies the library's
  tick alignment and pixel gaps.
- The renderer is intentionally **unlit** at this stage. Colour ramps, geometry, camera motion,
  antialiasing and depth-tested labels carry the visual language.

---

## Performance

Measurements on Chrome Beta with Vulkan and an AMD RX 6700 XT. They are guidance, not guarantees; see
[the performance report](docs/performance.md) for reproducible CPU, rendering and text benchmarks.

| Workload | Result |
| --- | --- |
| Landing showcase | 60 FPS, four views, ~123K triangles |
| Crystal symmetry viewer | Painted in ~0.2 s; 60 FPS from 1×1×1 to a 1,600-atom cell; a 400-atom POSCAR loads in ~0.5 s and a 1,600-atom one in ~1.1 s |
| Physics laboratory | 60 FPS, six views, ~54K triangles |
| GPU oscillator | 50,000 particles, ~0.022 ms GPU integration per step |
| GPU direct n-body | 8,192 bodies ≈ 0.5 ms/step; 32,768 ≈ 3.7 ms/step |
| Isosurface extraction | 250,000-sample budget; 48³ two-ball field ≈ 110 ms CPU |

Default budgets throw when exceeded: isosurfaces allow 250,000 grid samples, surfaces 250,000 quads,
curves 100,000 samples, and polylines 100,000 points. CPU field extraction blocks the frame that
requests it, so precompute or lower resolution for interactive controls.

---

## Development

```sh
npm install
npm run typecheck   # tsc -p tsconfig.library.json --noEmit
npm test            # build, then node --test tests/*.test.mjs
npm run build       # compile the library, showcase and demos into build/
npm run dev         # build, then serve the gallery on http://localhost:5173
```

The browser checks need Chrome on a debugging port and the dev server (`node scripts/serve.mjs`):

```sh
node scripts/check-links.mjs             # every page's links, scripts and route to the tour — no browser
node scripts/check-pages.mjs [port]      # every page loads, draws every canvas, and stays quiet
node scripts/check-basics.mjs [port]     # the basics tour: twenty-five demos, every control, every assertion
node scripts/check-academy.mjs [port]    # twenty-two chapters, every control, the simulation
node scripts/check-depth.mjs [port]      # renderer depth and the crystal viewer, pixel by pixel
node scripts/check-renderer.mjs [port]   # buffer reuse, idle frames, sparse uploads, labels, resize
node scripts/check-visual-quality.mjs [port] # line AA, glyph overhang, tick alignment, plot lifecycle
node scripts/check-workspace.mjs [port] # project selection, one visible canvas, tight-binding views
node scripts/check-demo-layout.mjs [port] # side columns at desktop/phone widths, text notation
node scripts/check-view-modes.mjs [port] # distant text filtering, 2D elements/camera, high AA
node scripts/check-text-updates.mjs [port] # changing/empty text, texture reuse, shared pipelines
node scripts/check-text-transform.mjs [port] # parent transforms, perspective, texture reuse
node scripts/check-text-depth.mjs [port] # partial text occlusion, MathML, styling, texture reuse
node scripts/check-transparency.mjs [port] # alpha ordering, instancing and wireframe separation
node scripts/check-particles.mjs [port]  # GPU results against a CPU force reference
node scripts/benchmark.mjs [port]        # rendering, text and GPU medians
```

`check-basics` captures from the compositor and measures the regions back inside the page, because a
WebGPU canvas cannot be read once it has been presented. It asserts that each demo draws something
distinct, that each control moves its own stage and no other, that each spin button holds the picture
still and starts it again, that the helix, the timeline and the simulation advance, and that nothing
logs an error. Disconnecting any single control makes it fail.

---

## Roadmap

The project is early and intentionally focused. PDE solvers, spatial interaction structures, lighting
and material systems, richer text layout, SVG import and broader Manim feature coverage remain future
work — see [VISUALIZATION_LIBRARY_PLAN.md](VISUALIZATION_LIBRARY_PLAN.md).

## License

ISC.
