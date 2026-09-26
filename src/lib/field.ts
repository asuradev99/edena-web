import { Geometry } from './geometry.js';
import type { Vec3 } from './math.js';

/** Axis-aligned sampling domain for a scalar field. */
export type FieldBounds = { min: Vec3; max: Vec3 };
export type IsosurfaceOptions = { maxSamples?: number };

/** The six Kuhn tetrahedra share cell corners 0 and 7, so a cube tiles without gaps. */
const TETS = [[0, 1, 3, 7], [0, 1, 5, 7], [0, 2, 3, 7], [0, 2, 6, 7], [0, 4, 5, 7], [0, 4, 6, 7]];
const TET_EDGES = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];

/** For each 4-bit inside mask, the tetra edges to walk as triangles (one triangle for 1/3, two for 2). */
const TET_TABLE: number[][][] = Array.from({ length: 16 }, (_, mask) => {
  const count = ((mask & 1) ? 1 : 0) + ((mask & 2) ? 1 : 0) + ((mask & 4) ? 1 : 0) + ((mask & 8) ? 1 : 0);
  if (count === 0 || count === 4) return [];
  if (count === 1 || count === 3) {
    const lone = [0, 1, 2, 3].find(i => Boolean(mask & (1 << i)) === (count === 1))!;
    return TET_EDGES.filter(([a, b]) => (a === lone) !== (b === lone));
  }
  const on = [0, 1, 2, 3].filter(i => mask & (1 << i)), off = [0, 1, 2, 3].filter(i => !(mask & (1 << i)));
  const cycle = [[on[0], off[0]], [off[0], on[1]], [on[1], off[1]], [off[1], on[0]]];
  return [cycle[0], cycle[1], cycle[2], cycle[0], cycle[2], cycle[3]];
});

function edgePoint(out: number[], p: Vec3, pv: number, q: Vec3, qv: number, iso: number): void {
  const t = (iso - pv) / (qv - pv);
  out.push(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t);
}

/**
 * Extract the level surface w = isovalue from a scalar callback by marching tetrahedra.
 * A non-finite sample suppresses the cells that touch it; triangle order is deterministic.
 * Extraction is separate from rendering: this returns plain geometry and never touches the GPU.
 */
export function isosurface(field: (x: number, y: number, z: number) => number, bounds: FieldBounds, isovalue = 0, resolution: number | [number, number, number] = 32, options: IsosurfaceOptions = {}): Geometry {
  const [nx, ny, nz] = typeof resolution === 'number' ? [resolution, resolution, resolution] : resolution;
  const maxSamples = options.maxSamples ?? 250_000;
  if (!Number.isFinite(isovalue)) throw new Error('Isovalue must be finite');
  if (![nx, ny, nz].every(n => Number.isInteger(n) && n > 0)) throw new Error('Resolution must be positive integers');
  if (![...bounds.min, ...bounds.max].every(Number.isFinite) || bounds.max.some((v, i) => v <= bounds.min[i])) throw new Error('Field bounds must be finite and increasing');
  if (!Number.isInteger(maxSamples) || maxSamples < 8) throw new Error('Sample budget must be an integer of at least 8');
  const sx = nx + 1, sy = ny + 1, sz = nz + 1;
  if (sx * sy * sz > maxSamples) throw new Error('Field resolution exceeds sample budget');
  const hx = (bounds.max[0] - bounds.min[0]) / nx, hy = (bounds.max[1] - bounds.min[1]) / ny, hz = (bounds.max[2] - bounds.min[2]) / nz;
  const values = new Float64Array(sx * sy * sz);
  for (let k = 0; k < sz; k++) for (let j = 0; j < sy; j++) for (let i = 0; i < sx; i++)
    values[i + sx * (j + sy * k)] = field(bounds.min[0] + i * hx, bounds.min[1] + j * hy, bounds.min[2] + k * hz);
  const out: number[] = [];
  const corner: Vec3[] = Array.from({ length: 8 }, () => [0, 0, 0]);
  const value = new Float64Array(8);
  const offsets = Array.from({ length: 8 }, (_, c) => (c & 1) + sx * (((c >> 1) & 1) + sy * ((c >> 2) & 1)));
  const x = Float64Array.from({ length: sx }, (_, i) => bounds.min[0] + i * hx);
  const y = Float64Array.from({ length: sy }, (_, j) => bounds.min[1] + j * hy);
  const z = Float64Array.from({ length: sz }, (_, k) => bounds.min[2] + k * hz);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    let finite = true, inside = 0;
    const base = i + sx * (j + sy * k);
    for (let c = 0; c < 8; c++) {
      const sample = values[base + offsets[c]];
      value[c] = sample;
      if (!Number.isFinite(sample)) finite = false;
      if (sample > isovalue) inside |= 1 << c;
    }
    // Most cells do not touch the surface. Skip them before constructing corner positions
    // or visiting tetrahedra; the eight corner vectors are reused for crossing cells.
    if (!finite || inside === 0 || inside === 255) continue;
    for (let c = 0; c < 8; c++) {
      const point = corner[c];
      point[0] = x[i + (c & 1)];
      point[1] = y[j + ((c >> 1) & 1)];
      point[2] = z[k + ((c >> 2) & 1)];
    }
    for (const tet of TETS) {
      const mask = (value[tet[0]] > isovalue ? 1 : 0) | (value[tet[1]] > isovalue ? 2 : 0) | (value[tet[2]] > isovalue ? 4 : 0) | (value[tet[3]] > isovalue ? 8 : 0);
      // A crossing edge is the linear interpolation between opposite-side corners.
      for (const [u, v] of TET_TABLE[mask]) edgePoint(out, corner[tet[u]], value[tet[u]], corner[tet[v]], value[tet[v]], isovalue);
    }
  }
  return new Geometry(out);
}
