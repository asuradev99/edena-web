import {
  WebGPUView, GpuCrystalLayer, Visual, Geometry, rgba, smooth, clamp, polyline, merge, shadedSphere, arrow, lineSegments,
  parsePOSCAR, parsePhonopySymmetry,
  latticeSites, supercell as makeSupercell, bonds as findBonds, cellVolume,
  fractionalToCartesian, cartesianToFractional, shortestDistance, appearanceFor,
  mapsOntoSelf, siteMapping, symmetryOrbits, closedCell, spaceGroupOperations, symmetryAnimationPoint, symmetryAnimationTransform, centeredIsometry,
  operationIsometry, rotateAboutAxis,
  mathml, mi, mn, mo, row, matrix, vec,
  type Vec3, type Color, type Bond, type Lattice, type CrystalStructure, type CrystalOperation, type Supercell, type Isometry,
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
const holdStartToggle = $<HTMLInputElement>('start-sites');
const prevButton = $<HTMLButtonElement>('prev-op');
const cellSites = $<HTMLSelectElement>('cell-sites');
const operationScope = $<HTMLSelectElement>('operation-scope');
const displacementAtom = $<HTMLSelectElement>('displacement-atom');
const displacementInputs = ['x', 'y', 'z'].map(axis => $<HTMLInputElement>(`displacement-${axis}`));
let displacementVisual: Visual | undefined;
let arrowMesh: Geometry | undefined;
let markerMesh: Geometry | undefined;
let displacementSites: Supercell | undefined;
let reportedStructure: CrystalStructure | undefined;
let reportedLegend: { big: Supercell; colour: string } | undefined;
const nextButton = $<HTMLButtonElement>('next-op');

/** Honoured so that choosing an operation does not start motion for readers who asked for none. */
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const SITE_COLORS = ['#62d6e8', '#f7d681', '#ef9273', '#b5a1ff', '#9ae6b4', '#ff9ec4', '#8ff0b0', '#9ad0ff'];
const ELEMENT_COLOR = (() => { const map = new Map<string, string>(); return (symbol: string) => { if (!map.has(symbol)) map.set(symbol, appearanceFor(symbol).color); return map.get(symbol)!; }; })();
/** Bond tint: the element hue, folded to transparent when the legend hides that element. */
const bondTint = (symbol: string): Color => rgba(ELEMENT_COLOR(symbol), hiddenElements.has(symbol) ? 0 : .8);

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
type PlacedMotion = Motion & { centre: Vec3; latticeShift: Vec3 };

/**
 * A bond half drawn by the GPU layer: from its tip atom to the midpoint with its partner. The image
 * offsets are Cartesian and let a partner that sits on a periodic copy end where its ghost does.
 */
type GpuBond = {
  /** The in-box atom this half-bond is anchored to. */
  anchor: number;
  /** The bonded partner, used directly when it, too, is in the box. */
  farAtom: number;
  /** 1 when this half is drawn outward from the anchor, 0 when back from the far end. */
  tip: 0 | 1;
  /** 1 when the far end is the drawn partner rather than a periodic copy. */
  linked: 0 | 1;
  /** The far endpoint relative to the anchor's resting position, rotated by the frame. */
  rel: Vec3;
};

type Built = {
  big: Supercell;
  baseCount: number;
  pivot: Vec3;
  destinations: number[];
  /** Drawn start and end position of every atom, in the frame centred on a lattice point. */
  ideal: Vec3[];
  target: Vec3[];
  /** Terminal nudge from the arc to the nearest periodic image of the target (usually zero). */
  drift: Vec3[];
  atomScales: Vec3[];
  bondSpecs: GpuBond[];
  /** Which element each bond / ghost belongs to, so the legend can fold elements away. */
  bondSymbols: string[];
  ghostSymbols: string[];
  ghostVisuals: Visual[];
  /** Resting position and in-box anchor of each periodic ghost, so it can follow the animation. */
  ghostPlace: { rest: Vec3; anchor: number }[];
  cellVisual?: Visual;
  /** One merged arc set per colour, so a trail matches the atoms that draw it. */
  trailVisuals: Visual[];
  trailSymbols: string[];
  elementVisuals: Visual[];
  /** Faded copies of the starting sites, shown while the operation runs. */
  startVisuals: Visual[];
  elementLabel: string;
  elementAnchor: Vec3 | undefined;
  motion: PlacedMotion;
  centre: Vec3;
  extent: number;
  /** Whether the animation, in the frame it is drawn in, permutes the drawn sites. */
  drawnPermutes: boolean;
  /** Sites the operation visibly relocates; the report and the highlights both use this set. */
  movers: Set<number>;
  /** The same sites in index order, so the "before" markers pair with them without rebuilding. */
  moverList: number[];
  shortest: number;
  wraps: boolean;
};

let view: WebGPUView | undefined;
let gpuCrystal: GpuCrystalLayer | undefined;
let gpuSites: Supercell | undefined;
let gpuColorKey = '';
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
let bondScene: { base: CrystalStructure; n: number; bonds: (GpuBond & { symbol: string; rest: Vec3 })[]; ghosts: { symbol: string; rest: Vec3; radius: Vec3; anchor: number }[] } | undefined;
/** One shaded unit sphere for every atom of every element, built on first use. */
let atomMesh: Geometry | undefined;
let compactAtomMesh: Geometry | undefined;
let frame = 0;
let last = 0;

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
 * repeatedly, and the decomposition costs a couple of 3×3 products. The motion is Cartesian, so the
 * entry records which lattice it was derived from — a phonopy file's operations outlive a change of
 * structure, and their axis and translation would otherwise describe the crystal that has gone.
 */
const MOTIONS = new WeakMap<CrystalOperation, { lattice: Lattice; motion: Motion }>();
function motionFor(operation: CrystalOperation): Motion {
  const cached = MOTIONS.get(operation);
  if (cached && cached.lattice === base.lattice) return cached.motion;
  const motion = { ...operationIsometry(base.lattice, operation), operation };
  MOTIONS.set(operation, { lattice: base.lattice, motion });
  return motion;
}

function describeOperation(operation: CrystalOperation): string {
  const motion = motionFor(operation);
  // The translation is printed in fractional coordinates, like the matrix beside it, so it is labelled.
  const shift = motion.translation.some(value => Math.abs(value) > 1e-9) ? ` + t = (${operation.translation.map(value => value.toFixed(2)).join(', ')})` : '';
  if (!motion.improper && Math.abs(motion.angle) < 1e-9 && !motion.trivial) return `t · translation${shift}`;
  if (motion.trivial) return `E · identity${shift}`;
  if (motion.inversion) return `i · inversion${shift}`;
  if (!motion.improper) {
    const degrees = Math.round(Math.abs(motion.angle) * 180 / Math.PI);
    return `${rotationSymbol(degrees)} · ${degrees}° ‖ ${axisLabel(motion.axis)}${shift ? " · rotation + translation" : ""}${shift}`;
  }
  if (Math.abs(motion.angle) < 1e-6) return `σ · mirror ⟂ ${axisLabel(motion.axis)}${shift ? " · reflection + translation" : ""}${shift}`;
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
  if (!motion.improper && Math.abs(motion.angle) < 1e-9 && !motion.trivial) {
    visuals.push(new Visual(arrow(centre, add(centre, motion.translation), .025), blue));
    return { visuals, anchor: centre, label: 'lattice translation' };
  }
  if (motion.trivial) return { visuals, anchor: centre, label: 'identity — every site maps to itself' };
  const reach = extent * .85;
  if (motion.inversion) {
    const marker = new Visual(siteMarker(), gold); marker.scale = [extent * .09, extent * .09, extent * .09]; marker.position = centre; visuals.push(marker);
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
let fitted: { points: Vec3[]; centre: Vec3; extent: number } | undefined;
let fittedHeight = 0;

/** Height that fits the drawn box's projection, leaving the camera pointed where it is. */
function fitHeight(): number {
  const camera = view!.camera;
  const { points, extent } = fitted!;
  // A rotated box projects taller than its axis-aligned extent, and the guard changes with the
  // viewport aspect (a narrow stage clips the sides too), so measure the projection and fit it.
  // CSS pixels, not the backing store: the backing store is resized asynchronously, so framing
  // against it would not be reproducible.
  camera.height = extent * 1.45;
  const viewportWidth = canvas.clientWidth, viewportHeight = canvas.clientHeight;
  if (!(viewportWidth > 0 && viewportHeight > 0)) return camera.height;
  const aspect = viewportWidth / viewportHeight;
  const projection = camera.matrix(aspect);
  const projected = points.map(point => camera.projectWith(projection, point, viewportWidth, viewportHeight));
  const toWorld = camera.height / viewportHeight;
  const tall = (Math.max(...projected.map(([, y]) => y)) - Math.min(...projected.map(([, y]) => y))) * toWorld;
  const wide = (Math.max(...projected.map(([x]) => x)) - Math.min(...projected.map(([x]) => x))) * toWorld / aspect;
  return Math.max(extent, tall, wide) * 1.18;
}

/** Point the camera at the box and fit it. */
function frameFor(points: Vec3[], centre: Vec3, extent: number): void {
  fitted = { points, centre, extent };
  view!.camera.target = centre;
  fittedHeight = fitHeight();
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
  frameFor(fitted.points, fitted.centre, fitted.extent);
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

/** How many repeats the viewer actually draws, once the atom budget is applied. */
function drawnRepeats(): number {
  const baseCount = base.positions.length;
  let n = repeats;
  while (baseCount * n ** 3 > 1600 && n > 1) n--;
  while (n > 1 && drawnFor(n).big.positions.length > 1600) n--;
  return n;
}

/**
 * The drawn supercell, its pivot, the points the camera has to fit (the box's corners and every
 * site) and the box's bounds — everything that depends on the crystal and the repeat count but not on
 * the selected operation. The picker's counts and the scene both need it, so it is built once.
 */
type Drawn = { big: Supercell; pivot: Vec3; points: Vec3[]; bounds: { min: Vec3; max: Vec3; centre: Vec3; extent: number } };
let drawnCache: { base: CrystalStructure; mode: string; cells: Map<number, Drawn> } | undefined;
function drawnFor(n: number) {
  if (!drawnCache || drawnCache.base !== base || drawnCache.mode !== cellSites.value)
    drawnCache = { base, mode: cellSites.value, cells: new Map() };
  if (!drawnCache.cells.has(n)) {
    let big = makeSupercell(base, [n, n, n]);
    if (cellSites.value === 'all') {
      const expanded = closedCell(big);
      big = { ...big, ...expanded, offsets: expanded.positions.map(() => [0, 0, 0] as Vec3) };
    }
    const pivot = fracToCart([n / 2, n / 2, n / 2]);
    const corners = [0, n].flatMap(i => [0, n].flatMap(j => [0, n].map(k => sub(fractionalToCartesian([i, j, k], base.lattice), pivot))));
    // The camera is fitted to the box *and* the sites drawn in it: a file whose coordinates reach past
    // its cell (a supercell given in Cartesian, say) would otherwise be framed off screen.
    const sites = big.positions.map(position => sub(fractionalToCartesian(position, big.lattice), pivot));
    drawnCache.cells.set(n, { big, pivot, points: [...corners, ...sites], bounds: boundsOf(corners) });
  }
  return drawnCache.cells.get(n)!;
}

/** Keep the symmetry element near the cell centre and retain only screw/glide translation. */
const PLACEMENTS = new WeakMap<CrystalOperation, { lattice: Lattice; cells: Map<number, PlacedMotion> }>();
function placedFor(operation: CrystalOperation, n: number): PlacedMotion {
  let cached = PLACEMENTS.get(operation);
  if (!cached || cached.lattice !== base.lattice) {
    cached = { lattice: base.lattice, cells: new Map() }; PLACEMENTS.set(operation, cached);
  }
  let motion = cached.cells.get(n);
  if (!motion) {
    const placement = centeredIsometry(base.lattice, operation, [n / 2, n / 2, n / 2]);
    motion = { ...placement, operation, centre: sub(placement.centre, drawnFor(n).pivot) };
    cached.cells.set(n, motion);
  }
  return motion;
}
function placedPoint(motion: PlacedMotion, point: Vec3, t: number): Vec3 {
  return add(symmetryAnimationPoint(motion, sub(point, motion.centre), t), motion.centre);
}

/** Three great circles mark a starting site without thousands of tube triangles per atom. */
function siteMarker(): Geometry {
  if (!markerMesh) {
    const segments: Vec3[] = [];
    for (let plane = 0; plane < 3; plane++) for (let i = 0; i < 32; i++) {
      for (const j of [i, i + 1]) {
        const p: Vec3 = [0, 0, 0];
        p[plane] = Math.cos(j * Math.PI / 16); p[(plane + 1) % 3] = Math.sin(j * Math.PI / 16);
        segments.push(p);
      }
    }
    markerMesh = lineSegments(segments, 1.2);
  }
  return markerMesh;
}

/** Return the placed operation's periodic image to the displayed box only when needed. */
function animationTarget(motion: PlacedMotion, point: Vec3, pivot: Vec3, lattice: Lattice): Vec3 {
  const image = add(placedPoint(motion, point, 1), pivot);
  const f = cartesianToFractional(image, lattice);
  const wrapped = f.map(v => v >= -1e-6 && v <= 1 + 1e-6 ? v : v - Math.floor(v)) as Vec3;
  return sub(fractionalToCartesian(wrapped, lattice), pivot);
}

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
    while (drawn > 1 && drawnFor(drawn).big.positions.length > 1600) drawn--;
    const count = drawnFor(drawn).big.positions.length;
    const capped = drawn !== asked;
    option.textContent = `${asked} × ${asked} × ${asked} · ${count} atoms${capped ? ' (capped)' : ''}`;
    option.disabled = capped;
    option.title = capped ? `${baseCount} atoms per cell exceeds the 1600-atom budget at ${asked} × ${asked} × ${asked}` : '';
    if (!capped) largest = asked;
  }
  if (repeats > largest) { repeats = largest; supercellSelect.value = String(largest); }
  const n = repeats;
  const { big, pivot, points, bounds } = drawnFor(n);
  // Frame the box once per structure. Re-framing on every operation change would throw away the
  // zoom and orbit the user just set up.
  if (!framed || framed.base !== base || framed.n !== n) {
    frameFor(points, bounds.centre, bounds.extent);
    framed = { base, n };

    // The picker's "N moved" counts the drawn cell, so it has to be restated when that changes.
    refreshOperationLabels();
    // Symbols on 40+ sites are an unreadable pile, so the toggle says why it does nothing. Bonds
    // stop at 1,200 atoms for the same reason: the search is O(n²).
    bondsToggle.disabled = big.positions.length > 1200;
    bondsToggle.title = bondsToggle.disabled ? 'Bonds are found for cells of up to 1,200 atoms' : 'Draw a bond between neighbouring sites';
    trailsToggle.disabled = false;
    trailsToggle.title = "Draw GPU orbit arcs and starting outlines";
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

  // Rendering coordinates and the nearest equivalent symmetry element share the cell centre.
  const ideal = big.positions.map(position => sub(fractionalToCartesian(position, big.lattice), pivot));
  const motion = placedFor(operations[operationIndex], n);
  const target = ideal.map(point => animationTarget(motion, point, pivot, big.lattice));
  const drift = ideal.map((point, index) => sub(target[index], placedPoint(motion, point, 1)));
  // An affine map of the box is bounded by its eight corners; no need to sample every atom.
  const pathPoints = points.slice(0, 8).flatMap(point => Array.from({ length: 9 }, (_, i) =>
    placedPoint(motion, point, i / 8)));
  const cameraPoints = [...points, ...pathPoints];
  const cameraBounds = boundsOf(cameraPoints);
  const zoom = fittedHeight ? view.camera.height / fittedHeight : 1;
  frameFor(cameraPoints, cameraBounds.centre, cameraBounds.extent);
  view.camera.height = fittedHeight * zoom;
  const tolerance = Math.max(1e-3, bounds.extent * 2e-4);
  const moverList = ideal.map((_, index) => index).filter(index =>
    between(ideal[index], placedPoint(motion, ideal[index], 1)) > tolerance);
  const movers = new Set(moverList);
  const targetFractional = target.map(point => cartesianToFractional(add(point, pivot), big.lattice));
  const destinations = target.map((point, i) => {
    const exact = ideal.findIndex((other, j) => big.species[i] === big.species[j] && between(point, other) < tolerance);
    if (exact >= 0) return exact;
    const f = targetFractional[i];
    return big.positions.findIndex((other, j) => big.species[i] === big.species[j] &&
      other.every((v, a) => Math.abs(f[a] - v - Math.round(f[a] - v)) < 1e-3));
  });
  const drawnPermutes = destinations.every(i => i >= 0);
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
  // Small distant atoms need fewer triangles; retain full detail for individual unit cells.
  const mesh = big.positions.length > 100
    ? (compactAtomMesh ??= shadedSphere(1, { resolution: [12, 24] }))
    : (atomMesh ??= shadedSphere(1));
  const meshes = new Map(elements.map(symbol => [symbol, mesh]));
  const atomScales: Vec3[] = big.positions.map((_, index) => { const radius = Math.max(shortest * .08, appearance.get(big.species[index])!.radius * unit); return [radius, radius, radius]; });
  const startVisuals: Visual[] = [];

  const ghostVisuals: Visual[] = [];
  const ghostSymbols: string[] = [];
  const ghostPlace: { rest: Vec3; anchor: number }[] = [];
  const bondSpecs: GpuBond[] = [];
  const bondSymbols: string[] = [];
  if (showBonds && big.positions.length <= 1200) {
    // Bonds are drawn by the GPU layer, so a bond follows the same per-atom transform as the spheres
    // and never has to dissolve while the crystal moves. The search and the half-bond list describe
    // the crystal, so they are still built once per structure.
    if (!bondScene || bondScene.base !== base || bondScene.n !== n) {
      const bonds: (GpuBond & { symbol: string; rest: Vec3 })[] = [];
      const ghosts: { symbol: string; rest: Vec3; radius: Vec3; anchor: number }[] = [];
      const seen = new Set<string>();
      for (const bond of found) {
        // The partner may sit on a periodic copy; the image is a Cartesian offset in the drawn frame.
        const image = fractionalToCartesian(bond.image, big.lattice);
        const rest: Vec3 = add(ideal[bond.j], image);
        const rel = sub(rest, ideal[bond.i]);
        const symbolI = big.species[bond.i], symbolJ = big.species[bond.j];
        // A zero image offset means the partner is drawn in the box and can be used directly.
        const linked: 0 | 1 = bond.image.every(value => Math.abs(value) < 1e-9) ? 1 : 0;
        // Both halves are anchored on atom i — the end that stays in the box — so they share one
        // midpoint however the two atoms are individually re-imaged into the cell. Half-bonds are
        // grouped by element symbol, not by colour, so the legend can fold one element away without
        // disturbing another that happens to share a colour.
        bonds.push({ anchor: bond.i, farAtom: bond.j, tip: 1, linked, rel, symbol: symbolI, rest });
        bonds.push({ anchor: bond.i, farAtom: bond.j, tip: 0, linked, rel, symbol: symbolJ, rest });
        // Show a periodic partner as a faded ghost so the coordination shell reads as complete. The
        // ghost rides the anchor's re-imaging, so it sits exactly at the far end of its bond.
        const periodicImage = bond.i !== bond.j && !linked;
        const key = `${symbolJ}:${rest.map(value => value.toFixed(3)).join(',')}`;
        if (periodicImage && !seen.has(key)) {
          seen.add(key);
          // Slightly smaller than a real site, so a periodic image never reads as an atom of the cell.
          ghosts.push({ symbol: symbolJ, rest, radius: times(atomScales[bond.j], .72), anchor: bond.i });
        }
      }
      bondScene = { base, n, bonds, ghosts };
    }
    for (const bond of bondScene.bonds) {
      bondSpecs.push({ anchor: bond.anchor, farAtom: bond.farAtom, tip: bond.tip, linked: bond.linked, rel: bond.rel });
      bondSymbols.push(bond.symbol);
    }
    for (const ghost of bondScene.ghosts) {
      const visual = new Visual(meshes.get(ghost.symbol)!, rgba(ELEMENT_COLOR(ghost.symbol), .22));
      visual.position = ghost.rest;
      visual.scale = ghost.radius;
      ghostVisuals.push(visual);
      ghostSymbols.push(ghost.symbol);
      ghostPlace.push({ rest: ghost.rest, anchor: ghost.anchor });
    }
  }
  gpuCrystal!.setBonds(bondSpecs.map((spec, index) => ({ ...spec, color: bondTint(bondSymbols[index]) })));

  const cellVisual = showCell ? new Visual(cellWire(big.lattice, pivot, Math.max(.006, bounds.extent * .0018)), rgba('#a4b3c6', .55)) : undefined;

  // Trail paths are evaluated in the vertex shader from 25 shared affine samples.
  const trailVisuals: Visual[] = [], trailSymbols: string[] = [];
  if (gpuSites !== big) {
    gpuCrystal!.setSites(ideal, atomScales.map(scale => scale[0]), big.species.map((symbol, i) => rgba(atomColor(i, symbol))));
    gpuSites = big; gpuColorKey = '';
  }
  const samples = new Float32Array(25 * 20);
  for (let step = 0; step < 25; step++) {
    samples.set(animationMatrix(motion, Math.min(1, step / 24 / .9)), step * 20);
    samples[step * 20 + 16] = wrapProgress(step / 24);
  }
  gpuCrystal!.setOperation(drift, movers, samples);

  const element = operationElement(motion, motion.centre, bounds.extent);

  built = {
    big, baseCount, pivot, destinations, ideal, target, drift, atomScales, bondSpecs, bondSymbols, ghostSymbols, ghostVisuals, ghostPlace,
    cellVisual, trailVisuals, trailSymbols, elementVisuals: element.visuals, startVisuals,
    drawnPermutes, wraps: drift.some(v => Math.hypot(...v) > 1e-6),
    elementLabel: element.label, elementAnchor: element.anchor, motion, centre: bounds.centre, extent: bounds.extent, movers, moverList, shortest,
  };
  view.world.add(...ghostVisuals, ...(cellVisual ? [cellVisual] : []), ...trailVisuals, ...element.visuals, ...startVisuals);

  arrowMesh ??= arrow([0, 0, 0], [0, 0, 1], .04);
  displacementVisual = new Visual(arrowMesh, rgba('#ff9ec4'));
  view.world.add(displacementVisual);
  const tracked = Number(displacementAtom.value);
  if (displacementSites !== big) {
    displacementAtom.replaceChildren(new Option('None', '-1'), ...big.species.map((symbol, i) => new Option(`${symbol}${i}`, String(i))));
    displacementSites = big;
  }
  displacementAtom.value = tracked >= 0 && tracked < big.positions.length ? String(tracked) : '-1';

  const origin = cartesianToFractional(add(motion.centre, pivot), base.lattice);
  $('operation-placement').textContent = `Equivalent element at (${origin.map(v => v.toFixed(2)).join(', ')}) fractional; residual translation ${Math.hypot(...motion.translation).toFixed(2)} Å.`;
  $('operation-placement').title = `Equivalent to the listed operation plus lattice translation (${motion.latticeShift.join(', ')}).`;
  if (reportedStructure !== base) { writeStructureInfo(); reportedStructure = base; }
  if (reportedLegend?.big !== big || reportedLegend.colour !== colourMode) {
    writeLegend(elements, appearance, big); reportedLegend = { big, colour: colourMode };
  }
  writeMapping();
}

function writeStructureInfo(): void {
  const lengths = base.lattice.map(vector => Math.hypot(...vector));
  const angle = (a: Vec3, b: Vec3) => Math.acos(clamp(dot3(a, b) / (Math.hypot(...a) * Math.hypot(...b)), -1, 1)) * 180 / Math.PI;
  // Two short lines instead of one long row, so nothing needs a horizontal scrollbar. Plain a, b, c
  // matches the α, β, γ below it.
  const lengthsLine = mathml(row(mi('a'), mo('='), mn(lengths[0].toFixed(3)), mo(','), mi('b'), mo('='), mn(lengths[1].toFixed(3)), mo(','), mi('c'), mo('='), mn(lengths[2].toFixed(3)), mo(' Å')));
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
    size.title = 'Tabulated radius; every sphere is scaled by the same factor so atoms never fuse';
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
  // The animation is the thing on screen, so the report judges what it actually does.
  const drawnOk = built?.drawnPermutes ?? false;
  const exact = exactOperations();
  const orbits = orbitsFor(exact.length ? exact : [operations[operationIndex]]);
  const mapping = siteMapping(base, operations[operationIndex], 1e-3);
  const moved = mapping.filter((target, index) => target >= 0 && target !== index).length;
  // Validation: a symmetry operation must send every site to a distinct, same-species site.
  const targets = mapping.filter(target => target >= 0);
  const bijective = targets.length === base.positions.length && new Set(targets).size === targets.length;
  const speciesKept = mapping.every((target, index) => target >= 0 && base.species[target] === base.species[index]);
  const valid = bijective && speciesKept;
  const displayed = built!;
  const rows = displayed.destinations.map((target, index) => {
    const species = displayed.big.species[index];
    // The accent follows the legend's colouring, so a cell reads as the same site the stage draws.
    return `<span class="map-cell" style="--accent:${atomColor(index, species)}">${species}<sub>${index}</sub> → ${target < 0 ? '∉' : `${displayed.big.species[target]}<sub>${target}</sub>`}</span>`;
  }).join('');
  // A supercell has many orbits with many indices each, so the list is capped like the map grid;
  // otherwise the report becomes a wall of numbers for a large cell.
  const orbitList = orbits.slice(0, 8).map(orbit => orbit.length > 12 ? `{${orbit.slice(0, 12).join(', ')}, …}` : `{${orbit.join(', ')}}`).join(' ');
  mappingPanel.innerHTML = `
    <div class="report-line"><strong>${exact.length}</strong> of ${operations.length} listed ${fileOperations ? 'file' : operationScope.value === 'space' ? 'space-group' : 'point'} operations map this cell onto itself.</div>
    <div class="report-line ${valid ? 'ok' : 'bad'}">${valid ? '✓ this operation maps every site to a distinct equivalent site of the cell.' : '✗ this operation does not preserve the structure.'}</div>
    <div class="report-line ${drawnOk ? 'ok' : 'bad'}">${drawnOk ? '✓ animation endpoints match equivalent sites modulo periodic images.' : '✗ some animation endpoints have no equivalent site.'}</div>
    <div class="report-line"><strong>${orbits.length}</strong> symmetry orbit${orbits.length === 1 ? '' : 's'}: ${orbitList}${orbits.length > 8 ? ` … ${orbits.length - 8} more` : ''}</div>
    <div class="report-line">This operation <strong>permutes</strong> ${moved} of the cell's ${base.positions.length} sites; the caption counts the drawn sites instead, which one fold can hide.</div>
    <div class="report-line muted">Drawn atom IDs. Boundary copies can share a periodic destination. The final motion returns outlying images to the cell.</div><div class="map-grid">${rows}</div>`;
}

/** Return periodic images to the box only after the physical operation has completed. */
function wrapProgress(t: number): number { return ease(clamp((t - .9) / .1, 0, 1)); }

let lastProgress = -1;
function renderScene(_changed = false): void { view?.render(); }

function animationMatrix(motion: PlacedMotion, t: number): Float32Array {
  const { columns: [x, y, z], translation } = symmetryAnimationTransform(motion, t);
  const c = motion.centre;
  const offset = [0, 1, 2].map(a => c[a] + translation[a] - x[a] * c[0] - y[a] * c[1] - z[a] * c[2]);
  return new Float32Array([...x, 0, ...y, 0, ...z, 0, ...offset, 1]);
}

function setText(element: HTMLElement, value: string): void {
  if (element.textContent !== value) element.textContent = value;
}

function update(): void {
  const state = built;
  if (!state || !view) return;
  const t = progress;
  lastProgress = progress;
  const transform = symmetryAnimationTransform(state.motion, Math.min(1, t / .9));
  const [x, y, z] = transform.columns;
  const linear = (p: Vec3): Vec3 => [
    x[0] * p[0] + y[0] * p[1] + z[0] * p[2],
    x[1] * p[0] + y[1] * p[1] + z[1] * p[2],
    x[2] * p[0] + y[2] * p[1] + z[2] * p[2],
  ];
  const offset = sub(add(state.motion.centre, transform.translation), linear(state.motion.centre));
  const wrap = wrapProgress(t);
  // Trails fade out at the end. Bonds no longer need to: the GPU layer transforms them with the same
  // per-atom motion that moves the spheres, so they stay attached for the whole operation.
  const flight = smooth(clamp(progress * 4)) * (1 - smooth(clamp((progress - .82) / .18)));
  // A supercell can move dozens of sites at once; thin the arcs out so 40 orbits do not read as a
  // single bright haze over the crystal.
  const orbitWeight = Math.min(1, 10 / Math.max(1, state.movers.size));
  const trailOpacity = showTrails ? (.12 + .78 * clamp(smooth(progress * 4))) * (1 - smooth(clamp((progress - .88) / .12))) * orbitWeight : 0;
  // Folding an element away from the legend silences everything that carries it: its half-bonds,
  // its periodic ghosts, its atoms, its "before" markers, and its floating symbols.
  state.ghostVisuals.forEach((visual, index) => {
    visual.opacity = showBonds && !hiddenElements.has(state.ghostSymbols[index]) ? 1 : 0;
    // The ghost is the far end of a bond, so it rides that bond's in-box anchor: applying the anchor's
    // drift (not the ghost's own host's) keeps it exactly one bond-length from the atom it hangs off.
    const place = state.ghostPlace[index];
    visual.position = add(add(linear(place.rest), offset), times(state.drift[place.anchor], wrap));
  });
  state.trailVisuals.forEach((visual, order) => { visual.opacity = hiddenElements.has(state.trailSymbols[order]) ? 0 : trailOpacity; });
  state.elementVisuals.forEach(visual => { visual.opacity = .3 + .7 * t; });
  const startOpacity = showTrails ? (holdStart ? .5 : smooth(progress * 3) * (1 - smooth((progress - .82) / .18)) * .5) * orbitWeight : 0;
  const colorKey = `${colourMode}|${[...hiddenElements].sort().join(',')}`;
  if (gpuColorKey !== colorKey) {
    gpuCrystal!.setColors(state.big.species.map((symbol, i) => rgba(atomColor(i, symbol), hiddenElements.has(symbol) ? 0 : 1)));
    gpuCrystal!.setBondColors(state.bondSymbols.map(bondTint));
    gpuColorKey = colorKey;
  }
  gpuCrystal!.setFrame(new Float32Array([...x, 0, ...y, 0, ...z, 0, ...offset, 1]), wrap, .06 * flight, trailOpacity * .5, startOpacity * .55, showBonds ? 1 : 0);
  const tracked = Number(displacementAtom.value);
  if (displacementVisual) {
    const u = displacementInputs.map(input => Number(input.value)) as Vec3;
    const valid = tracked >= 0 && tracked < state.ideal.length && u.every(Number.isFinite) && Math.hypot(...u) > 1e-9;
    displacementVisual.visible = valid && !hiddenElements.has(state.big.species[tracked]);
    if (valid) {
      const vector = linear(u), length = Math.hypot(...vector);
      displacementVisual.visible &&= length > 1e-9;
      displacementVisual.position = add(add(linear(state.ideal[tracked]), offset), times(state.drift[tracked], wrap));
      displacementVisual.scale = [1, 1, length];
      displacementVisual.orientation = [0, Math.acos(clamp(vector[2] / (length || 1), -1, 1)), Math.atan2(vector[1], vector[0])];
      setText($('displacement-value'), `u = (${vector.map(v => v.toFixed(3)).join(', ')}) Å`);
    } else setText($('displacement-value'), tracked >= 0 ? 'Enter a finite, nonzero displacement.' : '');
  }
  progressInput.value = String(progress);
  // The identity relocates nothing, so there is nothing to play.
  playButton.disabled = state.motion.trivial;
  // One glyph per idea: play/pause on this button, rewind on the one beside it. When the animation
  // has finished the label still says Replay, because pressing play starts it again from zero.
  setText(playButton, playing ? 'Ⅱ' : '▶');
  playButton.setAttribute('aria-label', playing ? 'Pause' : progress >= 1 ? 'Replay' : 'Play');
  setText($('progress-value'), `${Math.round(progress * 100)}%`);
  setText($('animation-phase'), progress >= 1 ? 'Complete' : progress >= .9 && state.wraps ? 'Return to periodic image in the cell' : 'Apply operation (pauses between composite stages)');
  renderScene(true);
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
  // transform, and a freshly chosen operation sitting at 0% looks like nothing happened. A reader who
  // asked for reduced motion gets the still frame and presses play if they want to see it.
  playing = !reducedMotion.matches && !built?.motion.trivial;
  update();
}

/**
 * How many drawn sites the animation visibly relocates. It counts the *supercell* the viewer draws,
 * with the same tolerance the caption uses, so the picker's "N moved" and the caption's "N of M sites
 * move" always agree. Because the cell is drawn centred on a lattice point, a rotation that swaps a
 * site with a corner image counts as moving it — which is exactly what the picture shows.
 */
let movedCounts: { base: CrystalStructure; n: number; counts: Map<CrystalOperation, number> } | undefined;
/** The operations a phonopy file supplied, kept when the structure changes under them. */
let fileOperations: CrystalOperation[] | undefined;
function visibleMovedCount(operation: CrystalOperation): number {
  const n = drawnRepeats();
  if (!movedCounts || movedCounts.base !== base || movedCounts.n !== n) movedCounts = { base, n, counts: new Map() };
  const cached = movedCounts.counts.get(operation);
  if (cached !== undefined) return cached;
  const drawn = drawnFor(n);
  const motion = placedFor(operation, n);
  const tolerance = Math.max(1e-3, drawn.bounds.extent * 2e-4);
  const count = drawn.big.positions.reduce((total, position) => {
    const point = sub(fractionalToCartesian(position, drawn.big.lattice), drawn.pivot);
    return total + (between(point, placedPoint(motion, point, 1)) > tolerance ? 1 : 0);
  }, 0);
  movedCounts.counts.set(operation, count);
  return count;
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
  if (motion.translation.some(v => Math.abs(v) > 1e-9)) return !motion.improper && Math.abs(motion.angle) < 1e-9 ? 'Translations' : 'Space operations · rotation / reflection + translation';
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
    list.push(new Option(operationLabel(operation, index), String(index)));
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

/** One picker line: index, name, and how many of the drawn sites it moves. */
function operationLabel(operation: CrystalOperation, index: number): string {
  return `${index + 1}. ${describeOperation(operation)} · ${visibleMovedCount(operation)} moved`;
}

/** Restate every option after the drawn cell changes, without disturbing the selection. */
function refreshOperationLabels(): void {
  operations.forEach((operation, index) => {
    const option = [...operationSelect.options].find(option => Number(option.value) === index);
    if (option) option.textContent = operationLabel(operation, index);
  });
}

function recomputeOperations(): void {
  // A phonopy file is the user's own list of operations, so it survives a change of structure — a
  // POSCAR dropped after its symmetry file must not silently discard it. The report then says
  // whether those operations preserve the cell they are shown against.
  operations = orderOperations(fileOperations ?? defaultOperations());
  populateOperationOptions();
}

function defaultOperations(): CrystalOperation[] {
  const group = spaceGroupOperations(base, 1e-4);
  return operationScope.value === 'space' ? group : group.filter(op => op.translation.every(v => Math.abs(v - Math.round(v)) < 1e-6));
}

function showFile(file: File, kind: string, error?: string): void {
  const existing = fileList.querySelector<HTMLElement>(`[data-name="${CSS.escape(file.name)}"]`);
  const item = existing ?? document.createElement('div');
  item.className = `file-item${error ? ' error' : ''}`;
  item.dataset.name = file.name;
  item.textContent = `${kind} · ${file.name}${error ? ` · ${error}` : ' · loaded'}`;
  if (!existing) fileList.append(item);
}

/** One line of feedback under the file controls; the colour says whether it went well. */
function setStatus(message: string, state: 'info' | 'ok' | 'error' = 'info'): void {
  status.textContent = message;
  status.dataset.state = state;
}

async function loadText(file: File, kind: 'poscar' | 'symmetry'): Promise<void> {
  try {
    const text = await file.text();
    if (kind === 'poscar') { base = parsePOSCAR(text); showFile(file, 'POSCAR'); setStatus(`${file.name} loaded`, 'ok'); }
    else { const parsed = parsePhonopySymmetry(text); if (parsed.length) { fileOperations = parsed; operations = orderOperations(parsed); } showFile(file, 'PHONOPY'); setStatus(`${file.name} · ${parsed.length} operations`, 'ok'); }
    if (kind === 'poscar') recomputeOperations(); else populateOperationOptions();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showFile(file, kind === 'poscar' ? 'POSCAR' : 'PHONOPY', message);
    setStatus(`${file.name}: ${message}`, 'error');
  }
}

async function loadUnknown(file: File): Promise<void> {
  const text = await file.text();
  const kind = /(?:^|\n)\s*(?:rotations|space_group|pointgroup|translations)\s*:/i.test(text) || /symmetry|phonopy/i.test(file.name) ? 'symmetry' : 'poscar';
  await loadText(file, kind);
}

async function init(): Promise<void> {
  view = await WebGPUView.create(canvas, { antialias: new URLSearchParams(location.search).get('quality') === 'high' ? 'high' : true, onError: message => setStatus(message, 'error') });
  if (disposed) { view.dispose(); return; }
  gpuCrystal = view.addGpuLayer((device, format, samples) => new GpuCrystalLayer(device, format, samples));
  view.camera.yaw = .62; view.camera.pitch = .38;
  // Re-fit when the stage changes shape, so a narrow window cannot clip the box and a resize cannot
  // throw away the zoom.
  const resizeObserver = new ResizeObserver(() => { if (!disposed) refit(); });
  resizeObserver.observe(canvas);
  window.addEventListener('pagehide', () => resizeObserver.disconnect(), { once: true });
  recomputeOperations();

  cellSites.addEventListener('change', () => {
    drawnCache = undefined; neighbours = undefined; bondScene = undefined; framed = undefined; movedCounts = undefined;
    rebuild(); refreshOperationLabels(); update();
  }, events);
  operationScope.addEventListener('change', () => { fileOperations = undefined; recomputeOperations(); }, events);
  displacementAtom.addEventListener('change', () => { rebuild(); update(); }, events);
  displacementInputs.forEach(input => input.addEventListener('input', update, events));
  $('mos2-example').addEventListener('click', async () => {
    try {
      const response = await fetch('examples/MoS2.POSCAR');
      if (!response.ok) throw new Error('Could not load MoS₂ example');
      base = parsePOSCAR(await response.text()); fileOperations = undefined;
      recomputeOperations(); setStatus('Loaded bulk 2H-MoS₂ · idealized example', 'ok');
    } catch (error) { setStatus(String(error), 'error'); }
  }, events);
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
  holdStartToggle.addEventListener('change', () => { holdStart = holdStartToggle.checked; update(); }, events);
  const step = (delta: number) => setOperation((operationIndex + delta + operations.length) % operations.length);
  prevButton.addEventListener('click', () => step(-1), events);
  nextButton.addEventListener('click', () => step(1), events);
  document.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const tag = (event.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    // Space activates whatever button has focus — a legend row folds its element, the drop zone opens
    // the file chooser — so leave that one to the button; the other shortcuts work wherever focus is.
    const buttonish = tag === 'BUTTON' || (event.target as HTMLElement)?.getAttribute?.('role') === 'button';
    if (buttonish && (event.code === 'Space' || event.key === 'Enter')) return;
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
  const acceptDrop = (event: DragEvent) => { for (const file of [...(event.dataTransfer?.files ?? [])]) void loadUnknown(file); };
  for (const name of ['dragover', 'dragenter']) dropZone.addEventListener(name, event => { event.preventDefault(); dropZone.classList.add('active'); }, events);
  for (const name of ['dragleave', 'drop']) dropZone.addEventListener(name, event => { event.preventDefault(); event.stopPropagation(); dropZone.classList.remove('active'); }, events);
  dropZone.addEventListener('drop', acceptDrop, events);
  dropZone.addEventListener('click', () => filesInput.click(), events);
  dropZone.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.code !== 'Space') return;
    event.preventDefault();
    filesInput.click();
  }, events);
  // A file dropped anywhere else must not navigate the page away from the viewer, and is just as
  // welcome as one dropped on the zone — the crystals people drag in usually land on the picture.
  for (const name of ['dragover', 'dragenter']) window.addEventListener(name, event => { event.preventDefault(); dropZone.classList.add('active'); }, { signal: lifetime.signal });
  window.addEventListener('dragleave', event => { if (!event.relatedTarget) dropZone.classList.remove('active'); }, { signal: lifetime.signal });
  window.addEventListener('drop', event => { event.preventDefault(); dropZone.classList.remove('active'); acceptDrop(event); }, { signal: lifetime.signal });
  // The header folds the legend away; it is a div so it needs the keyboard behaviour of a button.
  const toggleLegend = () => {
    const collapsed = legend.classList.toggle('collapsed');
    legendAnchor.setAttribute('aria-expanded', String(!collapsed));
    // The word has to describe what the next click does, not what the last one did.
    $('legend-toggle-label').textContent = collapsed ? 'expand' : 'collapse';
  };
  legendAnchor.addEventListener('click', toggleLegend, events);
  legendAnchor.addEventListener('keydown', event => {
    if (event.target !== legendAnchor) return;
    if (event.key !== 'Enter' && event.code !== 'Space') return;
    event.preventDefault();
    toggleLegend();
  }, events);
  showAllButton?.addEventListener('click', event => {
    // The button lives inside the clickable header, so stop fold-all from also collapsing it.
    event.stopPropagation();
    hiddenElements.clear();
    syncLegendRows();
    update();
  }, events);

  const tick = (now: number) => {
    if (disposed) return;
    const delta = last ? Math.min((now - last) / 1000, .25) : 0;
    last = now;
    if (playing) {
      progress = Math.min(1, progress + delta * speed / (built && (built.motion.improper || built.motion.translation.some(v => Math.abs(v) > 1e-9)) ? 3.2 : 1.8));
      if (progress >= 1) playing = false;
    }
    try { if (playing || progress !== lastProgress) update(); else renderScene(); } catch (error) { setStatus(error instanceof Error ? error.message : String(error), 'error'); }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  setStatus('Ready · ' + operations.length + ' operations');
}

window.addEventListener('pagehide', () => { disposed = true; cancelAnimationFrame(frame); lifetime.abort(); view?.dispose(); }, { once: true });
void init().catch(error => setStatus(String(error), 'error'));
