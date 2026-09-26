/**
 * What is standing in front of a point.
 *
 * Labels are DOM overlays, so the browser draws them over the canvas whatever the depth buffer says.
 * This module answers the missing question — *is anything between the camera and this anchor?* — on
 * the CPU, from the same world matrices the renderer uses. That keeps it independent of the render
 * pipeline: it works with MSAA on (the multisampled depth buffer cannot be read back), it needs no
 * extra pass, and it is a pure function of the scene, so it is testable without a GPU.
 *
 * The test is a ray from the camera through the label's own pixel. Each object contributes a cheap
 * volume first (a sphere when the geometry really is one, otherwise its local box) and, if that is
 * hit, a bounded sample of its triangles. Sampling matters for curved meshes: a box drawn around a
 * *sphere* would hide a label sitting on the sphere's near surface, while a sample of the actual
 * triangles does not. A small relative bias absorbs the floating-point difference between a label
 * anchored exactly on a surface and the surface itself.
 *
 * Cost is bounded by the caller: several ray tests per object pair, and the label layer probes a
 * slice of its labels each frame rather than all of them.
 */
import { type Vec3, dot, length, sub } from './math.js';
import type { Geometry } from './geometry.js';
import type { OrbitCamera } from './camera.js';

export type Occluder = { geometry: Geometry; matrix: Float32Array };
/** A ray from the camera through a pixel, with the distance along it to the thing being tested. */
export type Probe = { origin: Vec3; direction: Vec3; distance: number };

export type OcclusionOptions = {
  /** How much closer than the anchor a hit must be to count, as a fraction of its distance. */
  bias?: number;
  /** Triangles tested per object before giving up; the mesh is strided down to this many. */
  triangles?: number;
};

/** The most triangles sampled per object. Enough to close a curved silhouette, cheap enough per frame. */
const TRIANGLE_BUDGET = 160;

type Info = {
  /** Local box, the quick reject for every probe. */
  min: Vec3;
  max: Vec3;
  /** Set when every vertex sits on one sphere: then the sphere is exact and the box is not used. */
  sphere?: { centre: Vec3; radius: number };
  /** Decimated triangle corners, three vertices per triangle. */
  samples?: Float32Array;
  triangles: number;
};

const cache = new WeakMap<Geometry, Info>();

/** Build (once per geometry) the volumes and the decimated triangle sample used by every probe. */
export function occluderInfo(geometry: Geometry): Info {
  const known = cache.get(geometry);
  if (known) return known;
  const v = geometry.vertices;
  const count = Math.floor(v.length / 3);
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  const centre: Vec3 = [0, 0, 0];
  for (let i = 0; i < count; i++) {
    for (let axis = 0; axis < 3; axis++) {
      const value = v[i * 3 + axis] as number;
      if (value < min[axis]) min[axis] = value;
      if (value > max[axis]) max[axis] = value;
      centre[axis] += value;
    }
  }
  if (count === 0) {
    const empty: Info = { min: [0, 0, 0], max: [0, 0, 0], triangles: 0 };
    cache.set(geometry, empty);
    return empty;
  }
  for (let axis = 0; axis < 3; axis++) centre[axis] /= count;
  // A shell whose vertices all sit at the same distance from their centroid is sphere-*like*, and a
  // sphere test is tighter and cheaper than any box — use it for `sphere`/`wireSphere`/`shadedSphere`.
  // Uniform radius is not sufficient on its own: the eight corners of a cube are equidistant from its
  // centre too. A sphere also spreads its vertices over the whole solid angle, so count the distinct
  // directions as well, and require enough of them to call it a sphere.
  let mean = 0, spread = 0;
  const directions = new Set<string>();
  for (let i = 0; i < count; i++) {
    const dx = v[i * 3] as number, dy = v[i * 3 + 1] as number, dz = v[i * 3 + 2] as number;
    const rx = dx - centre[0], ry = dy - centre[1], rz = dz - centre[2];
    const r = Math.sqrt(rx * rx + ry * ry + rz * rz);
    mean += r;
    if (r > spread) spread = r;
    if (r > 1e-9) directions.add(`${Math.round(rx / r * 3)},${Math.round(ry / r * 3)},${Math.round(rz / r * 3)}`);
  }
  mean /= count;
  const sphere = count >= 16 && mean > 0 && spread / mean < 1.05 && directions.size >= 24
    ? { centre, radius: spread }
    : undefined;

  // Decimate the triangle list: a structured surface sampled uniformly still closes its silhouette.
  const triangles = Math.floor(count / 3);
  const take = Math.max(1, Math.min(triangles, TRIANGLE_BUDGET));
  const stride = Math.max(1, Math.ceil(triangles / take));
  const kept = Math.ceil(triangles / stride);
  const samples = new Float32Array(kept * 9);
  let out = 0;
  for (let t = 0; t < triangles; t += stride) {
    for (let corner = 0; corner < 3; corner++) {
      for (let axis = 0; axis < 3; axis++) samples[out++] = v[(t * 3 + corner) * 3 + axis] as number;
    }
  }
  const info: Info = { min, max, sphere, samples: samples.length ? samples : undefined, triangles };
  cache.set(geometry, info);
  return info;
}

/** Invert an affine matrix (the library never builds a projective one). */
export function invertAffine(m: Float32Array): Float32Array {
  const a = m[0] as number, b = m[4] as number, c = m[8] as number;
  const d = m[1] as number, e = m[5] as number, f = m[9] as number;
  const g = m[2] as number, h = m[6] as number, i = m[10] as number;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (!Number.isFinite(det) || Math.abs(det) < 1e-20) return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const inv = 1 / det;
  const out = new Float32Array(16);
  out[0] = (e * i - f * h) * inv; out[4] = (c * h - b * i) * inv; out[8] = (b * f - c * e) * inv;
  out[1] = (f * g - d * i) * inv; out[5] = (a * i - c * g) * inv; out[9] = (c * d - a * f) * inv;
  out[2] = (d * h - e * g) * inv; out[6] = (b * g - a * h) * inv; out[10] = (a * e - b * d) * inv;
  const tx = m[12] as number, ty = m[13] as number, tz = m[14] as number;
  out[12] = -(out[0] * tx + out[4] * ty + out[8] * tz);
  out[13] = -(out[1] * tx + out[5] * ty + out[9] * tz);
  out[14] = -(out[2] * tx + out[6] * ty + out[10] * tz);
  out[15] = 1;
  return out;
}

/** Nearest positive intersection with a sphere, or `undefined`. */
export function raySphere(origin: Vec3, direction: Vec3, centre: Vec3, radius: number): number | undefined {
  const ox = origin[0] - centre[0], oy = origin[1] - centre[1], oz = origin[2] - centre[2];
  const a = dot(direction, direction);
  const b = 2 * (ox * direction[0] + oy * direction[1] + oz * direction[2]);
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return undefined;
  const root = Math.sqrt(disc);
  const near = (-b - root) / (2 * a);
  const far = (-b + root) / (2 * a);
  if (near > 0) return near;
  if (near <= 0 && far > 0) return 0;                 // the probe starts inside the sphere
  return undefined;
}

/** Nearest intersection with an axis-aligned box, or `undefined`. A probe inside it counts as zero. */
export function rayBox(origin: Vec3, direction: Vec3, min: Vec3, max: Vec3): number | undefined {
  let enter = 0, exit = Infinity;
  for (let axis = 0; axis < 3; axis++) {
    const o = origin[axis] as number, d = direction[axis] as number;
    const lo = min[axis] as number, hi = max[axis] as number;
    if (Math.abs(d) < 1e-12) {
      if (o < lo || o > hi) return undefined;
      continue;
    }
    let t0 = (lo - o) / d, t1 = (hi - o) / d;
    if (t0 > t1) { const swap = t0; t0 = t1; t1 = swap; }
    if (t0 > enter) enter = t0;
    if (t1 < exit) exit = t1;
    if (enter > exit) return undefined;
  }
  return exit < 0 ? undefined : enter;
}

/** Möller–Trumbore, double sided: a mesh wound either way still hides what is behind it. */
export function rayTriangle(origin: Vec3, direction: Vec3, a: Vec3, b: Vec3, c: Vec3): number | undefined {
  const e1: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const px = direction[1] * e2[2] - direction[2] * e2[1];
  const py = direction[2] * e2[0] - direction[0] * e2[2];
  const pz = direction[0] * e2[1] - direction[1] * e2[0];
  const det = e1[0] * px + e1[1] * py + e1[2] * pz;
  if (Math.abs(det) < 1e-14) return undefined;
  const inv = 1 / det;
  const t0: Vec3 = [origin[0] - a[0], origin[1] - a[1], origin[2] - a[2]];
  const u = (t0[0] * px + t0[1] * py + t0[2] * pz) * inv;
  if (u < -1e-9 || u > 1 + 1e-9) return undefined;
  const qx = t0[1] * e1[2] - t0[2] * e1[1];
  const qy = t0[2] * e1[0] - t0[0] * e1[2];
  const qz = t0[0] * e1[1] - t0[1] * e1[0];
  const v = (direction[0] * qx + direction[1] * qy + direction[2] * qz) * inv;
  if (v < -1e-9 || u + v > 1 + 1e-9) return undefined;
  const t = (e2[0] * qx + e2[1] * qy + e2[2] * qz) * inv;
  return t > 1e-9 ? t : undefined;
}

/**
 * Nearest distance along `probe` at which `occluder` is hit, in world units, or `Infinity`.
 *
 * The probe is moved into the object's own frame, which is why the direction is *not* renormalised:
 * an affine map sends `o + t d` to `M⁻¹o + t M⁻¹d`, so `t` means the same distance on both sides.
 */
export function occluderDistance(occluder: Occluder, probe: Probe, limit: number, triangles = TRIANGLE_BUDGET): number {
  const info = occluderInfo(occluder.geometry);
  if (!info.samples && !info.sphere) return Infinity;
  const inverse = invertAffine(occluder.matrix);
  const o: Vec3 = [
    inverse[0]! * probe.origin[0] + inverse[4]! * probe.origin[1] + inverse[8]! * probe.origin[2] + inverse[12]!,
    inverse[1]! * probe.origin[0] + inverse[5]! * probe.origin[1] + inverse[9]! * probe.origin[2] + inverse[13]!,
    inverse[2]! * probe.origin[0] + inverse[6]! * probe.origin[1] + inverse[10]! * probe.origin[2] + inverse[14]!,
  ];
  const d: Vec3 = [
    inverse[0]! * probe.direction[0] + inverse[4]! * probe.direction[1] + inverse[8]! * probe.direction[2],
    inverse[1]! * probe.direction[0] + inverse[5]! * probe.direction[1] + inverse[9]! * probe.direction[2],
    inverse[2]! * probe.direction[0] + inverse[6]! * probe.direction[1] + inverse[10]! * probe.direction[2],
  ];

  // Cheap reject, then the tightest shape available.
  if (rayBox(o, d, info.min, info.max) === undefined) return Infinity;
  if (info.sphere) {
    const hit = raySphere(o, d, info.sphere.centre, info.sphere.radius);
    return hit !== undefined && hit <= limit ? hit : Infinity;
  }
  const samples = info.samples;
  if (!samples) return Infinity;
  const total = Math.floor(samples.length / 9);
  const take = Math.max(1, Math.min(total, triangles));
  const stride = Math.max(1, Math.ceil(total / take));
  let best = Infinity;
  for (let t = 0; t < total; t += stride) {
    const base = t * 9;
    const hit = rayTriangle(
      o, d,
      [samples[base] as number, samples[base + 1] as number, samples[base + 2] as number],
      [samples[base + 3] as number, samples[base + 4] as number, samples[base + 5] as number],
      [samples[base + 6] as number, samples[base + 7] as number, samples[base + 8] as number],
    );
    if (hit !== undefined && hit < best) {
      best = hit;
      if (best <= 0) break;
    }
  }
  return best <= limit ? best : Infinity;
}

/** A probe from `point` to the camera, given the pixel it projects to. */
export function probeFor(camera: OrbitCamera, px: number, py: number, width: number, height: number, point: Vec3): Probe {
  const { origin, direction } = camera.ray(px, py, width, height);
  const distance = (point[0] - origin[0]) * direction[0] + (point[1] - origin[1]) * direction[1] + (point[2] - origin[2]) * direction[2];
  return { origin, direction, distance };
}

/**
 * Is anything in `occluders` closer to the camera than the probe's own anchor?
 *
 * The bias is relative to the anchor's distance, so a label sitting exactly on a surface — the usual
 * case in these demos — is not hidden by the surface it is written on.
 */
export function occluded(probe: Probe, occluders: readonly Occluder[], options: OcclusionOptions = {}): boolean {
  const bias = options.bias ?? 0.02;
  const limit = probe.distance * (1 - bias);
  if (!(limit > 0) || occluders.length === 0) return false;
  const triangles = options.triangles ?? TRIANGLE_BUDGET;
  for (const occluder of occluders) {
    if (occluderDistance(occluder, probe, limit, triangles) < limit) return true;
  }
  return false;
}
