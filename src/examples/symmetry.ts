import {
  WebGPUView, Visual, Group, Geometry, LabelLayer, rgba, smooth, clamp, polyline, merge, sphere, shadedSphere, circle, arrow, wireSphere,
  parsePOSCAR, parsePhonopySymmetry,
  latticeSites, supercell as makeSupercell, bonds as findBonds,
  fractionalToCartesian, cartesianToFractional, structureBounds, shortestDistance, appearanceFor,
  CUBIC_OPERATIONS, mapsOntoSelf, siteMapping, symmetryOrbits, applyOperation,
  cartesianOperation, axisAngle, rotateAboutAxis, isCubic,
  sphericalWedge, sphericalWedgeOutline,
  mathml, mi, mn, mo, msub, msup, frac, row,
  type Vec3, type CrystalStructure, type CrystalOperation, type Supercell,
} from '../index.js';

const $ = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node as T;
};

const canvas = $<HTMLCanvasElement>('scene');
const stage = canvas.parentElement as HTMLElement;
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
const status = $<HTMLElement>('status');
const mappingPanel = $<HTMLElement>('mapping');
const selectionPanel = $<HTMLElement>('selection');
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

type Motion =
  | { kind: 'identity'; operation: CrystalOperation }
  | { kind: 'rotate'; operation: CrystalOperation; axis: Vec3; angle: number; translation: Vec3 }
  | { kind: 'slide'; operation: CrystalOperation };

type Built = {
  big: Supercell;
  baseCount: number;
  ideal: Vec3[];
  atomVisuals: Visual[];
  atomScales: Vec3[];
  bondVisuals: Visual[];
  ghostVisuals: Visual[];
  cellVisual?: Visual;
  trailVisual?: Visual;
  elementVisuals: Visual[];
  selectionVisuals: Visual[];
  /** Soft glow copies behind each atom, and faded "start" markers shown while animating. */
  haloVisuals: Visual[];
  startVisuals: Visual[];
  atomLabels: HTMLSpanElement[];
  elementLabel: string;
  elementAnchor: Vec3 | undefined;
  motion: Motion;
  centre: Vec3;
  extent: number;
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
let colourMode: 'species' | 'site' = 'species';
let selectedAtom = -1;
let built: Built | undefined;
let frame = 0;
let last = 0;
let clock = 0;
let disposed = false;
const lifetime = new AbortController();
const events = { signal: lifetime.signal };

const fracToCart = (fractional: Vec3) => fractionalToCartesian(fractional, base.lattice);
const det3 = (m: number[][]) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
const negate = (m: number[][]) => m.map(row => row.map(value => -value));

function axisLabel(axis: Vec3): string {
  const scale = 1 / Math.max(...axis.map(Math.abs), 1e-9);
  const integers = axis.map(value => Math.round(value * scale));
  const divisor = integers.reduce((g, value) => gcd(g, Math.abs(value)), 0) || 1;
  // Negative Miller indices use an overbar (1̄), the crystallographic convention.
  return `[${integers.map(value => value / divisor).map(value => value < 0 ? `${Math.abs(value)}̄` : String(value)).join('')}]`;
}
function gcd(a: number, b: number): number { return b ? gcd(b, a % b) : a; }

function mirrorNormal(m: number[][]): Vec3 {
  const candidates: Vec3[] = [[m[0][0] + 1, m[1][0], m[2][0]], [m[0][1], m[1][1] + 1, m[2][1]], [m[0][2], m[1][2], m[2][2] + 1]];
  return candidates.reduce((best, row) => Math.hypot(...row) > Math.hypot(...best) ? row : best);
}

/** Human name for an operation, read from the Cartesian matrix (so [111] axes read correctly). */
function describeOperation(operation: CrystalOperation): string {
  const m = cartesianOperation(base.lattice, operation.rotation), determinant = det3(m);
  const trace = m[0][0] + m[1][1] + m[2][2];
  const translation = operation.translation.some(value => Math.abs(value) > 1e-9) ? ` + (${operation.translation.map(value => value.toFixed(2)).join(', ')})` : '';
  if (determinant > 0) {
    const rotation = axisAngle(m);
    if (!rotation) return translation ? `glide${translation}` : 'E · identity';
    const degrees = Math.round(rotation.angle * 180 / Math.PI);
    const symbol = degrees === 180 ? 'C₂' : degrees === 120 ? 'C₃' : degrees === 90 ? 'C₄' : degrees === 60 ? 'C₆' : `C${Math.round(360 / degrees)}`;
    return `${symbol} · ${degrees}° ‖ ${axisLabel(rotation.axis)}${translation}`;
  }
  if (trace <= -3 + 1e-6) return `i · inversion${translation}`;
  if (Math.abs(trace - 1) < 1e-6) return `σ mirror ⟂ ${axisLabel(mirrorNormal(m))}${translation}`;
  const proper = axisAngle(negate(m));
  return proper ? `S${Math.round(2 * Math.PI / proper.angle)} · rotoreflection ‖ ${axisLabel(proper.axis)}${translation}` : `improper${translation}`;
}

function motionFor(operation: CrystalOperation): Motion {
  const m = cartesianOperation(base.lattice, operation.rotation), determinant = det3(m);
  const translation: Vec3 = fractionalToCartesian(operation.translation, base.lattice);
  if (determinant > 0) {
    const rotation = axisAngle(m);
    if (rotation) return { kind: 'rotate', operation, axis: rotation.axis, angle: rotation.angle, translation };
    return translation.some(value => Math.abs(value) > 1e-9) ? { kind: 'slide', operation } : { kind: 'identity', operation };
  }
  // Improper maps slide through the mirror/centre, which reads as a reflection rather than a spin.
  return { kind: 'slide', operation };
}

function motionPoint(motion: Motion, fromFractional: Vec3, t: number): Vec3 {
  const from = fracToCart(fromFractional);
  if (motion.kind === 'identity') return from;
  // The operation's true target, wrapped back into the unit cell: the animation must end on a
  // real site of the crystal, not on a periodic copy floating in a neighbouring cell.
  const target = fracToCart(applyOperation(motion.operation, fromFractional));
  if (motion.kind === 'rotate') {
    const arrived = rotateAboutAxis(from, motion.axis, motion.angle);
    // The gap between "where the arc lands" and "the wrapped site" is a lattice translation;
    // blending it in along the arc carries the atom home without a jump.
    const correction: Vec3 = [0, 1, 2].map(axis => target[axis] - arrived[axis] - motion.translation[axis]) as Vec3;
    const rotated = rotateAboutAxis(from, motion.axis, motion.angle * t);
    return [
      rotated[0] + (motion.translation[0] + correction[0]) * t,
      rotated[1] + (motion.translation[1] + correction[1]) * t,
      rotated[2] + (motion.translation[2] + correction[2]) * t,
    ];
  }
  // Improper maps and glides slide in fractional space and wrap every frame, so the site crosses
  // the periodic boundary and reappears inside the cell exactly where the operation sends it.
  const linear: Vec3 = [0, 1, 2].map(axis => {
    const moved = motion.operation.rotation[axis][0] * fromFractional[0] + motion.operation.rotation[axis][1] * fromFractional[1] + motion.operation.rotation[axis][2] * fromFractional[2] + motion.operation.translation[axis];
    return fromFractional[axis] + (moved - fromFractional[axis]) * t;
  }) as Vec3;
  return fracToCart(linear.map(value => ((value % 1) + 1) % 1) as Vec3);
}

function cellWire(lattice: Supercell['lattice'], width: number): Geometry {
  const corner = (i: number, j: number, k: number) => fractionalToCartesian([i, j, k], lattice);
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
  const cross: Vec3 = [axis[1] * seed[2] - axis[2] * seed[1], axis[2] * seed[0] - axis[0] * seed[2], axis[0] * seed[1] - axis[1] * seed[0]];
  const length = Math.hypot(...cross) || 1;
  return [cross[0] / length, cross[1] / length, cross[2] / length];
}
function rotationRing(centre: Vec3, axis: Vec3, radius: number, turns = 1): Vec3[] {
  const start = perpendicular(axis);
  return Array.from({ length: 33 }, (_, index) => {
    const point = rotateAboutAxis([start[0] * radius, start[1] * radius, start[2] * radius], axis, index / 32 * Math.PI * 2 * turns);
    return [point[0] + centre[0], point[1] + centre[1], point[2] + centre[2]] as Vec3;
  });
}
function mirrorQuad(centre: Vec3, normal: Vec3, size: number): Geometry {
  const u = perpendicular(normal), v: Vec3 = [normal[1] * u[2] - normal[2] * u[1], normal[2] * u[0] - normal[0] * u[2], normal[0] * u[1] - normal[1] * u[0]];
  const corner = (su: number, sv: number): Vec3 => [centre[0] + (u[0] * su + v[0] * sv) * size, centre[1] + (u[1] * su + v[1] * sv) * size, centre[2] + (u[2] * su + v[2] * sv) * size];
  const a = corner(-1, -1), b = corner(1, -1), c = corner(1, 1), d = corner(-1, 1);
  return new Geometry([...a, ...b, ...c, ...a, ...c, ...d]);
}

function operationElement(operation: CrystalOperation, centre: Vec3, extent: number): { visuals: Visual[]; anchor: Vec3 | undefined; label: string } {
  const m = cartesianOperation(base.lattice, operation.rotation), determinant = det3(m), trace = m[0][0] + m[1][1] + m[2][2];
  const visuals: Visual[] = [];
  const gold = rgba('#f7d681', .9), blue = rgba('#58c4dd', .85);
  if (determinant > 0) {
    const rotation = axisAngle(m);
    if (!rotation) return { visuals, anchor: centre, label: 'identity — every site maps to itself' };
    const half: Vec3 = [centre[0] - rotation.axis[0] * extent * .8, centre[1] - rotation.axis[1] * extent * .8, centre[2] - rotation.axis[2] * extent * .8];
    const end: Vec3 = [centre[0] + rotation.axis[0] * extent * .8, centre[1] + rotation.axis[1] * extent * .8, centre[2] + rotation.axis[2] * extent * .8];
    visuals.push(new Visual(polyline([half, end], .012), gold));
    // The arc spans exactly the rotation angle and carries an arrowhead, so the angle is visible.
    const ring = rotationRing(centre, rotation.axis, extent * .26, rotation.angle / (Math.PI * 2));
    visuals.push(new Visual(polyline(ring, .01), blue));
    visuals.push(new Visual(arrow(ring[ring.length - 3], ring[ring.length - 1], .022), blue));
    const degrees = Math.round(rotation.angle * 180 / Math.PI);
    return { visuals, anchor: end, label: `${degrees}° rotation about ${axisLabel(rotation.axis)}` };
  }
  if (trace <= -3 + 1e-6) {
    visuals.push(new Visual(wireSphere(extent * .09, 10, 6, .01), gold));
    return { visuals, anchor: centre, label: 'inversion centre' };
  }
  if (Math.abs(trace - 1) < 1e-6) {
    const normal = mirrorNormal(m);
    visuals.push(new Visual(mirrorQuad(centre, normal, extent * .42), rgba('#83c167', .16)));
    const u = perpendicular(normal), v: Vec3 = [normal[1] * u[2] - normal[2] * u[1], normal[2] * u[0] - normal[0] * u[2], normal[0] * u[1] - normal[1] * u[0]];
    const h = extent * .42;
    const outline: Vec3[] = [
      [centre[0] + (-u[0] - v[0]) * h, centre[1] + (-u[1] - v[1]) * h, centre[2] + (-u[2] - v[2]) * h],
      [centre[0] + (u[0] - v[0]) * h, centre[1] + (u[1] - v[1]) * h, centre[2] + (u[2] - v[2]) * h],
      [centre[0] + (u[0] + v[0]) * h, centre[1] + (u[1] + v[1]) * h, centre[2] + (u[2] + v[2]) * h],
      [centre[0] + (-u[0] + v[0]) * h, centre[1] + (-u[1] + v[1]) * h, centre[2] + (-u[2] + v[2]) * h],
      [centre[0] + (-u[0] - v[0]) * h, centre[1] + (-u[1] - v[1]) * h, centre[2] + (-u[2] - v[2]) * h],
    ];
    visuals.push(new Visual(polyline(outline, .009), rgba('#83c167', .85)));
    const normalEnd: Vec3 = [centre[0] + normal[0] * extent * .55, centre[1] + normal[1] * extent * .55, centre[2] + normal[2] * extent * .55];
    visuals.push(new Visual(arrow(centre, normalEnd, .016), rgba('#83c167', .85)));
    return { visuals, anchor: normalEnd, label: `mirror plane ⟂ ${axisLabel(normal)}` };
  }
  const proper = axisAngle(negate(m));
  if (proper) {
    const end: Vec3 = [centre[0] + proper.axis[0] * extent * .8, centre[1] + proper.axis[1] * extent * .8, centre[2] + proper.axis[2] * extent * .8];
    visuals.push(new Visual(polyline([[2 * centre[0] - end[0], 2 * centre[1] - end[1], 2 * centre[2] - end[2]], end], .012), gold));
    const ring = rotationRing(centre, proper.axis, extent * .26, proper.angle / (Math.PI * 2));
    visuals.push(new Visual(polyline(ring, .01), blue));
    visuals.push(new Visual(arrow(ring[ring.length - 3], ring[ring.length - 1], .022), blue));
    return { visuals, anchor: end, label: `${Math.round(proper.angle * 180 / Math.PI)}° rotoreflection about ${axisLabel(proper.axis)}` };
  }
  return { visuals, anchor: centre, label: 'improper operation' };
}

function atomColor(index: number, species: string): string {
  return colourMode === 'site' ? SITE_COLORS[index % SITE_COLORS.length] : ELEMENT_COLOR(species);
}

function selectionDetail(index: number, ideal: Vec3[]): { visuals: Visual[]; info: { r: number; theta: number; phi: number } } {
  const point = ideal[index];
  const r = Math.hypot(...point);
  const theta = Math.acos(clamp(point[1] / (r || 1), -1, 1));
  const phi = Math.atan2(point[2], point[0]);
  const visuals: Visual[] = [];
  const yellow = rgba('#ffff00', .85), pink = rgba('#e892c7', .9), white = rgba('#eeeeee', .5);
  visuals.push(new Visual(polyline([[0, 0, 0], point], .01), yellow));
  const polar: Vec3[] = Array.from({ length: 25 }, (_, i) => { const a = theta * i / 24; return [r * Math.sin(a) * Math.cos(phi), r * Math.cos(a), r * Math.sin(a) * Math.sin(phi)]; });
  visuals.push(new Visual(polyline(polar, .009), white));
  const azimuth: Vec3[] = Array.from({ length: 25 }, (_, i) => { const a = phi * i / 24; return [r * Math.sin(theta) * Math.cos(a), r * Math.cos(theta), r * Math.sin(theta) * Math.sin(a)]; });
  visuals.push(new Visual(polyline(azimuth, .009), white));
  // The volume element dV = r² sinθ dr dθ dφ at this site, drawn to scale.
  const dr = Math.max(r * .06, .08), dTheta = .12, dPhi = .12;
  const r0 = Math.max(1e-3, r - dr);
  visuals.push(new Visual(sphericalWedge(r0, r, Math.max(0, theta - dTheta), Math.min(Math.PI, theta + dTheta), phi - dPhi, phi + dPhi, 3), rgba('#e892c7', .18)));
  visuals.push(new Visual(sphericalWedgeOutline(r0, r, Math.max(0, theta - dTheta), Math.min(Math.PI, theta + dTheta), phi - dPhi, phi + dPhi, .006, 8), pink));
  return { visuals, info: { r, theta, phi } };
}

function rebuild(): void {
  if (!view) return;
  view.world.clear();
  labels?.dispose();
  labels = new LabelLayer($('labels'), view.camera);
  const baseCount = base.positions.length;
  let effectiveRepeats = repeats;
  while (baseCount * effectiveRepeats ** 3 > 1600 && effectiveRepeats > 1) effectiveRepeats--;
  const big = makeSupercell(base, [effectiveRepeats, effectiveRepeats, effectiveRepeats]);
  const bounds = structureBounds(big);
  view.camera.target = bounds.centre;
  view.camera.height = bounds.extent * 1.45;
  const shortest = shortestDistance(big.positions, big.lattice);
  const elements = [...new Set(big.species)];
  const appearance = new Map(elements.map(symbol => [symbol, appearanceFor(symbol)]));
  const widest = Math.max(...[...appearance.values()].map(entry => entry.radius));
  const unit = Math.min(1, shortest * .26 / widest);
  // Shaded spheres: the light-model shade rides in the vertex colors and the element hue is the
  // Visual color, so the renderer's multiply makes each atom read as a lit ball, not a flat disc.
  const meshes = new Map(elements.map(symbol => [symbol, shadedSphere(1)]));
  const halos = new Map(elements.map(symbol => [symbol, sphere(1)]));
  const ideal = big.positions.map(position => fractionalToCartesian(position, big.lattice));
  const atomScales: Vec3[] = big.positions.map((_, index) => { const radius = Math.max(shortest * .08, appearance.get(big.species[index])!.radius * unit); return [radius, radius, radius]; });
  const atomVisuals = big.positions.map((_, index) => {
    const visual = new Visual(meshes.get(big.species[index])!, rgba(atomColor(index, big.species[index])));
    visual.position = ideal[index];
    visual.scale = atomScales[index];
    return visual;
  });
  // A larger, faint copy of each sphere gives the silhouette a soft glow.
  const haloVisuals = big.positions.map((_, index) => {
    const halo = new Visual(halos.get(big.species[index])!, rgba(atomColor(index, big.species[index]), .12));
    halo.position = ideal[index];
    halo.scale = atomScales[index].map(value => value * 1.45) as Vec3;
    return halo;
  });
  // Faded markers at the starting sites: drawn while an operation runs, they make "before → after" legible.
  const startVisuals = big.positions.map((_, index) => {
    const marker = new Visual(meshes.get(big.species[index])!, rgba(atomColor(index, big.species[index]), .32));
    marker.position = ideal[index];
    marker.scale = atomScales[index].map(value => value * .6) as Vec3;
    return marker;
  });

  const bondVisuals: Visual[] = [];
  const ghostVisuals: Visual[] = [];
  if (showBonds && big.positions.length <= 1200) {
    const halves = new Map<string, Geometry[]>();
    const width = Math.min(.16, Math.max(.02, shortest * .055));
    const ghosts = new Set<string>();
    for (const bond of findBonds(big.positions, big.lattice, shortest * 1.28, { periodic: effectiveRepeats === 1 })) {
      const a = ideal[bond.i];
      const shifted: Vec3 = [big.positions[bond.j][0] + bond.image[0], big.positions[bond.j][1] + bond.image[1], big.positions[bond.j][2] + bond.image[2]];
      const b = fractionalToCartesian(shifted, big.lattice);
      const middle: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      const colorI = ELEMENT_COLOR(big.species[bond.i]), colorJ = ELEMENT_COLOR(big.species[bond.j]);
      const listI = halves.get(colorI) ?? []; listI.push(polyline([a, middle], width, 5)); halves.set(colorI, listI);
      const listJ = halves.get(colorJ) ?? []; listJ.push(polyline([middle, b], width, 5)); halves.set(colorJ, listJ);
      // A bond with a non-zero image offset ends on a periodic copy, not on a drawn atom.
      // Show that neighbour as a faded ghost so the coordination shell reads as complete.
      const periodicImage = bond.i !== bond.j && (bond.image[0] !== 0 || bond.image[1] !== 0 || bond.image[2] !== 0);
      if (periodicImage) {
        const key = `${big.species[bond.j]}:${shifted.map(value => value.toFixed(3)).join(',')}`;
        if (!ghosts.has(key)) {
          ghosts.add(key);
          const ghost = new Visual(meshes.get(big.species[bond.j])!, rgba(ELEMENT_COLOR(big.species[bond.j]), .28));
          ghost.position = b;
          ghost.scale = atomScales[bond.j];
          ghostVisuals.push(ghost);
        }
      }
    }
    for (const [color, list] of halves) bondVisuals.push(new Visual(merge(...list), rgba(color, .8)));
  }

  const cellVisual = showCell ? new Visual(cellWire(big.lattice, Math.max(.006, bounds.extent * .0018)), rgba('#a4b3c6', .55)) : undefined;

  const motion = motionFor(operations[operationIndex]);
  const element = operationElement(operations[operationIndex], bounds.centre, bounds.extent);
  const trailVisual = showTrails && big.positions.length <= 400 ? (() => {
    const paths: Geometry[] = [];
    for (let index = 0; index < big.positions.length; index++) {
      const series: Vec3[] = [];
      for (let step = 0; step <= 24; step++) {
        const position = motionPoint(motion, base.positions[index % baseCount], step / 24);
        const shift = fractionalToCartesian(big.offsets[index], base.lattice);
        series.push([position[0] + shift[0], position[1] + shift[1], position[2] + shift[2]]);
      }
      paths.push(polyline(series, Math.max(.004, bounds.extent * .0012)));
      // An arrowhead on the path of any site that actually moves makes the direction explicit.
      const baseIndex = index % baseCount;
      const target = applyOperation(operations[operationIndex], base.positions[baseIndex]);
      const moved = [0, 1, 2].some(axis => { const raw = Math.abs(target[axis] - base.positions[baseIndex][axis]); return Math.min(raw, 1 - raw) > 1e-4; });
      if (moved) paths.push(arrow(series[series.length - 3], series[series.length - 1], Math.max(.015, bounds.extent * .006)));
    }
    return paths.length ? new Visual(merge(...paths), rgba('#ffffff', .34)) : undefined;
  })() : undefined;

  const selectionVisuals: Visual[] = [];
  if (selectedAtom >= 0 && selectedAtom < ideal.length) {
    selectionVisuals.push(...selectionDetail(selectedAtom, ideal).visuals);
    // Outline every site in the selected atom's symmetry orbit: "these atoms are equivalent".
    const orbits = symmetryOrbits(base, operations, 1e-3);
    const orbit = new Set(orbits.find(list => list.includes(selectedAtom % baseCount)) ?? [selectedAtom % baseCount]);
    for (let index = 0; index < ideal.length; index++) {
      if (index === selectedAtom || !orbit.has(index % baseCount)) continue;
      const ring = new Visual(wireSphere(atomScales[index][0] * 1.45, 8, 5, .006), rgba('#ffff00', .5));
      ring.position = ideal[index];
      selectionVisuals.push(ring);
    }
  }

  built = { big, baseCount, ideal, atomVisuals, atomScales, bondVisuals, ghostVisuals, haloVisuals, startVisuals, atomLabels: [], cellVisual, trailVisual, elementVisuals: element.visuals, selectionVisuals, elementLabel: element.label, elementAnchor: element.anchor, motion, centre: bounds.centre, extent: bounds.extent };
  view.world.add(...haloVisuals, ...atomVisuals, ...ghostVisuals, ...bondVisuals, ...(cellVisual ? [cellVisual] : []), ...(trailVisual ? [trailVisual] : []), ...element.visuals, ...selectionVisuals, ...startVisuals);

  // Labels: lattice vectors, the symmetry element, the selected site, and (optionally) element symbols.
  const axes: [string, Vec3][] = [['a', fractionalToCartesian([1, 0, 0], big.lattice)], ['b', fractionalToCartesian([0, 1, 0], big.lattice)], ['c', fractionalToCartesian([0, 0, 1], big.lattice)]];
  for (const [name, direction] of axes) labels.addHTML(mathml(mi(name)), () => [direction[0] * 1.06, direction[1] * 1.06, direction[2] * 1.06], '#a4b3c6', 'math-label');
  if (element.anchor) labels.add(element.label, () => element.anchor!, '#83c167');
  if (selectedAtom >= 0 && selectedAtom < ideal.length) {
    const point = ideal[selectedAtom];
    labels.addHTML(mathml(msub(mi('r'), mn(selectedAtom + 1))), () => point, '#ffff00', 'math-label');
  }
  if (atomLabelsToggle.checked && big.positions.length <= 36) {
    for (let index = 0; index < big.positions.length; index++) {
      const span = labels.addHTML(mathml(mi(big.species[index])), () => atomVisuals[index].position, '#ffffff', 'math-label atom-tag');
      built.atomLabels.push(span);
    }
  }

  writeStructureInfo();
  writeLegend(elements, appearance, big);
  writeMapping();
  writeSelection();
}

function writeStructureInfo(): void {
  const lengths = base.lattice.map(vector => Math.hypot(...vector));
  const angle = (a: Vec3, b: Vec3) => Math.acos(clamp((a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (Math.hypot(...a) * Math.hypot(...b)), -1, 1)) * 180 / Math.PI;
  // Two short lines instead of one long row, so nothing needs a horizontal scrollbar.
  const lengthsLine = mathml(row(msub(mi('a'), mn(1)), mo('='), mn(lengths[0].toFixed(3)), mo(','), msub(mi('b'), mn(1)), mo('='), mn(lengths[1].toFixed(3)), mo(','), msub(mi('c'), mn(1)), mo('='), mn(lengths[2].toFixed(3)), mo(' Å')));
  const anglesLine = mathml(row(mi('α'), mo('='), mn(angle(base.lattice[1], base.lattice[2]).toFixed(1)), mo('°'), mo(','), mi('β'), mo('='), mn(angle(base.lattice[0], base.lattice[2]).toFixed(1)), mo('°'), mo(','), mi('γ'), mo('='), mn(angle(base.lattice[0], base.lattice[1]).toFixed(1)), mo('°')));
  info.innerHTML = `<div class="info-title">${base.comment || 'Crystal structure'}</div><div class="info-math">${lengthsLine}</div><div class="info-math">${anglesLine}</div><div class="info-line">${base.positions.length} atoms · ${[...new Set(base.species)].join(', ')}</div>`;
}

function writeLegend(elements: string[], appearance: Map<string, { radius: number; color: string }>, big: Supercell): void {
  legend.replaceChildren(...elements.map(symbol => {
    const { color, radius } = appearance.get(symbol)!;
    const count = big.species.filter(species => species === symbol).length;
    const rowElement = document.createElement('div');
    rowElement.className = 'legend-row';
    const swatch = document.createElement('span'); swatch.className = 'swatch'; swatch.style.background = color;
    const name = document.createElement('span'); name.textContent = symbol;
    const countElement = document.createElement('span'); countElement.className = 'muted'; countElement.textContent = `×${count}`;
    const size = document.createElement('span'); size.className = 'legend-size'; size.textContent = `${radius.toFixed(2)} Å`;
    rowElement.append(swatch, name, countElement, size);
    return rowElement;
  }));
}

function writeMapping(): void {
  const exact = operations.filter(operation => mapsOntoSelf(base, operation, 1e-3));
  const orbits = symmetryOrbits(base, exact.length ? exact : [operations[operationIndex]], 1e-3);
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
    <div class="report-line">Selected operation moves <strong>${moved}</strong> site${moved === 1 ? '' : 's'}.</div>
    <div class="map-grid">${rows}${mapping.length > 14 ? `<span class="map-cell muted">+${mapping.length - 14} more</span>` : ''}</div>`;
}

function writeSelection(): void {
  if (selectedAtom < 0 || !built || selectedAtom >= built.ideal.length) {
    selectionPanel.innerHTML = `<span class="muted">Click an atom to read its fractional, Cartesian, and spherical coordinates and see its volume element.</span>`;
    return;
  }
  const index = selectedAtom;
  const baseIndex = index % built.baseCount;
  const fractional = base.positions[baseIndex];
  const point = built.ideal[index];
  const cartesian = point;
  const r = Math.hypot(...point);
  const theta = Math.acos(clamp(point[1] / (r || 1), -1, 1)) * 180 / Math.PI;
  const phi = ((Math.atan2(point[2], point[0]) * 180 / Math.PI) + 360) % 360;
  const row_ = (label: string, value: string) => `<div class="readout-row"><span>${label}</span><code>${value}</code></div>`;
  selectionPanel.innerHTML = `
    <div class="selection-title">${base.species[baseIndex]}<sub>${index}</sub></div>
    ${row_('fractional', `(${fractional.map(value => value.toFixed(3)).join(', ')})`)}
    ${row_('Cartesian', `(${cartesian.map(value => value.toFixed(3)).join(', ')})`)}
    ${row_('r', `${r.toFixed(3)} Å`)}
    ${row_('θ (from +Y)', `${theta.toFixed(1)}°`)}
    ${row_('φ (xz-plane)', `${phi.toFixed(1)}°`)}`;
}

function update(): void {
  const state = built;
  if (!state || !view) return;
  const t = smooth(progress);
  // Bonds and ghosts dim while atoms are in flight, then come back so the finished state reads as
  // a complete crystal; trails fade out at the end for the same reason.
  const flight = smooth(clamp(progress * 4)) * (1 - smooth(clamp((progress - .82) / .18)));
  const bondOpacity = 1 - .78 * flight;
  const trailOpacity = showTrails ? (.12 + .78 * clamp(smooth(progress * 4))) * (1 - smooth(clamp((progress - .88) / .12))) : 0;
  state.bondVisuals.forEach(visual => { visual.opacity = showBonds ? bondOpacity : 0; });
  state.ghostVisuals.forEach(visual => { visual.opacity = showBonds ? bondOpacity : 0; });
  if (state.trailVisual) state.trailVisual.opacity = trailOpacity;
  state.elementVisuals.forEach(visual => { visual.opacity = showTrails ? .35 + .65 * (1 - t) : 1; });
  state.atomVisuals.forEach((visual, index) => {
    const baseIndex = index % state.baseCount;
    const local = motionPoint(state.motion, base.positions[baseIndex], t);
    const shift = fractionalToCartesian(state.big.offsets[index], base.lattice);
    const position: Vec3 = [local[0] + shift[0], local[1] + shift[1], local[2] + shift[2]];
    visual.position = position;
    // A gentle breathing keeps the scene alive; the selected site beats harder.
    const selected = index === selectedAtom;
    const pulse = 1 + (selected ? .14 : .015) * Math.sin(clock * (selected ? 4 : 1.6) + index);
    const scale = state.atomScales[index];
    visual.scale = [scale[0] * pulse, scale[1] * pulse, scale[2] * pulse];
    const halo = state.haloVisuals[index];
    if (halo) { halo.position = position; halo.scale = [scale[0] * 1.6 * pulse, scale[1] * 1.6 * pulse, scale[2] * 1.6 * pulse]; }
  });
  // Start markers: faint "before" rings that fade in as atoms leave their sites and out again
  // as the operation returns them home, so before → after is unambiguous.
  const startOpacity = showTrails ? (holdStart ? .55 : smooth(progress * 3) * (1 - smooth((progress - .82) / .18)) * .55) : 0;
  state.startVisuals.forEach(marker => { marker.opacity = startOpacity; });
  progressInput.value = String(progress);
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
  $('description').innerHTML = `<div class="op-name">${describeOperation(operation)}</div>
    <div class="op-matrix">R = [${operation.rotation.map(rowValues => `[${rowValues.join(', ')}]`).join(', ')}]${operation.translation.some(Boolean) ? ` + (${operation.translation.join(', ')})` : ''}</div>`;
  $('stage-op').textContent = `${describeOperation(operation)} — moves ${movedCount(operation)} site${movedCount(operation) === 1 ? '' : 's'}`;
  rebuild();
  update();
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
/** How many sites the operation actually relocates — the ones worth showing first. */
function movedCount(operation: CrystalOperation): number {
  return siteMapping(base, operation, 1e-3).filter((target, index) => target >= 0 && target !== index).length;
}
function orderOperations(list: CrystalOperation[]): CrystalOperation[] {
  return [...list].sort((a, b) => operationRank(a) - operationRank(b) || movedCount(b) - movedCount(a));
}

/** Fill the picker (name + how many sites move) and open on an operation that visibly moves sites. */
function populateOperationOptions(): void {
  operationSelect.replaceChildren(...operations.map((operation, index) => new Option(`${index + 1}. ${describeOperation(operation)} · ${movedCount(operation)} moved`, String(index))));
  const firstMoving = operations.findIndex((operation, index) => index > 0 && movedCount(operation) > 0);
  setOperation(firstMoving >= 0 ? firstMoving : 0);
}

function recomputeOperations(): void {
  operations = orderOperations(defaultOperations());
  populateOperationOptions();
}

function defaultOperations(): CrystalOperation[] {
  if (isCubic(base.lattice)) {
    const generated = CUBIC_OPERATIONS.map(rotation => ({ rotation, translation: [0, 0, 0] as Vec3, label: '' }));
    const exact = generated.filter(operation => mapsOntoSelf(base, operation, 1e-3));
    return exact.length >= 2 ? exact : generated;
  }
  const identity: number[][] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  return [
    { rotation: identity, translation: [0, 0, 0], label: 'E — identity' },
    { rotation: [[0, -1, 0], [1, 0, 0], [0, 0, 1]], translation: [0, 0, 0], label: 'C₄ — 90° about z' },
    { rotation: [[0, 0, 1], [1, 0, 0], [0, 1, 0]], translation: [0, 0, 0], label: 'C₃ — 120° about [111]' },
    { rotation: [[-1, 0, 0], [0, 1, 0], [0, 0, 1]], translation: [0, 0, 0], label: 'σ — mirror x = 0' },
    { rotation: [[-1, 0, 0], [0, -1, 0], [0, 0, -1]], translation: [0, 0, 0], label: 'i — inversion' },
  ];
}

function pick(clientX: number, clientY: number): number {
  if (!view || !built) return -1;
  const rect = stage.getBoundingClientRect();
  const x = clientX - rect.left, y = clientY - rect.top;
  let best = -1, bestDistance = 26;
  built.atomVisuals.forEach((visual, index) => {
    const [px, py] = view!.camera.project(visual.position, rect.width, rect.height);
    const distance = Math.hypot(px - x, py - y);
    if (distance < bestDistance) { bestDistance = distance; best = index; }
  });
  return best;
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
    if (kind === 'poscar') { base = parsePOSCAR(text); selectedAtom = -1; showFile(file, 'POSCAR'); status.textContent = `${file.name} loaded`; }
    else { const parsed = parsePhonopySymmetry(text); if (parsed.length) operations = orderOperations(parsed); selectedAtom = -1; showFile(file, 'PHONOPY'); status.textContent = `${file.name} · ${parsed.length} operations`; }
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
  recomputeOperations();

  operationSelect.addEventListener('change', () => setOperation(Number(operationSelect.value)), events);
  progressInput.addEventListener('input', () => { playing = false; progress = Number(progressInput.value); update(); }, events);
  playButton.addEventListener('click', () => {
    if (progress >= 1) progress = 0;
    playing = !playing;
    update();
  }, events);
  resetButton.addEventListener('click', () => { progress = 0; playing = false; update(); }, events);
  supercellSelect.addEventListener('change', () => { repeats = Number(supercellSelect.value); selectedAtom = -1; rebuild(); update(); }, events);
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
    if (event.code === 'Space') { event.preventDefault(); playButton.click(); }
    else if (event.code === 'ArrowLeft') { event.preventDefault(); playing = false; progress = clamp(progress - .05, 0, 1); update(); }
    else if (event.code === 'ArrowRight') { event.preventDefault(); playing = false; progress = clamp(progress + .05, 0, 1); update(); }
    else if (event.key === '[') step(-1);
    else if (event.key === ']') step(1);
    else if (event.key === 'r' || event.key === 'R') { playing = false; progress = 0; update(); }
    else if (event.key === 'p' || event.key === 'P') playButton.click();
  }, events);
  // Select on click, not on drag: the camera also listens for pointerdown, so a tiny
  // movement threshold keeps orbiting from changing the selection.
  let pressX = 0, pressY = 0, pressed = false;
  canvas.addEventListener('pointerdown', event => { pressed = true; pressX = event.clientX; pressY = event.clientY; }, events);
  canvas.addEventListener('pointerup', event => {
    if (!pressed || !view) return;
    pressed = false;
    if (Math.hypot(event.clientX - pressX, event.clientY - pressY) > 5) return;
    const hit = pick(event.clientX, event.clientY);
    if (hit === selectedAtom) return;
    selectedAtom = hit;
    rebuild();
    update();
  }, events);
  canvas.addEventListener('pointercancel', () => { pressed = false; }, events);
  poscarInput.addEventListener('change', () => { const file = poscarInput.files?.[0]; if (file) void loadText(file, 'poscar'); }, events);
  symmetryInput.addEventListener('change', () => { const file = symmetryInput.files?.[0]; if (file) void loadText(file, 'symmetry'); }, events);
  filesInput.addEventListener('change', () => { for (const file of filesInput.files ?? []) void loadUnknown(file); }, events);
  for (const name of ['dragover', 'dragenter']) dropZone.addEventListener(name, event => { event.preventDefault(); dropZone.classList.add('active'); }, events);
  for (const name of ['dragleave', 'drop']) dropZone.addEventListener(name, event => { event.preventDefault(); dropZone.classList.remove('active'); }, events);
  dropZone.addEventListener('drop', event => { for (const file of [...(event as DragEvent).dataTransfer!.files]) void loadUnknown(file); }, events);
  legendAnchor.addEventListener('click', () => { legend.classList.toggle('collapsed'); }, events);

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

