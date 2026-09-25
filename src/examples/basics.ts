/**
 * Basics: one small demo per fundamental piece of the library.
 *
 * Each demo below is a self-contained factory that builds its own world and returns an `update`, so
 * they can be read — and copied — one at a time. They draw through one device and one render loop,
 * which is how a page with several views is normally put together.
 */
import {
  WebGPUView, LabelLayer, Group, Visual, Timeline, tween,
  axes3d, boundsBox, box, boxEdges, cylinder, polyline, arrow, circle, sphere, shadedSphere, wireSphere, isosurface,
  parametricSurface, functionSurface, functionCurve, merge, rgba, lerp, smooth, transform, applyMatrix,
  createParticleState, stepParticles, streamlines, sphereSeeds, type VectorField, type ParticleAcceleration,
  mathml, mi, mn, mo, mtext, msub, msup, row, matrix, vec, tickValues, niceStep, formatTick, plotFrame, viridis, plasma,
  Geometry, type Vec3, type Rgb,
} from '../index.js';

const $ = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node as T;
};

const status = $('status');
const stats = $('stats');
/** ?samples=1 and ?dpr=1 drop MSAA and cap resolution for slow backends and headless checks. */
const params = new URLSearchParams(location.search);
const msaa = params.get('samples') === '1' ? 1 : 4;
const maxDpr = params.has('dpr') ? Number(params.get('dpr')) : 2;
/** Demos that move start still for a reader who asked for less motion. */
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

type Demo = { update(delta: number, clock: number): void; labels: LabelLayer };
const demos: Demo[] = [];
const views: WebGPUView[] = [];
/** Demos that threw; they are reported once and then skipped, so one cannot freeze the page. */
const broken = new Set<Demo>();
/** Views currently intersecting the viewport; the render loop skips the rest. */
const onScreen = new Set<WebGPUView>();
let observer: IntersectionObserver | undefined;
let disposed = false, frame = 0, last = 0, clock = 0, timer = 0;
const samples: number[] = [];

function report(message: string): void {
  console.error(message);
  status.textContent = message;
  status.hidden = false;
  stats.hidden = true;
}

/** Perspective camera, in the vocabulary the demos below use. */
function look(view: WebGPUView, yaw: number, pitch: number, distance: number): void {
  view.camera.projection = 'perspective';
  view.camera.yaw = yaw;
  view.camera.pitch = pitch;
  view.camera.distance = distance;
}

/** Upright text through the math typesetter, so labels share one style and one renderer. */
const tag = (text: string): string => mathml(mtext(text));
/** `t = 1.24` — the one label the helix rewrites as its marker moves. */
const timeLabel = (value: number): string => mathml(row(mi('t'), mo('='), mn(value.toFixed(2))));

/** Kept as an explicit marker at each call: a running tally would count every rebuild again. */
const count = (geometry: Geometry): Geometry => geometry;

/** The triangles actually queued, recomputed from the worlds so rebuilds cannot inflate it. */
function drawnTriangles(): number {
  let total = 0;
  for (const view of views) {
    if (!onScreen.has(view)) continue;
    for (const { node } of view.world.flatten()) total += node.geometry.vertices.length / 9;
  }
  return total;
}

/* --------------------------------------------------------------------------------------------
 * 01 · The 3D coordinate system: axes3d, boundsBox, tickValues, a grid, and projected labels.
 * ------------------------------------------------------------------------------------------ */

function coordinateDemo(view: WebGPUView): Demo {
  look(view, .64, .33, 5.9);
  const labels = new LabelLayer($('coordinates-labels'), view.camera);
  // Look slightly above the origin: the marker rides up to y = 2.4 with a label over it.
  view.camera.target = [0, .35, 0];
  const extent = 1.9;

  // A grid floor at z = -1, one merged visual: lines are tubes, so they keep their width in 3D.
  const gridLines: Geometry[] = [];
  for (let value = -extent; value <= extent + 1e-9; value += .4) {
    gridLines.push(polyline([[value, -1, -extent], [value, -1, extent]], .003));
    gridLines.push(polyline([[-extent, -1, value], [extent, -1, value]], .003));
  }
  const grid = new Visual(count(merge(...gridLines)), rgba('#7fb7d0', .16));

  const axes = new Visual(count(axes3d(extent, .012)), rgba('#dbe9f5', .9));
  const cage = new Visual(count(boundsBox([-1, -1, -1], [1, 1, 1], .005)), rgba('#9fe7ff', .45));

  // Integer ticks, as marks only: a number beside every one of them turned the picture into a
  // scattering of digits, and the cage and the grid already carry the scale.
  const tickLines: Geometry[] = [];
  for (let axis = 0; axis < 3; axis++) {
    for (const value of tickValues(-2, 2, 4)) {
      if (value === 0) continue;
      const at: Vec3 = [0, 0, 0];
      at[axis] = value;
      const wing: Vec3 = [0, 0, 0];
      wing[(axis + 1) % 3] = .05;
      tickLines.push(polyline([at.map((v, i) => v - wing[i]) as Vec3, at.map((v, i) => v + wing[i]) as Vec3], .005));
    }
  }
  const ticks = new Visual(count(merge(...tickLines)), rgba('#cfe4ea', .55));

  // The marker, controlled by the panel: a shaded ball, a dotted drop to the floor, a live label.
  let height = Number($<HTMLInputElement>('coordinates-height').value);
  const marker = new Visual(count(shadedSphere(.14)), rgba('#f7d681'));
  const drop = new Visual(polyline([[0, 0, 0], [0, 0, 0]], .006), rgba('#f7d681', .4));
  const place = (y: number): void => {
    marker.position = [1, y, .5];
    drop.geometry = polyline([[1, y, .5], [1, -1, .5]], .006);
  };
  place(height);
  // One label, clear of the marker it describes.
  labels.addHTML(mathml(row(mi('P'), mo('='), mo('('), mn('1.00'), mo(','), mn(height.toFixed(2)), mo(','), mn('0.50'), mo(')'))), () => [1.42, marker.position[1] + .42, .5], '#f7d681', 'math-label');

  // Axis names, in the colour the panel headings use, sitting just past each arrow.
  const names: [string, Vec3, string][] = [
    ['x', [extent + .42, -.12, 0], '#ff9a9a'],
    ['y', [-.14, extent + .42, 0], '#a8e6a3'],
    ['z', [-.14, 0, extent + .42], '#9ec9ff'],
  ];
  for (const [name, position, colour] of names) labels.addHTML(mathml(mi(name)), () => position, colour, 'math-label axis-name');

  view.world.add(grid, axes, cage, ticks, marker, drop);

  $<HTMLSelectElement>('coordinates-projection').addEventListener('change', event => {
    const mode = (event.target as HTMLSelectElement).value as 'perspective' | 'orthographic';
    view.camera.projection = mode;
    // Both are always set, so switching modes cannot land on a stale zoom.
    view.camera.height = 4.9;
    view.camera.distance = 5.9;
  });
  $<HTMLInputElement>('coordinates-grid').addEventListener('change', event => { grid.visible = (event.target as HTMLInputElement).checked; });
  $<HTMLInputElement>('coordinates-height').addEventListener('input', event => {
    height = Number((event.target as HTMLInputElement).value);
    $('coordinates-height-value').textContent = `y = ${height.toFixed(2)}`;
    place(height);
  });

  return { labels, update: () => {} };
}

/* --------------------------------------------------------------------------------------------
 * 02 · Interpolation: one Timeline, three easings, and absolute-time seeking.
 * ------------------------------------------------------------------------------------------ */

function interpolationDemo(view: WebGPUView): Demo {
  look(view, .85, .5, 7.6);
  const labels = new LabelLayer($('interpolation-labels'), view.camera);
  const radius = 2.2, turn = Math.PI * 2;

  const marker = (colour: string, y: number, text: string): Visual => {
    const visual = new Visual(count(shadedSphere(.17)), rgba(colour));
    visual.position = [radius, y, 0];
    view.world.add(visual);
    // The label rides beside its own marker, which is what the closure is for. The markers are stacked
    // vertically because they start and finish together, so the labels get room to breathe.
    labels.addHTML(tag(text), () => [visual.position[0] + .62, visual.position[1] + .2, visual.position[2]], colour, 'math-label');
    return visual;
  };
  const linear = marker('#f7d681', .55, 'lerp · constant speed');
  const smoothed = marker('#58c4dd', 0, 'smooth');
  const delayed = marker('#ff9ec4', -.55, 'tween · delayed');

  // The ring they travel, and one marker per easing, at a slightly different height so all three
  // stay legible when they bunch up.
  view.world.add(new Visual(count(circle(radius, 128, 'xz', .01)), rgba('#4a6b80', .85)));

  const place = (visual: Visual, angle: number): void => {
    visual.position = [radius * Math.cos(angle), visual.position[1], radius * Math.sin(angle)];
  };
  const timeline = new Timeline(4);
  // Cue 1 — a straight lerp, with the ease switched off so the difference is visible.
  timeline.add({ start: 0, duration: 4, ease: t => t, update: p => place(linear, p * turn) });
  // Cue 2 — the same motion with the default ease, which is the library's smoothstep.
  timeline.add({ start: 0, duration: 4, update: p => place(smoothed, p * turn) });
  // Cue 3 — the tween helper, on absolute time, because a cue is free to read the clock.
  timeline.add({ start: 1, duration: 2, ease: t => t, update: () => place(delayed, tween(timeline.time, 1, 2, 0, 1) * turn) });

  const timeInput = $<HTMLInputElement>('interpolation-time');
  const readout = $('interpolation-time-value');
  const playButton = $<HTMLButtonElement>('interpolation-play');
  const speedSelect = $<HTMLSelectElement>('interpolation-speed');

  let playing = !reducedMotion;
  const button = (): void => {
    playButton.textContent = playing ? 'Pause' : 'Play';
    playButton.setAttribute('aria-pressed', String(playing));
  };
  playButton.addEventListener('click', () => { if (playing) timeline.pause(); else timeline.play(); playing = !playing; button(); });
  timeInput.addEventListener('input', () => { playing = false; timeline.pause(); timeline.seek(Number(timeInput.value)); button(); });
  speedSelect.addEventListener('change', () => { timeline.speed = Number(speedSelect.value); });
  button();

  return {
    labels,
    update: delta => {
      if (playing) timeline.tick(delta);
      timeInput.value = String(timeline.time);
      readout.textContent = `${timeline.time.toFixed(2)} s`;
    },
  };
}

/* --------------------------------------------------------------------------------------------
 * 03 · Solids with transparent sides: box faces, cages, nesting and opacity.
 * ------------------------------------------------------------------------------------------ */

function transparencyDemo(view: WebGPUView): Demo {
  look(view, .74, .34, 4.9);
  const labels = new LabelLayer($('transparency-labels'), view.camera);
  const spin = new Group();

  // A glass case with a glass ball and a glass rod inside it: three solids, three opacities, and a
  // wire outline on each so the shapes stay readable through the faces.
  const caseSize = 1.2;
  const contents = [
    { name: 'box', colour: '#58c4dd', alpha: .1, geometry: () => box([-caseSize, -caseSize, -caseSize], [caseSize, caseSize, caseSize]), outline: () => boxEdges([-caseSize, -caseSize, -caseSize], [caseSize, caseSize, caseSize], .006), position: [0, 0, 0] as Vec3, label: [-caseSize * 1.02, caseSize * 1.02, caseSize * 1.02] as Vec3 },
    { name: 'sphere', colour: '#83c167', alpha: .3, geometry: () => sphere(.45), outline: () => wireSphere(.45, 10, 6, .005), position: [-.55, 0, 0] as Vec3, label: [-.55, .62, 0] as Vec3 },
    { name: 'cylinder', colour: '#f7d681', alpha: .34, geometry: () => cylinder(.38, 1.5), outline: () => cylinderCage(.38, 1.5), position: [.55, 0, 0] as Vec3, label: [.55, .95, 0] as Vec3 },
  ];
  const solids: { visual: Visual; alpha: number; colour: string }[] = [];
  for (const item of contents) {
    const solid = new Visual(count(item.geometry()), rgba(item.colour, item.alpha));
    solid.position = item.position;
    const outline = new Visual(count(item.outline()), rgba(item.colour, .6));
    outline.position = item.position;
    spin.add(solid, outline);
    solids.push({ visual: solid, alpha: item.alpha, colour: item.colour });
    // The name rides the solid, so it has to turn with the group the solid belongs to.
    labels.addHTML(tag(item.name), () => spinPoint(item.label, spin.rotation), item.colour, 'math-label');
  }
  view.world.add(spin, new Visual(count(axes3d(1.6, .008)), rgba('#dbe9f5', .28)));

  const opacityInput = $<HTMLInputElement>('transparency-opacity');
  const opacityValue = $('transparency-opacity-value');
  const spinButton = $<HTMLButtonElement>('transparency-spin');
  let spinning = !reducedMotion;
  const sync = (): void => {
    const factor = Number(opacityInput.value);
    opacityValue.textContent = factor.toFixed(2);
    // Each solid keeps its own face set, so they can be faded together or one at a time.
    for (const entry of solids) entry.visual.color = rgba(entry.colour, Math.min(1, entry.alpha * factor));
  };
  const button = (): void => {
    spinButton.textContent = spinning ? 'Spinning' : 'Still';
    spinButton.setAttribute('aria-pressed', String(spinning));
  };
  opacityInput.addEventListener('input', sync);
  spinButton.addEventListener('click', () => { spinning = !spinning; button(); });
  sync();
  button();

  return {
    labels,
    update: (_delta, time) => { if (spinning) spin.rotation = time * .5; },
  };
}

/** Rims and staves for a cylinder: the wireframe that reads through translucent faces. */
function cylinderCage(radius: number, height: number): Geometry {
  const half = height / 2;
  const parts: Geometry[] = [circle(radius, 64, 'xz', .005)];
  const rims = [half, -half].map(y => polyline(Array.from({ length: 65 }, (_, i) => {
    const angle = i / 64 * Math.PI * 2;
    return [radius * Math.cos(angle), y, radius * Math.sin(angle)] as Vec3;
  }), .005));
  const staves = [0, 1, 2, 3].map(k => {
    const angle = k / 4 * Math.PI * 2;
    return polyline([[radius * Math.cos(angle), -half, radius * Math.sin(angle)], [radius * Math.cos(angle), half, radius * Math.sin(angle)]], .005);
  });
  return merge(...parts, ...rims, ...staves);
}

/** Y rotation, matching the transform the renderer applies to a `Visual` or `Group`. */
function spinPoint(point: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle), s = Math.sin(angle);
  return [point[0] * c + point[2] * s, point[1], -point[0] * s + point[2] * c];
}

/* --------------------------------------------------------------------------------------------
 * 04 · Geometry, made and merged: the primitives, side by side, with a parametric surface.
 * ------------------------------------------------------------------------------------------ */

function shapesDemo(view: WebGPUView): Demo {
  look(view, .32, .26, 6.6);
  const labels = new LabelLayer($('shapes-labels'), view.camera);
  const shelf = new Group();

  const primitives: { name: string; geometry: Geometry; colour: string }[] = [
    { name: 'polyline', geometry: polyline([[-.35, -.35, .25], [0, .05, -.25], [.35, .4, .25]], .03, 8), colour: '#9ad0ff' },
    { name: 'arrow', geometry: arrow([0, -.45, 0], [0, .45, 0], .03), colour: '#f7d681' },
    { name: 'circle', geometry: circle(.4, 72, 'xy', .02), colour: '#83c167' },
    { name: 'sphere', geometry: sphere(.4), colour: '#b5a1ff' },
    { name: 'shadedSphere', geometry: shadedSphere(.4), colour: '#58c4dd' },
    { name: 'wireSphere', geometry: wireSphere(.42, 10, 6, .007), colour: '#ff9ec4' },
  ];

  const slots = primitives.length + 1;
  const half = 2.75;
  primitives.forEach((primitive, index) => {
    const x = -half + index * (2 * half / (slots - 1));
    const visual = new Visual(count(primitive.geometry), rgba(primitive.colour));
    visual.position = [x, .12, 0];
    shelf.add(visual);
    labels.addHTML(tag(primitive.name), () => applyMatrix(shelfMatrix(), [x, index % 2 ? -1.18 : -.92, 0]), '#9db0c2', 'math-label');
  });

  // The last slot is a parametric surface, which is also just a function — of two parameters.
  const surfaces: Record<string, () => Geometry> = {
    // Laid in the xy plane, so the hole faces the camera instead of hiding behind the near rim.
    torus: () => parametricSurface((u, v) => [(.44 + .18 * Math.cos(v)) * Math.cos(u), (.44 + .18 * Math.cos(v)) * Math.sin(u), .18 * Math.sin(v)], [0, Math.PI * 2], [0, Math.PI * 2], [72, 18]),
    mobius: () => parametricSurface((u, v) => [(.42 + v * .2 * Math.cos(u / 2)) * Math.cos(u), (.42 + v * .2 * Math.cos(u / 2)) * Math.sin(u), v * .2 * Math.sin(u / 2)], [0, Math.PI * 2], [-1, 1], [96, 8]),
    wave: () => functionSurface((x, y) => .3 * Math.sin(2 * x) * Math.cos(2 * y), [-.68, .68], [-.68, .68], [44, 44]),
  };
  const surfaceX = half;
  let surface = new Visual(count(surfaces.torus()), rgba('#58c4dd'));
  surface.position = [surfaceX, .12, 0];
  shelf.add(surface);
  labels.addHTML(tag('parametricSurface'), () => applyMatrix(shelfMatrix(), [surfaceX, -.92, 0]), '#9db0c2', 'math-label');

  view.world.add(shelf);

  // Labels live in world space, so they ride the shelf's own matrix: `rotation` is the y turn, and
  // `orientation` the three-axis pose the library applies before it.
  const spinInput = $<HTMLInputElement>('shapes-spin');
  const tiltInput = $<HTMLInputElement>('shapes-tilt');
  const shelfMatrix = (): Float32Array => transform([0, 0, 0], [1, 1, 1], shelf.rotation, shelf.orientation);
  const applySpin = (): void => {
    const degrees = Number(spinInput.value), tilt = Number(tiltInput.value) * Math.PI / 180;
    $('shapes-spin-value').textContent = `${Math.round(degrees)}°`;
    $('shapes-tilt-value').textContent = `${Math.round(Number(tiltInput.value))}°`;
    shelf.rotation = degrees * Math.PI / 180;
    shelf.orientation = [tilt, 0, 0];
  };
  spinInput.addEventListener('input', applySpin);
  tiltInput.addEventListener('input', applySpin);
  applySpin();

  $<HTMLSelectElement>('shapes-kind').addEventListener('change', event => {
    const kind = (event.target as HTMLSelectElement).value;
    const next = new Visual(count(surfaces[kind]()), rgba('#58c4dd'));
    next.position = [surfaceX, .12, 0];
    shelf.remove(surface);
    shelf.add(next);
    surface = next;
  });

  return { labels, update: () => {} };
}

/* --------------------------------------------------------------------------------------------
 * 05 · Groups and nested transforms: a parent, three arms, and a satellite each.
 * ------------------------------------------------------------------------------------------ */

function groupsDemo(view: WebGPUView): Demo {
  look(view, .4, .34, 5.8);
  const labels = new LabelLayer($('groups-labels'), view.camera);
  const system = new Group();
  const arms: { group: Group; base: number; rate: number; satellite: Group }[] = [];

  const hub = new Visual(count(shadedSphere(.2)), rgba('#e7edf5'));
  system.add(hub);

  for (let index = 0; index < 3; index++) {
    const arm = new Group();
    const base = index * Math.PI * 2 / 3;
    arm.rotation = base;
    const beam = new Visual(count(polyline([[0, 0, 0], [1.7, 0, 0]], .028, 8)), rgba('#9ad0ff', .9));
    const ball = new Visual(count(shadedSphere(.24)), rgba('#f7d681'));
    ball.position = [1.7, 0, 0];
    // A third level: the satellite orbits the ball, so the matrix chain is three deep.
    const satellite = new Group();
    satellite.position = [1.7, 0, 0];
    const moon = new Visual(count(shadedSphere(.11)), rgba('#ff9ec4'));
    moon.position = [.44, 0, 0];
    satellite.add(moon);
    arm.add(beam, ball, satellite);
    system.add(arm);
    arms.push({ group: arm, base, rate: .55 - index * .16, satellite });
  }
  view.world.add(system, new Visual(count(axes3d(.9, .006)), rgba('#dbe9f5', .22)));

  const spinButton = $<HTMLButtonElement>('groups-spin');
  let spinning = !reducedMotion, phase = 0;
  const button = (): void => {
    spinButton.textContent = spinning ? 'Spinning' : 'Still';
    spinButton.setAttribute('aria-pressed', String(spinning));
  };
  spinButton.addEventListener('click', () => { spinning = !spinning; button(); });
  button();

  const scaleInput = $<HTMLInputElement>('groups-scale');
  const opacityInput = $<HTMLInputElement>('groups-opacity');
  scaleInput.addEventListener('input', () => {
    const value = Number(scaleInput.value);
    $('groups-scale-value').textContent = value.toFixed(2);
    system.scale = [value, value, value];
  });
  // Group opacity multiplies down the tree: the beams and balls share the arms' fading.
  opacityInput.addEventListener('input', () => { for (const arm of arms) arm.group.opacity = Number(opacityInput.value); });

  return {
    labels,
    // An accumulated phase, so stopping holds the arms where they are instead of snapping back.
    update: delta => {
      if (spinning) phase += delta;
      system.rotation = phase * .22;
      for (const arm of arms) {
        arm.group.rotation = arm.base + phase * arm.rate;
        arm.satellite.rotation = phase * 1.6;
      }
    },
  };
}

/* --------------------------------------------------------------------------------------------
 * 06 · Labels on the scene: a helix, a travelling marker, and typeset maths that follows it.
 * ------------------------------------------------------------------------------------------ */

function labelDemo(view: WebGPUView): Demo {
  look(view, .5, .26, 6.8);
  const labels = new LabelLayer($('labels-stage-labels'), view.camera);
  const radius = 1.15, rise = .8;
  let turns = Number($<HTMLInputElement>('labels-turns').value);

  const helixGeometry = (n: number): Geometry => {
    const points: Vec3[] = [];
    const steps = 64 * n;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps * Math.PI * 2 * n;
      points.push([radius * Math.cos(t), rise * t / (Math.PI * 2) - rise * n / 2, radius * Math.sin(t)]);
    }
    return polyline(points, .012, 6);
  };
  const helix = new Visual(count(helixGeometry(turns)), rgba('#58c4dd', .9));
  const marker = new Visual(count(shadedSphere(.13)), rgba('#f7d681'));
  view.world.add(helix, marker, new Visual(count(axes3d(1.7, .006)), rgba('#dbe9f5', .25)));

  // Two labels: one static equation beside the helix, one number that follows the marker.
  labels.addHTML(mathml(row(mo('('), mi('cos'), mtext(' '), mi('t'), mo(','), mtext(' '), mn('0.80'), mi('t'), mo(','), mtext(' '), mi('sin'), mtext(' '), mi('t'), mo(')'))), () => [radius + .85, rise * turns / 2 + .7, 0], '#8fa2b8', 'math-label');
  const live = labels.addHTML(timeLabel(0), () => [marker.position[0], marker.position[1] + .3, marker.position[2]], '#f7d681', 'math-label');

  const turnsInput = $<HTMLInputElement>('labels-turns');
  turnsInput.addEventListener('input', () => {
    turns = Number(turnsInput.value);
    $('labels-turns-value').textContent = String(turns);
    helix.geometry = helixGeometry(turns);
  });

  const playButton = $<HTMLButtonElement>('labels-play');
  let playing = !reducedMotion, phase = 0, shown = -1;
  const button = (): void => {
    playButton.textContent = playing ? 'Pause' : 'Play';
    playButton.setAttribute('aria-pressed', String(playing));
  };
  playButton.addEventListener('click', () => { playing = !playing; button(); });
  button();

  return {
    labels,
    update: delta => {
      if (playing) phase = (phase + delta * .35) % 1;
      const t = phase * Math.PI * 2 * turns;
      marker.position = [radius * Math.cos(t), rise * t / (Math.PI * 2) - rise * turns / 2, radius * Math.sin(t)];
      // Rewriting the label only when its rounded value changes keeps the DOM out of the frame loop.
      const value = Math.round(t * 100) / 100;
      if (value !== shown) { shown = value; live.innerHTML = timeLabel(value); }
    },
  };
}

/* --------------------------------------------------------------------------------------------
 * 07 · Colour from data: per-vertex colours and a palette you can read.
 * ------------------------------------------------------------------------------------------ */

function colourDemo(view: WebGPUView): Demo {
  look(view, .52, .34, 6.4);
  const labels = new LabelLayer($('colour-labels'), view.camera);
  const paletteSelect = $<HTMLSelectElement>('colour-palette');
  const amplitudeInput = $<HTMLInputElement>('colour-amplitude');
  const group = new Group();
  view.world.add(group, new Visual(count(axes3d(1.2, .006)), rgba('#dbe9f5', .22)));
  let amplitude = Number(amplitudeInput.value);

  const paletteName = (): string => (paletteSelect.value === 'plasma' ? 'plasma' : 'viridis');
  const palette = (): ((t: number) => Rgb) => (paletteSelect.value === 'plasma' ? plasma : viridis);
  const span = 2.2;
  /** Height of the surface, which is also the value the colour encodes. */
  const f = (x: number, z: number): number => amplitude * Math.sin(x * 1.2) * Math.cos(z * 1.2);
  const ribbonLeft = span + .5, ribbonRight = span + .8;

  // Built by hand rather than with a helper, because the mechanism is the point of this demo: a
  // palette is a function from [0, 1] to a colour, and geometry can carry one colour per vertex.
  const build = (): void => {
    const steps = 44;
    const tint = (y: number): Rgb => palette()((y / amplitude + 1) / 2);
    const at = (i: number, j: number): Vec3 => {
      const x = -span + 2 * span * i / steps, z = -span + 2 * span * j / steps;
      return [x, f(x, z), z];
    };
    const vertices: number[] = [], colours: number[] = [];
    for (let i = 0; i < steps; i++) for (let j = 0; j < steps; j++) {
      const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
      for (const triangle of [[a, c, b], [b, c, d]]) {
        for (const vertex of triangle) { vertices.push(...vertex); colours.push(...tint(vertex[1])); }
      }
    }
    // …and the same function sampled up a ribbon, which is what makes the encoding readable.
    const rows = 96;
    for (let k = 0; k < rows; k++) {
      const low = -amplitude + 2 * amplitude * k / rows, high = -amplitude + 2 * amplitude * (k + 1) / rows;
      const lowColour = tint(low), highColour = tint(high);
      const bl: Vec3 = [ribbonLeft, low, 0], br: Vec3 = [ribbonRight, low, 0];
      const tl: Vec3 = [ribbonLeft, high, 0], tr: Vec3 = [ribbonRight, high, 0];
      vertices.push(...bl, ...br, ...tl, ...br, ...tr, ...tl);
      colours.push(...lowColour, ...lowColour, ...highColour, ...lowColour, ...highColour, ...highColour);
    }
    group.clear();
    group.add(
      new Visual(count(new Geometry(vertices, colours)), rgba('#ffffff')),
      new Visual(count(boxEdges([-span, -amplitude, -span], [span, amplitude, span], .003)), rgba('#9fe7ff', .1)),
      new Visual(count(boxEdges([ribbonLeft, -amplitude, -.01], [ribbonRight, amplitude, .01], .003)), rgba('#e8f0f6', .3)),
    );
  };

  // Three labels: what the palette is called, and the value at each end of the ribbon.
  const title = labels.addHTML(mathml(mn('')), () => [ribbonLeft - .15, amplitude + .34, 0], '#cfe4ea', 'math-label');
  const top = labels.addHTML(mathml(mn('')), () => [ribbonRight + .22, amplitude, 0], '#cfe4ea', 'math-label');
  const bottom = labels.addHTML(mathml(mn('')), () => [ribbonRight + .22, -amplitude, 0], '#cfe4ea', 'math-label');

  const sync = (): void => {
    amplitude = Number(amplitudeInput.value);
    $('colour-amplitude-value').textContent = amplitude.toFixed(2);
    build();
    title.innerHTML = mathml(row(mi(paletteName()), mo('('), mi('t'), mo(')')));
    top.innerHTML = mathml(mn(`+${amplitude.toFixed(2)}`));
    bottom.innerHTML = mathml(mn(`−${amplitude.toFixed(2)}`));
  };
  paletteSelect.addEventListener('change', sync);
  amplitudeInput.addEventListener('input', sync);
  sync();

  return { labels, update: () => {} };
}

/* --------------------------------------------------------------------------------------------
 * 23 · Measuring a distance and an angle: annotation is geometry plus text.
 * ------------------------------------------------------------------------------------------ */

function measureDemo(view: WebGPUView): Demo {
  look(view, .62, .3, 9.6);
  // The figure lives between A at (-1.6, -0.4) and B at up to (4.4, 2.6): look at its middle.
  view.camera.target = [1.4, .3, 0];
  const labels = new LabelLayer($('measure-labels'), view.camera);
  const turning = new Group();
  view.world.add(turning, new Visual(count(axes3d(1.3, .006)), rgba('#dbe9f5', .22)));
  const pointA: Vec3 = [-1.6, -.4, 0];

  let across = 3.2, up = 1.1, phase = 0, spinning = !reducedMotion;
  let attached: HTMLElement[] = [];
  const dimension = labels.addHTML(mathml(mn('')), () => [0, -2.7, 0], '#cfe4ea', 'math-label');
  const panelReadout = $('measure-readout');
  const turnButton = $<HTMLButtonElement>('measure-turn');

  /** The short way round between two directions, as a polyline through the origin's corner. */
  const arc = (from: Vec3, to: Vec3, radius: number, steps = 20): Vec3[] => {
    const out: Vec3[] = [];
    for (let index = 0; index <= steps; index++) {
      const t = index / steps;
      const x = from[0] * (1 - t) + to[0] * t, y = from[1] * (1 - t) + to[1] * t;
      const length = Math.hypot(x, y) || 1;
      out.push([pointA[0] + radius * x / length, pointA[1] + radius * y / length, 0]);
    }
    return out;
  };

  const build = (): void => {
    turning.clear();
    // Labels live in the DOM, so a rebuild has to take the old ones with it.
    for (const node of attached) node.remove();
    attached = [];
    const pointB: Vec3 = [across, up, 0];
    const dx = pointB[0] - pointA[0], dy = pointB[1] - pointA[1];
    const distance = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    const markers: Geometry[] = [sphere(.14), sphere(.14)];
    const legX: Vec3 = [pointB[0], pointA[1], 0];
    turning.add(
      // The measured segment, then the two legs that name which way each component goes.
      new Visual(count(polyline([pointA, pointB], .022, 6)), rgba('#f7d681')),
      new Visual(count(merge(
        polyline([pointA, legX], .01),
        polyline([legX, pointB], .01),
        // The angle at A, swept from the x direction to AB.
        polyline(arc([1, 0, 0], [dx, dy, 0], .95), .008),
      )), rgba('#9db0c2', .55)),
      new Visual(count(arrow(pointA, [pointA[0] + 1.5, pointA[1], 0], .02)), rgba('#58c4dd', .7)),
    );
    const a = new Visual(count(markers[0]), rgba('#58c4dd'));
    a.position = pointA;
    const b = new Visual(count(markers[1]), rgba('#f7d681'));
    b.position = pointB;
    turning.add(a, b);
    dimension.innerHTML = mathml(mtext(`|AB| = ${distance.toFixed(2)} · \u0394x = ${dx.toFixed(2)} · \u0394y = ${dy.toFixed(2)} \u00b7 \u03b8 = ${angle.toFixed(1)}\u00b0`));
    panelReadout.textContent = `|AB| = ${distance.toFixed(2)} · \u03b8 = ${angle.toFixed(1)}\u00b0`;
    attached.push(
      labels.addHTML(mathml(mtext(`|AB| = ${distance.toFixed(2)}`)), () => [(pointA[0] + pointB[0]) / 2, (pointA[1] + pointB[1]) / 2 + .28, 0], '#f7d681', 'math-label'),
      labels.addHTML(mathml(row(mo('\u03b8'), mo('='), mn(`${angle.toFixed(0)}\u00b0`))), () => [pointA[0] + 1.35, pointA[1] + .35, 0], '#9db0c2', 'math-label'),
    );
  };
  const button = (): void => {
    turnButton.textContent = spinning ? 'Turning' : 'Still';
    turnButton.setAttribute('aria-pressed', String(spinning));
  };
  for (const [id, apply] of [['measure-x', (value: number) => { across = value; $('measure-x-value').textContent = value.toFixed(2); }],
                             ['measure-y', (value: number) => { up = value; $('measure-y-value').textContent = value.toFixed(2); }]] as [string, (value: number) => void][]) {
    const input = $<HTMLInputElement>(id);
    input.addEventListener('input', () => { apply(Number(input.value)); build(); });
  }
  turnButton.addEventListener('click', () => { spinning = !spinning; button(); });
  build();
  button();

  return {
    labels,
    update: delta => {
      if (spinning) phase += delta * .25;
      turning.rotation = phase;
    },
  };
}

/* --------------------------------------------------------------------------------------------
 * 22 · What a node's transform is made of: read the matrix back and typeset it.
 * ------------------------------------------------------------------------------------------ */

function transformDemo(view: WebGPUView): Demo {
  look(view, .5, .3, 5.8);
  const labels = new LabelLayer($('transform-labels'), view.camera);
  const pointer = new Group();
  view.world.add(pointer, new Visual(count(axes3d(1.3, .006)), rgba('#dbe9f5', .22)));
  // An asymmetric shape: a bar with a ball on its +x end, so scale and yaw are both unmistakable.
  const bar = new Visual(count(box([-1, -.2, -.16], [1, .2, .16])), rgba('#58c4dd', .95));
  const tip = new Visual(count(shadedSphere(.32)), rgba('#f7d681'));
  tip.position = [1, 0, 0];
  pointer.add(bar, tip);

  let sx = 1.3, sy = .8, yaw = -35, tilt = 28;
  const matrixLabel = labels.addHTML(mathml(mn('')), () => [0, -2.25, 0], '#cfe4ea', 'math-label');
  const panelReadout = $('transform-readout');
  const apply = (): void => {
    pointer.scale = [sx, sy, 1];
    pointer.rotation = yaw * Math.PI / 180;
    pointer.orientation = [tilt * Math.PI / 180, 0, 0];
    // The same function the node uses to build its own matrix — printed rather than a copy of the maths.
    const held = transform(pointer.position, pointer.scale, pointer.rotation, pointer.orientation);
    const cell = (row: number, column: number) => {
      const value = held[column * 4 + row];
      return mn(Math.abs(value) < .005 ? 0 : value.toFixed(2));
    };
    matrixLabel.innerHTML = mathml(matrix([
      [cell(0, 0), cell(0, 1), cell(0, 2)],
      [cell(1, 0), cell(1, 1), cell(1, 2)],
      [cell(2, 0), cell(2, 1), cell(2, 2)],
    ]));
    const text = `scale ${sx.toFixed(2)}, ${sy.toFixed(2)} · yaw ${yaw}\u00b0 · tilt ${tilt}\u00b0`;
    panelReadout.textContent = text;
  };
  const controls: [string, string, (value: number) => void][] = [
    ['transform-sx', 'transform-sx-value', value => { sx = value; $('transform-sx-value').textContent = value.toFixed(2); }],
    ['transform-sy', 'transform-sy-value', value => { sy = value; $('transform-sy-value').textContent = value.toFixed(2); }],
    ['transform-yaw', 'transform-yaw-value', value => { yaw = value; $('transform-yaw-value').textContent = `${value.toFixed(0)}\u00b0`; }],
    ['transform-tilt', 'transform-tilt-value', value => { tilt = value; $('transform-tilt-value').textContent = `${value.toFixed(0)}\u00b0`; }],
  ];
  for (const [id, , update] of controls) {
    const input = $<HTMLInputElement>(id);
    input.addEventListener('input', () => { update(Number(input.value)); apply(); });
  }
  apply();

  return {
    labels,
    // A slow spin about the world's own y axis, so the printed matrix keeps its meaning: the node's
    // transform is what the sliders set, not what the camera does.
    update: () => {},
  };
}

/* --------------------------------------------------------------------------------------------
 * 21 · A camera that follows: the scene does not move, only the point being looked at.
 * ------------------------------------------------------------------------------------------ */

function followDemo(view: WebGPUView): Demo {
  look(view, .6, .38, 9.5);
  const labels = new LabelLayer($('follow-labels'), view.camera);
  const scene = new Group();
  view.world.add(scene, new Visual(count(axes3d(1.4, .006)), rgba('#dbe9f5', .18)));

  /** A lopsided closed loop: two frequencies of different period, so it never repeats visibly. */
  const along = (t: number): Vec3 => [
    2.6 * Math.cos(t * Math.PI * 2),
    .95 * Math.sin(t * Math.PI * 2 * 2.5),
    2.1 * Math.sin(t * Math.PI * 2),
  ];
  const trail: Vec3[] = Array.from({ length: 240 }, (_, index) => along(index / 240));
  scene.add(new Visual(count(polyline(trail, .012, 6)), rgba('#58c4dd', .45)));
  // A few fixed pillars: something in the frame that does not move, so following is visible.
  for (const [x, z] of [[-3.2, -3.2], [3.2, -3.2], [-3.2, 3.2], [3.2, 3.2]] as [number, number][]) {
    const pillar = new Visual(count(box([x - .12, -1.6, z - .12], [x + .12, 1.6, z + .12])), rgba('#9db0c2', .35));
    scene.add(pillar);
  }
  const marker = new Visual(count(shadedSphere(.34)), rgba('#f7d681'));
  scene.add(marker);
  const readout = labels.addHTML(mathml(mn('')), () => [0, -2.6, 0], '#9db0c2', 'math-label');

  let follow = true, phase = 0, playing = !reducedMotion;
  const lockButton = $<HTMLButtonElement>('follow-lock');
  const playButton = $<HTMLButtonElement>('follow-play');
  const pitchInput = $<HTMLInputElement>('follow-pitch');
  const distanceInput = $<HTMLInputElement>('follow-distance');
  const panelReadout = $('follow-readout');
  const buttons = (): void => {
    lockButton.textContent = follow ? 'Following' : 'Fixed view';
    lockButton.setAttribute('aria-pressed', String(follow));
    playButton.textContent = playing ? 'Pause' : 'Play';
    playButton.setAttribute('aria-pressed', String(playing));
  };
  const place = (): void => {
    const point = along(phase);
    marker.position = [...point];
    // Only the looked-at point moves; the camera's angle and distance are the reader's to set.
    // "Fixed view" looks at the origin, so the switch always does something definite.
    view.camera.target = follow ? point : [0, 0, 0];
    view.camera.pitch = Number(pitchInput.value);
    view.camera.distance = Number(distanceInput.value);
    const text = `target ${point.map(value => value.toFixed(1)).join(', ')}`;
    readout.innerHTML = mathml(mtext(text));
    panelReadout.textContent = text;
  };
  lockButton.addEventListener('click', () => { follow = !follow; buttons(); place(); });
  playButton.addEventListener('click', () => { playing = !playing; buttons(); });
  pitchInput.addEventListener('input', () => { $('follow-pitch-value').textContent = Number(pitchInput.value).toFixed(2); place(); });
  distanceInput.addEventListener('input', () => { $('follow-distance-value').textContent = Number(distanceInput.value).toFixed(1); place(); });
  buttons();
  place();

  return {
    labels,
    update: delta => {
      if (!playing) return;
      phase = (phase + delta * .12) % 1;
      place();
    },
  };
}

/* --------------------------------------------------------------------------------------------
 * 20 · A bar chart in 3D: data becomes geometry, and a sort eases rather than jumps.
 * ------------------------------------------------------------------------------------------ */

function barDemo(view: WebGPUView): Demo {
  look(view, .55, .24, 12);
  // The bars stand on y = 0 and reach 7, so look above the baseline rather than at it.
  view.camera.target = [0, 2.6, 0];
  const labels = new LabelLayer($('bars-labels'), view.camera);
  const spin = new Group();
  view.world.add(spin);

  const series: Record<string, { name: string; values: number[] }> = {
    orbits: { name: 'orbit radii (AU)', values: [.39, .72, 1, 1.52, 5.2, 9.58, 19.2, 30.1] },
    moons: { name: 'known moons', values: [0, 0, 1, 2, 95, 146, 28, 16] },
    sizes: { name: 'mean diameter (10³ km)', values: [4.9, 12.1, 12.7, 6.8, 139.8, 116.5, 50.7, 49.2] },
  };
  const slots = 8, gap = 1.05;
  let kind = 'orbits', rank = 0, phase = 0, spinning = !reducedMotion;
  let heights = [...series.orbits.values];
  let targets = [...heights];
  const barMesh = box([-.3, 0, -.3], [.3, 1, .3]);
  let bars: Visual[] = [];
  let gridLines: Visual | undefined;
  let axisLabels: HTMLElement[] = [];

  const scale = (values: number[]): number => Math.max(...values) * 1.15;
  const paint = (): void => {
    const maximum = scale(targets);
    for (let index = 0; index < slots; index++) {
      const value = heights[index] / maximum;
      bars[index].scale = [1, Math.max(.001, value * 7), 1];
      bars[index].position = [(index - (slots - 1) / 2) * gap, 0, 0];
    }
  };

  const build = (): void => {
    const values = series[kind].values;
    targets = rank ? [...values].sort((a, b) => b - a) : [...values];
    heights = rank ? [...values] : [...values];
    if (!rank) heights = [...values];
    const maximum = scale(targets);
    spin.clear();
    bars = [];
    // A grid and a value axis: ticks are the library's own nice numbers.
    const ticks = tickValues(0, maximum, 5);
    const lines: Geometry[] = [polyline([[-(slots - 1) / 2 * gap - .7, 0, 0], [(slots - 1) / 2 * gap + .7, 0, 0]], .006)];
    spin.add(new Visual(count(merge(...lines)), rgba('#9db0c2', .5)));
    const gridGeometry: Geometry[] = ticks.filter(value => value > 0).map(value => polyline([[-(slots - 1) / 2 * gap - .7, value / maximum * 7, 0], [(slots - 1) / 2 * gap + .7, value / maximum * 7, 0]], .003));
    gridLines = new Visual(count(merge(...gridGeometry)), rgba('#9db0c2', .2));
    spin.add(gridLines);
    for (const label of axisLabels) label.remove();
    axisLabels = ticks.map(value => labels.addHTML(mathml(mn(value.toFixed(value < 1 && value > 0 ? 2 : 0))), () => [-(slots - 1) / 2 * gap - 1, value / maximum * 7, 0], '#8b98a8', 'math-label'));
    for (let index = 0; index < slots; index++) {
      // `viridis` returns components in [0, 1] — for per-vertex colours, and for a solid once they
      // are written as hex.
      const shade = `#${viridis(index / (slots - 1)).map(component => Math.round(component * 255).toString(16).padStart(2, '0')).join('')}`;
      const bar = new Visual(barMesh, rgba(shade));
      spin.add(bar);
      bars.push(bar);
    }
    paint();
    const text = `${series[kind].name} · max ${Math.max(...values).toFixed(values === series.moons.values ? 0 : 1)}`;
    $('bars-readout').textContent = text;
    labels.addHTML(mathml(mtext(text)), () => [0, -1.3, 0], '#9db0c2', 'math-label');
  };

  const seriesSelect = $<HTMLSelectElement>('bars-series');
  const sortInput = $<HTMLInputElement>('bars-sort');
  const playButton = $<HTMLButtonElement>('bars-play');
  const spinButton = $<HTMLButtonElement>('bars-spin');
  let playing = !reducedMotion;
  const button = (): void => {
    playButton.textContent = playing ? 'Pause' : 'Play';
    playButton.setAttribute('aria-pressed', String(playing));
    spinButton.textContent = spinning ? 'Turning' : 'Still';
    spinButton.setAttribute('aria-pressed', String(spinning));
  };
  seriesSelect.addEventListener('change', () => { kind = seriesSelect.value; build(); });
  sortInput.addEventListener('input', () => {
    rank = Number(sortInput.value);
    $('bars-sort-value').textContent = rank < .5 ? 'by index' : 'by size';
    targets = rank < .5 ? [...series[kind].values] : [...series[kind].values].sort((a, b) => b - a);
    playing = true;
    button();
  });
  spinButton.addEventListener('click', () => { spinning = !spinning; button(); });
  playButton.addEventListener('click', () => { playing = !playing; button(); });
  build();
  button();

  return {
    labels,
    update: delta => {
      if (spinning) phase += delta * .3;
      spin.rotation = phase;
      // Ease the heights towards the target order: a sort that jumps is a sort you cannot follow.
      if (playing) {
        let settled = true;
        for (let index = 0; index < slots; index++) {
          const difference = targets[index] - heights[index];
          if (Math.abs(difference) > 1e-3) settled = false;
          heights[index] += difference * Math.min(1, delta * 4.5);
        }
        paint();
        if (settled) { playing = false; button(); }
      }
    },
  };
}

/* --------------------------------------------------------------------------------------------
 * 19 · Switching layers on and off: three groups and one boolean each.
 * ------------------------------------------------------------------------------------------ */

function layerDemo(view: WebGPUView): Demo {
  look(view, .62, .3, 7.6);
  const labels = new LabelLayer($('layers-labels'), view.camera);
  const spin = new Group();
  const axes = new Group(), bonds = new Group(), atoms = new Group();
  spin.add(axes, bonds, atoms);
  view.world.add(spin);

  const corners: Vec3[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) corners.push([x, y, z]);
  const edges: Geometry[] = [];
  for (let i = 0; i < corners.length; i++) for (let j = i + 1; j < corners.length; j++) {
    const distance = Math.hypot(corners[i][0] - corners[j][0], corners[i][1] - corners[j][1], corners[i][2] - corners[j][2]);
    if (distance < 2.1) edges.push(polyline([corners[i], corners[j]], .03, 6));
  }
  axes.add(new Visual(count(axes3d(1.5, .006)), rgba('#dbe9f5', .55)));
  bonds.add(new Visual(count(merge(...edges)), rgba('#9ad0ff', .9)));
  const atomMesh = shadedSphere(.17);
  for (const [index, corner] of corners.entries()) {
    const visual = new Visual(atomMesh, rgba(index % 2 ? '#f7d681' : '#83c167'));
    visual.position = corner;
    atoms.add(visual);
  }

  const layers: [string, Group, HTMLInputElement][] = [
    ['axes', axes, $<HTMLInputElement>('layers-axes')],
    ['bonds', bonds, $<HTMLInputElement>('layers-bonds')],
    ['atoms', atoms, $<HTMLInputElement>('layers-atoms')],
  ];
  const readout = $('layers-readout');
  const summary = labels.addHTML(mathml(mn('')), () => [0, -1.9, 0], '#9db0c2', 'math-label');
  const sync = (): void => {
    // One boolean per group: the whole subtree drops out of the frame walk, no geometry rebuilt.
    for (const [, group, input] of layers) group.visible = input.checked;
    const on = layers.filter(([, , input]) => input.checked).map(([name]) => name);
    const text = `${on.length} layer${on.length === 1 ? '' : 's'} on${on.length ? ` · ${on.join(', ')}` : ''}`;
    readout.textContent = text;
    summary.innerHTML = mathml(mtext(text));
  };
  for (const [, , input] of layers) input.addEventListener('change', sync);

  const turnButton = $<HTMLButtonElement>('layers-turn');
  let spinning = !reducedMotion, phase = 0;
  const button = (): void => {
    turnButton.textContent = spinning ? 'Turning' : 'Still';
    turnButton.setAttribute('aria-pressed', String(spinning));
  };
  turnButton.addEventListener('click', () => { spinning = !spinning; button(); });
  sync();
  button();

  return {
    labels,
    update: delta => {
      if (spinning) phase += delta * .4;
      spin.rotation = phase;
    },
  };
}

/* --------------------------------------------------------------------------------------------
 * 18 · A surface and its normals: sample a height field, and draw the way it faces.
 * ------------------------------------------------------------------------------------------ */

function normalDemo(view: WebGPUView): Demo {
  look(view, .58, .4, 7.6);
  const labels = new LabelLayer($('normals-labels'), view.camera);
  const spin = new Group();
  view.world.add(spin, new Visual(count(axes3d(1.3, .006)), rgba('#dbe9f5', .25)));

  const fields: Record<string, { f: (x: number, y: number) => number; bounds: [number, number]; colour: string }> = {
    saddle: { f: (x, y) => .42 * (x * x - y * y) * .5, bounds: [-1.5, 1.5], colour: '#83c167' },
    wave: { f: (x, y) => .38 * Math.sin(1.7 * x) * Math.cos(1.7 * y), bounds: [-1.7, 1.7], colour: '#58c4dd' },
    dome: { f: (x, y) => .9 * Math.exp(-(x * x + y * y) / 2.2), bounds: [-1.6, 1.6], colour: '#b5a1ff' },
  };
  let kind = 'saddle', arrowLength = .7, phase = 0, spinning = !reducedMotion;
  const readout = labels.addHTML(mathml(mn('')), () => [0, -1.9, 0], '#9db0c2', 'math-label');

  const build = (): void => {
    const { f, bounds, colour } = fields[kind];
    // A comb of normals, not a shell: sampling every third node of a 22-step grid keeps the surface
    // visible through the arrows.
    const [low, high] = bounds, step = (high - low) / 22 * 3;
    const normals: Geometry[] = [];
    const derivative = (x: number, y: number) => {
      const h = 1e-3;
      return [(f(x + h, y) - f(x - h, y)) / (2 * h), (f(x, y + h) - f(x, y - h)) / (2 * h)];
    };
    for (let x = low + step; x <= high - step * .5; x += step) {
      for (let y = low + step; y <= high - step * .5; y += step) {
        const [fx, fy] = derivative(x, y);
        // (x, f, y) is the surface; the normal is (-f_x, 1, -f_y) normalised, which is the cross
        // product of the two tangents for a height field.
        const raw: Vec3 = [-fx, 1, -fy];
        const length = Math.hypot(...raw);
        const normal: Vec3 = [raw[0] / length, raw[1] / length, raw[2] / length];
        const point: Vec3 = [x, f(x, y), y];
        normals.push(arrow(point, [point[0] + normal[0] * arrowLength, point[1] + normal[1] * arrowLength, point[2] + normal[2] * arrowLength], .008));
      }
    }
    spin.clear();
    spin.add(
      new Visual(count(functionSurface(f, [low, high], [low, high], [64, 64])), rgba(colour, .78)),
      new Visual(count(merge(...normals)), rgba('#f7d681', .9)),
    );
    readout.innerHTML = mathml(mtext(`${kind} · ${normals.length} normals · length ${arrowLength.toFixed(2)}`));
  };

  const kindSelect = $<HTMLSelectElement>('normals-kind');
  const lengthInput = $<HTMLInputElement>('normals-length');
  const spinButton = $<HTMLButtonElement>('normals-spin');
  const button = (): void => {
    spinButton.textContent = spinning ? 'Turning' : 'Still';
    spinButton.setAttribute('aria-pressed', String(spinning));
  };
  kindSelect.addEventListener('change', () => { kind = kindSelect.value; build(); });
  lengthInput.addEventListener('input', () => {
    arrowLength = Number(lengthInput.value);
    $('normals-length-value').textContent = arrowLength.toFixed(2);
    build();
  });
  spinButton.addEventListener('click', () => { spinning = !spinning; button(); });
  build();
  button();

  return {
    labels,
    update: delta => {
      if (spinning) phase += delta * .3;
      spin.rotation = phase;
    },
  };
}

/* --------------------------------------------------------------------------------------------
 * 17 · A path to travel along: a cubic Bezier, its control polygon, and an eased marker.
 * ------------------------------------------------------------------------------------------ */

function pathDemo(view: WebGPUView): Demo {
  look(view, .5, .3, 9.2);
  const labels = new LabelLayer($('path-labels'), view.camera);
  const world = new Group();
  view.world.add(world, new Visual(count(axes3d(1.1, .005)), rgba('#dbe9f5', .2)));

  /** A cubic Bézier: the four control points are the whole description of the path. */
  const bezier = (points: Vec3[], t: number): Vec3 => {
    const u = 1 - t;
    const weight = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
    return [0, 1, 2].map(axis => points.reduce((sum, point, index) => sum + weight[index] * point[axis], 0)) as Vec3;
  };
  const presets: Record<string, Vec3[]> = {
    arc: [[-3.1, -1.5, 0], [-1.6, 2.6, .8], [1.6, 2.6, -.8], [3.1, -1.5, 0]],
    swoop: [[-3.2, .6, .4], [-1.1, -2.4, -1.2], [1.1, 2.4, 1.2], [3.2, -.6, -.4]],
    loop: [[-2.6, 0, 0], [3.4, 2.2, 1.6], [-3.4, 2.2, -1.6], [2.6, 0, 0]],
  };
  let kind = 'arc', along = 0, playing = !reducedMotion;
  let eased: Vec3 = [0, 0, 0];

  const markerMesh = shadedSphere(.22);
  const dot = new Visual(markerMesh, rgba('#f7d681'));
  const readout = labels.addHTML(mathml(mn('')), () => [0, -3.05, 0], '#9db0c2', 'math-label');
  const panelReadout = $('path-readout');

  const build = (): void => {
    const points = presets[kind];
    world.clear();
    const samples: Vec3[] = Array.from({ length: 121 }, (_, index) => bezier(points, index / 120));
    world.add(new Visual(count(polyline(samples, .028, 8)), rgba('#58c4dd', .95)));
    // The control polygon and the control points: the construction behind the curve.
    world.add(new Visual(count(merge(...[0, 1, 2].map(index => polyline([points[index], points[index + 1]], .008)))), rgba('#9db0c2', .4)));
    points.forEach((point, index) => {
      const handle = new Visual(count(shadedSphere(.09)), rgba('#ff9ec4', .95));
      handle.position = point;
      world.add(handle);
    });
    for (let index = 0; index < 4; index++) {
      labels.addHTML(mathml(msub(mi('P'), mn(index))), () => {
        const point = points[index];
        return [point[0], point[1] + .28, point[2]] as Vec3;
      }, '#ff9ec4', 'math-label');
    }
    world.add(dot);
  };

  const kindSelect = $<HTMLSelectElement>('path-kind');
  const timeInput = $<HTMLInputElement>('path-time');
  const playButton = $<HTMLButtonElement>('path-play');
  const place = (): void => {
    // `smooth` slows both ends: the same parameter, read twice, is the whole lesson.
    const easedParameter = smooth(along);
    eased = bezier(presets[kind], easedParameter);
    dot.position = [...eased];
    timeInput.value = String(along);
    $('path-time-value').textContent = `${Math.round(along * 100)}%`;
    const text = `t = ${along.toFixed(2)} · eased ${easedParameter.toFixed(2)}`;
    readout.innerHTML = mathml(mtext(text));
    panelReadout.textContent = text;
  };
  const button = (): void => {
    playButton.textContent = playing ? 'Pause' : 'Play';
    playButton.setAttribute('aria-pressed', String(playing));
  };
  kindSelect.addEventListener('change', () => { kind = kindSelect.value; build(); place(); });
  playButton.addEventListener('click', () => { playing = !playing; button(); });
  timeInput.addEventListener('input', () => { playing = false; along = Number(timeInput.value); button(); place(); });
  build();
  button();
  place();

  return {
    labels,
    update: delta => {
      if (!playing) return;
      along = (along + delta * .32) % 1;
      place();
    },
  };
}

/* --------------------------------------------------------------------------------------------
 * 16 · Arrows and their sum: a diagram is geometry plus typeset text.
 * ------------------------------------------------------------------------------------------ */

function vectorDemo(view: WebGPUView): Demo {
  look(view, .55, .26, 8);
  const labels = new LabelLayer($('vectors-labels'), view.camera);
  const spin = new Group();
  view.world.add(spin, new Visual(count(axes3d(1.05, .005)), rgba('#dbe9f5', .22)));
  const readout = labels.addHTML(mathml(mn('')), () => [-2.6, -2.35, 0], '#9db0c2', 'math-label');

  let spread = 70, length = 1.8, phase = 0, spinning = !reducedMotion;
  let tipA: Vec3 = [0, 0, 0], tipB: Vec3 = [0, 0, 0], tipSum: Vec3 = [0, 0, 0];
  const readoutPanel = $('vectors-readout');

  const build = (): void => {
    // Two vectors mirrored about +y: their sum stays on the axis, and its length is 2|a|cos(θ/2),
    // which the readout states so the picture and the arithmetic agree.
    const half = spread * Math.PI / 360;
    const a: Vec3 = [Math.sin(half) * length, Math.cos(half) * length, 0];
    const b: Vec3 = [-Math.sin(half) * length, Math.cos(half) * length, 0];
    const sum: Vec3 = [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    tipA = a; tipB = b; tipSum = sum;
    spin.clear();
    spin.add(
      new Visual(count(merge(polyline([a, sum], .012), polyline([b, sum], .012))), rgba('#9db0c2', .45)),
      new Visual(count(arrow([0, 0, 0], a, .045)), rgba('#58c4dd')),
      new Visual(count(arrow([0, 0, 0], b, .045)), rgba('#83c167')),
      new Visual(count(arrow([0, 0, 0], sum, .06)), rgba('#f7d681')),
    );
    const size = (v: Vec3) => Math.hypot(...v).toFixed(2);
    readout.innerHTML = mathml(mtext(`|a| = ${size(a)} · |b| = ${size(b)} · θ = ${spread}° · |a + b| = ${size(sum)}`));
    readoutPanel.textContent = `|a| = ${size(a)} · |b| = ${size(b)} · θ = ${spread}° · |a + b| = ${size(sum)}`;
  };

  for (const [name, position] of [['a', () => tipA], ['b', () => tipB], ['a + b', () => tipSum]] as [string, () => Vec3][]) {
    const text = name === 'a + b' ? row(vec(mi('a')), mo('+'), vec(mi('b'))) : vec(mi(name));
    labels.addHTML(mathml(text), () => {
      const tip = position();
      const scale = 1.12;
      return [tip[0] * scale, tip[1] * scale + .12, tip[2] * scale] as Vec3;
    }, name === 'a' ? '#58c4dd' : name === 'b' ? '#83c167' : '#f7d681', 'math-label');
  }

  const spreadInput = $<HTMLInputElement>('vectors-spread');
  const lengthInput = $<HTMLInputElement>('vectors-length');
  const spinButton = $<HTMLButtonElement>('vectors-spin');
  const button = (): void => {
    spinButton.textContent = spinning ? 'Turning' : 'Still';
    spinButton.setAttribute('aria-pressed', String(spinning));
  };
  spreadInput.addEventListener('input', () => {
    spread = Number(spreadInput.value);
    $('vectors-spread-value').textContent = `${spread}°`;
    build();
  });
  lengthInput.addEventListener('input', () => {
    length = Number(lengthInput.value);
    $('vectors-length-value').textContent = length.toFixed(2);
    build();
  });
  spinButton.addEventListener('click', () => { spinning = !spinning; button(); });
  build();
  button();

  return {
    labels,
    update: delta => {
      if (spinning) phase += delta * .9;
      spin.rotation = phase;
    },
  };
}

/* --------------------------------------------------------------------------------------------
 * 15 · Building a scene in steps: one timeline, four cues, and a scrubber.
 * ------------------------------------------------------------------------------------------ */

function storyDemo(view: WebGPUView): Demo {
  look(view, .62, .3, 8.4);
  const labels = new LabelLayer($('story-labels'), view.camera);
  const frame = new Group(), bonds = new Group(), atoms = new Group();
  view.world.add(frame, bonds, atoms);

  // A small lattice: eight corners, twelve edges. The bonds and the atoms are whole groups, so a cue
  // can fade or scale them without touching a single child.
  const corners: Vec3[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) corners.push([x, y, z]);
  const edges: Geometry[] = [];
  for (let i = 0; i < corners.length; i++) for (let j = i + 1; j < corners.length; j++) {
    const distance = Math.hypot(corners[i][0] - corners[j][0], corners[i][1] - corners[j][1], corners[i][2] - corners[j][2]);
    if (distance < 2.1) edges.push(polyline([corners[i], corners[j]], .03, 6));
  }
  frame.add(new Visual(count(axes3d(1.5, .006)), rgba('#dbe9f5', .5)));
  bonds.add(new Visual(count(merge(...edges)), rgba('#9ad0ff', .9)));
  const atomMesh = shadedSphere(.17);
  const atoms2 = corners.map((corner, index) => {
    const visual = new Visual(atomMesh, rgba(index % 2 ? '#f7d681' : '#83c167'));
    visual.position = corner;
    visual.reveal = 0;
    atoms.add(visual);
    return visual;
  });

  const cubeLabel = labels.addHTML(mathml(mtext('a cubic cell · 8 sites · 12 bonds')), () => [0, -1.7, 0], '#9db0c2', 'math-label');
  cubeLabel.style.opacity = '0';

  const chapters = [
    { at: 0, text: '1 · the frame appears' },
    { at: 1.5, text: '2 · the bonds scale out' },
    { at: 3.6, text: '3 · the atoms arrive' },
    { at: 6, text: '4 · the labels name it' },
  ];
  const chapterReadout = $('story-chapter');
  const timeInput = $<HTMLInputElement>('story-time');
  const playButton = $<HTMLButtonElement>('story-play');
  const timeline = new Timeline(8);
  timeline.add({ start: 0, duration: 1.5, update: p => { frame.opacity = p; } });
  timeline.add({ start: 1.5, duration: 2.5, update: p => { bonds.scale = [p, p, p]; bonds.opacity = p; } });
  // Reveal is per-visual, so the atoms are faded one at a time as well as scaled as a group.
  timeline.add({ start: 3.6, duration: 2.4, update: p => { atoms.scale = [p, p, p]; for (const atom of atoms2) atom.reveal = p; } });
  timeline.add({ start: 6, duration: 1.5, update: p => { cubeLabel.style.opacity = String(p); } });

  let playing = !reducedMotion, shown = '';
  const button = (): void => {
    playButton.textContent = playing ? 'Pause' : 'Play';
    playButton.setAttribute('aria-pressed', String(playing));
  };
  const readout = (): void => {
    const chapter = chapters.filter(entry => timeline.time >= entry.at).pop() ?? chapters[0];
    if (chapter.text !== shown) { shown = chapter.text; chapterReadout.textContent = chapter.text; }
    timeInput.value = String(timeline.time);
    $('story-time-value').textContent = `${timeline.time.toFixed(1)} s`;
  };
  playButton.addEventListener('click', () => { playing ? timeline.pause() : timeline.play(); playing = !playing; button(); });
  timeInput.addEventListener('input', () => { playing = false; timeline.pause(); timeline.seek(Number(timeInput.value)); button(); readout(); });
  $<HTMLButtonElement>('story-restart').addEventListener('click', () => { timeline.seek(0); playing = true; timeline.play(); button(); readout(); });
  // Land on the finished picture rather than an empty stage: the panel should read at a glance, and
  // pressing play (or Start over) replays the build from zero.
  timeline.seek(timeline.duration);
  button();
  readout();

  return {
    labels,
    update: delta => {
      // Playing advances the clock; scrubbing seeks it. Either way the same readout follows, and the
      // finished frame simply holds, because every cue is a function of absolute time.
      if (!playing) return;
      timeline.tick(delta);
      readout();
      if (timeline.time >= timeline.duration) { playing = false; button(); }
    },
  };
}

/* --------------------------------------------------------------------------------------------
 * 14 · Streamlines in a vector field: integrate a direction field and flow markers along it.
 * ------------------------------------------------------------------------------------------ */

function streamlineDemo(view: WebGPUView): Demo {
  look(view, .6, .33, 9);
  const labels = new LabelLayer($('streamlines-labels'), view.camera);
  const spin = new Group();
  view.world.add(spin, new Visual(count(boundsBox([-3, -3, -3], [3, 3, 3], .003)), rgba('#9fe7ff', .14)), new Visual(count(axes3d(1.1, .005)), rgba('#dbe9f5', .22)));

  const fields: Record<string, VectorField> = {
    // Closed circles about the y axis: the prettiest way to show that a field is a direction at
    // every point, and that a streamline is what you get by following it.
    swirl: p => [-p[2], 0, p[0]],
    // A saddle: lines fall towards the origin in one direction and away from it in the others.
    saddle: p => [p[0] * .7, -p[1] * .7, p[2] * .25],
    // A source and a sink: radial out of one point and into another, which curves the field lines
    // between them exactly as a dipole's are curved.
    dipole: p => {
      const radial = (cx: number): Vec3 => {
        const dx = p[0] - cx, dy = p[1], dz = p[2];
        const k = 1 / Math.max(.5, Math.hypot(dx, dy, dz)) ** 3;
        return [k * dx, k * dy, k * dz];
      };
      const out = radial(-1.3), into = radial(1.3);
      return [out[0] - into[0], out[1] - into[1], out[2] - into[2]];
    },
  };
  const colours: Record<string, string> = { swirl: '#58c4dd', saddle: '#83c167', dipole: '#f7d681' };
  let kind = 'swirl', seeds = 22, speed = .7, phase = 0, flow = 0, spinning = !reducedMotion;
  let traced: Vec3[][] = [];
  let markers: { visual: Visual; line: Vec3[]; offset: number }[] = [];

  const markerMesh = parametricSurface((u, v) => [.062 * Math.sin(u) * Math.cos(v), .062 * Math.cos(u), .062 * Math.sin(u) * Math.sin(v)], [0, Math.PI], [0, Math.PI * 2], [6, 10]);
  const spinButton = $<HTMLButtonElement>('streamlines-turn');
  const summary = labels.addHTML(mathml(mn('')), () => [0, -3.55, 0], '#9db0c2', 'math-label');

  const build = (): void => {
    const field = fields[kind];
    traced = streamlines(field, sphereSeeds(seeds, 2.4), 0, { step: .09, steps: 420, both: true, minStrength: .08, bounds: { min: [-3, -3, -3], max: [3, 3, 3] } });
    const tubes = traced.filter(line => line.length > 6).map(line => polyline(line, .014, 5));
    spin.clear();
    markers = [];
    if (tubes.length) spin.add(new Visual(count(merge(...tubes)), rgba(colours[kind], .85)));
    for (const line of traced) {
      if (line.length < 6) continue;
      // Three markers per line, spread along it, is what makes the direction readable.
      for (let index = 0; index < 3; index++) {
        const visual = new Visual(markerMesh, rgba('#ffffff', .92));
        visual.position = [...line[0]];
        spin.add(visual);
        markers.push({ visual, line, offset: index / 3 });
      }
    }
    summary.innerHTML = mathml(mtext(`${kind} · ${tubes.length} streamlines · ${markers.length} markers · flow ${speed.toFixed(2)}`));
  };

  const kindSelect = $<HTMLSelectElement>('streamlines-kind');
  const countInput = $<HTMLInputElement>('streamlines-count');
  const speedInput = $<HTMLInputElement>('streamlines-speed');
  const button = (): void => {
    spinButton.textContent = spinning ? 'Turning' : 'Still';
    spinButton.setAttribute('aria-pressed', String(spinning));
  };
  kindSelect.addEventListener('change', () => { kind = kindSelect.value; build(); });
  countInput.addEventListener('input', () => {
    seeds = Number(countInput.value);
    $('streamlines-count-value').textContent = String(seeds);
    build();
  });
  speedInput.addEventListener('input', () => {
    speed = Number(speedInput.value);
    $('streamlines-speed-value').textContent = speed.toFixed(2);
    // The readout names the rate, so a check can see the control without waiting for motion.
    summary.innerHTML = mathml(mtext(`${kind} · ${traced.filter(line => line.length > 6).length} streamlines · ${markers.length} markers · flow ${speed.toFixed(2)}`));
  });
  spinButton.addEventListener('click', () => { spinning = !spinning; button(); });
  build();
  button();

  return {
    labels,
    update: delta => {
      if (spinning) { phase += delta * .2; flow += delta * speed * .12; }
      spin.rotation = phase;
      // Markers slide along their own traced polyline: no integration in the render loop. The flow
      // shares the button, so "Still" holds the whole picture.
      for (const marker of markers) {
        const along = (marker.offset + flow) % 1;
        const position = Math.min(marker.line.length - 1, along * marker.line.length);
        const low = Math.floor(position), high = Math.min(marker.line.length - 1, low + 1), mix = position - low;
        marker.visual.position[0] = lerp(marker.line[low][0], marker.line[high][0], mix);
        marker.visual.position[1] = lerp(marker.line[low][1], marker.line[high][1], mix);
        marker.visual.position[2] = lerp(marker.line[low][2], marker.line[high][2], mix);
      }
    },
  };
}

/* --------------------------------------------------------------------------------------------
 * 13 · Shapes from a scalar field: an implicit surface, extracted at a level you choose.
 * ------------------------------------------------------------------------------------------ */

function fieldDemo(view: WebGPUView): Demo {
  look(view, .7, .34, 6.2);
  const labels = new LabelLayer($('field-labels'), view.camera);
  const min: Vec3 = [-1.6, -1.6, -1.6], max: Vec3 = [1.6, 1.6, 1.6];
  const spin = new Group();
  view.world.add(spin, new Visual(count(boundsBox(min, max, .004)), rgba('#9fe7ff', .22)), new Visual(count(axes3d(1.2, .005)), rgba('#dbe9f5', .24)));

  /** Three fields, each signed so that level 0 is the interesting surface. */
  const fields: Record<string, (x: number, y: number, z: number) => number> = {
    balls: (x, y, z) => Math.max(.78 - Math.hypot(x + .38, y - .22, z - .1), .72 - Math.hypot(x - .42, y + .18, z + .12)),
    torus: (x, y, z) => (Math.hypot(x, z) - .95) ** 2 + y * y - .3 ** 2,
    gyroid: (x, y, z) => Math.sin(2.6 * x) * Math.cos(2.6 * y) + Math.sin(2.6 * y) * Math.cos(2.6 * z) + Math.sin(2.6 * z) * Math.cos(2.6 * x),
  };
  const ranges: Record<string, [number, number]> = { balls: [-.6, .6], torus: [-.5, .5], gyroid: [-1.2, 1.2] };
  let kind = 'balls', level = 0, resolution = 28, surface: Visual | undefined;
  let spinning = !reducedMotion, phase = 0;
  const spinButton = $<HTMLButtonElement>('field-spin');
  const readout = labels.addHTML(mathml(mn('')), () => [0, -2.2, 0], '#9db0c2', 'math-label');

  const build = (): void => {
    const geometry = count(isosurface(fields[kind], { min, max }, level, resolution));
    const next = new Visual(geometry, rgba(kind === 'gyroid' ? '#58c4dd' : '#83c167', .92));
    if (surface) spin.remove(surface);
    surface = next;
    spin.add(next);
    readout.innerHTML = mathml(mtext(`${kind} · f = ${level.toFixed(2)} · ${Math.round(geometry.vertices.length / 9).toLocaleString()} triangles`));
  };

  const kindSelect = $<HTMLSelectElement>('field-kind');
  const levelInput = $<HTMLInputElement>('field-level');
  const resolutionSelect = $<HTMLSelectElement>('field-resolution');
  const levelOutput = $('field-level-value');
  kindSelect.addEventListener('change', () => {
    kind = kindSelect.value;
    const [low, high] = ranges[kind];
    levelInput.min = String(low); levelInput.max = String(high);
    level = 0; levelInput.value = '0';
    levelOutput.textContent = level.toFixed(2);
    build();
  });
  levelInput.addEventListener('input', () => {
    level = Number(levelInput.value);
    levelOutput.textContent = level.toFixed(2);
    build();
  });
  resolutionSelect.addEventListener('change', () => { resolution = Number(resolutionSelect.value); build(); });
  const button = (): void => {
    spinButton.textContent = spinning ? 'Turning' : 'Still';
    spinButton.setAttribute('aria-pressed', String(spinning));
  };
  spinButton.addEventListener('click', () => { spinning = !spinning; button(); });
  build();
  button();

  return {
    labels,
    update: delta => {
      if (spinning) phase += delta * .35;
      spin.rotation = phase;
    },
  };
}

/* --------------------------------------------------------------------------------------------
 * 12 · A simulation, stepped by hand: the CPU particle seam, one acceleration function.
 * ------------------------------------------------------------------------------------------ */

function simulationDemo(view: WebGPUView): Demo {
  look(view, .5, .3, 12);
  const labels = new LabelLayer($('simulation-labels'), view.camera);
  const cloud = new Group();
  // A deliberately cheap mesh: hundreds of these are drawn every frame, and the default sphere is
  // a couple of thousand triangles each. At this size the difference is invisible.
  const mesh = parametricSurface((u, v) => [.075 * Math.sin(u) * Math.cos(v), .075 * Math.cos(u), .075 * Math.sin(u) * Math.sin(v)], [0, Math.PI], [0, Math.PI * 2], [6, 10]);
  view.world.add(cloud, new Visual(count(axes3d(1.1, .005)), rgba('#dbe9f5', .18)));

  let state = createParticleState([0, 0, 0], 3);
  let dots: Visual[] = [];
  let particles = Number($<HTMLInputElement>('simulation-count').value);
  let force = 'spring', elapsed = 0, steps = 0, playing = !reducedMotion;
  const summary = labels.addHTML(mathml(mn('')), () => [0, -5.4, 0], '#9db0c2', 'math-label');

  /** Three accelerations, all bounded, so the cloud stays in frame however long it runs. */
  const forces: Record<string, ParticleAcceleration> = {
    spring: (_index, p) => [-1.8 * p[0], -1.8 * p[1], -1.8 * p[2]],
    swirl: (_index, p, v) => [-1.5 * p[0] - 1.3 * v[1], -1.5 * p[1] + 1.3 * v[0], -1.5 * p[2]],
    pair: (_index, p) => {
      const pull = (cx: number, cz: number) => {
        const dx = p[0] - cx, dy = p[1], dz = p[2] - cz;
        const radius = Math.max(.4, Math.hypot(dx, dy, dz));
        return -2.2 / (radius * radius * radius);
      };
      const a = pull(-2.4, 0), b = pull(2.4, 0);
      return [a * (p[0] + 2.4) + b * (p[0] - 2.4), (a + b) * p[1], a * p[2] + b * p[2]];
    },
  };

  const build = (): void => {
    const positions: number[] = [], velocities: number[] = [];
    for (let index = 0; index < particles; index++) {
      // A shell of particles, each with a tangential kick, seeded deterministically so the demo is
      // the same on every reload.
      const radius = 2.4 + 2.1 * ((index * 0.6180339887) % 1);
      const theta = index * 2.399963229728653, phi = Math.acos(1 - 2 * ((index * 0.7548776662) % 1));
      const x = radius * Math.sin(phi) * Math.cos(theta), y = radius * Math.cos(phi), z = radius * Math.sin(phi) * Math.sin(theta);
      positions.push(x, y, z);
      velocities.push(-z * .42, y * .12, x * .42);
    }
    state = createParticleState(positions, 3, velocities);
    cloud.clear();
    dots = [];
    for (let index = 0; index < particles; index++) {
      const dot = new Visual(mesh, rgba('#9ad0ff'));
      dot.position = [positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]];
      cloud.add(dot);
      dots.push(dot);
    }
    update();
  };

  const readout = (): void => {
    summary.innerHTML = mathml(mtext(`${force} · ${particles} particles · ${steps} steps · t = ${elapsed.toFixed(1)} s`));
  };
  const update = (): void => {
    const positions = state.positions;
    for (let index = 0; index < dots.length; index++) {
      // Mutating in place: writing positions[index] would allocate a fresh array every frame.
      dots[index].position[0] = positions[index * 3];
      dots[index].position[1] = positions[index * 3 + 1];
      dots[index].position[2] = positions[index * 3 + 2];
    }
  };

  const forceSelect = $<HTMLSelectElement>('simulation-force');
  const countInput = $<HTMLInputElement>('simulation-count');
  const playButton = $<HTMLButtonElement>('simulation-play');
  const button = (): void => {
    playButton.textContent = playing ? 'Pause' : 'Play';
    playButton.setAttribute('aria-pressed', String(playing));
  };
  forceSelect.addEventListener('change', () => { force = forceSelect.value; readout(); });
  countInput.addEventListener('input', () => {
    particles = Number(countInput.value);
    $('simulation-count-value').textContent = String(particles);
    elapsed = 0; steps = 0;
    build();
  });
  playButton.addEventListener('click', () => { playing = !playing; button(); });
  build();
  button();

  return {
    labels,
    update: delta => {
      if (!playing) return;
      // Two half-steps: plenty stable for springs at this stiffness, and cheap.
      const step = Math.min(delta, .05) / 2;
      stepParticles(state, step, forces[force]);
      stepParticles(state, step, forces[force]);
      steps += 2;
      elapsed += Math.min(delta, .05);
      update();
      readout();
    },
  };
}

/* --------------------------------------------------------------------------------------------
 * 11 · A camera move: the orbit camera driven like a shot, and scrubbed like a storyboard.
 * ------------------------------------------------------------------------------------------ */

function cameraDemo(view: WebGPUView): Demo {
  look(view, .5, .3, 8);
  const labels = new LabelLayer($('camera-labels'), view.camera);

  // Something worth moving around: a ring of solids on a floor, lit by nothing but their own colours.
  const scene = new Group();
  const shapes = [box([-.45, -.45, -.45], [.45, .45, .45]), sphere(.45), cylinder(.36, .9), shadedSphere(.42), wireSphere(.5, 8, 5, .008)];
  const palette = ['#58c4dd', '#83c167', '#f7d681', '#ff9ec4', '#b5a1ff'];
  for (let index = 0; index < 8; index++) {
    const angle = index / 8 * Math.PI * 2;
    const visual = new Visual(count(shapes[index % shapes.length]), rgba(palette[index % palette.length]));
    visual.position = [2.1 * Math.cos(angle), index % 2 ? .75 : -.1, 2.1 * Math.sin(angle)];
    scene.add(visual);
  }
  const floorLines: Geometry[] = [];
  for (let value = -3; value <= 3; value += .75) {
    floorLines.push(polyline([[value, -1, -3], [value, -1, 3]], .003), polyline([[-3, -1, value], [3, -1, value]], .003));
  }
  scene.add(new Visual(count(merge(...floorLines)), rgba('#7fb7d0', .16)));
  view.world.add(scene, new Visual(count(axes3d(1.1, .006)), rgba('#dbe9f5', .3)));
  labels.addHTML(tag('target'), () => [0, .18, 0], '#9db0c2', 'math-label');

  // Four shots, all of them just numbers over p in [0, 1].
  const paths: Record<string, (p: number) => [number, number, number]> = {
    orbit: p => [.4 + p * Math.PI * 2, .3 + .1 * Math.sin(p * Math.PI * 2), 8.2],
    dive: p => [.7 + .5 * p, .34 - .12 * p, lerp(10.5, 3.1, smooth(p))],
    sweep: p => [-1 + 2 * smooth(p), .1 + .55 * Math.sin(Math.PI * p), 7.6 + 1.8 * Math.sin(p * Math.PI * 2)],
    top: p => [.4 + 1.1 * p, lerp(.25, 1.4, smooth(p)), 8.4],
  };
  const pathSelect = $<HTMLSelectElement>('camera-path');
  const playButton = $<HTMLButtonElement>('camera-play');
  const timeInput = $<HTMLInputElement>('camera-time');
  const readout = $('camera-readout');
  let path = 'orbit', phase = 0, playing = !reducedMotion;
  const apply = (): void => {
    const [yaw, pitch, distance] = paths[path](phase);
    view.camera.yaw = yaw;
    view.camera.pitch = pitch;
    view.camera.distance = distance;
    timeInput.value = String(phase);
    $('camera-time-value').textContent = `${Math.round(phase * 100)}%`;
    readout.textContent = `yaw ${yaw.toFixed(2)} · pitch ${pitch.toFixed(2)} · distance ${distance.toFixed(1)}`;
  };
  const button = (): void => {
    playButton.textContent = playing ? 'Pause' : 'Play';
    playButton.setAttribute('aria-pressed', String(playing));
  };
  pathSelect.addEventListener('change', () => { path = pathSelect.value; apply(); });
  playButton.addEventListener('click', () => { playing = !playing; button(); });
  timeInput.addEventListener('input', () => { playing = false; phase = Number(timeInput.value); button(); apply(); });
  button();
  apply();

  return {
    labels,
    update: delta => {
      if (playing) { phase = (phase + delta * .11) % 1; apply(); }
    },
  };
}

/* --------------------------------------------------------------------------------------------
 * 10 · One mesh, many copies: shared geometry, moved and scaled, batched by the renderer.
 * ------------------------------------------------------------------------------------------ */

function instancesDemo(view: WebGPUView): Demo {
  look(view, .66, .38, 8.6);
  const labels = new LabelLayer($('instances-labels'), view.camera);
  const grid = new Group();
  view.world.add(grid);
  // One mesh for every copy. Nothing below rebuilds geometry.
  const mesh = box([-.42, -.42, -.42], [.42, .42, .42]);
  const colours = ['#58c4dd', '#83c167'];
  let copies: { visual: Visual; at: Vec3; parity: number }[] = [];
  let count = Number($<HTMLInputElement>('instances-count').value);
  let wave = Number($<HTMLInputElement>('instances-wave').value);

  const summary = labels.addHTML(mathml(mn('')), () => [0, -2.85, 0], '#9db0c2', 'math-label');
  /** The grid always spans the same world extent, so more copies means smaller cubes, not a bigger box. */
  const spacing = () => 4.2 / count;
  const baseScale = () => 1.6 / count;

  const build = (): void => {
    grid.clear();
    copies = [];
    const gap = spacing(), half = 4.2 / 2 - gap / 2;
    for (let i = 0; i < count; i++) for (let j = 0; j < count; j++) for (let k = 0; k < count; k++) {
      const at: Vec3 = [-half + i * gap, -half + j * gap, -half + k * gap];
      const parity = (i + j + k) % 2;
      const visual = new Visual(mesh, rgba(colours[parity]));
      visual.position = at;
      grid.add(visual);
      copies.push({ visual, at, parity });
    }
    const nodes = count ** 3;
    // One text run: separate mtext runs swallow their leading spaces.
    summary.innerHTML = mathml(mtext(`${nodes} nodes · 1 mesh · ${(nodes * 12).toLocaleString()} triangles · 2 draws`));
  };

  const countInput = $<HTMLInputElement>('instances-count');
  const waveInput = $<HTMLInputElement>('instances-wave');
  const spinButton = $<HTMLButtonElement>('instances-spin');
  let spinning = !reducedMotion, phase = 0;
  const button = (): void => {
    spinButton.textContent = spinning ? 'Animating' : 'Still';
    spinButton.setAttribute('aria-pressed', String(spinning));
  };
  countInput.addEventListener('input', () => {
    count = Number(countInput.value);
    $('instances-count-value').textContent = `${count}³ = ${count ** 3} cubes`;
    build();
  });
  waveInput.addEventListener('input', () => {
    wave = Number(waveInput.value);
    $('instances-wave-value').textContent = wave.toFixed(2);
  });
  spinButton.addEventListener('click', () => { spinning = !spinning; button(); });
  build();
  button();

  return {
    labels,
    // One phase drives both the turn and the wave, so "Still" holds the whole picture — which also
    // lets the check tell a control's effect apart from the animation's own drift.
    update: delta => {
      if (spinning) phase += delta * .3;
      grid.rotation = phase;
      // Sizes follow a travelling wave, which is one assignment per copy — no geometry is touched.
      const base = baseScale();
      for (const copy of copies) {
        const size = base * (1 + wave * .85 * Math.sin(2.4 * (copy.at[0] + copy.at[1] + copy.at[2]) - phase * 7.3));
        copy.visual.scale = [size, size, size];
      }
    },
  };
}

/* --------------------------------------------------------------------------------------------
 * 09 · Depth and draw order: translucent slabs crossed by opaque solids.
 * ------------------------------------------------------------------------------------------ */

function depthDemo(view: WebGPUView): Demo {
  look(view, .62, .32, 7.4);
  const labels = new LabelLayer($('depth-labels'), view.camera);
  const spin = new Group();
  view.world.add(spin);

  // A floor slab and a wall slab, both translucent, plus three opaque balls that pass right through
  // them: the balls must stay solid, and the slabs must blend in the right order wherever they cross.
  const floor = new Visual(count(box([-2.3, -.07, -2.3], [2.3, .07, 2.3])), rgba('#58c4dd', .34));
  const wall = new Visual(count(box([-.07, -2.3, -2.3], [.07, 2.3, 2.3])), rgba('#f7d681', .36));
  const floorEdge = new Visual(count(boxEdges([-2.3, -.07, -2.3], [2.3, .07, 2.3], .004)), rgba('#9fe7ff', .5));
  const wallEdge = new Visual(count(boxEdges([-.07, -2.3, -2.3], [.07, 2.3, 2.3], .004)), rgba('#f7d681', .55));
  spin.add(floor, floorEdge, wall, wallEdge);

  const balls = [-1.5, 0, 1.5].map(x => {
    const ball = new Visual(count(shadedSphere(.22)), rgba('#83c167'));
    ball.position = [x, Math.sin(x) * .7, Math.cos(x) * .9];
    spin.add(ball);
    return ball;
  });

  const crossInput = $<HTMLInputElement>('depth-cross');
  const tiltInput = $<HTMLInputElement>('depth-tilt');
  const spinButton = $<HTMLButtonElement>('depth-spin');
  let spinning = !reducedMotion, phase = 0;
  const place = (): void => {
    const cross = Number(crossInput.value), lean = Number(tiltInput.value) * Math.PI / 180;
    $('depth-cross-value').textContent = cross.toFixed(2);
    $('depth-tilt-value').textContent = `${Math.round(Number(tiltInput.value))}°`;
    // The wall slides along z, so it sweeps through the floor and the balls; the lean tilts the whole
    // stack, which is a bigger and clearer change than leaning one thin slab.
    wall.position = [0, 0, cross];
    wallEdge.position = [0, 0, cross];
    spin.orientation = [lean, 0, 0];
  };
  const button = (): void => {
    spinButton.textContent = spinning ? 'Turning' : 'Still';
    spinButton.setAttribute('aria-pressed', String(spinning));
  };
  crossInput.addEventListener('input', place);
  tiltInput.addEventListener('input', place);
  spinButton.addEventListener('click', () => { spinning = !spinning; button(); });
  place();
  button();

  return {
    labels,
    update: delta => {
      if (spinning) { phase += delta * .25; spin.rotation = phase; }
    },
  };
}

/* --------------------------------------------------------------------------------------------
 * 08 · A chart in 3D: plotFrame, ticks and a function curve.
 * ------------------------------------------------------------------------------------------ */

function plotDemo(view: WebGPUView): Demo {
  // Dead on the xy plane: a chart is a 3D scene, but it reads best from straight ahead.
  look(view, 0, 0, 5.8);
  const labels = new LabelLayer($('plot-labels'), view.camera);
  const chart = plotFrame([-4.4, 4.4], [-1.6, 1.6], { xTicks: 8, yTicks: 4 });
  view.world.add(
    new Visual(count(chart.grid), rgba('#e8f0f6', .1)),
    new Visual(count(chart.ticks), rgba('#e8f0f6', .38)),
    new Visual(count(chart.axes), rgba('#e8f0f6', .75)),
  );
  for (const anchor of chart.labels) labels.addHTML(mathml(mtext(anchor.text)), () => anchor.position, '#8f9aad', 'math-label');

  const functions: Record<string, (x: number) => number> = {
    sine: x => Math.sin(x),
    square: x => .9 * Math.sign(Math.sin(2 * x)),
    damped: x => 1.15 * Math.exp(-x * x / 9) * Math.sin(3 * x),
    gaussian: x => 1.25 * Math.exp(-x * x / 2.6),
  };
  const equations: Record<string, string> = {
    sine: row(mi('f'), mo('('), mi('x'), mo(')'), mo('='), mi('sin'), mo('('), mi('x'), mo(')')),
    square: row(mi('f'), mo('('), mi('x'), mo(')'), mo('='), mn('0.9'), mi('sign'), mo('('), mi('sin'), mo('('), mn('2'), mi('x'), mo(')'), mo(')')),
    damped: row(mi('f'), mo('('), mi('x'), mo(')'), mo('='), msup(mi('e'), row(mo('−'), msup(mi('x'), mn('2')), mo('⁄'), mn('9'))), mi('sin'), mo('('), mn('3'), mi('x'), mo(')')),
    gaussian: row(mi('f'), mo('('), mi('x'), mo(')'), mo('='), msup(mi('e'), row(mo('−'), msup(mi('x'), mn('2')), mo('⁄'), mn('2.6')))),
  };
  let curve = new Visual(count(functionCurve(functions.sine, [-4.4, 4.4], 640, .022)), rgba('#ffff00'));
  view.world.add(curve);
  const equation = labels.addHTML(mathml(equations.sine), () => [-4.35, 1.78, 0], '#e9f2fa', 'math-label');

  $<HTMLSelectElement>('plot-function').addEventListener('change', event => {
    const kind = (event.target as HTMLSelectElement).value;
    const next = new Visual(count(functionCurve(functions[kind], [-4.4, 4.4], 640, .022)), rgba('#ffff00'));
    view.world.remove(curve);
    view.world.add(next);
    curve = next;
    equation.innerHTML = mathml(equations[kind]);
  });

  return { labels, update: () => {} };
}

/* --------------------------------------------------------------------------------------------
 * Wiring: one device, eight views, one loop.
 * ------------------------------------------------------------------------------------------ */

async function initialize(): Promise<void> {
  const canvases = ['coordinates-canvas', 'interpolation-canvas', 'transparency-canvas', 'shapes-canvas', 'groups-canvas', 'labels-canvas', 'colour-canvas', 'plot-canvas', 'depth-canvas', 'instances-canvas', 'camera-canvas', 'simulation-canvas', 'field-canvas', 'streamlines-canvas', 'story-canvas', 'vectors-canvas', 'path-canvas', 'normals-canvas', 'layers-canvas', 'bars-canvas', 'follow-canvas', 'transform-canvas', 'measure-canvas'];
  const first = await WebGPUView.create($<HTMLCanvasElement>(canvases[0]), { samples: msaa, maxDpr, onError: report });
  views.push(first);
  if (disposed) { first.dispose(); return; }
  for (const id of canvases.slice(1)) {
    views.push(await WebGPUView.create($<HTMLCanvasElement>(id), { device: first.device, onError: report }));
  }
  demos.push(
    coordinateDemo(views[0]),
    interpolationDemo(views[1]),
    transparencyDemo(views[2]),
    shapesDemo(views[3]),
    groupsDemo(views[4]),
    labelDemo(views[5]),
    colourDemo(views[6]),
    plotDemo(views[7]),
    depthDemo(views[8]),
    instancesDemo(views[9]),
    cameraDemo(views[10]),
    simulationDemo(views[11]),
    fieldDemo(views[12]),
    streamlineDemo(views[13]),
    storyDemo(views[14]),
    vectorDemo(views[15]),
    pathDemo(views[16]),
    normalDemo(views[17]),
    layerDemo(views[18]),
    barDemo(views[19]),
    followDemo(views[20]),
    transformDemo(views[21]),
    measureDemo(views[22]),
  );

  // Eleven views on one page: drawing the ones below the fold would cost a full render each frame for
  // nothing. They all start on screen, and the observer takes the hidden ones out of the loop.
  for (const view of views) onScreen.add(view);
  const byCanvas = new Map<Element, WebGPUView>(views.map((view, index) => [document.getElementById(canvases[index]) as Element, view]));
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
  // The first animation frame can carry a timestamp from before this loop started, so clamp both ways:
  // a negative delta once reached a simulation and threw on its own guard.
  const delta = last ? Math.max(0, Math.min((now - last) / 1000, .1)) : 0;
  last = now;
  clock += delta;
  // Every demo keeps its own time, on screen or not, so a timeline is where it should be when the
  // reader scrolls back to it. Only the draw is skipped: that is the part that costs a full pass.
  for (const demo of demos) {
    // One demo throwing must not freeze the other eleven: report it, then leave that one alone.
    try {
      demo.update(delta, clock);
      demo.labels.update();
    } catch (error) {
      if (!broken.has(demo)) {
        broken.add(demo);
        report(`${error instanceof Error ? error.message : String(error)} — one demo has stopped`);
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
    stats.textContent = `${average.toFixed(1)} ms/frame · ${(1000 / average).toFixed(0)} fps · ${onScreen.size} of ${views.length} views drawing · ${Math.round(drawnTriangles()).toLocaleString()} triangles · ${stats.dataset.renderer ?? ''}`;
  }
  frame = requestAnimationFrame(animate);
}

document.addEventListener('visibilitychange', () => { last = 0; });

window.addEventListener('pagehide', () => {
  disposed = true;
  cancelAnimationFrame(frame);
  observer?.disconnect();
  for (const demo of demos) demo.labels.dispose();
  for (const view of [...views].reverse()) view.dispose();
}, { once: true });

void initialize().catch(error => report(error instanceof Error ? error.message : String(error)));
