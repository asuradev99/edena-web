/**
 * Academy: six interactive chapters on how Edena turns maths into pixels.
 *
 * The page is wiring. Every number a chapter *claims* is computed by `academy-model.ts`, which has
 * no DOM and no WebGPU, so it can be unit-tested; each panel here only reads a control, calls the
 * model or the public library, and paints the result. One device serves every panel, the render
 * loop skips the panels below the fold, and a panel that throws is reported once and then left
 * alone — the same structure as `basics.ts`, deliberately, because that is the pattern the docs
 * point a reader at.
 */
import {
  WebGPUView, LabelLayer, Group, Visual,
  box, boxEdges, polyline, arrow, shadedSphere, wireSphere,
  functionSurface, functionCurve, colorMappedSurface, ramp, viridis, plasma, rgba,
  createParticleState, stepParticles,
  axes3d, plotFrame, niceStep, tickValues, formatTick,
  Timeline, tween, smooth, lerp, applyMatrix, sphere, parametricSurface,
  isosurface, streamlines, sphereSeeds,
  mathml, mi, mn, mo, mtext, row, number, matrix, brackets, frac, msup, msub, subsup, sqrt, mroot,
  cases, integral, differential, paren, limit, areaUnder, lineThrough, secantSlope, latex,
  Derivation, checkStep, strikeRuns, attachHandles, screenDistance,
  parsePOSCAR, parsePhonopySymmetry, appearanceFor,
  type M, type DerivationStep, type Vec3, type Rgb, Geometry,
} from '../index.js';
import {
  CPU_BUDGET, surfaceCost, fieldCost, relativeSize, normalise, clamped,
  decaySolution, finalAbsoluteError, observedOrder, harmonicEnergy,
  SYMMETRY_OPERATIONS, operationNamed, orbitReport, centredAtoms, structureFor, displaced, structureBounds,
  type LatticeChoice, type Integrator,
} from './academy-model.js';

const $ = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node as T;
};

const status = $('status');
const stats = $('stats');
const params = new URLSearchParams(location.search);
const msaa = params.get('samples') === '1' ? 1 : 4;
const maxDpr = params.has('dpr') ? Number(params.get('dpr')) : 2;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * A chapter's lab. Most own a WebGPU canvas and a `LabelLayer`; two of them (typesetting and the
 * derivation) are pure DOM, so `labels` is optional and `Panel.view` is undefined for those.
 */
type Demo = { update(delta: number, clock: number): void; labels?: LabelLayer };
type Panel = { demo: Demo; view?: WebGPUView; time?: number };
const panels: Panel[] = [];
const views: WebGPUView[] = [];
const broken = new Set<Demo>();
const onScreen = new Set<WebGPUView>();
let observer: IntersectionObserver | undefined;
let disposed = false, frame = 0, last = 0, timer = 0;
const samples: number[] = [];

function report(message: string): void {
  console.error(message);
  status.textContent = message;
  status.hidden = false;
  stats.hidden = true;
}

const tag = (text: string): string => mathml(mtext(text));
/** A number at a fixed number of decimals, typeset with a real minus sign and grouped digits. */
const num = (value: number, digits = 2): string => mathml(number(value, digits));

function look(view: WebGPUView, yaw: number, pitch: number, distance: number): void {
  view.camera.projection = 'perspective';
  view.camera.yaw = yaw;
  view.camera.pitch = pitch;
  view.camera.distance = distance;
}

/** Shared surface height fields, so the mesh and colour chapters can agree on what they draw. */
const FIELDS: Record<string, (x: number, y: number) => number> = {
  ripple: (x, y) => { const r = Math.hypot(x, y); return 1.25 * Math.sin(2.6 * r) / (1 + .6 * r); },
  saddle: (x, y) => (x * x - y * y) / 12,
  waves: (x, y) => .55 * (Math.sin(1.4 * x) + Math.cos(1.6 * y)),
  well: (x, y) => { const r = Math.hypot(x, y); return 1.15 * Math.exp(-r * r / 7) * Math.cos(1.5 * r) + .25 * Math.sin(2.2 * x); },
};

/* --------------------------------------------------------------------------------------------
 * 01 · Coordinate spaces, and why perspective is a division.
 * ------------------------------------------------------------------------------------------ */

function projectionDemo(view: WebGPUView): Demo {
  const labels = new LabelLayer($('projection-labels'), view.camera);
  const camera = view.camera;
  camera.projection = 'orthographic';
  // Yawed, not head-on: a rail straight down the view axis collapses to a single bar and hides the
  // recession the panel is about. At this yaw the five boxes spread across the stage.
  camera.yaw = .85;
  camera.pitch = .26;
  camera.target = [0, 0, -3.2];
  camera.height = 6.2;
  camera.distance = 10;
  camera.fovY = Math.PI / 4;

  // Five identical boxes receding along the view axis. Nothing about them changes; only their
  // distance does, so any difference on screen comes from the projection itself.
  const nearZ = 0, farZ = -7.2, spacing = 1.8;
  const cubes: Visual[] = [];
  for (let z = nearZ; z >= farZ; z -= spacing) {
    const cube = new Visual(box([-.35, -.35, -.35], [.35, .35, .35]), rgba('#80d4df', .9));
    cube.position = [0, 0, z];
    cubes.push(cube);
    view.world.add(cube);
  }
  // A rail under them, so the recession is unambiguous.
  view.world.add(new Visual(polyline([[0, -.75, nearZ], [0, -.75, farZ]], .012), rgba('#7a8fa6', .5)));

  const nearAnchor: Vec3 = [0, .62, nearZ];
  const farAnchor: Vec3 = [0, .62, farZ];
  const nearLabel = labels.addHTML(tag('near'), () => nearAnchor, '#80d4df', 'math-label');
  const farLabel = labels.addHTML(tag('far'), () => farAnchor, '#80d4df', 'math-label');

  const mode = $<HTMLSelectElement>('projection-mode');
  const distance = $<HTMLInputElement>('projection-distance');
  const readout = $('projection-readout');
  let size: [number, number] = [640, 400];

  const back: Vec3 = [0, 0, 0];
  const eyeFor = (): Vec3 => {
    back[0] = Math.sin(camera.yaw) * Math.cos(camera.pitch);
    back[1] = Math.sin(camera.pitch);
    back[2] = Math.cos(camera.yaw) * Math.cos(camera.pitch);
    return [camera.target[0] + back[0] * camera.distance, camera.target[1] + back[1] * camera.distance, camera.target[2] + back[2] * camera.distance];
  };
  const depthOf = (z: number): number => {
    const eye = eyeFor();
    return Math.hypot(eye[0], eye[1], eye[2] - z);
  };
  /**
   * Height on screen of the same cube at depth z, measured through the real camera. Height, not
   * width: the rail is yawed, so a horizontal segment lies oblique to the view and perspective
   * keystones it, which contaminates the 1/depth reading. A vertical segment keeps both endpoints
   * at almost the same depth, so this isolates the law the chapter is about.
   */
  const pixelHeight = (z: number): number => {
    const [w, h] = size;
    const bottom = camera.project([0, -.35, z], w, h);
    const top = camera.project([0, .35, z], w, h);
    return Math.hypot(top[0] - bottom[0], top[1] - bottom[1]);
  };

  const refresh = (): void => {
    // Move the camera first, then measure — the reading has to describe the picture that is drawn.
    camera.distance = Number(distance.value);
    if (camera.projection === 'orthographic') camera.height = Math.max(2.4, camera.distance * .56);
    const near = pixelHeight(nearZ), far = pixelHeight(farZ);
    nearLabel.style.color = near > far + .5 ? '#80d4df' : '#f1d087';
    farLabel.style.color = far > near + .5 ? '#80d4df' : '#f1d087';
    const ratio = far > 0 ? near / far : 0;
    readout.textContent = `near ${near.toFixed(1)} px · far ${far.toFixed(1)} px · ratio ${ratio.toFixed(2)}× · `
      + (camera.projection === 'perspective'
        ? `1/depth: ${(depthOf(farZ) / depthOf(nearZ)).toFixed(2)}×`
        : `orthographic: ${relativeSize(depthOf(nearZ), depthOf(farZ), 'orthographic').toFixed(2)}×`);
  };

  mode.addEventListener('change', () => {
    camera.projection = mode.value === 'perspective' ? 'perspective' : 'orthographic';
    if (camera.projection === 'perspective') { camera.distance = Number(distance.value); camera.fovY = Math.PI / 4; }
    else camera.height = Math.max(2.4, Number(distance.value) * .56);
    refresh();
  });
  distance.addEventListener('input', refresh);
  view.onResize = (w, h) => { size = [w, h]; refresh(); };
  refresh();

  return { labels, update: () => {} };
}

/* --------------------------------------------------------------------------------------------
 * 02 · CPU geometry: a mesh is arithmetic before it is pixels.
 * ------------------------------------------------------------------------------------------ */

function meshDemo(view: WebGPUView): Demo {
  const labels = new LabelLayer($('mesh-labels'), view.camera);
  {
    const camera = view.camera;
    camera.projection = 'orthographic';
    camera.yaw = .62;
    // A taller pitch looks down on the surface instead of along it; the geometry is a landscape
    // (functionSurface puts height on +y), and an edge-on view hides the very mesh being counted.
    camera.pitch = .68;
    camera.target = [0, 0, 0];
    camera.height = 8.8;
  }

  const kind = $<HTMLSelectElement>('mesh-kind');
  const resolution = $<HTMLInputElement>('mesh-resolution');
  const readout = $('mesh-readout');
  const probe = $<HTMLButtonElement>('mesh-probe');
  const probeStatus = $('mesh-probe-status');

  // The same grid, but coloured by height. The renderer is unlit, so a single-colour height field
  // reads as a flat silhouette from every angle; a two-stop ramp restores the form. Ranges and
  // custom palettes are chapter 03's subject; here the ramp is fixed and white is the tint.
  const meshRamp = ramp([0, [.15, .35, .45] as Rgb], [1, [.62, .92, .98] as Rgb]);
  const mesh = new Visual(colorMappedSurface(FIELDS.ripple, [-3, 3], [-3, 3], meshRamp, [40, 40]), rgba('#ffffff'));
  view.world.add(mesh);

  /** The isosurface boundary, quoted beside the surface one because they are not the same number. */
  const fieldNote = (() => {
    const last = fieldCost(61), over = fieldCost(62);
    return `isosurface instead caps samples: ${last.resolution.join('×')} is ${last.samples.toLocaleString()} (legal), `
      + `${over.resolution.join('×')} is ${over.samples.toLocaleString()} (over)`;
  })();

  const rebuild = (): void => {
    const res = Number(resolution.value);
    const cost = surfaceCost(res);
    const started = performance.now();
    mesh.geometry = colorMappedSurface(FIELDS[kind.value], [-3, 3], [-3, 3], meshRamp, [res, res]);
    const built = performance.now() - started;
    readout.textContent = `${cost.columns}×${cost.rows} samples → ${cost.quads.toLocaleString()} quads `
      + `(${cost.triangles.toLocaleString()} triangles) · built in ${built.toFixed(1)} ms`;
    probeStatus.textContent = `surfaces cap ${CPU_BUDGET.toLocaleString()} quads, so a square grid is legal to 500×500 · ${fieldNote}`;
  };
  kind.addEventListener('change', rebuild);
  resolution.addEventListener('input', rebuild);
  // The honest way to show the guard: ask for one step past the budget and print the library's own
  // refusal. The guard fires before any sampling, so this cannot hang the page.
  probe.addEventListener('click', () => {
    const over = surfaceCost(501);
    try {
      functionSurface(FIELDS.waves, [-3, 3], [-3, 3], [501, 501]);
      probeStatus.textContent = `501×501 has ${over.quads.toLocaleString()} quads — the guard did not fire, which is a bug.`;
    } catch (error) {
      probeStatus.textContent = `501×501 has ${over.quads.toLocaleString()} quads → ${error instanceof Error ? error.message : String(error)}`;
    }
  });
  rebuild();

  return { labels, update: () => {} };
}

/* --------------------------------------------------------------------------------------------
 * 03 · Colour is data: a colormap is a function, and a range is a choice.
 * ------------------------------------------------------------------------------------------ */

function colourDemo(view: WebGPUView): Demo {
  const labels = new LabelLayer($('colour-labels'), view.camera);
  {
    const camera = view.camera;
    camera.projection = 'orthographic';
    camera.yaw = .7;
    camera.pitch = .28;
    camera.target = [0, 0, 0];
    camera.height = 8.2;
  }
  const domain: [number, number] = [-3.3, 3.3];
  const palettes: Record<string, (t: number) => Rgb> = {
    viridis,
    plasma,
    terrain: ramp([0, [.09, .24, .45] as Rgb], [.5, [.2, .62, .36] as Rgb], [1, [.98, .95, .86] as Rgb]),
    ember: ramp([0, [.05, .03, .06] as Rgb], [.55, [.85, .3, .1] as Rgb], [1, [1, .95, .7] as Rgb]),
  };
  const mapSelect = $<HTMLSelectElement>('colour-map');
  const low = $<HTMLInputElement>('colour-low');
  const high = $<HTMLInputElement>('colour-high');
  const readout = $('colour-readout');

  const surface = new Visual(colorMappedSurface(FIELDS.well, domain, domain, viridis, [48, 48], [-1, 1]), rgba('#ffffff'));
  view.world.add(surface);

  const rebuild = (): void => {
    let lo = Number(low.value), hi = Number(high.value);
    if (hi <= lo) { hi = lo + .05; high.value = String(hi); }
    const palette = palettes[mapSelect.value] ?? viridis;
    surface.geometry = colorMappedSurface(FIELDS.well, domain, domain, palette, [48, 48], [lo, hi]);
    // How much of the field the chosen range pins to an end, measured on the same domain a reader sees.
    let pinned = 0, total = 0, min = Infinity, max = -Infinity;
    for (let i = 0; i <= 40; i++) for (let j = 0; j <= 40; j++) {
      const value = FIELDS.well(domain[0] + (domain[1] - domain[0]) * i / 40, domain[0] + (domain[1] - domain[0]) * j / 40);
      total++;
      if (value < min) min = value;
      if (value > max) max = value;
      const t = normalise(value, [lo, hi]);
      if (clamped(value, [lo, hi]) || t === 0 || t === 1) pinned++;
    }
    const auto = `sampled range ${min.toFixed(2)} … ${max.toFixed(2)}`;
    readout.textContent = `range [${lo.toFixed(2)}, ${hi.toFixed(2)}] · `
      + `${(100 * pinned / total).toFixed(0)}% of samples pinned to an end · ${auto}`;
  };
  mapSelect.addEventListener('change', rebuild);
  low.addEventListener('input', rebuild);
  high.addEventListener('input', rebuild);
  rebuild();

  return { labels, update: () => {} };
}

/* --------------------------------------------------------------------------------------------
 * 04 · Integration: two methods, one exact answer, and the order you can measure.
 * ------------------------------------------------------------------------------------------ */

function integrationDemo(view: WebGPUView): Demo {
  const labels = new LabelLayer($('integration-labels'), view.camera);
  const domain: [number, number] = [0, 2];
  const yRange: [number, number] = [0, 1.12];
  const rate = 1;
  const fit = (): void => {
    const canvas = $<HTMLCanvasElement>('integration-canvas');
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    view.camera.projection = 'orthographic';
    view.camera.yaw = 0;
    view.camera.pitch = 0;
    // Frame the domain, not the world origin: this chart runs from t = 0 to t = 2, so the origin is
    // its left edge and targeting it would push the whole plot into the right half of the stage.
    view.camera.target = [(domain[0] + domain[1]) / 2, (yRange[0] + yRange[1]) / 2, 0];
    view.camera.height = Math.max(yRange[1] - yRange[0] + .9, (domain[1] - domain[0] + .5) / aspect);
  };
  const chart = plotFrame(domain, yRange, {
    xTicks: 4, yTicks: 5, minor: 5,
    xTitle: mi('t'), yTitle: row(mi('y'), mo('('), mi('t'), mo(')')),
  });
  view.world.add(
    new Visual(chart.minorGrid, rgba('#e8f0f6', .06)),
    new Visual(chart.grid, rgba('#e8f0f6', .11)),
    new Visual(chart.minor, rgba('#e8f0f6', .28)),
    new Visual(chart.ticks, rgba('#e8f0f6', .42)),
    new Visual(chart.axes, rgba('#e8f0f6', .8)),
  );
  for (const anchor of chart.labels) labels.addHTML(mathml(anchor.math ?? mtext(anchor.text)), () => anchor.position, '#93a6b8', 'math-label');
  for (const anchor of chart.titles) labels.addHTML(mathml(anchor.math ?? mtext(anchor.text)), () => anchor.position, '#cfe4ea', 'math-label');

  const exact = new Visual(functionCurve(t => Math.exp(-rate * t), domain, 160, .02), rgba('#e8f0f6', .95));
  const euler = new Visual(polyline([[0, 1, 0], [2, Math.exp(-2), 0]], .022), rgba('#ff9a9a'));
  const rk4 = new Visual(polyline([[0, 1, 0], [2, Math.exp(-2), 0]], .022), rgba('#7fe0b0'));
  view.world.add(exact, euler, rk4);

  const select = $<HTMLSelectElement>('integration-dt');
  const readout = $('integration-readout');

  const curve = (sample: ReturnType<typeof decaySolution>): Geometry => {
    const points: Vec3[] = sample.t.map((t, index) => [t, sample.y[index], 0]);
    return polyline(points, .022);
  };
  const errorAt = (stepSize: number, method: Integrator): number => {
    const steps = Math.max(1, Math.round(2 / stepSize));
    return finalAbsoluteError(decaySolution(rate, stepSize, steps, method));
  };

  const refresh = (): void => {
    const dt = Number(select.value);
    const steps = Math.max(1, Math.round(2 / dt));
    const eulerSample = decaySolution(rate, dt, steps, 'euler');
    const rk4Sample = decaySolution(rate, dt, steps, 'rk4');
    euler.geometry = curve(eulerSample);
    rk4.geometry = curve(rk4Sample);
    const eulerError = finalAbsoluteError(eulerSample);
    const rk4Error = finalAbsoluteError(rk4Sample);
    const eulerOrder = observedOrder(errorAt(dt * 2, 'euler'), eulerError);
    const rk4Order = observedOrder(errorAt(dt * 2, 'rk4'), rk4Error);
    readout.textContent = `dt ${dt.toFixed(4)} · ${steps} steps · `
      + `Euler ${eulerError.toExponential(2)} (order ${eulerOrder.toFixed(2)}) · `
      + `RK4 ${rk4Error.toExponential(2)} (order ${rk4Order.toFixed(2)})`;
  };
  select.addEventListener('change', refresh);
  view.onResize = fit;
  fit();
  refresh();

  return { labels, update: () => {} };
}


/* --------------------------------------------------------------------------------------------
 * 05 · The simulation seam: the same integrator on the CPU and on the GPU.
 * ------------------------------------------------------------------------------------------ */

function simulationDemo(view: WebGPUView): Demo {
  const labels = new LabelLayer($('simulation-labels'), view.camera);
  const camera = view.camera;
  camera.projection = 'orthographic';
  camera.yaw = .55;
  camera.pitch = .46;
  camera.target = [0, 0, 0];
  camera.height = 4.2;

  const group = new Group();
  view.world.add(group);
  const ball = shadedSphere(.05);
  const tint = ramp([0, [.5, .83, .88] as Rgb], [1, [.95, .82, .53] as Rgb]);

  const countSelect = $<HTMLSelectElement>('simulation-count');
  const substepSelect = $<HTMLSelectElement>('simulation-substeps');
  const playButton = $<HTMLButtonElement>('simulation-play');
  const readout = $('simulation-readout');

  const stiffness = 1;
  let state = createParticleState([0, 0, 0], 3);
  let particles: Visual[] = [];
  let initialEnergy = 1;
  let stepMs = 0, rate = 0;
  let playing = !reducedMotion;

  const button = (): void => {
    playButton.textContent = playing ? 'Pause' : 'Play';
    playButton.setAttribute('aria-pressed', String(playing));
  };

  const build = (count: number): void => {
    group.clear();
    particles = [];
    const positions: number[] = [], velocities: number[] = [];
    for (let index = 0; index < count; index++) {
      const radius = .5 + 1.05 * Math.sqrt((index + .5) / count);
      const angle = index * 2.399963229728653;
      positions.push(radius * Math.cos(angle), .16 * Math.sin(angle * 3.1), radius * Math.sin(angle));
      velocities.push(-Math.sqrt(stiffness) * radius * Math.sin(angle), 0, Math.sqrt(stiffness) * radius * Math.cos(angle));
    }
    state = createParticleState(positions, 3, velocities);
    initialEnergy = harmonicEnergy(state.positions, state.velocities, stiffness);
    for (let index = 0; index < count; index++) {
      const [r, g, b] = tint(index / Math.max(1, count - 1));
      const dot = new Visual(ball, [r, g, b, 1]);
      dot.position = [state.positions[index * 3], state.positions[index * 3 + 1], state.positions[index * 3 + 2]];
      particles.push(dot);
      group.add(dot);
    }
  };

  // The acceleration is a function of position only, exactly as a spring is: a = −k·x.
  const spring = (_index: number, position: readonly number[]): readonly number[] =>
    [-stiffness * position[0], -stiffness * position[1], -stiffness * position[2]];

  const advance = (dt: number): void => {
    const substeps = Number(substepSelect.value);
    const slice = dt / substeps;
    for (let step = 0; step < substeps; step++) stepParticles(state, slice, spring);
  };

  playButton.addEventListener('click', () => { playing = !playing; button(); });
  const rebuild = (): void => { build(Number(countSelect.value)); sync(); };
  countSelect.addEventListener('change', rebuild);
  substepSelect.addEventListener('change', () => { stepMs = 0; rate = 0; });
  button();
  rebuild();

  function sync(): void {
    for (let index = 0; index < particles.length; index++) {
      particles[index].position = [state.positions[index * 3], state.positions[index * 3 + 1], state.positions[index * 3 + 2]];
    }
  }

  return {
    labels,
    update: delta => {
      if (playing) {
        const started = performance.now();
        advance(Math.min(delta, .05));
        const elapsed = performance.now() - started;
        stepMs += (elapsed - stepMs) * .15;
        const substeps = Number(substepSelect.value);
        rate += (substeps * 1000 / Math.max(stepMs, .001) - rate) * .05;
      }
      sync();
      const energy = harmonicEnergy(state.positions, state.velocities, stiffness);
      const drift = initialEnergy ? (energy - initialEnergy) / initialEnergy * 100 : 0;
      readout.textContent = `${state.count} particles · ${substepSelect.value} substep(s) · `
        + `${stepMs.toFixed(2)} ms per frame batch (${rate.toFixed(0)} steps/s) · energy ${drift >= 0 ? '+' : ''}${drift.toFixed(2)}%`;
    },
  };
}

/* --------------------------------------------------------------------------------------------
 * 06 · Symmetry: the same operation fixes different atoms in different crystals.
 * ------------------------------------------------------------------------------------------ */

function symmetryDemo(view: WebGPUView): Demo {
  const labels = new LabelLayer($('symmetry-labels'), view.camera);
  const camera = view.camera;
  camera.projection = 'orthographic';
  camera.yaw = .62;
  camera.pitch = .3;
  camera.target = [0, 0, 0];
  camera.height = 6.6;

  const group = new Group();
  view.world.add(group);
  const ball = shadedSphere(.16, { ambient: .3 });
  const palette: Record<string, Rgb> = {
    A: [.5, .83, .88], B: [.95, .82, .53], O: [1, .62, .77],
    Na: [.56, .83, .63], Cl: [.97, .84, .51],
  };
  const orbitColours = ['#f1d087', '#80d4df', '#ff9ec4', '#9fe7a0', '#c9a0ff'];

  const latticeSelect = $<HTMLSelectElement>('symmetry-lattice');
  const operationSelect = $<HTMLSelectElement>('symmetry-operation');
  const strain = $<HTMLInputElement>('symmetry-strain');
  const readout = $('symmetry-readout');

  const rebuild = (): void => {
    group.clear();
    const kind = latticeSelect.value as LatticeChoice;
    const base = structureFor(kind);
    const structure = displaced(base, base.positions.length - 1, Number(strain.value));
    const operation = operationNamed(operationSelect.value as keyof typeof SYMMETRY_OPERATIONS);
    const report = orbitReport(structure, operation, 1e-4);
    const { extent } = structureBounds(structure);
    const half = extent / 2;

    // The cell and the axes are already centred on the origin, and `centredAtoms` subtracts the
    // same centre, so the group itself stays at the origin.
    group.add(new Visual(axes3d(half * 1.05, .006), rgba('#cfe4ea', .5)));
    group.add(new Visual(boxEdges([-half, -half, -half], [half, half, half], .006), rgba('#9fe7ff', .5)));

    const atoms = centredAtoms(structure);
    atoms.forEach((atom, index) => {
      const fixed = report.fixed.includes(index);
      const hue = palette[atom.species] ?? [.8, .8, .8] as Rgb;
      const visual = new Visual(ball, [...hue, 1]);
      visual.position = atom.position;
      group.add(visual);
      if (fixed) {
        const ring = new Visual(wireSphere(.235, 10, 6, .006), rgba('#f1d087', .85));
        ring.position = atom.position;
        group.add(ring);
      }
    });

    // One arrow per moved site, coloured by the orbit the site belongs to: the arrow is the
    // operation, not a decoration, so a reader can see which atoms trade places.
    const orbitOf = new Map<number, number>();
    report.orbits.forEach((orbit, orbitIndex) => orbit.forEach(site => orbitOf.set(site, orbitIndex)));
    atoms.forEach((atom, index) => {
      const target = report.mapping[index];
      if (target === index) return;
      const colour = orbitColours[(orbitOf.get(index) ?? 0) % orbitColours.length];
      const link = new Visual(arrow(atom.position, atoms[target].position, .01), rgba(colour, .8));
      group.add(link);
    });

    const answer = report.ontoSelf
      ? `onto-self: yes — ${operation.label} is a symmetry of this crystal`
      : `onto-self: no — the displaced site breaks it`;
    readout.textContent = `${kind} · ${operation.label} · ${report.fixed.length} fixed, ${report.moved.length} moved `
      + `in ${report.orbits.length} orbit(s) · ${report.latticeOperations} cubic ops · tolerance 1e-4 · ${answer}`;
  };
  latticeSelect.addEventListener('change', rebuild);
  operationSelect.addEventListener('change', rebuild);
  strain.addEventListener('input', rebuild);
  rebuild();

  return { labels, update: () => {} };
}

/* --------------------------------------------------------------------------------------------
 * 07 · The transform stack: a group's world matrix is its ancestors' composed.
 * ------------------------------------------------------------------------------------------ */

function transformDemo(view: WebGPUView): Demo {
  const labels = new LabelLayer($('transform-labels'), view.camera);
  look(view, .5, .34, 10.5);
  view.camera.target = [0, -.5, 0];
  // Three nested groups. Each link is drawn in its parent's frame starting at the origin, so the
  // chain only reads correctly if the matrices compose; the wrist is the last child.
  const base = new Group(); const upper = new Group(); const fore = new Group(); const hand = new Group();
  base.add(upper); upper.add(fore); fore.add(hand);
  base.position = [-2.6, -1.4, 0];
  upper.position = [1.7, 0, 0]; fore.position = [1.6, 0, 0]; hand.position = [1.2, 0, 0];
  const link = (length: number, colour: string): Visual => new Visual(polyline([[0, 0, 0], [length, 0, 0]], .07, 6), rgba(colour));
  base.add(link(1.7, '#58c4dd')); upper.add(link(1.6, '#83c167')); fore.add(link(1.2, '#f7d681'));
  const tip = new Visual(sphere(.17), rgba('#ff9ec4'));
  hand.add(tip);
  view.world.add(new Visual(axes3d(1.3, .006), rgba('#dbe9f5', .2)), base);

  const readout = $('transform-readout');
  const matrixOut = $('transform-matrix');
  // Listed literally rather than built from a template: the page test asserts that every control id
  // in the HTML is named somewhere in this module, and a template string hides that.
  const joints = [
    $<HTMLInputElement>('transform-joint-1'),
    $<HTMLInputElement>('transform-joint-2'),
    $<HTMLInputElement>('transform-joint-3'),
  ];
  let tipWorld: Vec3 = [0, 0, 0], live = !reducedMotion, phase = 0;
  const apply = (): void => {
    base.rotation = Number(joints[0].value);
    upper.rotation = Number(joints[1].value);
    fore.rotation = Number(joints[2].value);
    // Read the wrist's *world* matrix back out of the scene graph rather than multiplying by hand,
    // so the number printed is the number the renderer used.
    let held: Float32Array | undefined;
    for (const item of view.world.flatten()) if (item.node === tip) held = item.matrix;
    if (!held) return;
    tipWorld = applyMatrix(held, [0, 0, 0]);
    const cell = (row: number, column: number) => number(held[column * 4 + row], 2);
    matrixOut.innerHTML = mathml(brackets(matrix([
      [cell(0, 0), cell(0, 1), cell(0, 2)],
      [cell(1, 0), cell(1, 1), cell(1, 2)],
      [cell(2, 0), cell(2, 1), cell(2, 2)],
    ])));
    readout.textContent = `wrist in world = (${tipWorld.map(value => value.toFixed(2)).join(', ')}) `
      + `· three local y-rotations, composed parent → child`;
  };
  for (const control of joints) control.addEventListener('input', () => { live = false; apply(); });
  labels.addHTML(mathml(mtext('wrist')), () => [tipWorld[0], tipWorld[1] + .4, tipWorld[2]], '#ff9ec4', 'math-label');
  apply();

  return {
    labels,
    update: delta => {
      if (!live) return;
      phase += delta * .5;
      joints[2].value = String(.95 * Math.sin(phase));
      apply();
    },
  };
}

/* --------------------------------------------------------------------------------------------
 * 08 · Interpolation, easing, and why time is absolute.
 * ------------------------------------------------------------------------------------------ */

function timeDemo(view: WebGPUView): Demo {
  const labels = new LabelLayer($('time-labels'), view.camera);
  look(view, .32, .3, 9.5);
  view.camera.target = [0, .5, 0];
  view.world.add(new Visual(polyline([[-3.3, 0, 0], [3.3, 0, 0]], .02, 6), rgba('#5c6f83')));
  const markers = ['#58c4dd', '#83c167', '#f7d681'].map((colour, index) => {
    const marker = new Visual(sphere(.14), rgba(colour));
    marker.position = [-3.3, 1 - index * .7, 0];
    return marker;
  });
  view.world.add(...markers);

  // One clock, three cues. A cue is a function of *absolute* time, so a seek anywhere — forwards,
  // backwards or a jump — puts every marker exactly where that time says, with no accumulated drift.
  const timeline = new Timeline(4);
  timeline.add({ start: 0, duration: 4, update: p => { markers[0].position = [-3.3 + 6.6 * p, 1, 0]; } });
  timeline.add({ start: 0, duration: 4, ease: smooth, update: p => { markers[1].position = [-3.3 + 6.6 * p, .3, 0]; } });
  timeline.add({ start: 1.2, duration: 2.2, update: p => { markers[2].position = [-3.3 + 6.6 * p, -.4, 0]; } });

  const readout = $('time-readout');
  const scrub = $<HTMLInputElement>('time-scrub');
  const play = $<HTMLButtonElement>('time-play');
  let playing = !reducedMotion;
  const report = (): void => {
    const time = timeline.time;
    const values = [time / 4, smooth(time / 4), tween(time, 1.2, 2.2, 0, 1)];
    readout.textContent = `t = ${time.toFixed(2)} s · lerp ${values[0].toFixed(3)} · smooth ${values[1].toFixed(3)} `
      + `· delayed tween ${values[2].toFixed(3)} · ${playing ? 'playing' : 'paused'}`;
    if (document.activeElement !== scrub) scrub.value = String(time);
  };
  scrub.addEventListener('input', () => { playing = false; timeline.seek(Number(scrub.value)); report(); });
  play.addEventListener('click', () => {
    playing = !playing;
    play.textContent = playing ? 'Pause' : 'Play';
    play.setAttribute('aria-pressed', String(playing));
    if (playing) timeline.play(); else timeline.pause();
    report();
  });
  play.textContent = playing ? 'Pause' : 'Play';
  timeline.seek(0); report();

  return {
    labels,
    update: delta => {
      if (playing) timeline.tick(delta);
      report();
    },
  };
}

/* --------------------------------------------------------------------------------------------
 * 09 · Curves, tubes, and the point budget that makes a line a solid.
 * ------------------------------------------------------------------------------------------ */

function curveDemo(view: WebGPUView): Demo {
  const labels = new LabelLayer($('curve-labels'), view.camera);
  view.camera.projection = 'orthographic'; view.camera.yaw = 0; view.camera.pitch = 0;
  view.camera.target = [0, 0, 0]; view.camera.height = 6.4;

  const kinds: Record<string, (x: number) => number> = {
    'ripple': x => 1.6 * Math.sin(x) * Math.exp(-Math.abs(x) / 5),
    'runge': x => 1 / (1 + 3 * x * x) * 3 - 1,
    'chirp': x => 1.5 * Math.sin(x * x / 2.2),
  };
  const kind = $<HTMLSelectElement>('curve-kind');
  const samples = $<HTMLInputElement>('curve-samples');
  const width = $<HTMLInputElement>('curve-width');
  const readout = $('curve-readout');
  const probe = $<HTMLButtonElement>('curve-probe');
  const probeStatus = $('curve-probe-status');

  let curve = new Visual(functionCurve(kinds[kind.value], [-6, 6], Number(samples.value), Number(width.value)), rgba('#7fe3ef'));
  view.world.add(new Visual(axes3d(2.2, .004), rgba('#dbe9f5', .18)), curve);

  /** A tube turns one sample into `sides` quads — eight triangles at the default four sides. */
  const rebuild = (): void => {
    const count = Number(samples.value), radius = Number(width.value);
    view.world.remove(curve);
    const started = performance.now();
    curve = new Visual(functionCurve(kinds[kind.value], [-6, 6], count, radius), rgba('#7fe3ef'));
    const built = performance.now() - started;
    view.world.add(curve);
    const triangles = Math.max(0, count - 1) * 8;
    readout.textContent = `${count.toLocaleString()} samples · tube ≈ ${triangles.toLocaleString()} triangles `
      + `(${count - 1} segments × 4 sides × 2) · built in ${built.toFixed(1)} ms`;
    probeStatus.textContent = 'The sampler is capped at 100 000 points; longer runs are chunked with the joint repeated, so the cap is reachable rather than a crash.';
  };
  kind.addEventListener('change', rebuild);
  samples.addEventListener('input', rebuild);
  width.addEventListener('input', rebuild);
  // Show the guard by asking for one sample past the budget. The check fires before any sampling,
  // so this cannot hang the page — the refusal is the library's own message.
  probe.addEventListener('click', () => {
    try {
      functionCurve(kinds[kind.value], [-6, 6], 100_001);
      probeStatus.textContent = '100 001 samples were accepted, which is a bug — the cap should refuse.';
    } catch (error) {
      probeStatus.textContent = `100 001 samples → ${error instanceof Error ? error.message : String(error)}`;
    }
  });
  rebuild();

  return { labels, update: () => {} };
}

/* --------------------------------------------------------------------------------------------
 * 10 · Surfaces, quads, and the winding that makes a volume positive.
 * ------------------------------------------------------------------------------------------ */

function surfaceDemo(view: WebGPUView): Demo {
  const labels = new LabelLayer($('surface-labels'), view.camera);
  look(view, .6, .45, 9);
  const resolution = $<HTMLInputElement>('surface-resolution');
  const readout = $('surface-readout');
  const ring = 1.35, tube = .42;
  const torus = (u: number, v: number): Vec3 => [
    (ring + tube * Math.cos(v)) * Math.cos(u), tube * Math.sin(v), (ring + tube * Math.cos(v)) * Math.sin(u),
  ];

  /** Divergence theorem: summing a·(b×c)/6 over outward-wound triangles gives the enclosed volume. */
  const signedVolume = (geometry: Geometry): number => {
    const v = geometry.vertices;
    let total = 0;
    for (let i = 0; i < v.length; i += 9) {
      const ax = v[i], ay = v[i + 1], az = v[i + 2];
      const bx = v[i + 3], by = v[i + 4], bz = v[i + 5];
      const cx = v[i + 6], cy = v[i + 7], cz = v[i + 8];
      total += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    }
    return total;
  };

  let surface = new Visual(parametricSurface(torus, [0, 2 * Math.PI], [0, 2 * Math.PI], [Number(resolution.value), Number(resolution.value)]), rgba('#58c4dd'));
  view.world.add(surface);

  const rebuild = (): void => {
    const res = Number(resolution.value);
    view.world.remove(surface);
    surface = new Visual(parametricSurface(torus, [0, 2 * Math.PI], [0, 2 * Math.PI], [res, res]), rgba('#58c4dd'));
    view.world.add(surface);
    const volume = signedVolume(surface.geometry);
    const exact = 2 * Math.PI * Math.PI * ring * tube * tube;
    readout.textContent = `${res}×${res} quads · ${(res * res * 2).toLocaleString()} triangles · `
      + `signed volume ${volume.toFixed(3)} vs exact 2π²Rr² = ${exact.toFixed(3)} · `
      + `${volume > 0 ? 'positive, so every face is wound outward' : 'negative — the winding is inside-out'}`;
  };
  resolution.addEventListener('input', rebuild);
  rebuild();

  return {
    labels,
    update: delta => { surface.rotation += delta * .35; },
  };
}

/* --------------------------------------------------------------------------------------------
 * 11 · One level set: marching tetrahedra over a sample lattice.
 * ------------------------------------------------------------------------------------------ */

function fieldDemo(view: WebGPUView): Demo {
  const labels = new LabelLayer($('field-labels'), view.camera);
  look(view, .7, .4, 7.5);
  const melt = $<HTMLInputElement>('field-melt');
  const resolution = $<HTMLInputElement>('field-resolution');
  const readout = $('field-readout');
  const bounds = { min: [-2, -2, -2] as Vec3, max: [2, 2, 2] as Vec3 };
  // Two moving metaballs: the level set between them is what the reader sees melt together.
  const balls = (x: number, y: number, z: number, blend: number): number =>
    1 / Math.hypot(x - blend, y, z) + 1 / Math.hypot(x + blend, y, z);
  let blob = new Visual(isosurface((x, y, z) => balls(x, y, z, .85), bounds, 1.6, Number(resolution.value)), rgba('#83e07a'));
  view.world.add(blob);

  const rebuild = (): void => {
    const res = Number(resolution.value), level = Number(melt.value);
    const samples = (res + 1) ** 3;
    view.world.remove(blob);
    const started = performance.now();
    blob = new Visual(isosurface((x, y, z) => balls(x, y, z, .9), bounds, level, res), rgba('#83e07a'));
    const built = performance.now() - started;
    view.world.add(blob);
    readout.textContent = `iso = ${level.toFixed(2)} · ${res}³ cells → ${samples.toLocaleString()} samples `
      + `(budget 250 000) · ${(blob.geometry.vertices.length / 9).toLocaleString()} triangles · built in ${built.toFixed(0)} ms`;
  };
  melt.addEventListener('input', rebuild);
  resolution.addEventListener('input', rebuild);
  rebuild();

  return {
    labels,
    update: delta => { blob.rotation += delta * .3; },
  };
}

/* --------------------------------------------------------------------------------------------
 * 12 · Streamlines: RK4 with arc-length steps through a vector field.
 * ------------------------------------------------------------------------------------------ */

function streamlineDemo(view: WebGPUView): Demo {
  const labels = new LabelLayer($('streamline-labels'), view.camera);
  look(view, .55, .38, 8);
  const step = $<HTMLInputElement>('streamline-step');
  const readout = $('streamline-readout');
  // A field with a stagnation point at the origin: lines slow, stop, and are dropped if too short.
  const field = (p: Vec3, time: number): Vec3 => [
    p[0] * .35 - p[1] * 1.1 + .25 * Math.sin(time),
    p[1] * .35 + p[0] * 1.1,
    -.25 * p[2],
  ];
  const seeds = sphereSeeds(14, 1.05);
  view.world.add(new Visual(axes3d(1.4, .005), rgba('#dbe9f5', .18)));

  let lines: Visual[] = [], marker: Visual | undefined, travelled = 0;
  const rebuild = (): void => {
    for (const line of lines) view.world.remove(line);
    const traced = streamlines(field, seeds, 0, { step: Number(step.value), bounds: { min: [-2.2, -2.2, -2.2], max: [2.2, 2.2, 2.2] }, maxLength: 6 });
    lines = traced.map(line => new Visual(polyline(line, .014, 5), rgba('#f0a9d0', .85)));
    view.world.add(...lines);
    const points = traced.reduce((sum, line) => sum + line.length, 0);
    readout.textContent = `${traced.length} of ${seeds.length} seeds produced a line · step ${Number(step.value).toFixed(3)} `
      + `(arc length) · ${points.toLocaleString()} integrated points · a seed on the stagnation point is dropped`;
    if (!marker) { marker = new Visual(sphere(.11), rgba('#f7d681')); view.world.add(marker); }
  };
  step.addEventListener('input', rebuild);
  rebuild();

  return {
    labels,
    update: delta => {
      travelled += delta * 1.2;
      // A marker walking the first traced line shows that `step` is an arc length, not a frame count.
      if (marker && lines[0] && lines[0].geometry.vertices.length >= 3) {
        const v = lines[0].geometry.vertices;
        const count = v.length / 3;
        const at = Math.floor((travelled % 1) * count);
        marker.position = [v[at * 3], v[at * 3 + 1], v[at * 3 + 2]];
      }
    },
  };
}

/* --------------------------------------------------------------------------------------------
 * 13 · Axes, ticks and labels: choosing round numbers, then typesetting them.
 * ------------------------------------------------------------------------------------------ */

function plotFrameDemo(view: WebGPUView): Demo {
  const labels = new LabelLayer($('plotframe-labels'), view.camera);
  const fit = (): void => {
    const canvas = $<HTMLCanvasElement>('plotframe-canvas');
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    view.camera.projection = 'orthographic';
    view.camera.yaw = 0; view.camera.pitch = 0; view.camera.target = [0, 0, 0];
    view.camera.height = Math.max(4.6, 9.6 / aspect);
  };
  const ticks = $<HTMLInputElement>('plotframe-ticks');
  const readout = $('plotframe-readout');
  const domain: [number, number] = [-4.5, 4.5], range: [number, number] = [-1.6, 1.6];
  const x = (value: number): number => 1.2 * Math.sin(value) * Math.exp(-value * value / 22);

  let chart = plotFrame(domain, range, { xTicks: Number(ticks.value), yTicks: 4, minor: 5, xTitle: mi('x'), yTitle: mi('f') });
  const curve = new Visual(functionCurve(x, domain, 320, .02), rgba('#f7d681'));
  let tickNodes: HTMLSpanElement[] = [], titleNodes: HTMLSpanElement[] = [];
  const rebuild = (): void => {
    const count = Number(ticks.value);
    chart = plotFrame(domain, range, { xTicks: count, yTicks: 4, minor: 5, xTitle: mi('x'), yTitle: mi('f') });
    view.world.add(
      new Visual(chart.minorGrid, rgba('#e8f0f6', .05)), new Visual(chart.grid, rgba('#e8f0f6', .1)),
      new Visual(chart.minor, rgba('#e8f0f6', .28)), new Visual(chart.ticks, rgba('#e8f0f6', .42)),
      new Visual(chart.axes, rgba('#e8f0f6', .78)),
    );
    for (const node of [...tickNodes, ...titleNodes]) node.remove();
    tickNodes = chart.labels.map(anchor => labels.addHTML(mathml(anchor.math ?? mtext(anchor.text)), () => anchor.position, '#93a6b8', 'math-label'));
    titleNodes = chart.titles.map(anchor => labels.addHTML(mathml(anchor.math ?? mtext(anchor.text)), () => anchor.position, '#cfe4ea', 'math-label'));
    const step = niceStep(domain[1] - domain[0], count);
    readout.textContent = `${count} requested → niceStep picks ${formatTick(step, step)} · `
      + `ticks ${tickValues(domain[0], domain[1], count).join(', ')} · minor marks subdivide each step by 5`;
    fit();
  };
  ticks.addEventListener('input', rebuild);
  view.world.add(curve);
  view.onResize = fit;
  rebuild();

  return { labels, update: () => {} };
}

/* --------------------------------------------------------------------------------------------
 * 14 · Typesetting: MathML builders and the operand rule.
 * ------------------------------------------------------------------------------------------ */

function typesetDemo(): Demo {
  const kind = $<HTMLSelectElement>('typeset-kind');
  const output = $('typeset-output');
  const source = $('typeset-source');
  const probeStatus = $('typeset-probe-status');
  const probe = $<HTMLButtonElement>('typeset-probe');

  /**
   * Each expression written the way it is written everywhere else — as LaTeX. One of these cannot be
   * said with a slash at all: `\frac{\Delta y}{\Delta x}` is a *stacked* fraction, and the whole
   * point of the page is that the picture agrees with the notation.
   */
  const sources: Record<string, string> = {
    'fraction': '\\frac{\\Delta y}{\\Delta x}',
    'square of a sum': '(x+h)^2',
    'radical': '\\sqrt{x+1}',
    'nth root': '\\sqrt[3]{x}',
    'index and exponent': 'a_n^2',
    'limit': '\\lim_{h\\to 0}',
    'integral': '\\int_0^1 x\\,dx',
    'matrix': '\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}',
    'cases': '\\begin{cases} x & x>0 \\\\ -x & x\\le 0 \\end{cases}',
    'cancellation': '\\frac{x\\cdot h}{h\\cdot y} = \\frac{x}{y}',
  };

  const render = (): void => {
    const maths = sources[kind.value] ?? '';
    output.innerHTML = latex(maths, { display: 'block' });
    // The LaTeX is what an author writes; one click shows the MathML it became.
    source.textContent = maths;
  };
  kind.addEventListener('change', render);
  probe.addEventListener('click', () => {
    const maths = sources[kind.value] ?? '';
    const markup = latex(maths);
    // The operand rule again, this time on generated markup: `msup` and friends take exactly two
    // children, which is why every operand the converter emits is a single element.
    const bare = '<mi>a</mi><mi>b</mi>';
    probeStatus.textContent = `${maths} → ${markup.length > 220 ? `${markup.slice(0, 220)}…` : markup} `
      + `· msup(bare, 2) → ${msup(bare, mn('2'))}`;
  });
  render();

  return { update: () => {} };
}

/* --------------------------------------------------------------------------------------------
 * 15 · A derivation: tokens, beats and marks.
 * ------------------------------------------------------------------------------------------ */

function derivationDemo(): Demo {
  const host = $('derivation-host');
  const readout = $('derivation-readout');
  const play = $<HTMLButtonElement>('derivation-play');
  const next = $<HTMLButtonElement>('derivation-next');
  const bad = $<HTMLButtonElement>('derivation-bad');
  const badStatus = $('derivation-bad-status');
  const stepControl = $<HTMLInputElement>('derivation-step');

  const steps: DerivationStep[] = [
    {
      note: mathml(mtext('start from the definition')),
      tokens: [
        { id: 'f', math: mi('f'), text: 'f' }, { id: 'p', math: mo('('), text: '(' },
        { id: 'x', math: mi('x'), text: 'x' }, { id: 'c', math: mo(')'), text: ')' },
        { id: 'eq', math: mo('='), text: '=' },
        { id: 'sq', math: msup(mi('x'), mn('2')), text: 'x squared' },
      ],
    },
    {
      note: mathml(mtext('expand to see the difference quotient')),
      tokens: [
        { id: 'a', math: msup(paren(row(mi('x'), mo('+'), mi('h'))), mn('2')), text: '(x+h) squared' },
        { id: 'minus', math: mo('\u2212'), text: 'minus' },
        { id: 'b', math: msup(mi('x'), mn('2')), text: 'x squared' },
        { id: 'over', math: mo('/'), text: 'over' },
        { id: 'h', math: mi('h'), text: 'h' },
      ],
      beats: [
        { marks: [{ kind: 'highlight', ids: ['a'], colour: '#f7d681' }] },
        { marks: [{ kind: 'bracket', ids: ['a'], colour: '#80d4df', note: mathml(mtext('expand')) }] },
        // A cancellation over tokens that are not neighbours is split into runs by `strikeRuns`.
        { marks: [{ kind: 'cancel', ids: ['b'], colour: '#ff9d9d' }] },
      ],
    },
  ];

  const derivation = new Derivation(host, {
    className: 'academy-derivation',
    interval: 900,
    onChange: position => {
      readout.textContent = `step ${position.step + 1} of ${steps.length} · beat ${position.beat + 1} · ${derivation.describe()}`;
    },
  });
  derivation.set(steps);

  play.addEventListener('click', () => {
    const playing = play.getAttribute('aria-pressed') === 'true';
    play.setAttribute('aria-pressed', String(!playing));
    play.textContent = playing ? 'Play' : 'Pause';
    if (playing) derivation.pause(); else derivation.play();
  });
  next.addEventListener('click', () => derivation.next());
  // A control the page test can drive: seeking to a step is the same operation as playing to it.
  stepControl.addEventListener('input', () => derivation.seek(Number(stepControl.value)));
  // `checkStep` is the guard the pages run before rendering: a mark that names a token which is not
  // in the line is a typo that would otherwise fail silently, so it throws with the offending id.
  bad.addEventListener('click', () => {
    try {
      checkStep({ tokens: steps[0].tokens, beats: [{ marks: [{ kind: 'highlight', ids: ['ghost'] }] }] }, 'academy probe');
      badStatus.textContent = 'a mark naming a missing token was accepted, which is a bug.';
    } catch (error) {
      badStatus.textContent = `missing token → ${error instanceof Error ? error.message : String(error)}`;
    }
  });
  badStatus.textContent = `cancel over ['b'] stays one run; a cancel over a wrapped row is split by strikeRuns into ${strikeRuns(['a', 'x', 'b'], ['a', 'b']).length} runs.`;

  return { update: () => {} };
}

/* --------------------------------------------------------------------------------------------
 * 16 · Picking and dragging in three dimensions.
 * ------------------------------------------------------------------------------------------ */

function pickingDemo(view: WebGPUView): Demo {
  const labels = new LabelLayer($('picking-labels'), view.camera);
  look(view, .55, .42, 9);
  view.world.add(new Visual(boxEdges([-2, -2, -2], [2, 2, 2], .006), rgba('#dbe9f5', .16)));
  view.world.add(new Visual(axes3d(1.5, .005), rgba('#dbe9f5', .2)));
  const ball = new Visual(sphere(.22), rgba('#f7d681'));
  const echo = new Visual(sphere(.22), rgba('#ff9ec4'));
  view.world.add(ball, echo);
  const echoControl = $<HTMLInputElement>('picking-echo');
  let at: Vec3 = [0, 0, 0];
  let echoAt: Vec3 = [Number(echoControl.value), 0, -1.1];
  ball.position = at;
  echo.position = echoAt;
  const readout = $('picking-readout');
  echoControl.addEventListener('input', () => { echoAt = [Number(echoControl.value), 0, -1.1]; });

  // The handle reads `at()` every frame, so it follows the ball even while the camera orbits.
  attachHandles($<HTMLCanvasElement>('picking-canvas'), view.camera, () => [{
    id: 'ball',
    at: () => at,
    plane: { normal: [0, 1, 0] },
    cursor: 'grab',
    to: point => {
      at = [Math.max(-1.9, Math.min(1.9, point[0])), 0, Math.max(-1.9, Math.min(1.9, point[2]))];
    },
  }], {
    onGrab: handle => {
      readout.textContent = handle ? 'grabbed: the camera is locked and the ray meets y = 0' : 'released';
    },
  });

  const canvas = $<HTMLCanvasElement>('picking-canvas');
  return {
    labels,
    update: () => {
      ball.position = at;
      echo.position = echoAt;
      // Screen-space distance is what picking actually uses, so print it for the echo ball too:
      // the reader can see that a click near the pink ball would not grab the gold one.
      const width = canvas.clientWidth, height = canvas.clientHeight;
      const near = screenDistance(view.camera, at, width / 2, height / 2, width, height);
      const far = screenDistance(view.camera, echoAt, width / 2, height / 2, width, height);
      readout.textContent = `handle at (${at.map(value => value.toFixed(2)).join(', ')}) `
        + `· screen distance from the centre: handle ${near.toFixed(0)} px, echo ${far.toFixed(0)} px `
        + `· a grab needs a pointer within its radius`;
    },
  };
}

/* --------------------------------------------------------------------------------------------
 * 17 · Depth, transparency and the order the renderer chooses.
 * ------------------------------------------------------------------------------------------ */

function depthDemo(view: WebGPUView): Demo {
  const labels = new LabelLayer($('depth-labels'), view.camera);
  look(view, .6, .35, 10);
  const order = $<HTMLSelectElement>('depth-order');
  // Three nested translucent shells around one opaque core. Opaque geometry writes depth first;
  // translucent geometry tests against it and blends back-to-front.
  const shells = [1.5, 1.15, .8].map((size, index) =>
    new Visual(box([-size, -size, -size], [size, size, size]), rgba(['#58c4dd', '#83c167', '#f7d681'][index], .22)));
  const core = new Visual(sphere(.42), rgba('#ff9ec4'));
  view.world.add(core, ...shells);
  const readout = $('depth-readout');
  const report = (): void => {
    const mode = order.value;
    core.visible = mode === 'opaque-first';
    readout.textContent = mode === 'opaque-first'
      ? 'opaque core first (writes depth) → translucent shells test against it, back to front: each shell is visible through the ones in front.'
      : 'shells drawn in the given order without regard to depth: the inner shells can be painted before the outer ones, so the nesting reads wrongly.';
  };
  order.addEventListener('change', report);
  report();

  return {
    labels,
    update: delta => {
      for (const shell of shells) shell.rotation += delta * .2;
      core.rotation += delta * .2;
    },
  };
}

/* --------------------------------------------------------------------------------------------
 * 18 · Instancing: 1 geometry, N draws, and the bytes that move.
 * ------------------------------------------------------------------------------------------ */

function instancingDemo(view: WebGPUView): Demo {
  const labels = new LabelLayer($('instancing-labels'), view.camera);
  look(view, .62, .5, 12);
  const count = $<HTMLInputElement>('instancing-count');
  const readout = $('instancing-readout');
  // One geometry, many Visuals: the renderer uploads the mesh once and the matrices once, then one
  // instanced draw. The per-instance record is 4x4 (16 floats) plus opacity = 17 floats = 68 bytes.
  const mesh = sphere(.12);
  let nodes: Visual[] = [];
  const side = (n: number) => Math.ceil(Math.cbrt(n));
  const rebuild = (): void => {
    for (const node of nodes) view.world.remove(node);
    nodes = [];
    const total = Number(count.value), n = side(total);
    for (let index = 0; index < total; index++) {
      const x = index % n, y = Math.floor(index / n) % n, z = Math.floor(index / (n * n));
      const node = new Visual(mesh, rgba(index % 7 === 0 ? '#f7d681' : '#58c4dd'));
      node.position = [(x - (n - 1) / 2) * .5, (y - (n - 1) / 2) * .5, (z - (n - 1) / 2) * .5];
      nodes.push(node);
    }
    view.world.add(...nodes);
    readout.textContent = `${total.toLocaleString()} instances of one ${(mesh.vertices.length / 9).toLocaleString()}-triangle mesh · `
      + `${(total * 17 * 4 / 1024).toFixed(1)} KiB of instance data, uploaded once · `
      + `moving one object changes its 16 matrix floats (64 bytes) and its opacity, nothing else`;
  };
  count.addEventListener('input', rebuild);
  rebuild();

  let phase = 0;
  return {
    labels,
    update: delta => {
      phase += delta;
      // A wave through the lattice: only the instances whose height changed are re-uploaded, which is
      // what the renderer's per-interval comparison buys.
      for (let index = 0; index < nodes.length; index++) {
        const wave = Math.sin(phase * 2 - index * .05);
        nodes[index].scale = [1, 1 + .35 * wave, 1];
      }
    },
  };
}

/* --------------------------------------------------------------------------------------------
 * 19 · Crystal data: parsing POSCAR and phonopy files.
 * ------------------------------------------------------------------------------------------ */

function crystalDemo(view: WebGPUView): Demo {
  const labels = new LabelLayer($('crystal-labels'), view.camera);
  look(view, .6, .35, 9);
  const source = $<HTMLSelectElement>('crystal-source');
  const readout = $('crystal-readout');
  const operations = $('crystal-operations');

  const files: Record<string, string> = {
    'diamond (POSCAR)': `diamond\n5.43\n1.0 0.0 0.0\n0.0 1.0 0.0\n0.0 0.0 1.0\nC\n2\nDirect\n0.00 0.00 0.00\n0.25 0.25 0.25\n`,
    // The scale line may be negative, in which case it is a *target volume*: the cell is scaled so
    // it encloses that many cubic ångström, which is what VASP means by it.
    'rocksalt, volume scale': `rocksalt\n-160.0\n1.0 0.0 0.0\n0.0 1.0 0.0\n0.0 0.0 1.0\nNa Cl\n1 1\nDirect\n0.0 0.0 0.0\n0.5 0.5 0.5\n`,
  };
  const symmetryFiles: Record<string, string> = {
    'diamond (phonopy)': `rotations:
- - [ 1, 0, 0 ]
  - [ 0, 1, 0 ]
  - [ 0, 0, 1 ]
- - [ -1, 0, 0 ]
  - [ 0, 1, 0 ]
  - [ 0, 0, -1 ]
translations:
- [ 0, 0, 0 ]
- [ 0, 0, 0 ]
`,
  };

  let drawn: Visual[] = [];
  const cartesian = (f: Vec3, lattice: [Vec3, Vec3, Vec3]): Vec3 => [
    f[0] * lattice[0][0] + f[1] * lattice[1][0] + f[2] * lattice[2][0],
    f[0] * lattice[0][1] + f[1] * lattice[1][1] + f[2] * lattice[2][1],
    f[0] * lattice[0][2] + f[1] * lattice[1][2] + f[2] * lattice[2][2],
  ];
  const rebuild = (): void => {
    for (const node of drawn) view.world.remove(node);
    drawn = [];
    const parsed = parsePOSCAR(files[source.value]);
    const scale = 2.2;
    for (let index = 0; index < parsed.species.length; index++) {
      const point = cartesian(parsed.positions[index], parsed.lattice);
      const appearance = appearanceFor(parsed.species[index]);
      const node = new Visual(sphere(appearance.radius * scale), rgba(appearance.color));
      node.position = point.map(value => value * scale - 2.2) as Vec3;
      drawn.push(node);
    }
    const lengths = parsed.lattice.map(row => Math.hypot(...row));
    view.world.add(...drawn);
    const operationsText = symmetryFiles[source.value.replace(' (POSCAR)', ' (phonopy)')];
    const ops = operationsText ? parsePhonopySymmetry(operationsText) : [];
    operations.textContent = ops.length
      ? `${ops.length} operation(s): ${ops.map(operation => operation.label).join(', ')}`
      : 'no phonopy file for this one';
    const volume = Math.abs(
      parsed.lattice[0][0] * (parsed.lattice[1][1] * parsed.lattice[2][2] - parsed.lattice[1][2] * parsed.lattice[2][1])
      - parsed.lattice[0][1] * (parsed.lattice[1][0] * parsed.lattice[2][2] - parsed.lattice[1][2] * parsed.lattice[2][0])
      + parsed.lattice[0][2] * (parsed.lattice[1][0] * parsed.lattice[2][1] - parsed.lattice[1][1] * parsed.lattice[2][0]));
    readout.textContent = `${parsed.comment || 'no comment'} · ${parsed.species.length} sites `
      + `[${parsed.species.join(', ')}] · |a|,|b|,|c| = ${lengths.map(value => value.toFixed(3)).join(', ')} Å `
      + `· cell volume ${volume.toFixed(2)} Å³`;
  };
  source.addEventListener('change', rebuild);
  view.world.add(new Visual(boxEdges([-2.2, -2.2, -2.2], [2.2, 2.2, 2.2], .006), rgba('#dbe9f5', .2)));
  rebuild();

  return { labels, update: delta => { for (const node of drawn) node.rotation += delta * .1; } };
}

/* --------------------------------------------------------------------------------------------
 * 20 · Element appearance: CPK colour and radius.
 * ------------------------------------------------------------------------------------------ */

function elementsDemo(view: WebGPUView): Demo {
  const labels = new LabelLayer($('elements-labels'), view.camera);
  view.camera.projection = 'orthographic'; view.camera.yaw = 0; view.camera.pitch = 0;
  view.camera.target = [0, 0, 0]; view.camera.height = 7.4;
  const group = $<HTMLSelectElement>('elements-group');
  const readout = $('elements-readout');
  const groups: Record<string, string[]> = {
    'organic backbone': ['H', 'C', 'N', 'O', 'P', 'S'],
    'alkali metals': ['Li', 'Na', 'K', 'Rb', 'Cs'],
    'noble gases': ['He', 'Ne', 'Ar', 'Kr', 'Xe'],
    'transition metals': ['Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ag', 'Au'],
  };
  const unknown = $('elements-unknown');
  let nodes: Visual[] = [];
  let labelNodes: HTMLSpanElement[] = [];
  const rebuild = (): void => {
    for (const node of nodes) view.world.remove(node);
    for (const node of labelNodes) node.remove();
    nodes = []; labelNodes = [];
    const symbols = groups[group.value];
    symbols.forEach((symbol, index) => {
      const appearance = appearanceFor(symbol);
      const node = new Visual(sphere(appearance.radius * 2.1), rgba(appearance.color));
      node.position = [(index - (symbols.length - 1) / 2) * 1.25, 0, 0];
      nodes.push(node);
      labelNodes.push(labels.addHTML(mathml(mtext(symbol)), () => [node.position[0], -(appearance.radius * 2.1) - .42, 0], '#cfe4ea', 'math-label'));
    });
    view.world.add(...nodes);
    const sample = appearanceFor(symbols[0]);
    readout.textContent = `${symbols.length} elements · radius is scaled from the published covalent radius `
      + `(${symbols[0]} → ${sample.radius} Å, colour ${sample.color}) · `
      + `an unknown symbol falls back to ${appearanceFor('Xx').radius} Å and ${appearanceFor('Xx').color}`;
    unknown.textContent = `appearanceFor('Xx') = ${JSON.stringify(appearanceFor('Xx'))}`;
  };
  group.addEventListener('change', rebuild);
  rebuild();

  return { labels, update: delta => { for (const node of nodes) node.rotation += delta * .25; } };
}

/* --------------------------------------------------------------------------------------------
 * 21 · Area under a curve: the geometry is the quadrature rule.
 * ------------------------------------------------------------------------------------------ */

function areaDemo(view: WebGPUView): Demo {
  const labels = new LabelLayer($('area-labels'), view.camera);
  const shape = $<HTMLSelectElement>('area-shape');
  const steps = $<HTMLInputElement>('area-steps');
  const readout = $('area-readout');

  // Each entry carries its exact integral, so the error printed is a real error and not a claim.
  const shapes: Record<string, { f: (x: number) => number; domain: [number, number]; exact: number; label: string }> = {
    'sin x on [0, π]': { f: Math.sin, domain: [0, Math.PI], exact: 2, label: '∫ sin x dx = 2' },
    'x² on [0, 1]': { f: x => x * x, domain: [0, 1], exact: 1 / 3, label: '∫ x² dx = 1/3' },
    '√x on [0, 1]': { f: Math.sqrt, domain: [0, 1], exact: 2 / 3, label: '∫ √x dx = 2/3' },
  };

  const fit = (): void => {
    const canvas = $<HTMLCanvasElement>('area-canvas');
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    view.camera.projection = 'orthographic';
    view.camera.yaw = 0; view.camera.pitch = 0;
    const { domain } = shapes[shape.value];
    view.camera.target = [(domain[0] + domain[1]) / 2, .6, 0];
    view.camera.height = Math.max(2.2, (domain[1] - domain[0] + .8) / aspect);
  };

  let strips = new Visual(areaUnder(shapes[shape.value].f, shapes[shape.value].domain, { baseline: 0, samples: Number(steps.value) }), rgba('#7fe3ef', .3));
  let curve = new Visual(functionCurve(shapes[shape.value].f, shapes[shape.value].domain, 240, .018), rgba('#f7d681'));
  let axesNodes: Visual[] = [];
  let labelNodes: HTMLSpanElement[] = [];
  view.world.add(strips, curve);

  const rebuild = (): void => {
    const entry = shapes[shape.value];
    const samples = Number(steps.value);
    view.world.remove(strips, curve, ...axesNodes);
    strips = new Visual(areaUnder(entry.f, entry.domain, { baseline: 0, samples }), rgba('#7fe3ef', .3));
    curve = new Visual(functionCurve(entry.f, entry.domain, 240, .018), rgba('#f7d681'));
    const chart = plotFrame(entry.domain, [0, Math.max(...entry.domain.map(entry.f)) * 1.15 || 1], { xTicks: 5, yTicks: 3, minor: 4 });
    axesNodes = [
      new Visual(chart.grid, rgba('#e8f0f6', .1)), new Visual(chart.ticks, rgba('#e8f0f6', .4)), new Visual(chart.axes, rgba('#e8f0f6', .7)),
    ];
    for (const node of labelNodes) node.remove();
    labelNodes = chart.labels.map(anchor => labels.addHTML(mathml(anchor.math ?? mtext(anchor.text)), () => anchor.position, '#93a6b8', 'math-label'));
    view.world.add(strips, curve, ...axesNodes);
    // The strips *are* the trapezoid rule: a quad per interval between two samples. So the estimate
    // is that sum, and the error against the closed form is a fact about this picture.
    const width = (entry.domain[1] - entry.domain[0]) / samples;
    let trapezoid = 0;
    for (let index = 0; index < samples; index++) {
      const left = entry.domain[0] + index * width, right = left + width;
      trapezoid += (entry.f(left) + entry.f(right)) / 2 * width;
    }
    const error = Math.abs(trapezoid - entry.exact);
    readout.textContent = `${samples} strips · trapezoid sum ${trapezoid.toFixed(6)} · exact ${entry.exact.toFixed(6)} `
      + `· error ${error.toExponential(2)} (${(error / entry.exact * 100).toFixed(3)}%) · ${entry.label} · halving the width quarters the error`;
    fit();
  };
  shape.addEventListener('change', rebuild);
  steps.addEventListener('input', rebuild);
  view.onResize = fit;
  rebuild();

  return { labels, update: () => {} };
}

/* --------------------------------------------------------------------------------------------
 * 22 · The secant limit: a difference quotient that becomes a derivative.
 * ------------------------------------------------------------------------------------------ */

function limitDemo(view: WebGPUView): Demo {
  const labels = new LabelLayer($('limit-labels'), view.camera);
  const hControl = $<HTMLInputElement>('limit-h');
  const readout = $('limit-readout');
  const f = (x: number) => Math.sin(x) + .35 * x * x;
  const slopeAt = (x: number) => Math.cos(x) + .7 * x;      // the exact derivative, written once
  const at = .9, domain: [number, number] = [-.2, 2.6];

  const fit = (): void => {
    const canvas = $<HTMLCanvasElement>('limit-canvas');
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    view.camera.projection = 'orthographic';
    view.camera.yaw = 0; view.camera.pitch = 0;
    view.camera.target = [1.2, 1.3, 0];
    view.camera.height = Math.max(4, 4.6 / aspect);
  };

  // f ranges from about -0.19 at the left edge to 2.88 at the right, so the frame has to hold
  // [-0.4, 3.0] or the curve leaves the top of the picture.
  const chart = plotFrame(domain, [-.4, 3], { xTicks: 5, yTicks: 4, minor: 4 });
  const labelNodes = chart.labels.map(anchor => labels.addHTML(mathml(anchor.math ?? mtext(anchor.text)), () => anchor.position, '#93a6b8', 'math-label'));
  view.world.add(
    new Visual(chart.grid, rgba('#e8f0f6', .09)), new Visual(chart.ticks, rgba('#e8f0f6', .38)),
    new Visual(chart.axes, rgba('#e8f0f6', .7)),
    new Visual(functionCurve(f, domain, 260, .018), rgba('#f7d681')),
    // The tangent is fixed: it is what the secants are converging to, drawn once so the reader can
    // see the approach rather than being told the answer.
    new Visual(lineThrough([at, f(at), 0], slopeAt(at), domain, .01), rgba('#7fe3ef', .55)),
  );

  const point = new Visual(sphere(.055), rgba('#ff9ec4'));
  const second = new Visual(sphere(.045), rgba('#83e167'));
  let secant = new Visual(lineThrough([at, f(at), 0], slopeAt(at), domain, .012), rgba('#83e167'));
  view.world.add(point, second, secant);

  // The slider is logarithmic: 0 → h = 10^-0.4, 1 → h = 10^-3.4, which is where a secant stops being
  // distinguishable from the tangent at the precision a float32 geometry can carry.
  const hOf = (value: number) => 10 ** (-.4 - 3 * value);
  let live = !reducedMotion, sweep = 0;

  const place = (h: number): void => {
    const b = at + h;
    const secantSlopeValue = secantSlope(f, at, b);
    const exact = slopeAt(at);
    view.world.remove(secant);
    secant = new Visual(lineThrough([at, f(at), 0], secantSlopeValue, domain, .012), rgba('#83e167'));
    view.world.add(secant);
    point.position = [at, f(at), 0];
    second.position = [b, f(b), 0];
    const error = Math.abs(secantSlopeValue - exact);
    readout.textContent = `h = ${h.toExponential(2)} · secant slope ${secantSlopeValue.toFixed(6)} `
      + `· derivative ${exact.toFixed(6)} · |error| ${error.toExponential(2)} · `
      + `${error < 1e-4 ? 'the difference quotient has converged to the derivative' : 'still distinguishable'}`;
  };

  hControl.addEventListener('input', () => { live = false; place(hOf(Number(hControl.value))); });
  view.onResize = fit;
  place(hOf(Number(hControl.value)));
  fit();

  return {
    labels,
    update: delta => {
      if (!live) return;
      sweep += delta * .18;
      const value = .5 + .5 * Math.sin(sweep);
      hControl.value = String(value);
      place(hOf(value));
    },
  };
}

/* --------------------------------------------------------------------------------------------
 * Bootstrap: one device, one loop, and panels that stop drawing when they scroll away.
 * ------------------------------------------------------------------------------------------ */

async function initialize(): Promise<void> {
  const canvases = [
    'projection-canvas', 'mesh-canvas', 'colour-canvas', 'integration-canvas', 'simulation-canvas', 'symmetry-canvas',
    'transform-canvas', 'time-canvas', 'curve-canvas', 'surface-canvas', 'field-canvas', 'streamline-canvas', 'plotframe-canvas',
    'picking-canvas', 'depth-canvas', 'instancing-canvas', 'crystal-canvas', 'elements-canvas',
    'area-canvas', 'limit-canvas',
  ];
  const first = await WebGPUView.create($<HTMLCanvasElement>(canvases[0]), { samples: msaa, maxDpr, onError: report });
  views.push(first);
  if (disposed) { first.dispose(); return; }
  for (const id of canvases.slice(1)) views.push(await WebGPUView.create($<HTMLCanvasElement>(id), { device: first.device, onError: report, samples: msaa, maxDpr }));

  panels.push(
    { demo: projectionDemo(views[0]), view: views[0] },
    { demo: meshDemo(views[1]), view: views[1] },
    { demo: colourDemo(views[2]), view: views[2] },
    { demo: integrationDemo(views[3]), view: views[3] },
    { demo: simulationDemo(views[4]), view: views[4] },
    { demo: symmetryDemo(views[5]), view: views[5] },
    { demo: transformDemo(views[6]), view: views[6] },
    { demo: timeDemo(views[7]), view: views[7] },
    { demo: curveDemo(views[8]), view: views[8] },
    { demo: surfaceDemo(views[9]), view: views[9] },
    { demo: fieldDemo(views[10]), view: views[10] },
    { demo: streamlineDemo(views[11]), view: views[11] },
    { demo: plotFrameDemo(views[12]), view: views[12] },
    { demo: typesetDemo() },
    { demo: derivationDemo() },
    { demo: pickingDemo(views[13]), view: views[13] },
    { demo: depthDemo(views[14]), view: views[14] },
    { demo: instancingDemo(views[15]), view: views[15] },
    { demo: crystalDemo(views[16]), view: views[16] },
    { demo: elementsDemo(views[17]), view: views[17] },
    { demo: areaDemo(views[18]), view: views[18] },
    { demo: limitDemo(views[19]), view: views[19] },
  );

  const byCanvas = new Map<Element, WebGPUView>(views.map((view, index) => [document.getElementById(canvases[index]) as Element, view]));
  // Seed the drawing set with every view. IntersectionObserver is not guaranteed to deliver an entry
  // (Firefox can stop delivering them entirely), and a page whose canvases never render is worse than
  // one that draws a few off-screen views. The observer still prunes them where it works.
  for (const view of views) onScreen.add(view);
  observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const view = byCanvas.get(entry.target);
      if (!view) continue;
      if (entry.isIntersecting) onScreen.add(view);
      else onScreen.delete(view);
    }
  }, { rootMargin: '150px' });
  for (const canvas of canvases) observer.observe($(canvas));

  const info = first.adapterInfo;
  const name = info?.description || info?.device || info?.architecture || info?.vendor || '';
  const renderer = `${first.isFallbackAdapter ? 'software GPU' : 'GPU'}${name ? ` (${name})` : ''}`;
  stats.dataset.renderer = `${renderer} · msaa×${msaa} · dpr≤${maxDpr}`;
  timer = 1;
  animate(performance.now());
}

function animate(now: number): void {
  if (disposed) return;
  const delta = last ? Math.max(0, Math.min((now - last) / 1000, .1)) : 0;
  last = now;
  for (const panel of panels) {
    const { demo, view } = panel;
    if ((view && !onScreen.has(view)) || broken.has(demo)) continue;
    panel.time = (panel.time ?? 0) + delta;
    try {
      demo.update(delta, panel.time);
      demo.labels?.update();
    } catch (error) {
      if (!broken.has(demo)) {
        broken.add(demo);
        report(`${error instanceof Error ? error.message : String(error)} — one chapter has stopped`);
      }
    }
  }
  for (const view of views) if (onScreen.has(view)) view.render();
  samples.push(delta * 1000);
  if (samples.length > 120) samples.shift();
  timer += delta;
  if (timer >= .25) {
    timer = 0;
    const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    stats.textContent = `${average.toFixed(1)} ms/frame · ${(1000 / average).toFixed(0)} fps · `
      + `${onScreen.size} of ${views.length} panels drawing · ${stats.dataset.renderer ?? ''}`;
  }
  frame = requestAnimationFrame(animate);
}

document.addEventListener('visibilitychange', () => { last = 0; });

window.addEventListener('pagehide', () => {
  disposed = true;
  cancelAnimationFrame(frame);
  observer?.disconnect();
  for (const panel of panels) panel.demo.labels?.dispose();
  for (const view of [...views].reverse()) view.dispose();
}, { once: true });

void initialize().catch(error => report(error instanceof Error ? error.message : String(error)));
