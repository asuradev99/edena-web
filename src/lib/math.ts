export type Vec3 = [number, number, number];
export type Color = [number, number, number, number];
export const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const length = (v: Vec3) => Math.hypot(...v);
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
export const dot = (a: Vec3, b: Vec3): number => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
export const normalize = (v: Vec3): Vec3 => { const n = length(v) || 1; return [v[0]/n, v[1]/n, v[2]/n]; };
export const identity = () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
export function multiply(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let c=0;c<4;c++) for (let r=0;r<4;r++) for (let k=0;k<4;k++) out[c*4+r] += a[k*4+r]*b[c*4+k];
  return out;
}
/** A rotation about one world axis, as a column-major 4×4. */
function axialRotation(axis: 0 | 1 | 2, angle: number): Float32Array {
  const c = Math.cos(angle), s = Math.sin(angle), m = identity();
  if (axis === 0) { m[5] = c; m[6] = s; m[9] = -s; m[10] = c; }
  else if (axis === 1) { m[0] = c; m[2] = -s; m[8] = s; m[10] = c; }
  else { m[0] = c; m[1] = s; m[4] = -s; m[5] = c; }
  return m;
}
/**
 * An Euler rotation, applied x then y then z. `rotation` on a `Visual` or `Group` turns about +y only;
 * this is for everything else — tumbling a shape, tilting a plane — and composes on top of it.
 */
export function orientationMatrix(orientation: Vec3): Float32Array {
  if (!orientation.every(Number.isFinite)) throw new Error('Orientation must be finite');
  const [x, y, z] = orientation;
  return multiply(multiply(axialRotation(2, z), axialRotation(1, y)), axialRotation(0, x));
}
/** Apply a 4×4 to a point, including its translation. Handy for placing a label on a transformed node. */
export function applyMatrix(matrix: Float32Array, point: Vec3): Vec3 {
  return [0, 1, 2].map(row => matrix[row] * point[0] + matrix[4 + row] * point[1] + matrix[8 + row] * point[2] + matrix[12 + row]) as Vec3;
}
export function transform(position: Vec3, scale: Vec3, rotation: number, orientation?: Vec3): Float32Array {
  // Scale first (the columns carry it), then the rotations, then the translation — the order the
  // original y-only form used, so passing no orientation is exactly the old behaviour.
  const m = orientation ? multiply(axialRotation(1, rotation), orientationMatrix(orientation)) : axialRotation(1, rotation);
  for (let column = 0; column < 3; column++) for (let row = 0; row < 3; row++) m[column * 4 + row] *= scale[column];
  m[12] = position[0]; m[13] = position[1]; m[14] = position[2];
  return m;
}
export function rgba(hex: string, alpha = 1): Color {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error('Color must be #rrggbb');
  const n=parseInt(hex.slice(1),16); return [(n>>16)/255, ((n>>8)&255)/255, (n&255)/255, clamp(alpha)];
}
