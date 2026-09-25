export type Vec3 = [number, number, number];
export type Color = [number, number, number, number];
export const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const length = (v: Vec3) => Math.hypot(...v);
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
export const normalize = (v: Vec3): Vec3 => { const n = length(v) || 1; return [v[0]/n, v[1]/n, v[2]/n]; };
export const identity = () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
export function multiply(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let c=0;c<4;c++) for (let r=0;r<4;r++) for (let k=0;k<4;k++) out[c*4+r] += a[k*4+r]*b[c*4+k];
  return out;
}
export function transform(position: Vec3, scale: Vec3, rotation: number): Float32Array {
  const c=Math.cos(rotation), s=Math.sin(rotation), m=identity();
  m[0]=c*scale[0]; m[2]=-s*scale[0]; m[5]=scale[1]; m[8]=s*scale[2]; m[10]=c*scale[2];
  m[12]=position[0]; m[13]=position[1]; m[14]=position[2]; return m;
}
export function rgba(hex: string, alpha = 1): Color {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error('Color must be #rrggbb');
  const n=parseInt(hex.slice(1),16); return [(n>>16)/255, ((n>>8)&255)/255, (n&255)/255, clamp(alpha)];
}
