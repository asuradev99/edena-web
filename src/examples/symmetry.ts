import {
  WebGPUView, Visual, Geometry, LabelLayer, rgba, smooth, clamp, polyline, merge, shadedSphere, arrow, wireSphere,
  parsePOSCAR, parsePhonopySymmetry,
  latticeSites, supercell as makeSupercell, bonds as findBonds, cellVolume,
  fractionalToCartesian, shortestDistance, appearanceFor,
  latticePointGroup, mapsOntoSelf, siteMapping, symmetryOrbits,
  operationIsometry, isometryPoint, isometryTarget, rotateAboutAxis,
  mathml, mi, mn, mo, msub, row, matrix, vec,
  type Vec3, type Bond, type CrystalStructure, type CrystalOperation, type Supercell, type Isometry,
} from '../index.js';

const $ = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node as T;
};

const canvas = $<HTMLCanvasElement>('scene');
const operationSelect = $<HTMLSelectElement>('operation');
const progressInput = $<HTMLInputElement>('progress');
const playButton = $<HTMLButtonElement>('play');
const resetButton = $<HTMLButtonElement>('reset');
const poscarInput = $<HTMLInputElement>('poscar-file');
const symmetryInput = $<HTMLInputElement>('symmetry-file');
const filesInput = $<HTMLInputElement>('files-input');
const dropZone = $<HTMLElement>('drop-zone');
const fileList = $<HTMLElement>('file-list');
const info = $<HTMLElement>('structure-info');
const legend = $<HTMLElement>('legend');
/** Clears every fold at once; present only while at least one element is folded away. */
const showAllButton = document.querySelector<HTMLButtonElement>('#legend-all');
const status = $<HTMLElement>('status');
const mappingPanel = $<HTMLElement>('mapping');
const supercellSelect = $<HTMLSelectElement>('supercell');
const colourSelect = $<HTMLSelectElement>('colour');
const speedSelect = $<HTMLSelectElement>('speed');
const bondsToggle = $<HTMLInputElement>('bonds');
const cellToggle = $<HTMLInputElement>('cell');
const trailsToggle = $<HTMLInputElement>('trails');
const legendAnchor = $<HTMLElement>('legend-anchor');
const atomLabelsToggle = $<HTMLInputElement>('atom-labels');
const holdStartToggle = $<HTMLInputElement>('start-sites');
const prevButton = $<HTMLButtonElement>('prev-op');
const nextButton = $<HTMLButtonElement>('next-op');

const SITE_COLORS = ['#62d6e8', '#f7d681', '#ef9273', '#b5a1ff', '#9ae6b4', '#ff9ec4', '#8ff0b0', '#9ad0ff'];
const ELEMENT_COLOR = (() => { const map = new Map<string, string>(); return (symbol: string) => { if (!map.has(symbol)) map.set(symbol, appearanceFor(symbol).color); return map.get(symbol)!; }; })();

// --- Small vector helpers ----------------------------------------------------------------------
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const times = (a: Vec3, factor: number): Vec3 => [a[0] * factor, a[1] * factor, a[2] * factor];
const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit3 = (a: Vec3): Vec3 => { const length = Math.hypot(...a) || 1; return [a[0] / length, a[1] / length, a[2] / length]; };
const between = (a: Vec3, b: Vec3): number => Math.hypot(...sub(a, b));

/** Gentle start and stop, so the motion reads as a crystal settling rather than a linear wipe. */
const ease = (value: number): number => { const t = clamp(value, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };

const SUBSCRIPTS = '₀₁₂₃₄₅₆₇₈₉';
const subscript = (value: number): string => String(value).split('').map(digit => SUBSCRIPTS[Number(digit)] ?? digit).join('');
const SUPERSCRIPTS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const superscript = (value: number): string => String(value).split('').map(digit => SUPERSCRIPTS[Number(digit)] ?? digit).join('');

/** A symmetry operation together with the rigid motion it performs, so animation and element agree. */
type Motion = Isometry & { operation: CrystalOperation };

type Built = {
  big: Supercell;
  baseCount: number;
  /** Drawn start and end position of every atom, in the frame centred on a lattice point. */
  ideal: Vec3[];
  target: Vec3[];
  /** Terminal nudge from the arc to the nearest periodic image of the target (usually zero). */
  drift: Vec3[];
  atomVisuals: Visual[];
  atomScales: Vec3[];
  bondVisuals: Visual[];
  /** Which element each bond / ghost belongs to, so the legend can fold elements away. */
  bondSymbols: Map<Visual, string>;
  ghostSymbols: string[];
  ghostVisuals: Visual[];
  cellVisual?: Visual;
  /** One merged arc set per colour, so a trail matches the atoms that draw it. */
  trailVisuals: Visual[];
  trailSymbols: string[];
  elementVisuals: Visual[];
  /** Faded copies of the starting sites, shown while the operation runs. */
  startVisuals: Visual[];
  atomLabels: HTMLSpanElement[];
  elementLabel: string;
  elementAnchor: Vec3 | undefined;
  motion: Motion;
  centre: Vec3;
  extent: number;
  /** Sites the operation visibly relocates; the report and the highlights both use this set. */
  movers: Set<number>;
  /** The same sites in index order, so the "before" markers pair with them without rebuilding. */
  moverList: number[];
  shortest: number;
};

let view: WebGPUView | undefined;
let labels: LabelLayer | undefined;
let base: CrystalStructure = latticeSites('perovskite', { side: 3.905, species: ['Sr', 'Ti', 'O'] });
let operations: CrystalOperation[] = [];
let operationIndex = 0;
let repeats = 1;
let progress = 0;
let playing = false;
let speed = 1;
let showBonds = true;
let showCell = true;
let showTrails = true;
/** Keep the faint "before" markers visible after the operation, for side-by-side comparison. */
let holdStart = false;
/** Elements folded away from the scene by clicking the legend. */
const hiddenElements = new Set<string>();
let colourMode: 'species' | 'site' = 'species';
let built: Built | undefined;
/** Neighbour search and bonds, reused while the crystal and the bond toggle are unchanged. */
let neighbours: { base: CrystalStructure; n: number; showBonds: boolean; shortest: number; bonds: Bond[] } | undefined;
/** Which structure the camera was framed for, so a manual zoom survives operation changes. */
let framed: { base: CrystalStructure; n: number } | undefined;
/** Bond and ghost geometry, rebuilt only when the crystal changes. */
let bondScene: { base: CrystalStructure; n: number; halves: Map<string, Geometry>; ghosts: { symbol: string; position: Vec3; radius: Vec3 }[] } | undefined;
/** One shaded unit sphere for every atom of every element, built on first use. */
let atomMesh: Geometry | undefined;
/** Wire markers, keyed by their size, dropped when the crystal changes. */
const markerCache = new Map<string, Geometry>();
let frame = 0;
let last = 0;
let clock = 0;
let disposed = false;
const lifetime = new AbortController();
const events = { signal: lifetime.signal };

const fracToCart = (fractional: Vec3) => fractionalToCartesian(fractional, base.lattice);

function axisLabel(axis: Vec3): string {
  const scale = 1 / Math.max(...axis.map(Math.abs), 1e-9);
  const integers = axis.map(value => Math.round(value * scale));
  const divisor = integers.reduce((g, value) => gcd(g, Math.abs(value)), 0) || 1;
  // Negative Miller indices use an overbar (1̄), the crystallographic convention.
  return `[${integers.map(value => value / divisor).map(value => value < 0 ? `${Math.abs(value)}̄` : String(value)).join('')}]`;
}
function gcd(a: number, b: number): number { return b ? gcd(b, a % b) : a; }

/**
 * The operation's rigid motion, memoised: the picker, the ordering and the report all ask for it
 * repeatedly, and the decomposition costs a couple of 3×3 products. Operations are recreated
 * whenever the structure changes, so a WeakMap keyed by operation cannot go stale.
 */
const MOTIONS = new WeakMap<CrystalOperation, Motion>();
function motionFor(operation: CrystalOperation): Motion {
  let motion = MOTIONS.get(operation);
  if (!motion) { motion = { ...operationIsometry(base.lattice, operation), operation }; MOTIONS.set(operation, motion); }
  return motion;
}

function describeOperation(operation: CrystalOperation): string {
  const motion = motionFor(operation);
  const shift = motion.translation.some(value => Math.abs(value) > 1e-9) ? ` + (${operation.translation.map(value => value.toFixed(2)).join(', ')})` : '';
  if (motion.trivial) return `E · identity${shift}`;
  if (motion.inversion) return `i · inversion${shift}`;
  if (!motion.improper) {
    const degrees = Math.round(Math.abs(motion.angle) * 180 / Math.PI);
    return `${rotationSymbol(degrees)} · ${degrees}° ‖ ${axisLabel(motion.axis)}${shift}`;
  }
  if (Math.abs(motion.angle) < 1e-6) return `σ · mirror ⟂ ${axisLabel(motion.axis)}${shift}`;
  // A rotoreflection is S_n^k = R(k·360/n)·σ^k, and only odd k carries a single reflection, so the
  // power separates an operation from its inverse: S4 about [100] and S4³ about [100] differ only in
  // the sign of the spin, and without the power the two entries read identically.
  const degrees = Math.round(Math.abs(motion.angle) * 180 / Math.PI);
  const order = Math.round(360 / degrees);
  const turns = ((Math.round(motion.angle * 180 / Math.PI / (360 / order)) % order) + order) % order;
  const power = turns % 2 === 1 ? turns : turns + order;
  return `S${subscript(order)}${power > 1 ? superscript(power) : ''} · rotoreflection ‖ ${axisLabel(motion.axis)}${shift}`;
}

function rotationSymbol(degrees: number): string {
  if (degrees === 180) return 'C₂';
  if (degrees === 120) return 'C₃';
  if (degrees === 90) return 'C₄';
  if (degrees === 60) return 'C₆';
  return `C${subscript(Math.round(360 / degrees))}`;
}

function cellWire(lattice: Supercell['lattice'], pivot: Vec3, width: number): Geometry {
  const corner = (i: number, j: number, k: number) => sub(fractionalToCartesian([i, j, k], lattice), pivot);
  const edges: Geometry[] = [];
  for (const i of [0, 1]) for (const j of [0, 1]) {
    edges.push(polyline([corner(i, j, 0), corner(i, j, 1)], width));
    edges.push(polyline([corner(i, 0, j), corner(i, 1, j)], width));
    edges.push(polyline([corner(0, i, j), corner(1, i, j)], width));
  }
  return merge(...edges);
}
function perpendicular(axis: Vec3): Vec3 {
  const seed: Vec3 = Math.abs(axis[1]) > .9 ? [1, 0, 0] : [0, 1, 0];
  return unit3(cross3(axis, seed));
}
function rotationRing(centre: Vec3, axis: Vec3, radius: number, turns = 1): Vec3[] {
  const start = times(perpendicular(axis), radius);
  return Array.from({ length: 33 }, (_, index) => add(centre, rotateAboutAxis(start, axis, index / 32 * Math.PI * 2 * turns)));
}
function mirrorQuad(centre: Vec3, normal: Vec3, size: number): Geometry {
  const u = perpendicular(normal), v = cross3(normal, u);
  const corner = (su: number, sv: number): Vec3 => add(centre, times(add(times(u, su), times(v, sv)), size));
  const a = corner(-1, -1), b = corner(1, -1), c = corner(1, 1), d = corner(-1, 1);
  return new Geometry([...a, ...b, ...c, ...a, ...c, ...d]);
}

/** The element itself: a rotation axis and its arc, a mirror plane, or an inversion centre. */
function operationElement(motion: Motion, centre: Vec3, extent: number): { visuals: Visual[]; anchor: Vec3 | undefined; label: string } {
  const visuals: Visual[] = [];
  const gold = rgba('#f7d681', .9), blue = rgba('#58c4dd', .85), green = rgba('#83c167', .85);
  if (motion.trivial) return { visuals, anchor: centre, label: 'identity — every site maps to itself' };
  const reach = extent * .85;
  if (motion.inversion) {
    visuals.push(new Visual(wireSphere(extent * .09, 10, 6, .012), gold));
    return { visuals, anchor: centre, label: 'inversion centre' };
  }
  const axisLine = [sub(centre, times(motion.axis, reach)), add(centre, times(motion.axis, reach))];
  visuals.push(new Visual(polyline(axisLine, .012), gold));
  // A rotoreflection's axis has no meaningful direction, so the sign of the spin has to be spoken
  // here: S4³ about [100] turns the other way from S4 about [100], and only the sign says so.
  const signed = Math.round(motion.angle * 180 / Math.PI);
  const degrees = Math.abs(signed);
  if (!motion.improper) {
    // The arc spans exactly the rotation angle and carries an arrowhead, so the angle is visible.
    const ring = rotationRing(centre, motion.axis, extent * .26, motion.angle / (Math.PI * 2));
    visuals.push(new Visual(polyline(ring, .01), blue));
    visuals.push(new Visual(arrow(ring[ring.length - 3], ring[ring.length - 1], .022), blue));
    const anchor = add(centre, times(motion.axis, reach));
    return { visuals, anchor, label: `${degrees}° rotation about ${axisLabel(motion.axis)}` };
  }
  // Improper: show the mirror plane perpendicular to the axis, and the spin that goes with it.
  visuals.push(new Visual(mirrorQuad(centre, motion.axis, extent * .38), rgba('#83c167', .09)));
  const u = perpendicular(motion.axis), v = cross3(motion.axis, u), h = extent * .38;
  const outline: Vec3[] = [
    add(centre, times(add(times(u, -1), times(v, -1)), h)),
    add(centre, times(add(u, times(v, -1)), h)),
    add(centre, times(add(u, v), h)),
    add(centre, times(add(times(u, -1), v), h)),
    add(centre, times(add(times(u, -1), times(v, -1)), h)),
  ];
  visuals.push(new Visual(polyline(outline, .009), green));
  const anchor = add(centre, times(motion.axis, extent * .55));
  visuals.push(new Visual(arrow(centre, anchor, .016), green));
  if (Math.abs(motion.angle) > 1e-6) {
    const ring = rotationRing(centre, motion.axis, extent * .26, motion.angle / (Math.PI * 2));
    visuals.push(new Visual(polyline(ring, .01), blue));
    visuals.push(new Visual(arrow(ring[ring.length - 3], ring[ring.length - 1], .022), blue));
  }
  // Name the two moves in the order they play, so the label matches what the animation does.
  return {
    visuals,
    anchor,
    label: Math.abs(motion.angle) < 1e-6
      ? `mirror plane ⟂ ${axisLabel(motion.axis)}`
      : `rotate ${signed}° about ${axisLabel(motion.axis)}, then mirror ⟂ ${axisLabel(motion.axis)}`,
  };
}

function atomColor(index: number, species: string): string {
  return colourMode === 'site' ? SITE_COLORS[index % SITE_COLORS.length] : ELEMENT_COLOR(species);
}

/**
 * The box the camera was fitted to, so a resize can re-fit without losing the zoom the user set.
 * `fittedHeight` is the height that fits that box on the current viewport.
 */
let fitted: { corners: Vec3[]; centre: Vec3; extent: number } | undefined;
let fittedHeight = 0;

/** Height that fits the drawn box's projection, leaving the camera pointed where it is. */
function fitHeight(): number {
  const camera = view!.camera;
  const { corners, extent } = fitted!;
  // A rotated box projects taller than its axis-aligned extent, and the guard changes with the
  // viewport aspect (a narrow stage clips the sides too), so measure the projection and fit it.
  // CSS pixels, not the backing store: the backing store is resized asynchronously, so framing
  // against it would not be reproducible.
  camera.height = extent * 1.45;
  const viewportWidth = canvas.clientWidth, viewportHeight = canvas.clientHeight;
  if (!(viewportWidth > 0 && viewportHeight > 0)) return camera.height;
  const aspect = viewportWidth / viewportHeight;
  const projected = corners.map(point => camera.project(point, viewportWidth, viewportHeight));
  const toWorld = camera.height / viewportHeight;
  const tall = (Math.max(...projected.map(([, y]) => y)) - Math.min(...projected.map(([, y]) => y))) * toWorld;
  const wide = (Math.max(...projected.map(([x]) => x)) - Math.min(...projected.map(([x]) => x))) * toWorld / aspect;
  return Math.max(extent, tall, wide) * 1.18;
}

/** Point the camera at the box and fit it. */
function frameFor(corners: Vec3[], centre: Vec3, extent: number): void {
  fitted = { corners, centre, extent };
  fittedHeight = fitHeight();
  view!.camera.target = centre;
  view!.camera.height = fittedHeight;
}

/** Re-fit after a reshape, keeping whatever zoom the user set relative to the fit. */
function refit(): void {
  if (!view || !fitted || !fittedHeight) return;
  const zoom = view.camera.height / fittedHeight;
  fittedHeight = fitHeight();
  view.camera.height = fittedHeight * zoom;
}

/** Put the camera back where it started: the default orbit, fitted to the drawn box. */
function resetView(): void {
  if (!view || !fitted) return;
  view.camera.yaw = .62;
  view.camera.pitch = .38;
  frameFor(fitted.corners, fitted.centre, fitted.extent);
}

function boundsOf(points: Vec3[]): { min: Vec3; max: Vec3; centre: Vec3; extent: number } {
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const point of points) for (let axis = 0; axis < 3; axis++) {
    min[axis] = Math.min(min[axis], point[axis]);
    max[axis] = Math.max(max[axis], point[axis]);
  }
  return {
    min,
    max,
    centre: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
    extent: Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]),
  };
}

/**
 * The scene is laid out in a frame centred on a lattice point, i.e. the cell spans [-n/2, n/2]
 * rather than [0, n]. Every point-group element passes through the origin, so this puts the drawn
 * axis or plane in the middle of the picture and lets the crystal turn about it instead of
 * sweeping around a corner of the box.
 */
function rebuild(): void {
  if (!view) return;
  view.world.clear();
  const baseCount = base.positions.length;
  // Say how many atoms each choice draws, and disable the ones the 1600-atom budget would quietly
  // shrink to the same cell — a 2x2x2 that draws the 1x1x1 cell is worse than no option at all.
  let largest = 1;
  for (const option of [...supercellSelect.options]) {
    const asked = Number(option.value);
    let drawn = asked;
    while (baseCount * drawn ** 3 > 1600 && drawn > 1) drawn--;
    const capped = drawn !== asked;
    option.textContent = `${asked} × ${asked} × ${asked} · ${baseCount * drawn ** 3} atoms${capped ? ' (capped)' : ''}`;
    option.disabled = capped;
    option.title = capped ? `${baseCount} atoms per cell exceeds the 1600-atom budget at ${asked} × ${asked} × ${asked}` : '';
    if (!capped) largest = asked;
  }
  if (repeats > largest) { repeats = largest; supercellSelect.value = String(largest); }
  const n = repeats;
  const big = makeSupercell(base, [n, n, n]);
  const pivot = fracToCart([n / 2, n / 2, n / 2]);
  const corners = [0, n].flatMap(i => [0, n].flatMap(j => [0, n].map(k => sub(fractionalToCartesian([i, j, k], base.lattice), pivot))));
  const bounds = boundsOf(corners);
  // Frame the box once per structure. Re-framing on every operation change would throw away the
  // zoom and orbit the user just set up.
  if (!framed || framed.base !== base || framed.n !== n) {
    frameFor(corners, bounds.centre, bounds.extent);
    framed = { base, n };
    markerCache.clear();
  }

  // The nearest-neighbour search and the bond list describe the structure, not the operation, and
  // both are O(n²): re-deriving them on every operation change cost a 400-atom cell ~140 ms a time.
  const cached = neighbours && neighbours.base === base && neighbours.n === n && neighbours.showBonds === showBonds ? neighbours : undefined;
  const shortest = cached ? cached.shortest : shortestDistance(big.positions, big.lattice);
  const found = cached ? cached.bonds : (showBonds && big.positions.length <= 1200 ? findBonds(big.positions, big.lattice, shortest * 1.28, { periodic: n === 1 }) : []);
  neighbours = { base, n, showBonds, shortest, bonds: found };
  const elements = [...new Set(big.species)];
  // Forget folded elements the new structure does not contain, so a stale fold cannot blank a
  // freshly loaded crystal.
  for (const symbol of [...hiddenElements]) if (!elements.includes(symbol)) hiddenElements.delete(symbol);
  const appearance = new Map(elements.map(symbol => [symbol, appearanceFor(symbol)]));
  const widest = Math.max(...[...appearance.values()].map(entry => entry.radius));
  const unit = Math.min(1, shortest * .26 / widest);

  // Drawn positions: base fractional + cell offset, centred on the lattice point at the origin.
  // `big.positions` are fractional in the supercell lattice, so converting with the supercell
  // lattice and subtracting the pivot is the same as (f + offset) in base cell units.
  const ideal = big.positions.map(position => sub(fractionalToCartesian(position, big.lattice), pivot));
  const motion = motionFor(operations[operationIndex]);
  const target = ideal.map(point => isometryTarget(motion, point, big.lattice));
  const drift = ideal.map((point, index) => sub(target[index], isometryPoint(motion, point, 1)));
  const tolerance = Math.max(1e-3, bounds.extent * 2e-4);
  const moverList = ideal.map((_, index) => index).filter(index => between(ideal[index], target[index]) > tolerance);
  const movers = new Set(moverList);
  // Announce what the picture will actually do. A point-group operation of a high-symmetry crystal
  // fixes every atom that sits on its element, so "3 of 5 sites move" is information, not a bug —
  // and saying how many are pinned explains why they are not moving.
  const description = describeOperation(motion.operation);
  const pinned = ideal.length - moverList.length;
  const held = !moverList.length ? ' (all lie on the element)' : pinned ? ` · ${pinned} ${pinned === 1 ? 'lies' : 'lie'} on the element` : '';
  $('stage-op').textContent = motion.trivial
    ? `${description} — every site maps onto itself`
    : `${description} — ${moverList.length} of ${ideal.length} sites move${held}`;

  // Shaded spheres: the light-model shade rides in the vertex colours and the element hue is the
  // Visual colour, so the renderer's multiply makes each atom read as a lit ball, not a flat disc.
  // The sphere is unit-sized and shaded per vertex, which is thousands of vertices, so one mesh is
  // built once and shared by every element and every rebuild — rebuilding it per element was the
  // single largest cost of choosing an operation.
  atomMesh ??= shadedSphere(1);
  const meshes = new Map(elements.map(symbol => [symbol, atomMesh!]));
  const atomScales: Vec3[] = big.positions.map((_, index) => { const radius = Math.max(shortest * .08, appearance.get(big.species[index])!.radius * unit); return [radius, radius, radius]; });
  const atomVisuals = big.positions.map((_, index) => {
    const visual = new Visual(meshes.get(big.species[index])!, rgba(atomColor(index, big.species[index])));
    visual.position = ideal[index];
    visual.scale = atomScales[index];
    return visual;
  });
  // Wire outlines left at the starting sites make "before → after" legible while the operation runs.
  // An outline reads as a marker; a filled translucent ball just looks like another atom. Their size
  // and tube width follow the crystal, so they are cached per size and dropped when it changes.
  const markerWidth = Math.max(.004, bounds.extent * .0016);
  const markers = new Map(elements.map(symbol => {
    const radius = Math.max(.02, appearance.get(symbol)!.radius * unit * .95);
    const key = `${radius.toFixed(4)}|${markerWidth.toFixed(4)}`;
    let geometry = markerCache.get(key);
    if (!geometry) { geometry = wireSphere(radius, 12, 7, markerWidth); markerCache.set(key, geometry); }
    return [symbol, geometry] as [string, Geometry];
  }));
  const startVisuals = moverList.map(index => {
    const marker = new Visual(markers.get(big.species[index])!, rgba(atomColor(index, big.species[index]), .55));
    marker.position = ideal[index];
    return marker;
  });

  const bondVisuals: Visual[] = [];
  const ghostVisuals: Visual[] = [];
  const ghostSymbols: string[] = [];
  const bondSymbols = new Map<Visual, string>();
  if (showBonds && big.positions.length <= 1200) {
    // Bonds describe the crystal, so their geometry is built once per structure and re-wrapped in new
    // Visuals as the operation changes — the same way the shaded spheres above share one geometry.
    if (!bondScene || bondScene.base !== base || bondScene.n !== n) {
      const halves = new Map<string, Geometry[]>();
      const width = Math.min(.16, Math.max(.02, shortest * .055));
      const ghosts: { symbol: string; position: Vec3; radius: Vec3 }[] = [];
      const seen = new Set<string>();
      for (const bond of found) {
        const a = ideal[bond.i];
        const shifted: Vec3 = [big.positions[bond.j][0] + bond.image[0], big.positions[bond.j][1] + bond.image[1], big.positions[bond.j][2] + bond.image[2]];
        const b = sub(fractionalToCartesian(shifted, big.lattice), pivot);
        const middle: Vec3 = times(add(a, b), .5);
        // Half-bonds are grouped by element symbol — not by colour — so the legend can fold one
        // element away without disturbing another that happens to share a colour.
        const symbolI = big.species[bond.i], symbolJ = big.species[bond.j];
        const listI = halves.get(symbolI) ?? []; listI.push(polyline([a, middle], width, 5)); halves.set(symbolI, listI);
        const listJ = halves.get(symbolJ) ?? []; listJ.push(polyline([middle, b], width, 5)); halves.set(symbolJ, listJ);
        // A bond with a non-zero image offset ends on a periodic copy, not on a drawn atom.
        // Show that neighbour as a faded ghost so the coordination shell reads as complete.
        const periodicImage = bond.i !== bond.j && (bond.image[0] !== 0 || bond.image[1] !== 0 || bond.image[2] !== 0);
        const key = `${symbolJ}:${shifted.map(value => value.toFixed(3)).join(',')}`;
        if (periodicImage && !seen.has(key)) {
          seen.add(key);
          // Slightly smaller than a real site, so a periodic image never reads as an atom of the cell.
          ghosts.push({ symbol: symbolJ, position: b, radius: times(atomScales[bond.j], .72) });
        }
      }
      bondScene = { base, n, halves: new Map([...halves].map(([symbol, list]) => [symbol, merge(...list)])), ghosts };
    }
    for (const [symbol, geometry] of bondScene.halves) {
      const visual = new Visual(geometry, rgba(ELEMENT_COLOR(symbol), .8));
      bondSymbols.set(visual, symbol);
      bondVisuals.push(visual);
    }
    for (const ghost of bondScene.ghosts) {
      const visual = new Visual(meshes.get(ghost.symbol)!, rgba(ELEMENT_COLOR(ghost.symbol), .22));
      visual.position = ghost.position;
      visual.scale = ghost.radius;
      ghostVisuals.push(visual);
      ghostSymbols.push(ghost.symbol);
    }
  }

  const cellVisual = showCell ? new Visual(cellWire(big.lattice, pivot, Math.max(.006, bounds.extent * .0018)), rgba('#a4b3c6', .55)) : undefined;

  // Orbit trails: one arc per moving site, with an arrowhead so the direction is explicit. In a
  // dense supercell the arrowheads are dropped and the arcs are thinned by their opacity, so the
  // picture reads as a few sweeping orbits instead of a hairball.
  const trailVisuals: Visual[] = [];
  const trailSymbols: string[] = [];
  if (showTrails && movers.size && big.positions.length <= 400) {
    // Merge the arcs by the colour of the atom that draws them, so each element keeps its own hue
    // instead of the whole set being one flat white.
    const byColor = new Map<string, { symbol: string; paths: Geometry[] }>();
    for (const index of moverList) {
      const series = Array.from({ length: 25 }, (_, step) => {
        const t = step / 24;
        return add(isometryPoint(motion, ideal[index], t), times(drift[index], t));
      });
      const color = atomColor(index, big.species[index]);
      const entry = byColor.get(color) ?? { symbol: big.species[index], paths: [] };
      entry.paths.push(polyline(series, Math.max(.004, bounds.extent * .0012)));
      if (moverList.length <= 12) entry.paths.push(arrow(series[series.length - 3], series[series.length - 1], Math.max(.015, bounds.extent * .006)));
      byColor.set(color, entry);
    }
    for (const [color, entry] of byColor) {
      trailVisuals.push(new Visual(merge(...entry.paths), rgba(color, .5)));
      trailSymbols.push(entry.symbol);
    }
  }

  const element = operationElement(motion, bounds.centre, bounds.extent);

  built = {
    big, baseCount, ideal, target, drift, atomVisuals, atomScales, bondVisuals, bondSymbols, ghostSymbols, ghostVisuals,
    cellVisual, trailVisuals, trailSymbols, elementVisuals: element.visuals, startVisuals, atomLabels: [],
    elementLabel: element.label, elementAnchor: element.anchor, motion, centre: bounds.centre, extent: bounds.extent, movers, moverList, shortest,
  };
  view.world.add(...atomVisuals, ...ghostVisuals, ...bondVisuals, ...(cellVisual ? [cellVisual] : []), ...trailVisuals, ...element.visuals, ...startVisuals);

  // Labels: lattice vectors, the symmetry element, and (optionally) element symbols.
  labels?.dispose();
  labels = new LabelLayer($('labels'), view.camera);
  for (const [name, direction] of [['a', 0], ['b', 1], ['c', 2]] as [string, number][]) {
    const point = sub(times(big.lattice[direction], 1.06), pivot);
    labels.addHTML(mathml(mi(name)), () => point, '#a4b3c6', 'math-label');
  }
  if (element.anchor) labels.add(element.label, () => element.anchor!, '#83c167');
  if (atomLabelsToggle.checked && big.positions.length <= 36) {
    for (let index = 0; index < big.positions.length; index++) {
      built.atomLabels.push(labels.addHTML(mathml(mi(big.species[index])), () => atomVisuals[index].position, '#ffffff', 'math-label atom-tag'));
    }
  }

  writeStructureInfo();
  writeLegend(elements, appearance, big);
  writeMapping();
}

function writeStructureInfo(): void {
  const lengths = base.lattice.map(vector => Math.hypot(...vector));
  const angle = (a: Vec3, b: Vec3) => Math.acos(clamp(dot3(a, b) / (Math.hypot(...a) * Math.hypot(...b)), -1, 1)) * 180 / Math.PI;
  // Two short lines instead of one long row, so nothing needs a horizontal scrollbar.
  const lengthsLine = mathml(row(msub(mi('a'), mn(1)), mo('='), mn(lengths[0].toFixed(3)), mo(','), msub(mi('b'), mn(1)), mo('='), mn(lengths[1].toFixed(3)), mo(','), msub(mi('c'), mn(1)), mo('='), mn(lengths[2].toFixed(3)), mo(' Å')));
  const anglesLine = mathml(row(mi('α'), mo('='), mn(angle(base.lattice[1], base.lattice[2]).toFixed(1)), mo('°'), mo(','), mi('β'), mo('='), mn(angle(base.lattice[0], base.lattice[2]).toFixed(1)), mo('°'), mo(','), mi('γ'), mo('='), mn(angle(base.lattice[0], base.lattice[1]).toFixed(1)), mo('°')));
  info.innerHTML = `<div class="info-title">${base.comment || 'Crystal structure'}</div><div class="info-math">${lengthsLine}</div><div class="info-math">${anglesLine}</div><div class="info-line">${base.positions.length} atoms · ${[...new Set(base.species)].join(', ')} · ${cellVolume(base.lattice).toFixed(1)} Å³</div>`;
}

/**
 * A swatch that shows every colour an element uses. Colour-by-element is one flat colour; colour-by-
 * site gives the element's sites several palette colours, so the swatch becomes hard-stopped stripes
 * rather than a single hue that would not match the atoms.
 */
function swatchFill(colors: string[]): string {
  if (colors.length < 2) return colors[0] ?? '#888';
  const stops = colors.map((color, index) => `${color} ${index / colors.length * 100}% ${(index + 1) / colors.length * 100}%`);
  return `linear-gradient(135deg, ${stops.join(', ')})`;
}

function writeLegend(elements: string[], appearance: Map<string, { radius: number; color: string }>, big: Supercell): void {
  legend.replaceChildren(...elements.map(symbol => {
    const { color, radius } = appearance.get(symbol)!;
    const count = big.species.filter(species => species === symbol).length;
    const siteColors = colourMode === 'site'
      ? base.species.map((species, index) => species === symbol ? SITE_COLORS[index % SITE_COLORS.length] : undefined).filter((entry): entry is string => Boolean(entry))
      : [];
    const rowElement = document.createElement('button');
    rowElement.type = 'button';
    rowElement.dataset.symbol = symbol;
    rowElement.className = `legend-row${hiddenElements.has(symbol) ? ' off' : ''}`;
    rowElement.title = `Hide or show every ${symbol} site`;
    rowElement.setAttribute('aria-pressed', String(hiddenElements.has(symbol)));
    const swatch = document.createElement('span'); swatch.className = 'swatch'; swatch.style.background = swatchFill(siteColors.length ? siteColors : [color]);
    const name = document.createElement('span'); name.className = 'legend-name'; name.textContent = symbol;
    const countElement = document.createElement('span'); countElement.className = 'muted'; countElement.textContent = `×${count}`;
    const size = document.createElement('span'); size.className = 'legend-size'; size.textContent = `${radius.toFixed(2)} Å`;
    rowElement.append(swatch, name, countElement, size);
    rowElement.addEventListener('click', () => toggleElement(symbol));
    return rowElement;
  }));
  syncLegendControls();
}

/** Fold one element in or out of the scene; the scene reacts on the next frame. */
function toggleElement(symbol: string): void {
  if (hiddenElements.has(symbol)) hiddenElements.delete(symbol); else hiddenElements.add(symbol);
  syncLegendRows();
  update();
}

function syncLegendRows(): void {
  for (const rowElement of legend.querySelectorAll<HTMLElement>('.legend-row')) {
    const off = hiddenElements.has(rowElement.dataset.symbol ?? '');
    rowElement.classList.toggle('off', off);
    rowElement.setAttribute('aria-pressed', String(off));
  }
  syncLegendControls();
}

function syncLegendControls(): void {
  if (showAllButton) showAllButton.hidden = hiddenElements.size === 0;
}

/**
 * How many operations preserve the cell, and which they are. Both depend on the crystal rather than
 * on the selected operation, and testing all of them is 48 `mapsOntoSelf` scans, so the answer is
 * cached: switching operations must not re-scan the cell.
 */
let exactSummary: { base: CrystalStructure; operations: CrystalOperation[]; list: CrystalOperation[] } | undefined;
function exactOperations(): CrystalOperation[] {
  if (exactSummary && exactSummary.base === base && exactSummary.operations === operations) return exactSummary.list;
  exactSummary = { base, operations, list: operations.filter(operation => mapsOntoSelf(base, operation, 1e-3)) };
  return exactSummary.list;
}

/** Orbits of the same operation set, cached by that set's identity. */
let orbitSummary: { used: CrystalOperation[]; orbits: number[][] } | undefined;
function orbitsFor(used: CrystalOperation[]): number[][] {
  if (orbitSummary && orbitSummary.used === used) return orbitSummary.orbits;
  orbitSummary = { used, orbits: symmetryOrbits(base, used, 1e-3) };
  return orbitSummary.orbits;
}

function writeMapping(): void {
  const exact = exactOperations();
  const orbits = orbitsFor(exact.length ? exact : [operations[operationIndex]]);
  const mapping = siteMapping(base, operations[operationIndex], 1e-3);
  const moved = mapping.filter((target, index) => target >= 0 && target !== index).length;
  // Validation: a symmetry operation must send every site to a distinct, same-species site.
  const targets = mapping.filter(target => target >= 0);
  const bijective = targets.length === base.positions.length && new Set(targets).size === targets.length;
  const speciesKept = mapping.every((target, index) => target >= 0 && base.species[target] === base.species[index]);
  const valid = bijective && speciesKept;
  const rows = mapping.slice(0, 14).map((target, index) => {
    const species = base.species[index];
    return `<span class="map-cell" style="--accent:${ELEMENT_COLOR(species)}">${species}<sub>${index}</sub> → ${target < 0 ? '∉' : `${base.species[target]}<sub>${target}</sub>`}</span>`;
  }).join('');
  mappingPanel.innerHTML = `
    <div class="report-line"><strong>${exact.length}</strong> of ${operations.length} listed operations map this cell onto itself.</div>
    <div class="report-line ${valid ? 'ok' : 'bad'}">${valid ? '✓ verified: every site maps to a distinct equivalent site, and the animation ends back inside the cell.' : '✗ this operation does not preserve the structure.'}</div>
    <div class="report-line"><strong>${orbits.length}</strong> symmetry orbit${orbits.length === 1 ? '' : 's'}: ${orbits.map(orbit => `{${orbit.join(', ')}}`).join(' ')}</div>
    <div class="report-line">This operation <strong>permutes</strong> ${moved} of the cell's ${base.positions.length} sites; the caption counts the drawn sites that visibly move.</div>
    <div class="map-grid">${rows}${mapping.length > 14 ? `<span class="map-cell muted">+${mapping.length - 14} more</span>` : ''}</div>`;
}

function update(): void {
  const state = built;
  if (!state || !view) return;
  const t = ease(progress);
  // Bonds and ghosts are built for the resting structure and cannot follow a rotation, so they
  // dissolve as soon as the atoms leave and reassemble as they settle; trails fade out at the end.
  const flight = smooth(clamp(progress * 4)) * (1 - smooth(clamp((progress - .82) / .18)));
  const bondOpacity = 1 - .94 * flight;
  // A supercell can move dozens of sites at once; thin the arcs out so 40 orbits do not read as a
  // single bright haze over the crystal.
  const orbitWeight = Math.min(1, 10 / Math.max(1, state.movers.size));
  const trailOpacity = showTrails ? (.12 + .78 * clamp(smooth(progress * 4))) * (1 - smooth(clamp((progress - .88) / .12))) * orbitWeight : 0;
  // Folding an element away from the legend silences everything that carries it: its half-bonds,
  // its periodic ghosts, its atoms, its "before" markers, and its floating symbols.
  state.bondVisuals.forEach(visual => { visual.opacity = showBonds && !hiddenElements.has(state.bondSymbols.get(visual) ?? '') ? bondOpacity : 0; });
  state.ghostVisuals.forEach((visual, index) => { visual.opacity = showBonds && !hiddenElements.has(state.ghostSymbols[index]) ? bondOpacity : 0; });
  state.trailVisuals.forEach((visual, order) => { visual.opacity = hiddenElements.has(state.trailSymbols[order]) ? 0 : trailOpacity; });
  state.elementVisuals.forEach(visual => { visual.opacity = .3 + .7 * t; });
  state.atomVisuals.forEach((visual, index) => {
    const hidden = hiddenElements.has(state.big.species[index]);
    visual.position = add(isometryPoint(state.motion, state.ideal[index], t), times(state.drift[index], t));
    visual.opacity = hidden ? 0 : 1;
    // Gentle breathing keeps the scene alive; moving sites swell a little while they travel, which
    // draws the eye to exactly the atoms the operation relocates.
    const lift = state.movers.has(index) ? 1 + .06 * flight : 1;
    const pulse = lift * (1 + .012 * Math.sin(clock * 1.6 + index));
    visual.scale = times(state.atomScales[index], pulse);
  });
  // Same thinning as the trails: a supercell leaves an outline at every one of its 38 moving sites.
  const startOpacity = showTrails ? (holdStart ? .5 : smooth(progress * 3) * (1 - smooth((progress - .82) / .18)) * .5) * orbitWeight : 0;
  state.startVisuals.forEach((marker, order) => {
    marker.opacity = hiddenElements.has(state.big.species[state.moverList[order]]) ? 0 : startOpacity;
  });
  state.atomLabels.forEach((label, index) => { label.style.display = hiddenElements.has(state.big.species[index]) ? 'none' : ''; });
  progressInput.value = String(progress);
  // The identity relocates nothing, so there is nothing to play.
  playButton.disabled = state.movers.size === 0;
  playButton.textContent = playing ? 'Ⅱ' : progress >= 1 ? '↺' : '▶';
  playButton.setAttribute('aria-label', playing ? 'Pause' : progress >= 1 ? 'Replay' : 'Play');
  $('progress-value').textContent = `${Math.round(progress * 100)}%`;
  labels?.update();
  view.render();
}

function setOperation(index: number): void {
  operationIndex = clamp(index, 0, operations.length - 1);
  progress = 0; playing = false;
  operationSelect.value = String(operationIndex);
  const operation = operations[operationIndex];
  const matrixMarkup = mathml(row(mi('R'), mo('='), matrix(operation.rotation.map(values => values.map(value => mn(value))))));
  const shiftMarkup = operation.translation.some(Boolean)
    ? mathml(row(mo('+'), vec(row(mn(operation.translation[0].toFixed(2)), mo(','), mn(operation.translation[1].toFixed(2)), mo(','), mn(operation.translation[2].toFixed(2))))))
    : '';
  $('description').innerHTML = `<div class="op-name">${describeOperation(operation)}</div>
    <div class="op-matrix">${matrixMarkup}${shiftMarkup}</div>`;
  // The stage caption is set by rebuild(), which knows exactly which drawn sites move.
  rebuild();
  // Choosing an operation plays it straight away: the point of the picker is to watch the crystal
  // transform, and a freshly chosen operation sitting at 0% looks like nothing happened.
  playing = (built?.movers.size ?? 0) > 0;
  update();
}

/**
 * How many sites of one cell the animation visibly relocates. Because the cell is drawn centred on
 * a lattice point, a rotation that swaps a site with a corner image counts as moving it — which is
 * exactly what the picture shows.
 */
function visibleMovedCount(operation: CrystalOperation): number {
  const motion = motionFor(operation);
  const pivot = fracToCart([.5, .5, .5]);
  return base.positions.reduce((count, position) => {
    const point = sub(fractionalToCartesian(position, base.lattice), pivot);
    return count + (between(point, isometryTarget(motion, point, base.lattice)) > 1e-3 ? 1 : 0);
  }, 0);
}

/** Teaching order: identity, rotations by size, then roto-reflections, mirrors, inversion. */
function operationRank(operation: CrystalOperation): number {
  const name = describeOperation(operation);
  if (name.startsWith('E')) return 0;
  if (name.startsWith('C₄')) return 1;
  if (name.startsWith('C₃')) return 2;
  if (name.startsWith('C₂')) return 3;
  if (name.startsWith('C₆')) return 4;
  if (name.startsWith('S')) return 5;
  if (name.startsWith('σ')) return 6;
  if (name.startsWith('i')) return 7;
  return 8;
}

function orderOperations(list: CrystalOperation[]): CrystalOperation[] {
  const moving = new Map(list.map(operation => [operation, visibleMovedCount(operation)]));
  return [...list].sort((a, b) => operationRank(a) - operationRank(b) || (moving.get(b) ?? 0) - (moving.get(a) ?? 0));
}

/** Fill the picker (name + how many sites move) and open on an operation that visibly moves sites. */
/** Which family an operation belongs to, for the picker's optgroups. */
function operationFamily(operation: CrystalOperation): string {
  const motion = motionFor(operation);
  if (motion.trivial) return 'Identity';
  if (motion.inversion) return 'Inversion';
  if (motion.improper) return Math.abs(motion.angle) < 1e-6 ? 'Mirrors' : 'Roto-reflections';
  // Group by the order of the axis, not by the angle: 180° is 2-fold, 120° is 3-fold, 90° is 4-fold.
  return `Rotations · ${Math.round(360 / (Math.abs(motion.angle) * 180 / Math.PI))}-fold`;
}

function populateOperationOptions(): void {
  // Forty-eight flat entries are hard to scan, so group them by family. Option values stay the
  // indices of the flat list, so nothing downstream has to know about the grouping.
  const groups = new Map<string, HTMLOptionElement[]>();
  operations.forEach((operation, index) => {
    const family = operationFamily(operation);
    const list = groups.get(family) ?? [];
    list.push(new Option(`${index + 1}. ${describeOperation(operation)} · ${visibleMovedCount(operation)} moved`, String(index)));
    groups.set(family, list);
  });
  operationSelect.replaceChildren(...[...groups].map(([family, options]) => {
    const group = document.createElement('optgroup');
    group.label = family;
    group.append(...options);
    return group;
  }));
  const firstMoving = operations.findIndex((operation, index) => index > 0 && visibleMovedCount(operation) > 0);
  setOperation(firstMoving >= 0 ? firstMoving : 0);
}

function recomputeOperations(): void {
  operations = orderOperations(defaultOperations());
  populateOperationOptions();
}

function defaultOperations(): CrystalOperation[] {
  // The point group of the cell itself — 48 for cubic, 24 for hexagonal, 16 for tetragonal, and
  // so on — so every operation shown is a genuine symmetry of the lattice, not just of a cube.
  const group = latticePointGroup(base.lattice, 1e-4).map(rotation => ({ rotation, translation: [0, 0, 0] as Vec3, label: '' }));
  if (!group.length) return [{ rotation: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], translation: [0, 0, 0], label: 'E — identity' }];
  const exact = group.filter(operation => mapsOntoSelf(base, operation, 1e-3));
  // Prefer the operations that preserve this structure; otherwise list the lattice group and let
  // the report say how many of them survive the basis.
  return exact.length >= 2 ? exact : group;
}

function showFile(file: File, kind: string, error?: string): void {
  const existing = fileList.querySelector<HTMLElement>(`[data-name="${CSS.escape(file.name)}"]`);
  const item = existing ?? document.createElement('div');
  item.className = `file-item${error ? ' error' : ''}`;
  item.dataset.name = file.name;
  item.textContent = `${kind} · ${file.name}${error ? ` · ${error}` : ' · loaded'}`;
  if (!existing) fileList.append(item);
}

async function loadText(file: File, kind: 'poscar' | 'symmetry'): Promise<void> {
  try {
    const text = await file.text();
    if (kind === 'poscar') { base = parsePOSCAR(text); showFile(file, 'POSCAR'); status.textContent = `${file.name} loaded`; }
    else { const parsed = parsePhonopySymmetry(text); if (parsed.length) operations = orderOperations(parsed); showFile(file, 'PHONOPY'); status.textContent = `${file.name} · ${parsed.length} operations`; }
    if (kind === 'poscar') recomputeOperations(); else populateOperationOptions();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showFile(file, kind === 'poscar' ? 'POSCAR' : 'PHONOPY', message);
    status.textContent = `${file.name}: ${message}`;
  }
}

async function loadUnknown(file: File): Promise<void> {
  const text = await file.text();
  const kind = /(?:^|\n)\s*(?:rotations|space_group|pointgroup|translations)\s*:/i.test(text) || /symmetry|phonopy/i.test(file.name) ? 'symmetry' : 'poscar';
  await loadText(file, kind);
}

async function init(): Promise<void> {
  view = await WebGPUView.create(canvas, { onError: message => { status.textContent = message; } });
  if (disposed) { view.dispose(); return; }
  view.camera.yaw = .62; view.camera.pitch = .38;
  // Re-fit when the stage changes shape, so a narrow window cannot clip the box and a resize cannot
  // throw away the zoom.
  const resizeObserver = new ResizeObserver(() => { if (!disposed) refit(); });
  resizeObserver.observe(canvas);
  window.addEventListener('pagehide', () => resizeObserver.disconnect(), { once: true });
  recomputeOperations();

  operationSelect.addEventListener('change', () => setOperation(Number(operationSelect.value)), events);
  progressInput.addEventListener('input', () => { playing = false; progress = Number(progressInput.value); update(); }, events);
  playButton.addEventListener('click', () => {
    if (progress >= 1) progress = 0;
    playing = !playing;
    update();
  }, events);
  resetButton.addEventListener('click', () => { progress = 0; playing = false; update(); }, events);
  supercellSelect.addEventListener('change', () => { repeats = Number(supercellSelect.value); rebuild(); update(); }, events);
  colourSelect.addEventListener('change', () => { colourMode = colourSelect.value === 'site' ? 'site' : 'species'; rebuild(); update(); }, events);
  speedSelect.addEventListener('change', () => { speed = Number(speedSelect.value); }, events);
  bondsToggle.addEventListener('change', () => { showBonds = bondsToggle.checked; rebuild(); update(); }, events);
  cellToggle.addEventListener('change', () => { showCell = cellToggle.checked; rebuild(); update(); }, events);
  trailsToggle.addEventListener('change', () => { showTrails = trailsToggle.checked; rebuild(); update(); }, events);
  atomLabelsToggle.addEventListener('change', () => { rebuild(); update(); }, events);
  holdStartToggle.addEventListener('change', () => { holdStart = holdStartToggle.checked; update(); }, events);
  const step = (delta: number) => setOperation((operationIndex + delta + operations.length) % operations.length);
  prevButton.addEventListener('click', () => step(-1), events);
  nextButton.addEventListener('click', () => step(1), events);
  document.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const tag = (event.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    // Space activates a focused button (a legend row folds its element), so leave that one to the
    // button; the other shortcuts keep working wherever the focus is.
    if (tag === 'BUTTON' && event.code === 'Space') return;
    if (event.code === 'Space') { event.preventDefault(); playButton.click(); }
    else if (event.code === 'ArrowLeft') { event.preventDefault(); playing = false; progress = clamp(progress - .05, 0, 1); update(); }
    else if (event.code === 'ArrowRight') { event.preventDefault(); playing = false; progress = clamp(progress + .05, 0, 1); update(); }
    else if (event.key === '[') step(-1);
    else if (event.key === ']') step(1);
    else if (event.key === 'r' || event.key === 'R') { playing = false; progress = 0; update(); }
    else if (event.key === 'p' || event.key === 'P') playButton.click();
    else if (event.key === 'f' || event.key === 'F' || event.key === '0') resetView();
  }, events);
  canvas.addEventListener('dblclick', () => resetView(), events);
  poscarInput.addEventListener('change', () => { const file = poscarInput.files?.[0]; if (file) void loadText(file, 'poscar'); }, events);
  symmetryInput.addEventListener('change', () => { const file = symmetryInput.files?.[0]; if (file) void loadText(file, 'symmetry'); }, events);
  filesInput.addEventListener('change', () => { for (const file of filesInput.files ?? []) void loadUnknown(file); }, events);
  for (const name of ['dragover', 'dragenter']) dropZone.addEventListener(name, event => { event.preventDefault(); dropZone.classList.add('active'); }, events);
  for (const name of ['dragleave', 'drop']) dropZone.addEventListener(name, event => { event.preventDefault(); dropZone.classList.remove('active'); }, events);
  dropZone.addEventListener('drop', event => { for (const file of [...(event as DragEvent).dataTransfer!.files]) void loadUnknown(file); }, events);
  legendAnchor.addEventListener('click', () => { legend.classList.toggle('collapsed'); }, events);
  showAllButton?.addEventListener('click', event => {
    // The button lives inside the clickable header, so stop fold-all from also collapsing it.
    event.stopPropagation();
    hiddenElements.clear();
    syncLegendRows();
    update();
  }, events);

  const tick = (now: number) => {
    if (disposed) return;
    const delta = last ? Math.min((now - last) / 1000, .1) : 0;
    last = now; clock += delta;
    if (playing) {
      progress = Math.min(1, progress + delta * speed / 1.3);
      if (progress >= 1) playing = false;
    }
    try { update(); } catch (error) { status.textContent = error instanceof Error ? error.message : String(error); }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  status.textContent = 'Ready · ' + operations.length + ' operations';
}

window.addEventListener('pagehide', () => { disposed = true; cancelAnimationFrame(frame); lifetime.abort(); labels?.dispose(); view?.dispose(); }, { once: true });
void init().catch(error => { status.textContent = String(error); });
