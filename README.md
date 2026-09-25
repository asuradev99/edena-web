# Edena

Edena is a TypeScript/WebGPU library for mathematical visualization, scientific animation, and GPU-resident simulation. Geometry stays reusable, simulation state can stay on the GPU, and the same primitives can power a polished explainer or a high-throughput experiment.

The visual language is inspired by mathematical animation: dark stages, restrained typography, bright semantic colors, and motion that explains an idea.

## Explore the showcase

```sh
npm install
npm run dev
```

Open [http://localhost:5173/](http://localhost:5173/). The landing page is an interactive gallery with Fourier harmonic synthesis, value-colored standing waves, Viridis and Plasma ramps, Möbius strips, torus and gyroid surfaces, orthographic/perspective camera controls, and a reversible cubic-lattice construction with atoms, bonds, labels, and a timeline.

Dedicated demos:

- [Physics laboratory](physics-lab.html): Kepler orbits, direct all-pairs GPU gravity, double pendulums, the Lorenz attractor, wave interference, and a vibrating drumhead.
- [Crystal symmetry](symmetry.html): upload a POSCAR/CONTCAR and phonopy `symmetry.yaml`, then watch each rotation, mirror, inversion and roto-reflection play on the structure — bonds, periodic neighbours, orbit trails and a live site-mapping report.
- [GPU particles](particles.html): compare the 50K oscillator baseline with direct O(N²) GPU gravity.
- [Electric-field animatic](electrostatics.html): a complete visual derivation for a uniformly charged ball, including the volume integral and a Gauss-law check.
- [3D field explorer](field.html): an isolated implicit-surface example.

## Crystal workflow

The symmetry viewer accepts extensionless POSCAR files, VASP 4 and VASP 5 layouts, positive or target-volume scale factors, Direct or Cartesian positions, Selective Dynamics lines, and phonopy symmetry files in nested, row-oriented, or flat nine-number rotation formats. Files are parsed locally in the browser.

```ts
import { parsePOSCAR, parsePhonopySymmetry } from 'edena-web';

const structure = parsePOSCAR(await poscarFile.text());
const operations = parsePhonopySymmetry(await symmetryFile.text());
console.log(structure.species, structure.positions.length);
console.log(operations[0].rotation, operations[0].translation);
```

The viewer draws the cell centred on a lattice point rather than on a corner, because every point-group element passes through the origin: with the origin in the middle of the picture the drawn axis or mirror plane is where the crystal actually turns, and no atom sweeps around the edge of the box. `isometryTarget` only nudges an atom by a lattice vector when its image leaves the cell, which never happens for a cubic cell.

The stage is camera-only: drag to orbit, scroll to zoom, double-click (or `F`) to put the camera back where it started. Space plays the selected operation, the arrows scrub it, `[` and `]` step through the list and `R` returns to the start.

```ts
import { operationIsometry, isometryPoint, isometryTarget } from 'edena-web';

const isometry = operationIsometry(structure.lattice, operation);
const atHalfway = isometryPoint(isometry, start, 0.5);   // the identity at t = 0, the full map at t = 1
const resting = isometryTarget(isometry, start, structure.lattice);
```

Improper operations are reported as the rotoreflection they are, `S(θ, n) = R(θ, n)·σ_n`, and every animation performs exactly the move its matrix expresses rather than an interpolation invented for the occasion. A rotation turns about the operation's own axis; a mirror slides straight through its plane; an inversion slides straight through the centre; and a roto-reflection runs as two moves in sequence — the whole rotation, then the whole fold. At the halfway point of a roto-reflection the rotation is complete and the fold has not begun, so the label can name both moves in the order they play.

## Library quick start

```ts
import { WebGPUView, Visual, functionCurve, rgba } from 'edena-web';

const view = await WebGPUView.create(canvas);
view.camera.yaw = 0;
view.camera.pitch = 0;
view.world.add(new Visual(functionCurve(Math.sin, [-Math.PI, Math.PI], 320), rgba('#58c4dd')));

function frame() { view.render(); requestAnimationFrame(frame); }
frame();
```

The public entry point exports:

| Area | Main tools |
| --- | --- |
| Geometry | `polyline`, `arrow`, `circle`, `sphere`, `wireSphere`, `parametricSurface`, `functionCurve`, `functionSurface`, `merge` |
| Plotting | `plotFrame`, `axes3d`, `boundsBox`, `niceStep`, `tickValues`, `formatTick` |
| Fields | `isosurface` for CPU marching-tetrahedra extraction |
| Color | `ramp`, `viridis`, `plasma`, `colorMappedSurface` |
| Scene graph | `Visual`, `Group`, `World`, visibility, opacity, transforms, reveal progress |
| Camera/view | Orbit controls, orthographic or perspective projection, MSAA, alpha mode, DPR cap, projected `LabelLayer` text |
| Animation | Absolute-time `Timeline` and `tween` helpers |
| CPU simulation | `createParticleState`, `stepParticles`, `ParticleSimulation` |
| GPU simulation | `GpuParticleSimulation` with ping-pong storage buffers, compute integration, instanced rendering, timestamp timing, reset, and checksums |
| Crystal data | `parsePOSCAR`, `parsePhonopySymmetry` |
| Crystal geometry | `cellFromParameters`, `fractionalToCartesian`/`cartesianToFractional`, `supercell`, `latticeSites`, `bonds`, `nearestNeighbours`, `millerPlane`, `latticePointGroup`, `mapsOntoSelf`, `siteMapping`, `symmetryOrbits`, `operationIsometry`/`isometryPoint`/`isometryTarget` |
| Elements | `ELEMENTS`, `appearanceFor` (CPK-brightened colors and covalent radii) |
| Math text | `mathml`, `mi`, `mn`, `mo`, `frac`, `msub`, `msup`, `matrix`, … and `LabelLayer.addHTML` to typeset them over the canvas |

### Plotting and fields

```ts
import { plotFrame, isosurface, colorMappedSurface, viridis } from 'edena-web';

const frame = plotFrame([-3, 3], [-1, 1], { grid: true });
const surface = colorMappedSurface((x, y) => Math.sin(x) * Math.cos(y), [-3, 3], [-3, 3], viridis, [48, 48]);
const blob = isosurface((x, y, z) => 0.6 - Math.hypot(x, y, z), { min: [-1, -1, -1], max: [1, 1, 1] }, 0, 48);
```

### Animation

```ts
import { Timeline } from 'edena-web';

const timeline = new Timeline(4).add({ start: 0, duration: 3, update: progress => visual.reveal = progress });
timeline.play();
let previous = performance.now();
function animate(now: number) {
  timeline.tick((now - previous) / 1000);
  previous = now;
  view.render();
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
```

### CPU particles

```ts
import { createParticleState, ParticleSimulation } from 'edena-web';

const state = createParticleState([0, 0, 0], 3, [1, 0, 0]);
const simulation = new ParticleSimulation(state);
simulation.step(1 / 60, () => [0, -9.81, 0]);
simulation.reset();
```

The callback returns acceleration, not force. Position and velocity buffers are mutated in place; the callback receives reusable private arrays. The seam is renderer-agnostic.

### GPU particles

```ts
import { GpuParticleSimulation } from 'edena-web';

const simulation = await GpuParticleSimulation.create({ count: 50_000, mode: 'oscillator' });
simulation.setCamera(viewProjection, canvas.width, canvas.height);
const encoder = simulation.device.createCommandEncoder();
simulation.step(encoder);
const pass = encoder.beginRenderPass({ colorAttachments: [{ view, loadOp: 'clear', storeOp: 'store' }] });
simulation.render(pass);
pass.end();
simulation.device.queue.submit([encoder.finish()]);
```

`mode: 'nbody'` runs direct all-pairs gravity with softening and an optional disc layout. It is intentionally a raw O(N²) reference path: on the development GPU, 8,192 bodies take about 0.5 ms/step, 32,768 about 3.7 ms/step, and 50,000 about 8 ms/step. The simple oscillator mode reaches 50,000 particles at 60 FPS in the benchmark page.

## Rendering behavior

Opaque geometry writes depth, so front surfaces occlude rear surfaces regardless of submission order. Transparent objects render afterward, test against solid depth, and blend back-to-front by projected object origin. Intersecting transparent meshes still need a more advanced transparency technique; use opaque materials for solid scientific plots.

The renderer is intentionally unlit at this stage. Color ramps, geometry, camera motion, antialiasing, and DOM-projected labels provide the visual language. `GpuParticleSimulation` uses its own no-depth sprite path because 50,000 soft, unsorted particles should not hard-occlude one another.

## Performance and limits

Measurements were taken on Chrome Beta with Vulkan and an AMD RX 6700 XT. They are guidance, not guarantees.

| Workload | Result |
| --- | --- |
| Landing showcase | 60 FPS, four views, about 123K triangles |
| Crystal symmetry viewer | 60 FPS at 1×1×1 through 3×3×3 perovskite (135 atoms, 129 moving sites, one merged trail draw); a 400-atom POSCAR loads in ~0.5 s; choosing an operation rebuilds in ~4 ms, ~30 ms at 3×3×3 |
| Physics laboratory | 60 FPS, six views, about 54K triangles |
| GPU oscillator | 50,000 particles, about 0.022 ms GPU integration per step |
| GPU direct n-body | 8,192 bodies ≈ 0.5 ms/step; 32,768 ≈ 3.7 ms/step |
| Isosurface extraction | 250,000 sample budget; 48³ two-ball field ≈ 110 ms CPU extraction |

Default budgets throw when exceeded: isosurfaces allow 250,000 grid samples, surfaces allow 250,000 quads, curves allow 100,000 samples, and polylines allow 100,000 points. CPU field extraction blocks the frame that requests it, so precompute or lower resolution for interactive controls.

The crystal viewer bonds cells up to 1,200 atoms (beyond that it draws atoms without bonds) and draws at most 1,600 atoms per supercell. Bond finding, the nearest-neighbour distance, the atom mesh and the symmetry-orbit computation describe the crystal rather than the selected operation, so they are computed once and reused as the operation changes; only the orbit arcs, which are per operation, are rebuilt each time.

## Development

```sh
npm install
npm run dev
npm run typecheck
npm test
npm run build
```

WebGPU rendering requires a compatible browser with hardware acceleration. Chrome Beta on Vulkan is the verification path used for the demos. Use `?dpr=1` or `?samples=1` on the showcase when testing a slower adapter.

The project is early and intentionally focused. PDE solvers, spatial interaction structures, lighting/material systems, richer text layout, SVG import, and broader Manim feature coverage remain future work. See [VISUALIZATION_LIBRARY_PLAN.md](VISUALIZATION_LIBRARY_PLAN.md) for the roadmap.
