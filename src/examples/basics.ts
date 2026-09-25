/**
 * Basics: one small demo per fundamental piece of the library.
 *
 * Each demo below is a self-contained factory that builds its own world and returns an `update`, so
 * they can be read — and copied — one at a time. They draw through one device and one render loop,
 * which is how a page with several views is normally put together.
 */
import {
  WebGPUView, LabelLayer, Group, Visual, Timeline, tween,
  axes3d, boundsBox, box, boxEdges, cylinder, polyline, arrow, circle, sphere, shadedSphere, wireSphere,
  parametricSurface, functionSurface, functionCurve, merge, rgba, lerp, smooth, transform, applyMatrix,
  mathml, mi, mn, mo, mtext, msup, row, tickValues, formatTick, plotFrame, viridis, plasma,
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
let disposed = false, frame = 0, last = 0, clock = 0, timer = 0;
const samples: number[] = [];
let triangles = 0;

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

const count = (geometry: Geometry): Geometry => { triangles += geometry.vertices.length / 9; return geometry; };

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
  const floor = new Visual(count(box([-2.3, -.04, -2.3], [2.3, .04, 2.3])), rgba('#58c4dd', .3));
  const wall = new Visual(count(box([-.04, -2.3, -2.3], [.04, 2.3, 2.3])), rgba('#f7d681', .32));
  const floorEdge = new Visual(count(boxEdges([-2.3, -.04, -2.3], [2.3, .04, 2.3], .004)), rgba('#9fe7ff', .5));
  const wallEdge = new Visual(count(boxEdges([-.04, -2.3, -2.3], [.04, 2.3, 2.3], .004)), rgba('#f7d681', .55));
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
    // The wall leans about x and slides along z, so it sweeps through the floor and the balls.
    wall.position = [0, 0, cross];
    wallEdge.position = [0, 0, cross];
    wall.orientation = [lean, 0, 0];
    wallEdge.orientation = [lean, 0, 0];
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
  const first = await WebGPUView.create($<HTMLCanvasElement>('coordinates-canvas'), { samples: msaa, maxDpr, onError: report });
  views.push(first);
  if (disposed) { first.dispose(); return; }
  for (const id of ['interpolation-canvas', 'transparency-canvas', 'shapes-canvas', 'groups-canvas', 'labels-canvas', 'colour-canvas', 'plot-canvas', 'depth-canvas', 'instances-canvas', 'camera-canvas']) {
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
  );

  const info = first.adapterInfo;
  const name = info?.description || info?.device || info?.architecture || info?.vendor || '';
  const renderer = `${first.isFallbackAdapter ? 'software GPU' : 'GPU'}${name ? ` (${name})` : ''}`;
  stats.dataset.renderer = `${renderer} · msaa×${msaa} · dpr≤${maxDpr}`;
  timer = 1;
  animate(performance.now());
}

function animate(now: number): void {
  if (disposed) return;
  const delta = last ? Math.min((now - last) / 1000, .1) : 0;
  last = now;
  clock += delta;
  for (const demo of demos) demo.update(delta, clock);
  for (const demo of demos) demo.labels.update();
  for (const view of views) view.render();
  samples.push(delta * 1000);
  if (samples.length > 120) samples.shift();
  timer += delta;
  if (timer >= .25) {
    timer = 0;
    const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    stats.textContent = `${average.toFixed(1)} ms/frame · ${(1000 / average).toFixed(0)} fps · ${views.length} views · ${Math.round(triangles).toLocaleString()} triangles · ${stats.dataset.renderer ?? ''}`;
  }
  frame = requestAnimationFrame(animate);
}

document.addEventListener('visibilitychange', () => { last = 0; });

window.addEventListener('pagehide', () => {
  disposed = true;
  cancelAnimationFrame(frame);
  for (const demo of demos) demo.labels.dispose();
  for (const view of [...views].reverse()) view.dispose();
}, { once: true });

void initialize().catch(error => report(error instanceof Error ? error.message : String(error)));
