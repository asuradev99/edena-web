import { cross, sub, type Vec3 } from './math.js';
import type { CrystalOperation, CrystalStructure } from './crystal.js';

/**
 * Geometry above the parsers in `crystal.ts`: cell parameters, fractional ↔ Cartesian
 * conversion, supercells, bond/neighbour finding with periodic images, Miller planes, the
 * 48 cubic point-group operations (generated, not hand-listed), and an exact
 * `mapsOntoSelf` test in fractional space.
 *
 * Everything is pure and returns plain data, so a viewer can rebuild freely without GPU
 * bookkeeping.
 */
export type Lattice = CrystalStructure['lattice'];

const DEGREES = Math.PI / 180;

export function cellVolume(lattice: Lattice): number {
  return Math.abs(determinant(lattice[0], lattice[1], lattice[2]));
}

/** Right-handed cell from lengths (Å) and angles (degrees): a along x, b in the xy plane. */
export function cellFromParameters(a: number, b: number, c: number, alpha = 90, beta = 90, gamma = 90): Lattice {
  if (![a, b, c].every(value => Number.isFinite(value) && value > 0)) throw new Error('Cell lengths must be positive and finite');
  const [al, be, ga] = [alpha, beta, gamma].map(value => value * DEGREES);
  const ca = Math.cos(al), cb = Math.cos(be), cg = Math.cos(ga), sg = Math.sin(ga);
  if (Math.abs(sg) < 1e-9) throw new Error('Cell angle γ must not be 0° or 180°');
  const czSquared = c * c - (c * cb) * (c * cb) - Math.pow(c * (ca - cb * cg) / sg, 2);
  if (czSquared <= 1e-12) throw new Error('Cell angles do not define a valid, non-degenerate cell');
  return [
    [a, 0, 0],
    [b * cg, b * sg, 0],
    [c * cb, c * (ca - cb * cg) / sg, Math.sqrt(czSquared)],
  ];
}

/** Fractional coordinates to Cartesian: columns of `lattice` are the cell vectors. */
export function fractionalToCartesian(fractional: Vec3, lattice: Lattice): Vec3 {
  return [
    fractional[0] * lattice[0][0] + fractional[1] * lattice[1][0] + fractional[2] * lattice[2][0],
    fractional[0] * lattice[0][1] + fractional[1] * lattice[1][1] + fractional[2] * lattice[2][1],
    fractional[0] * lattice[0][2] + fractional[1] * lattice[1][2] + fractional[2] * lattice[2][2],
  ];
}

/** Cartesian coordinates back to fractional, throwing when the cell is singular. */
export function cartesianToFractional(point: Vec3, lattice: Lattice): Vec3 {
  const d = determinant(lattice[0], lattice[1], lattice[2]);
  if (Math.abs(d) < 1e-12) throw new Error('Lattice vectors are linearly dependent');
  const [a, b, c] = lattice;
  return [
    dot(point, cross(b, c)) / d,
    dot(point, cross(c, a)) / d,
    dot(point, cross(a, b)) / d,
  ];
}

/** Wrap fractional coordinates into the half-open cell [0, 1). */
export const wrapFractional = (fractional: Vec3): Vec3 => fractional.map(value => ((value % 1) + 1) % 1) as Vec3;

/** Squared separation in fractional space, using the minimum image convention. */
export function fractionalDistanceSquared(a: Vec3, b: Vec3): number {
  let sum = 0;
  for (let axis = 0; axis < 3; axis++) {
    const raw = Math.abs(a[axis] - b[axis]) % 1;
    const shortest = Math.min(raw, 1 - raw);
    sum += shortest * shortest;
  }
  return sum;
}

/** Cartesian separation in ångström between two **fractional** sites, using the shortest image. */
export function periodicDistance(a: Vec3, b: Vec3, lattice: Lattice): number {
  const delta: Vec3 = [0, 1, 2].map(axis => { const raw = a[axis] - b[axis]; return raw - Math.round(raw); }) as Vec3;
  return Math.hypot(...fractionalToCartesian(delta, lattice));
}

export type Supercell = CrystalStructure & { /** Cell offset of every copied site, in units of the original cell. */ offsets: Vec3[]; /** The original, unreplicated cell. */ base: CrystalStructure };

/**
 * Replicate a structure `repeats` times along each cell vector. The returned lattice is the
 * supercell, so the fractional coordinates stay inside [0, 1) and the viewer can draw one box.
 */
export function supercell(structure: CrystalStructure, repeats: [number, number, number] = [1, 1, 1]): Supercell {
  if (!repeats.every(n => Number.isInteger(n) && n >= 1)) throw new Error('Supercell repeats must be positive integers');
  const species: string[] = [], positions: Vec3[] = [], offsets: Vec3[] = [];
  for (let i = 0; i < repeats[0]; i++) for (let j = 0; j < repeats[1]; j++) for (let k = 0; k < repeats[2]; k++)
    for (let atom = 0; atom < structure.positions.length; atom++) {
      species.push(structure.species[atom]);
      offsets.push([i, j, k]);
      positions.push([
        (structure.positions[atom][0] + i) / repeats[0],
        (structure.positions[atom][1] + j) / repeats[1],
        (structure.positions[atom][2] + k) / repeats[2],
      ]);
    }
  if (repeats[0] * repeats[1] * repeats[2] === 1) return { ...structure, offsets, base: structure };
  const lattice: Lattice = [
    structure.lattice[0].map(value => value * repeats[0]) as Vec3,
    structure.lattice[1].map(value => value * repeats[1]) as Vec3,
    structure.lattice[2].map(value => value * repeats[2]) as Vec3,
  ];
  return { comment: structure.comment, lattice, species, positions, offsets, base: structure };
}

export type SiteKind = 'sc' | 'bcc' | 'fcc' | 'diamond' | 'rock-salt' | 'perovskite';

const BASIS: Record<SiteKind, { label: string; fractional: Vec3 }[]> = {
  'sc': [{ label: 'A', fractional: [0, 0, 0] }],
  'bcc': [{ label: 'A', fractional: [0, 0, 0] }, { label: 'A', fractional: [.5, .5, .5] }],
  'fcc': [{ label: 'A', fractional: [0, 0, 0] }, { label: 'A', fractional: [0, .5, .5] }, { label: 'A', fractional: [.5, 0, .5] }, { label: 'A', fractional: [.5, .5, 0] }],
  'diamond': [
    { label: 'A', fractional: [0, 0, 0] }, { label: 'A', fractional: [0, .5, .5] }, { label: 'A', fractional: [.5, 0, .5] }, { label: 'A', fractional: [.5, .5, 0] },
    { label: 'A', fractional: [.25, .25, .25] }, { label: 'A', fractional: [.25, .75, .75] }, { label: 'A', fractional: [.75, .25, .75] }, { label: 'A', fractional: [.75, .75, .25] },
  ],
  'rock-salt': [
    { label: 'Na', fractional: [0, 0, 0] }, { label: 'Na', fractional: [0, .5, .5] }, { label: 'Na', fractional: [.5, 0, .5] }, { label: 'Na', fractional: [.5, .5, 0] },
    { label: 'Cl', fractional: [.5, .5, .5] }, { label: 'Cl', fractional: [.5, 0, 0] }, { label: 'Cl', fractional: [0, .5, 0] }, { label: 'Cl', fractional: [0, 0, .5] },
  ],
  'perovskite': [
    { label: 'A', fractional: [0, 0, 0] },
    { label: 'B', fractional: [.5, .5, .5] },
    { label: 'O', fractional: [.5, .5, 0] }, { label: 'O', fractional: [.5, 0, .5] }, { label: 'O', fractional: [0, .5, .5] },
  ],
};

/**
 * Generate a common lattice type. `cell` may be supplied (so a hexagonal cell stays
 * hexagonal); otherwise a cubic cell of the given side is used. Labels are real element
 * symbols where the structure has a conventional chemistry, and `A`/`B` otherwise — remap
 * them by passing `species`.
 */
export function latticeSites(kind: SiteKind, options: { cell?: Lattice; side?: number; species?: string[] } = {}): CrystalStructure {
  const basis = BASIS[kind];
  if (!basis) throw new Error(`Unknown lattice kind "${kind}"`);
  const side = options.side ?? 3.905;
  const lattice = options.cell ?? ([[side, 0, 0], [0, side, 0], [0, 0, side]] as Lattice);
  return {
    comment: `${kind} lattice`,
    lattice,
    species: basis.map((site, index) => options.species?.[index] ?? site.label),
    positions: basis.map(site => [...site.fractional] as Vec3),
  };
}

export type Bond = { i: number; j: number; /** Image offset applied to site `j`, in cells. */ image: Vec3; length: number };

/**
 * Find bonded pairs within `cutoff` ångström. With `periodic` (the default) a bond may wrap
 * across a cell face and reports the image offset it used; otherwise only offsets inside the
 * given cell are considered, which is what a supercell wants (its copies are already real sites).
 *
 * `maxNeighbours` keeps only each site's nearest `n` partners, so a too-generous cutoff cannot
 * turn the scene into a hairball.
 */
export function bonds(positions: Vec3[], lattice: Lattice, cutoff: number, options: { periodic?: boolean; self?: boolean; maxNeighbours?: number } = {}): Bond[] {
  if (!(cutoff > 0) || !Number.isFinite(cutoff)) throw new Error('Bond cutoff must be positive and finite');
  const periodic = options.periodic ?? true;
  const offsets: Vec3[] = periodic
    ? [[0, 0, 0], [-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, -1, 0], [-1, 0, -1], [0, -1, -1], [-1, 1, 0], [1, -1, 0], [-1, 0, 1], [1, 0, -1], [0, -1, 1], [0, 1, -1], [1, 1, 0], [1, 0, 1], [0, 1, 1], [-1, -1, -1], [1, 1, 1], [-1, -1, 1], [-1, 1, -1], [1, -1, -1], [-1, 1, 1], [1, -1, 1], [1, 1, -1]]
    : [[0, 0, 0]];
  const found: Bond[] = [];
  for (let i = 0; i < positions.length; i++) for (let j = i; j < positions.length; j++) {
    if (i === j && !options.self) continue;
    for (const image of offsets) {
      if (i === j) {
        // A site bonds to its own periodic image; the ±v pair is the same neighbour, so
        // keep only the canonical half-space copy.
        if (image[0] === 0 && image[1] === 0 && image[2] === 0) continue;
        if (image[0] < 0 || (image[0] === 0 && (image[1] < 0 || (image[1] === 0 && image[2] < 0)))) continue;
      }
      const delta = fractionalToCartesian([
        positions[j][0] + image[0] - positions[i][0],
        positions[j][1] + image[1] - positions[i][1],
        positions[j][2] + image[2] - positions[i][2],
      ], lattice);
      const length = Math.hypot(...delta);
      // Keep *every* image within the cutoff, not just the closest. A large cation can have
      // one partner on this side of the cell and its image on the other; both are real bonds.
      if (length > 1e-6 && length <= cutoff) found.push({ i, j, image, length });
    }
  }
  const limit = options.maxNeighbours;
  if (!limit) return found;
  const byAtom = new Map<number, Bond[]>();
  for (const bond of found) {
    for (const atom of bond.i === bond.j ? [bond.i] : [bond.i, bond.j]) {
      const list = byAtom.get(atom) ?? [];
      list.push(bond);
      byAtom.set(atom, list);
    }
  }
  const keep = new Set<Bond>();
  for (const list of byAtom.values()) list.sort((a, b) => a.length - b.length).slice(0, limit).forEach(bond => keep.add(bond));
  return found.filter(bond => keep.has(bond));
}

export type Neighbour = { index: number; length: number; image: Vec3 };

/** Closest sites to a Cartesian point, nearest first. */
export function nearestNeighbours(positions: Vec3[], lattice: Lattice, point: Vec3, count = 4, cutoff = Infinity): Neighbour[] {
  const fractional = cartesianToFractional(point, lattice);
  const result: Neighbour[] = [];
  for (let index = 0; index < positions.length; index++) {
    // Fold the site difference into [-1/2, 1/2) on every axis: that picks the nearest
    // periodic image. The offset we folded out is the cell the image lives in.
    const raw = [0, 1, 2].map(axis => positions[index][axis] - fractional[axis]);
    const shifts = raw.map(value => Math.round(value));
    const folded = raw.map((value, axis) => value - shifts[axis]) as Vec3;
    const image = shifts.map(value => -value) as Vec3;
    const length = Math.hypot(...fractionalToCartesian(folded, lattice));
    if (length <= cutoff) result.push({ index, length, image });
  }
  return result.sort((a, b) => a.length - b.length).slice(0, count);
}

/**
 * A square patch of the (hkl) plane, centred in the cell. Returns the four corners in
 * Cartesian coordinates, ordered as a polygon. Useful for a cleavage-plane overlay.
 */
export function millerPlane(lattice: Lattice, h: number, k: number, l: number, size = 1): Vec3[] {
  if (![h, k, l].some(value => value !== 0)) throw new Error('Miller indices cannot all be zero');
  const volume = determinant(lattice[0], lattice[1], lattice[2]);
  if (Math.abs(volume) < 1e-12) throw new Error('Lattice vectors are linearly dependent');
  // The plane normal is the reciprocal-space vector g = h a* + k b* + l c*.
  const [bxc, cxa, axb] = [cross(lattice[1], lattice[2]), cross(lattice[2], lattice[0]), cross(lattice[0], lattice[1])];
  const g: Vec3 = [0, 1, 2].map(axis => (h * bxc[axis] + k * cxa[axis] + l * axb[axis]) / volume) as Vec3;
  const normal = normalize(g);
  const seed: Vec3 = Math.abs(normal[1]) > .9 ? [1, 0, 0] : [0, 1, 0];
  const u = normalize(cross(normal, seed));
  const v = cross(normal, u);
  const centre = fractionalToCartesian([.5, .5, .5], lattice);
  const half = size / 2;
  return [
    centre.map((value, axis) => value - half * (u[axis] + v[axis])) as Vec3,
    centre.map((value, axis) => value - half * (u[axis] - v[axis])) as Vec3,
    centre.map((value, axis) => value + half * (u[axis] + v[axis])) as Vec3,
    centre.map((value, axis) => value + half * (u[axis] - v[axis])) as Vec3,
  ];
}

/** All 48 signed-permutation matrices — the point group m-3m of a cubic crystal. */
export const CUBIC_OPERATIONS: number[][][] = (() => {
  const permutations = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  const operations: number[][][] = [];
  for (const permutation of permutations) for (const signs of [[1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1], [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1]]) {
    operations.push(permutation.map((column, row) => [0, 1, 2].map(axis => axis === column ? signs[row] : 0)));
  }
  return operations;
})();

/**
 * Every integer matrix with entries in {−1, 0, 1} that preserves the lattice metric, i.e. the
 * point group of the cell written in its own basis. The Gram matrix `G` (G_ij = aᵢ·aⱼ) defines
 * the metric, and a fractional map `M` is a symmetry exactly when `Mᵀ G M = G`.
 *
 * This is what makes the viewer correct for non-cubic cells: a cubic cell yields 48 operations,
 * a hexagonal cell 24, tetragonal 16, and so on. (Crystals whose basis breaks the lattice
 * symmetry keep the lattice operations, and {@link mapsOntoSelf} reports which ones survive.)
 */
export function latticePointGroup(lattice: Lattice, tolerance = 1e-6): number[][][] {
  const metric = lattice.map(a => lattice.map(b => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const values = [-1, 0, 1];
  const operations: number[][][] = [];
  for (const a of values) for (const b of values) for (const c of values)
    for (const d of values) for (const e of values) for (const f of values)
      for (const h of values) for (const i of values) for (const j of values) {
        const m = [[a, b, c], [d, e, f], [h, i, j]];
        const det = a * (e * j - f * i) - b * (d * j - f * h) + c * (d * i - e * h);
        if (Math.abs(Math.abs(det) - 1) > 1e-9) continue;
        let ok = true;
        for (let p = 0; p < 3 && ok; p++) for (let q = 0; q < 3 && ok; q++) {
          let sum = 0;
          for (let r = 0; r < 3; r++) for (let s = 0; s < 3; s++) sum += m[r][p] * metric[r][s] * m[s][q];
          if (Math.abs(sum - metric[p][q]) > tolerance) ok = false;
        }
        if (ok) operations.push(m);
      }
  return operations;
}

/** Apply a symmetry operation to a fractional position and wrap it back into the cell. */
export function applyOperation(operation: CrystalOperation, fractional: Vec3): Vec3 {
  const m = operation.rotation, t = operation.translation;
  return wrapFractional([0, 1, 2].map(axis => m[axis][0] * fractional[0] + m[axis][1] * fractional[1] + m[axis][2] * fractional[2] + t[axis]) as Vec3);
}

/**
 * Does this operation map the structure onto itself? Exact up to `tolerance` in fractional
 * space, and species-aware, so a rotation that permutes different elements does not count.
 */
export function mapsOntoSelf(structure: CrystalStructure, operation: CrystalOperation, tolerance = 1e-4): boolean {
  const toleranceSquared = tolerance * tolerance;
  return structure.positions.every((position, index) => {
    const moved = applyOperation(operation, position);
    const species = structure.species[index];
    return structure.positions.some((candidate, other) =>
      structure.species[other] === species && fractionalDistanceSquared(moved, candidate) <= toleranceSquared);
  });
}

/** For each site, the index it is sent to (or −1 when the operation leaves the cell). */
export function siteMapping(structure: CrystalStructure, operation: CrystalOperation, tolerance = 1e-4): number[] {
  const toleranceSquared = tolerance * tolerance;
  return structure.positions.map((position, index) => {
    const moved = applyOperation(operation, position);
    const species = structure.species[index];
    for (let other = 0; other < structure.positions.length; other++) {
      if (structure.species[other] !== species) continue;
      if (fractionalDistanceSquared(moved, structure.positions[other]) <= toleranceSquared) return other;
    }
    return -1;
  });
}

/** Group sites into symmetry orbits under a list of operations. */
export function symmetryOrbits(structure: CrystalStructure, operations: CrystalOperation[], tolerance = 1e-4): number[][] {
  const used = new Set<number>();
  const orbits: number[][] = [];
  for (let seed = 0; seed < structure.positions.length; seed++) {
    if (used.has(seed)) continue;
    const orbit = new Set<number>();
    const queue = [seed];
    while (queue.length) {
      const index = queue.pop()!;
      if (orbit.has(index)) continue;
      orbit.add(index);
      for (const operation of operations) {
        const target = siteMapping(structure, operation, tolerance)[index];
        if (target >= 0 && !orbit.has(target)) queue.push(target);
      }
    }
    orbit.forEach(index => used.add(index));
    orbits.push([...orbit].sort((a, b) => a - b));
  }
  return orbits;
}

/** Bounding box of the Cartesian sites, plus the cell corners, in ångström. */
export function structureBounds(structure: CrystalStructure): { min: Vec3; max: Vec3; centre: Vec3; extent: number } {
  const points: Vec3[] = structure.positions.map(position => fractionalToCartesian(position, structure.lattice));
  const corners: Vec3[] = [];
  for (const i of [0, 1]) for (const j of [0, 1]) for (const k of [0, 1]) corners.push(fractionalToCartesian([i, j, k], structure.lattice));
  for (const corner of corners) points.push(corner);
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const point of points) for (let axis = 0; axis < 3; axis++) { min[axis] = Math.min(min[axis], point[axis]); max[axis] = Math.max(max[axis], point[axis]); }
  const centre: Vec3 = [0, 1, 2].map(axis => (min[axis] + max[axis]) / 2) as Vec3;
  return { min, max, centre, extent: Math.max(...[0, 1, 2].map(axis => max[axis] - min[axis]), 1e-3) };
}

/** Shortest non-zero interatomic distance, used to scale balls so they never fuse. */
export function shortestDistance(positions: Vec3[], lattice: Lattice): number {
  let shortest = Infinity;
  for (let i = 0; i < positions.length; i++) for (let j = i + 1; j < positions.length; j++) {
    const distance = periodicDistance(positions[i], positions[j], lattice);
    if (distance > 1e-6 && distance < shortest) shortest = distance;
  }
  if (Number.isFinite(shortest)) return shortest;
  return Math.min(...lattice.map(vector => Math.hypot(...vector))) * .25;
}

function dot(a: Vec3, b: Vec3): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function determinant(a: Vec3, b: Vec3, c: Vec3): number { return dot(a, cross(b, c)); }
function normalize(v: Vec3): Vec3 { const n = Math.hypot(...v) || 1; return [v[0] / n, v[1] / n, v[2] / n]; }

/** The lattice as a 3×3 matrix whose columns are the cell vectors (fractional → Cartesian). */
export function latticeMatrix(lattice: Lattice): number[][] {
  return [
    [lattice[0][0], lattice[1][0], lattice[2][0]],
    [lattice[0][1], lattice[1][1], lattice[2][1]],
    [lattice[0][2], lattice[1][2], lattice[2][2]],
  ];
}
function multiply3(a: number[][], b: number[][]): number[][] {
  return a.map(row => [0, 1, 2].map(column => row[0] * b[0][column] + row[1] * b[1][column] + row[2] * b[2][column]));
}
function inverse3(m: number[][]): number[][] {
  const d = m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  if (Math.abs(d) < 1e-12) throw new Error('Matrix is singular');
  return [
    [(m[1][1] * m[2][2] - m[1][2] * m[2][1]) / d, (m[0][2] * m[2][1] - m[0][1] * m[2][2]) / d, (m[0][1] * m[1][2] - m[0][2] * m[1][1]) / d],
    [(m[1][2] * m[2][0] - m[1][0] * m[2][2]) / d, (m[0][0] * m[2][2] - m[0][2] * m[2][0]) / d, (m[0][2] * m[1][0] - m[0][0] * m[1][2]) / d],
    [(m[1][0] * m[2][1] - m[1][1] * m[2][0]) / d, (m[0][1] * m[2][0] - m[0][0] * m[2][1]) / d, (m[0][0] * m[1][1] - m[0][1] * m[1][0]) / d],
  ];
}
/**
 * The operation's linear part in Cartesian coordinates: `A·R·A⁻¹`. For an operation that
 * preserves the lattice this is an ordinary orthogonal matrix, which is what lets the viewer
 * animate a rotation as a circular arc rather than a chord.
 */
export function cartesianOperation(lattice: Lattice, rotation: number[][]): number[][] {
  const a = latticeMatrix(lattice);
  return multiply3(multiply3(a, rotation), inverse3(a));
}
/** Axis and angle of a proper rotation matrix (det +1). Undefined for the identity. */
export function axisAngle(m: number[][]): { axis: Vec3; angle: number } | undefined {
  const trace = m[0][0] + m[1][1] + m[2][2];
  const angle = Math.acos(Math.max(-1, Math.min(1, (trace - 1) / 2)));
  if (!Number.isFinite(angle) || angle < 1e-7) return undefined;
  const skew: Vec3 = [m[2][1] - m[1][2], m[0][2] - m[2][0], m[1][0] - m[0][1]];
  const sine = Math.sin(angle);
  if (Math.abs(sine) > 1e-6) return { axis: normalize(skew), angle };
  // angle ≈ π: the skew part vanishes, so read the axis from (R + I).
  const candidates: Vec3[] = [[m[0][0] + 1, m[1][0], m[2][0]], [m[0][1], m[1][1] + 1, m[2][1]], [m[0][2], m[1][2], m[2][2] + 1]];
  const longest = candidates.reduce((best, row) => Math.hypot(...row) > Math.hypot(...best) ? row : best);
  return { axis: normalize(longest), angle };
}
/** Rodrigues' rotation of a point about an axis through the origin. */
export function rotateAboutAxis(point: Vec3, axis: Vec3, angle: number): Vec3 {
  const [x, y, z] = normalize(axis), c = Math.cos(angle), s = Math.sin(angle);
  const dotp = point[0] * x + point[1] * y + point[2] * z;
  const crossp: Vec3 = [y * point[2] - z * point[1], z * point[0] - x * point[2], x * point[1] - y * point[0]];
  return [
    point[0] * c + crossp[0] * s + x * dotp * (1 - c),
    point[1] * c + crossp[1] * s + y * dotp * (1 - c),
    point[2] * c + crossp[2] * s + z * dotp * (1 - c),
  ];
}

/**
 * The -1 eigenvector of an improper orthogonal matrix `m`: the normal of its mirror plane.
 * `m + I` has rank two for a reflection, so the cross product of its two most independent columns
 * is that normal. (Taking the *longest* column of `m + I` instead — an easy mistake — returns a
 * vector lying in the plane, which mislabels and mis-draws every diagonal mirror.)
 */
export function improperNormal(m: number[][]): Vec3 {
  const columns: Vec3[] = [
    [m[0][0] + 1, m[1][0], m[2][0]],
    [m[0][1], m[1][1] + 1, m[2][1]],
    [m[0][2], m[1][2], m[2][2] + 1],
  ];
  const candidates = [cross(columns[0], columns[1]), cross(columns[1], columns[2]), cross(columns[2], columns[0])];
  return normalize(candidates.reduce((best, candidate) => Math.hypot(...candidate) > Math.hypot(...best) ? candidate : best));
}

/**
 * A crystal operation re-expressed as the rigid motion it performs, so it can be animated.
 *
 * A proper operation is a rotation by `angle` about `axis`. An improper orthogonal operation is
 * always a rotoreflection S(θ, n) = R(θ, n)·σ_n — a rotation about `n` composed with a reflection
 * in the plane normal to it — so `axis` is the plane normal and `angle` the spin that goes with it.
 */
export type Isometry = {
  /** Unit axis: the rotation axis, or the mirror-plane normal for an improper operation. */
  axis: Vec3;
  /** Rotation angle for a proper operation, or the rotoreflection angle. */
  angle: number;
  /** True when the map also reflects through the plane normal to `axis`. */
  improper: boolean;
  /** True for the inversion, a rotoreflection by 180° whose axis may be any direction. */
  inversion: boolean;
  /** Screw/glide part, in Cartesian coordinates of the lattice. */
  translation: Vec3;
  /** The identity: no axis, no angle, no translation. */
  trivial: boolean;
};

/** Decompose an operation into a rotation or rotoreflection about the origin. */
export function operationIsometry(lattice: Lattice, operation: CrystalOperation): Isometry {
  const m = cartesianOperation(lattice, operation.rotation);
  const trace = m[0][0] + m[1][1] + m[2][2];
  const translation = fractionalToCartesian(operation.translation, lattice);
  const glides = translation.some(value => Math.abs(value) > 1e-12);
  if (determinant(m[0] as Vec3, m[1] as Vec3, m[2] as Vec3) > 0) {
    const rotation = axisAngle(m);
    if (!rotation) return { axis: [0, 0, 1], angle: 0, improper: false, inversion: false, translation, trivial: !glides };
    return { axis: rotation.axis, angle: rotation.angle, improper: false, inversion: false, translation, trivial: false };
  }
  // Inversion has no distinguished axis, so name one; its element is a point, not a line.
  if (trace <= -3 + 1e-6) return { axis: [0, 1, 0], angle: Math.PI, improper: true, inversion: true, translation, trivial: false };
  const axis = improperNormal(m);
  // The trace fixes |θ| only, and a reflection does not distinguish ±n, so the sign of the spin has
  // to come from the antisymmetric part: M - Mᵀ = 2 sin θ · n for S(θ, n) = R(θ, n)·σ_n.
  const skew: Vec3 = [m[2][1] - m[1][2], m[0][2] - m[2][0], m[1][0] - m[0][1]];
  return {
    axis,
    angle: Math.atan2(dot(skew, axis) / 2, (trace + 1) / 2),
    improper: true,
    inversion: false,
    translation,
    trivial: false,
  };
}

/**
 * The motion of `operationIsometry`, evaluated part-way: the identity at t = 0 and the full map at
 * t = 1.
 *
 * Each family performs exactly the geometric move its matrix expresses, rather than an interpolation
 * invented for the occasion:
 *
 * - a proper rotation turns about the operation's own axis, by the angle of the matrix;
 * - a mirror is a reflection, so the site travels straight through the plane;
 * - an inversion is a point operation, so the site travels straight through the centre;
 * - a roto-reflection is two moves in sequence — first the rotation about the axis, then the
 *   reflection in the plane normal to it — because that is literally how `R(θ, n)·σ_n` acts. At the
 *   halfway point the rotation is complete and the fold has not begun.
 */
export function isometryPoint(isometry: Isometry, point: Vec3, t: number): Vec3 {
  if (isometry.trivial) return point;
  const { axis, angle, improper, inversion, translation } = isometry;
  let moved: Vec3;
  if (inversion) {
    moved = [point[0] * (1 - 2 * t), point[1] * (1 - 2 * t), point[2] * (1 - 2 * t)];
  } else if (!improper) {
    moved = rotateAboutAxis(point, axis, angle * t);
  } else if (Math.abs(angle) < 1e-9) {
    const through = 2 * t * dot(point, axis);
    moved = [point[0] - through * axis[0], point[1] - through * axis[1], point[2] - through * axis[2]];
  } else {
    const spun = rotateAboutAxis(point, axis, angle * Math.min(1, 2 * t));
    const through = 2 * Math.max(0, 2 * t - 1) * dot(spun, axis);
    moved = [spun[0] - through * axis[0], spun[1] - through * axis[1], spun[2] - through * axis[2]];
  }
  return [moved[0] + translation[0] * t, moved[1] + translation[1] * t, moved[2] + translation[2] * t];
}

/**
 * Where an animation should leave `point`: the operation's own image, slid back into the cell
 * centred on the origin only when it falls outside. A cubic cell maps onto itself under its whole
 * point group, so there the correction is identically zero and every atom travels its true arc.
 */
export function isometryTarget(isometry: Isometry, point: Vec3, lattice: Lattice): Vec3 {
  const image = isometryPoint(isometry, point, 1);
  const fractional = cartesianToFractional(image, lattice);
  // The tolerance matters: a cubic image lands exactly on a box face (fractional ±1/2) all the
  // time, and treating 0.5 + 4e-8 as "outside" would shove that atom a whole cell sideways.
  const delta: Vec3 = [0, 1, 2].map(axis => Math.abs(fractional[axis]) <= .5 + 1e-6 ? 0 : -Math.round(fractional[axis])) as Vec3;
  if (!delta.some(value => value !== 0)) return image;
  const shift = fractionalToCartesian(delta, lattice);
  return [image[0] + shift[0], image[1] + shift[1], image[2] + shift[2]];
}
/** True when the cell is cubic to within a relative tolerance (angles in degrees). */
export function isCubic(lattice: Lattice, tolerance = 1e-2): boolean {
  const lengths = lattice.map(vector => Math.hypot(...vector));
  const equalLengths = Math.max(...lengths) - Math.min(...lengths) <= tolerance * Math.max(...lengths);
  const orthogonal = [cross(lattice[0], lattice[1]), cross(lattice[1], lattice[2]), cross(lattice[2], lattice[0])]
    .every((vector, axis) => Math.abs(dot(normalize(vector), normalize(lattice[axis]))) <= tolerance);
  return equalLengths && orthogonal;
}

