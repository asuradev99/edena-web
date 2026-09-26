import {
  WebGPUView, LabelLayer, Group, Visual, Geometry, merge, polyline, sphere, circle, axes3d,
  colorMappedSurface, functionSurface, plasma, viridis, ramp, rgba, smooth,
  createParticleState, ParticleSimulation, GpuParticleSimulation, OrbitCamera, Timeline, tween,
  type Vec3, type Rgb,
} from '../index.js';

/**
 * A physics laboratory: five live experiments built on the library's simulation seams.
 * Four panels are `WebGPUView`s sharing one device; the n-body panel drives its own canvas
 * because the particle core owns its render pipeline rather than going through a view.
 */

const get = <T extends HTMLElement>(id: string) => { const node = document.getElementById(id); if (!node) throw new Error(`Missing ${id}`); return node as T; };
const status = get('status'), stats = get('stats');
const pauseButton = get<HTMLButtonElement>('pause'), replayButton = get<HTMLButtonElement>('replay');
const views: WebGPUView[] = [], labels: LabelLayer[] = [], timelines: Timeline[] = [], updates: ((delta: number, seconds: number) => void)[] = [];
const samples: number[] = [];
let frame = 0, disposed = false, last = 0, timer = 0, elapsedSeconds = 0;
const cleanups:(()=>void)[]=[];
const visibleCanvases=new Set<HTMLCanvasElement>();
let paused = matchMedia('(prefers-reduced-motion: reduce)').matches;

function report(message: string) {
  console.error(message);
  status.textContent = message; status.hidden = false; stats.hidden = true; pauseButton.disabled = true;
}

/** `ramp` wants RGB triples; the library's color helper parses hex into premultiplied-free RGBA. */
const rgb = (hex: string): Rgb => { const [r, g, b] = rgba(hex); return [r, g, b]; };

/** A tube whose color slides along the curve — merged bands carry their own vertex colors. */
function gradientTube(points: Vec3[], width: number, colorOf: (t: number) => Rgb, bands = 56): Geometry {
  const parts: Geometry[] = [];
  for (let band = 0; band < bands; band += 1) {
    const from = Math.floor(band * (points.length - 1) / bands);
    const to = Math.min(points.length - 1, Math.max(from + 1, Math.floor((band + 1) * (points.length - 1) / bands)));
    const tube = polyline(points.slice(from, to + 1), width);
    const color = colorOf(band / (bands - 1));
    const colors = new Float32Array(tube.vertices.length);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = color[0]; colors[i + 1] = color[1]; colors[i + 2] = color[2]; }
    parts.push(new Geometry(tube.vertices, colors));
  }
  return merge(...parts);
}

/** A geometry recolored per vertex from world position. */
function colorize(geometry: Geometry, colorOf: (x: number, y: number, z: number) => Rgb): Geometry {
  const { vertices } = geometry;
  const colors = new Float32Array(vertices.length);
  for (let i = 0; i < vertices.length; i += 3) {
    const color = colorOf(vertices[i], vertices[i + 1], vertices[i + 2]);
    colors[i] = color[0]; colors[i + 1] = color[1]; colors[i + 2] = color[2];
  }
  return new Geometry(vertices, colors);
}

async function initialize() {
  const params = new URLSearchParams(location.search);
  const msaa = params.get('samples') === '1' ? 1 : 4;
  const maxDpr = params.has('dpr') ? Number(params.get('dpr')) : 2;
  // ?alpha=opaque skips premultiplied compositing, which is cheaper when nothing needs to blend
  // with the page behind the canvas.
  const alphaMode: GPUCanvasAlphaMode = params.get('alpha') === 'opaque' ? 'opaque' : 'premultiplied';

  const keplerView = await WebGPUView.create(get<HTMLCanvasElement>('kepler'), { samples: msaa, maxDpr, alphaMode, onError: report });
  if (disposed) { keplerView.dispose(); return; }
  views.push(keplerView);
  const info = keplerView.adapterInfo, name = info?.description || info?.device || info?.architecture || info?.vendor || '';
  const renderer = `${keplerView.isFallbackAdapter ? 'software GPU' : 'GPU'}${name ? ` (${name})` : ''} · msaa×${msaa} · dpr≤${maxDpr}`;
  // Triangle totals are measured from the live scene, not accumulated at construction: every
  // slider that rebuilds a geometry would otherwise inflate a running total forever.
  const counted = (geometry: Geometry) => geometry;
  const liveTriangles = () => {
    let total = 0;
    for (const v of views) for (const { node } of v.world.flatten()) total += node.geometry.vertices.length / 9;
    return total;
  };
  const addView = async (id: string) => {
    const v = await WebGPUView.create(get<HTMLCanvasElement>(id), { device: keplerView.device, onError: report });
    if (disposed) { v.dispose(); throw new Error('disposed'); }
    views.push(v); return v;
  };

  /* ── 01 · Kepler orbits: gravity integrated through the CPU seam ───────────────────────── */
  keplerView.camera.yaw = .35; keplerView.camera.pitch = .58; keplerView.camera.height = 4.6;
  const ECCENTRICITIES = [0, .35, .65];
  const PLANET_COLORS = ['#58c4dd', '#ffff00', '#83c167'];
  const orbitVisuals: Visual[] = [], planetVisuals: Visual[] = [];
  const orbitGroup = new Group(), planetGroup = new Group();
  const keplerLabels = new LabelLayer(get('kepler-labels'), keplerView.camera);
  const keplerOrbit = (a: number, e: number): Vec3[] => Array.from({ length: 481 }, (_, i) => {
    const theta = i / 480 * Math.PI * 2;
    const r = a * (1 - e * e) / (1 + e * Math.cos(theta));
    return [r * Math.cos(theta), 0, r * Math.sin(theta)] as Vec3;
  });
  // Exact two-body initial conditions for an ellipse of semi-major axis a and eccentricity e
  // with GM = 1 and the star at a focus:
  //   r(θ) = a(1 − e²)/(1 + e cos θ),  v_r = e sin θ · √(1/p),  v_θ = h/r,  h = √p
  // Getting this wrong is invisible until the planets stop tracking their own rings.
  function keplerState(a: number, e: number, theta: number): { position: Vec3; velocity: Vec3 } {
    const p = a * (1 - e * e);
    const r = p / (1 + e * Math.cos(theta));
    const radial = e * Math.sin(theta) * Math.sqrt(1 / p);
    const tangential = Math.sqrt(p) / r;
    const cos = Math.cos(theta), sin = Math.sin(theta);
    return {
      position: [r * cos, 0, r * sin],
      velocity: [radial * cos - tangential * sin, 0, radial * sin + tangential * cos],
    };
  }
  const positions: number[] = [], velocities: number[] = [];
  ECCENTRICITIES.forEach((e, index) => {
    const a = .8 + index * .35;
    // Different true anomalies so the planets do not all start on the same ray.
    const start = keplerState(a, e, index * 1.9);
    positions.push(...start.position);
    velocities.push(...start.velocity);
    // Color each orbit ring by its distance from the star: one gradient per ring, no extra draws.
    const ring = new Visual(counted(colorize(polyline(keplerOrbit(a, e), .01), (x, _y, z) => viridis(Math.hypot(x, z) / (a * (1 + e))))), rgba('#ffffff'));
    ring.reveal = 0; orbitVisuals.push(ring); orbitGroup.add(ring);
    keplerLabels.add(`e = ${e.toFixed(2)}`, () => [a * (1 + e) * .8, 0, a * (1 + e) * .34], PLANET_COLORS[index]);
  });
  ECCENTRICITIES.forEach((_, index) => {
    const planet = new Visual(counted(sphere(.045)), rgba(PLANET_COLORS[index]));
    planetVisuals.push(planet); planetGroup.add(planet);
  });
  planetGroup.add(new Visual(counted(circle(.19, 64, 'xz', .008)), rgba('#ffd866', .5)));
  planetGroup.add(new Visual(counted(sphere(.11)), rgba('#ffd866')));
  keplerView.world.add(new Visual(counted(axes3d(1.2, .006)), rgba('#eeeeee', .22)), orbitGroup, planetGroup);
  keplerLabels.add('star', () => [-.34, .17, 0], '#ffd866');
  labels.push(keplerLabels);
  let kepler = new ParticleSimulation(createParticleState(positions, 3, velocities));
  // Keep a margin: `start + duration` is compared with `>` against the timeline length, and
  // 1.1 + 1.3 lands a hair above 2.4 in binary floating point.
  const keplerTimeline = new Timeline(2.8);
  keplerTimeline.add({ start: .5, duration: 1.3, update: p => { planetGroup.opacity = p; } });
  keplerTimeline.add({ start: 1.1, duration: 1.3, update: p => { planetGroup.scale = [p, p, p]; } });
  timelines.push(keplerTimeline);
  let keplerRemainder=0;
  get('kepler-reset').addEventListener('click', () => { kepler.reset(); keplerRemainder=0;elapsedSeconds=0; });
  get('kepler-dt').addEventListener('input', event => { get('kepler-dt-value').textContent = Number((event.target as HTMLInputElement).value).toFixed(3); });
  updates.push((delta, seconds) => {
    if (!paused&&visibleCanvases.has(keplerView.canvas)) {
      const step = Number(get<HTMLInputElement>('kepler-dt').value);
      // Run simulation time faster than wall time so a full orbit reads in a few seconds.
      // Carry fractional steps forward instead of rounding every frame (refresh-rate dependent).
      keplerRemainder=Math.min(keplerRemainder+delta*1.5,step*64);
      const count = Math.floor(keplerRemainder/step);keplerRemainder-=count*step;
      for (let i = 0; i < count; i += 1) {
        kepler.step(step, (_index, position) => {
          const r = Math.max(Math.hypot(position[0], position[1], position[2]), .04);
          const k = -1 / (r * r * r);
          return [k * position[0], k * position[1], k * position[2]];
        });
      }
    }
    const { positions: advanced } = kepler.state;
    planetVisuals.forEach((planet, index) => { planet.position = [advanced[index * 3], advanced[index * 3 + 1], advanced[index * 3 + 2]]; });
    // Tubes draw themselves in once; `tween` is the library's absolute-time ramp helper.
    const reveal = smooth(tween(seconds, 0, 1.8, 0, 1));
    for (const ring of orbitVisuals) ring.reveal = reveal;
  });

  /* ── 02 · Gravity, all-pairs, on the GPU ──────────────────────────────────────────────── */
  const nbodyCanvas = get<HTMLCanvasElement>('nbody');
  const nbodyContext = nbodyCanvas.getContext('webgpu');
  if (!nbodyContext) throw new Error('WebGPU canvas context unavailable');
  const nbodyFormat = navigator.gpu.getPreferredCanvasFormat();
  nbodyContext.configure({ device: keplerView.device, format: nbodyFormat, alphaMode: 'opaque' });
  const nbodyCamera = new OrbitCamera();
  nbodyCamera.projection = 'perspective'; nbodyCamera.yaw = .9; nbodyCamera.pitch = .45; nbodyCamera.distance = 3.6;
  cleanups.push(nbodyCamera.attach(nbodyCanvas));
  const bodiesSelect = get<HTMLSelectElement>('bodies'), nbodyTiming = get('nbody-timing');
  let nbodySize: [number, number] = [nbodyCanvas.clientWidth, nbodyCanvas.clientHeight];
  // Read layout on resize only: the frame loop must not force a reflow.
  const nbodyObserver=new ResizeObserver(() => { nbodySize = [nbodyCanvas.clientWidth, nbodyCanvas.clientHeight]; });
  nbodyObserver.observe(nbodyCanvas);cleanups.push(()=>nbodyObserver.disconnect());
  const nbodyOptions = (count: number) => ({
    device: keplerView.device, format: nbodyFormat, count, mode: 'nbody' as const, layout: 'disc' as const,
    orbitPeriod: 9, pointSize: 2.1, color: [.6, .82, 1, .95] as [number, number, number, number], onError: report,
  });
  let nbody = await GpuParticleSimulation.create(nbodyOptions(Number(bodiesSelect.value)));
  if(disposed){nbody.destroy();return;}
  cleanups.push(()=>{nbody.destroy();nbodyContext.unconfigure();});
  let generation=0;
  async function measureNbody(current:GpuParticleSimulation):Promise<void>{
    nbodyTiming.textContent='Measuring GPU integration…';
    // measure() advances its target. A disposable copy prevents timing from changing the
    // experiment, and runs only on creation/count changes rather than periodically.
    let probe:GpuParticleSimulation|undefined;
    try{
      probe=await GpuParticleSimulation.create(nbodyOptions(current.count));
      if(disposed||current!==nbody)return;
      const ms=await probe.measure(20);
      if(disposed||current!==nbody)return;
      nbodyTiming.textContent=ms===null?`GPU timing unavailable${probe.timingError?` (${probe.timingError})`:''}`
        :`${current.count.toLocaleString()} bodies · GPU step ${ms.toFixed(3)} ms · ${Math.round(1000/Math.max(ms,.000001)).toLocaleString()} steps/s`;
    }catch(error){if(!disposed&&current===nbody)nbodyTiming.textContent=`GPU timing unavailable: ${String(error)}`;}
    finally{probe?.destroy();}
  }
  void measureNbody(nbody);
  const nbodyLabels = new LabelLayer(get('nbody-labels'), nbodyCamera);
  nbodyLabels.add('spiral arms', () => [1.25, .1, .55], '#8f8f99');
  labels.push(nbodyLabels);
  bodiesSelect.addEventListener('change', () => {
    const count = Number(bodiesSelect.value), request=++generation;
    void GpuParticleSimulation.create(nbodyOptions(count))
      .then(next => { if (disposed||request!==generation) { next.destroy(); return; } const previous=nbody;nbody = next; previous.destroy();void measureNbody(next); })
      .catch(e => report(String(e)));
  });
  get('nbody-reset').addEventListener('click', () => nbody.reset());
  updates.push(delta => {
    if(!visibleCanvases.has(nbodyCanvas))return;
    const dpr = Math.min(maxDpr, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(nbodySize[0] * dpr)), height = Math.max(1, Math.round(nbodySize[1] * dpr));
    if (!nbodySize[0] || !nbodySize[1]) return;
    if (nbodyCanvas.width !== width || nbodyCanvas.height !== height) { nbodyCanvas.width = width; nbodyCanvas.height = height; }
    if (!paused) nbodyCamera.yaw += delta * .07;
    nbody.setCamera(nbodyCamera.matrix(width / height), width, height);
    const encoder = nbody.device.createCommandEncoder();
    if (!paused) nbody.step(encoder);
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: nbodyContext.getCurrentTexture().createView(), loadOp: 'clear', clearValue: { r: .012, g: .014, b: .022, a: 1 }, storeOp: 'store' }],
    });
    nbody.render(pass); pass.end();
    nbody.device.queue.submit([encoder.finish()]);
  });

  /* ── 03 · Two double pendulums, 0.1° apart ───────────────────────────────────────────── */
  const pendulumView = await addView('pendulum');
  pendulumView.camera.projection = 'perspective'; pendulumView.camera.yaw = .2; pendulumView.camera.pitch = .1; pendulumView.camera.distance = 5.4;
  const pendulumGroup = new Group();
  const pendulumTimeline = new Timeline(3.4);
  let pendulumTrace: Visual | undefined;
  const pendulumAngle = get<HTMLInputElement>('pendulum-angle');
  function buildPendulum(): void {
    const g = 9.81, dt = .002, steps = 9000;
    type P = { a: number; b: number; wa: number; wb: number };
    const derivative = (s: P) => {
      const delta = s.a - s.b, denominator = 3 - Math.cos(2 * delta);
      return {
        a: s.wa, b: s.wb,
        wa: (-3 * g * Math.sin(s.a) - g * Math.sin(s.a - 2 * s.b) - 2 * Math.sin(delta) * (s.wb * s.wb + s.wa * s.wa * Math.cos(delta))) / denominator,
        wb: (2 * Math.sin(delta) * (2 * s.wa * s.wa + 2 * g * Math.cos(s.a) + s.wb * s.wb * Math.cos(delta))) / denominator,
      };
    };
    const step = (s: P) => {
      const k1 = derivative(s);
      const at = (k: P, h: number): P => ({ a: s.a + k.a * h, b: s.b + k.b * h, wa: s.wa + k.wa * h, wb: s.wb + k.wb * h });
      const k2 = derivative(at(k1, dt / 2)), k3 = derivative(at(k2, dt / 2)), k4 = derivative(at(k3, dt));
      return {
        a: s.a + dt / 6 * (k1.a + 2 * k2.a + 2 * k3.a + k4.a),
        b: s.b + dt / 6 * (k1.b + 2 * k2.b + 2 * k3.b + k4.b),
        wa: s.wa + dt / 6 * (k1.wa + 2 * k2.wa + 2 * k3.wa + k4.wa),
        wb: s.wb + dt / 6 * (k1.wb + 2 * k2.wb + 2 * k3.wb + k4.wb),
      };
    };
    const release = pendulumAngle.valueAsNumber * Math.PI / 180;
    const states: P[] = [{ a: release, b: release * .72, wa: 0, wb: 0 }, { a: release + 1e-3, b: release * .72 + 1e-3, wa: 0, wb: 0 }];
    const traces: Vec3[][] = [[], []];
    for (let i = 0; i < steps; i += 1) {
      states.forEach((s, p) => {
        const x = Math.sin(s.a) + Math.sin(s.b), y = -Math.cos(s.a) - Math.cos(s.b);
        if (i % 10 === 0) traces[p].push([x, y, 0]);
        states[p] = step(s);
      });
    }
    const chaos = ramp([0, rgb('#440154')], [.3, rgb('#3b528b')], [.55, rgb('#21918c')], [.8, rgb('#5ec962')], [1, rgb('#fde725')]);
    const merged = counted(merge(...traces.map((trace, p) => gradientTube(trace.map(point => [point[0], point[1], p ? .05 : -.05] as Vec3), .022, chaos))));
    const previous = pendulumTrace;
    pendulumTrace = new Visual(merged, rgba('#ffffff'));
    pendulumTrace.reveal = 0;
    if (previous) pendulumGroup.remove(previous);
    pendulumGroup.add(pendulumTrace);
  }
  pendulumView.world.add(pendulumGroup);
  pendulumTimeline.add({ start: 0, duration: 3.4, update: p => { if (pendulumTrace) pendulumTrace.reveal = p; } });
  timelines.push(pendulumTimeline);
  const pendulumLabels = new LabelLayer(get('pendulum-labels'), pendulumView.camera);
  pendulumLabels.add('released together', () => [-1.9, 1.35, 0], '#fde725');
  pendulumLabels.add('histories split', () => [-2.1, -1.9, 0], '#21918c');
  labels.push(pendulumLabels);
  buildPendulum();
  pendulumAngle.addEventListener('input', () => {
    get('pendulum-angle-value').textContent = `${pendulumAngle.value}°`;
    buildPendulum();
    elapsedSeconds=0;
  });

  /* ── 04 · The Lorenz attractor ────────────────────────────────────────────────────────── */
  const lorenzView = await addView('lorenz');
  lorenzView.camera.projection = 'perspective'; lorenzView.camera.yaw = .6; lorenzView.camera.pitch = .26; lorenzView.camera.distance = 3.2;
  const lorenzGroup = new Group();
  const lorenzTimeline = new Timeline(3.2);
  let lorenzCurve: Visual | undefined;
  const rhoInput = get<HTMLInputElement>('rho');
  function buildLorenz(rho: number): void {
    const sigma = 10, beta = 8 / 3, dt = .004;
    const derivative = (x: number, y: number, z: number): Vec3 => [sigma * (y - x), x * (rho - z) - y, x * y - beta * z];
    let x = .1, y = 0, z = 0;
    const points: Vec3[] = [];
    for (let i = 0; i < 9000; i += 1) {
      const [dx, dy, dz] = derivative(x, y, z);
      const [ax, ay, az] = derivative(x + dx * dt / 2, y + dy * dt / 2, z + dz * dt / 2);
      const [bx, by, bz] = derivative(x + ax * dt / 2, y + ay * dt / 2, z + az * dt / 2);
      const [cx, cy, cz] = derivative(x + bx * dt, y + by * dt, z + bz * dt);
      x += dt / 6 * (dx + 2 * ax + 2 * bx + cx);
      y += dt / 6 * (dy + 2 * ay + 2 * by + cy);
      z += dt / 6 * (dz + 2 * az + 2 * bz + cz);
      if (i % 8 === 0) points.push([x * .055, (z - 25) * .055, y * .055]);
    }
    const previous = lorenzCurve;
    lorenzCurve = new Visual(counted(gradientTube(points, .013, ramp([0, rgb('#58c4dd')], [.5, rgb('#c792ea')], [1, rgb('#ffff00')]))), rgba('#ffffff'));
    lorenzCurve.reveal = 0;
    if (previous) lorenzGroup.remove(previous);
    lorenzGroup.add(lorenzCurve);
  }
  lorenzView.world.add(new Visual(counted(axes3d(1.1, .006)), rgba('#eeeeee', .22)), lorenzGroup);
  lorenzTimeline.add({ start: 0, duration: 3, update: p => { if (lorenzCurve) lorenzCurve.reveal = p; } });
  timelines.push(lorenzTimeline);
  buildLorenz(Number(rhoInput.value));
  rhoInput.addEventListener('input', () => {
    get('rho-value').textContent = rhoInput.valueAsNumber.toFixed(1);
    buildLorenz(rhoInput.valueAsNumber);
    elapsedSeconds=0;
  });

  /* ── 05 · Two-source interference as a height field ──────────────────────────────────── */
  const waveView = await addView('wave');
  waveView.camera.projection = 'perspective'; waveView.camera.yaw = .28; waveView.camera.pitch = .82; waveView.camera.distance = 9.6;
  const waveInput = get<HTMLInputElement>('wave-k'), waveGap = get<HTMLInputElement>('wave-gap');
  let waveSurface: Visual | undefined;
  function buildWave(wavenumber: number, separation: number): void {
    const source = separation / 2;
    const amplitude = (x: number, y: number) => {
      const r1 = Math.hypot(x - source, y), r2 = Math.hypot(x + source, y);
      return .2 * (Math.cos(wavenumber * r1) / (1 + r1) + Math.cos(wavenumber * r2) / (1 + r2));
    };
    const previous = waveSurface;
    waveSurface = new Visual(counted(colorMappedSurface(amplitude, [-3, 3], [-3, 3], plasma, [48, 48], [-.4, .4])), rgba('#ffffff', .95));
    if (previous) waveView.world.remove(previous);
    waveView.world.add(waveSurface);
  }
  waveView.world.add(new Visual(counted(axes3d(1.4, .006)), rgba('#eeeeee', .18)));
  buildWave(waveInput.valueAsNumber, waveGap.valueAsNumber);
  const waveLabels = new LabelLayer(get('wave-labels'), waveView.camera);
  waveLabels.add('nodes', () => [0, .34, 0], '#8f8f99');
  labels.push(waveLabels);
  waveInput.addEventListener('input', () => {
    get('wave-k-value').textContent = waveInput.valueAsNumber.toFixed(1);
    buildWave(waveInput.valueAsNumber, waveGap.valueAsNumber);
  });
  waveGap.addEventListener('input', () => {
    get('wave-gap-value').textContent = waveGap.valueAsNumber.toFixed(2);
    buildWave(waveInput.valueAsNumber, waveGap.valueAsNumber);
  });

  /* ── 06 · Drumhead modes: functionSurface, nodal lines, group visibility ─────────────── */
  const drumView = await addView('drum');
  drumView.camera.projection = 'perspective'; drumView.camera.yaw = .52; drumView.camera.pitch = .6; drumView.camera.distance = 4.4;
  const drumM = get<HTMLSelectElement>('drum-m'), drumN = get<HTMLSelectElement>('drum-n');
  const nodeToggle = get<HTMLInputElement>('drum-nodes');
  const drumGroup = new Group(), nodeGroup = new Group();
  let drumSurface: Visual | undefined, drumNodes: Visual | undefined;
  const displacement = ramp([0, rgb('#2b1d59')], [.5, rgb('#c792ea')], [1, rgb('#ffff00')]);
  function buildDrum(m: number, n: number): void {
    // A square membrane clamped at its edges: z = sin(mπx/2)·sin(nπy/2) on [-1, 1]².
    const mode = functionSurface(
      (x, y) => .5 * Math.sin(m * Math.PI * (x + 1) / 2) * Math.sin(n * Math.PI * (y + 1) / 2),
      [-1, 1], [-1, 1], [48, 48],
    );
    const lines: Geometry[] = [];
    for (let k = 0; k <= m; k += 1) { const x = -1 + 2 * k / m; lines.push(polyline([[x, 0, -1], [x, 0, 1]], .011)); }
    for (let l = 0; l <= n; l += 1) { const z = -1 + 2 * l / n; lines.push(polyline([[-1, 0, z], [1, 0, z]], .011)); }
    const previousSurface = drumSurface, previousNodes = drumNodes;
    drumSurface = new Visual(counted(colorize(mode, (_x, y) => displacement((y + 1.2) / 2.4))), rgba('#ffffff'));
    drumNodes = new Visual(counted(merge(...lines)), rgba('#58c4dd', .85));
    if (previousSurface) drumGroup.remove(previousSurface);
    if (previousNodes) nodeGroup.remove(previousNodes);
    drumGroup.add(drumSurface); nodeGroup.add(drumNodes);
  }
  // The lines sit exactly on the surface's zero crossings, and the renderer does no depth
  // writes, so they must be submitted *after* the surface to be seen on top of it.
  drumView.world.add(new Visual(counted(axes3d(1.45, .006)), rgba('#eeeeee', .18)), drumGroup, nodeGroup);
  // A dedicated timeline drives the vibration with play()/tick() rather than absolute seeks.
  const drumTimeline = new Timeline(2);
  drumTimeline.add({ start: 0, duration: 2, update: p => { drumGroup.scale = [1, .22 + .78 * Math.abs(Math.cos(Math.PI * p)), 1]; } });
  drumTimeline.play();
  buildDrum(Number(drumM.value), Number(drumN.value));
  const drumLabels = new LabelLayer(get('drum-labels'), drumView.camera);
  drumLabels.add('nodal lines', () => [-1.32, .05, 1.32], '#58c4dd');
  labels.push(drumLabels);
  const rebuildDrum = () => { buildDrum(Number(drumM.value), Number(drumN.value)); nodeGroup.visible = nodeToggle.checked; };
  drumM.addEventListener('change', rebuildDrum);
  drumN.addEventListener('change', rebuildDrum);
  nodeToggle.addEventListener('change', () => { nodeGroup.visible = nodeToggle.checked; });

  const labelViews:[LabelLayer,HTMLCanvasElement][]=[
    [keplerLabels,keplerView.canvas],[nbodyLabels,nbodyCanvas],[pendulumLabels,pendulumView.canvas],
    [waveLabels,waveView.canvas],[drumLabels,drumView.canvas],
  ];
  const visibility=new IntersectionObserver(entries=>{
    for(const entry of entries){const canvas=entry.target as HTMLCanvasElement;
      if(entry.isIntersecting)visibleCanvases.add(canvas);else visibleCanvases.delete(canvas);}
  },{rootMargin:'100px'});
  for(const canvas of [...views.map(v=>v.canvas),nbodyCanvas]){visibleCanvases.add(canvas);visibility.observe(canvas);}
  cleanups.push(()=>visibility.disconnect());

  if (paused) for (const timeline of timelines) timeline.seek(timeline.duration);
  animate(performance.now());

  function animate(now: number) {
    if (disposed) return;
    const delta = last ? Math.max(0,Math.min((now - last) / 1000, .1)) : 0; last = now;
    if(!paused)elapsedSeconds+=delta;
    const seconds = elapsedSeconds;
    if (!paused) {
      for (const timeline of timelines) timeline.seek(Math.min(timeline.duration, seconds));
      // tick()/play() rather than an absolute seek: a looping vibration for the drumhead.
      drumTimeline.tick(delta);
      if (!drumTimeline.playing) drumTimeline.play();
      lorenzGroup.rotation += delta * .12;
    }
    for (const update of updates) update(delta, seconds);
    for (const [layer,canvas] of labelViews) if(visibleCanvases.has(canvas))layer.update();
    for (const v of views) if(visibleCanvases.has(v.canvas))v.render();
    samples.push(delta * 1000); if (samples.length > 120) samples.shift();
    timer += delta;
    if (timer >= .25) {
      timer = 0;
      const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
      stats.textContent = `${average.toFixed(1)} ms/frame · ${(1000 / Math.max(average, .0001)).toFixed(0)} fps · ${views.length + 1} views · ${Math.round(liveTriangles()).toLocaleString()} triangles · ${renderer}`;
    }
    frame = requestAnimationFrame(animate);
  }
}

function toggle() {
  paused = !paused;
  pauseButton.textContent = paused ? 'Resume motion' : 'Pause motion';
  pauseButton.setAttribute('aria-pressed', String(paused));
}
pauseButton.addEventListener('click', toggle);
pauseButton.textContent = paused ? 'Resume motion' : 'Pause motion';
pauseButton.setAttribute('aria-pressed', String(paused));
replayButton.addEventListener('click', () => { elapsedSeconds=0;for(const timeline of timelines)timeline.seek(0); });
document.addEventListener('visibilitychange', () => { last = 0; });

function shutdown() {
  disposed = true; cancelAnimationFrame(frame);
  for(const cleanup of cleanups)cleanup();
  for (const layer of labels) layer.dispose();
  for (const view of [...views].reverse()) view.dispose();
}
window.addEventListener('pagehide', shutdown, { once: true });
void initialize().catch(e => { shutdown(); report(e instanceof Error ? e.message : String(e)); });
