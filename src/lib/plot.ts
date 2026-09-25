import { Geometry, arrow, merge, polyline } from './geometry.js';
import { clamp, type Vec3 } from './math.js';

/** A world-space point paired with the text a caller renders there. */
export type Anchor = { text: string; position: Vec3 };

/** Smallest round step (1, 2 or 5 times a power of ten) fitting `count` intervals into `span`. */
export function niceStep(span: number, count: number): number {
  if (!Number.isFinite(span) || span <= 0) throw new Error('Span must be positive and finite');
  if (!Number.isInteger(count) || count < 1) throw new Error('Tick count must be a positive integer');
  const raw = span / count, power = 10 ** Math.floor(Math.log10(raw)), error = raw / power;
  return (error >= 5 ? 5 : error >= 2 ? 2 : 1) * power;
}

/** Round tick values inside a finite increasing range; endpoints appear when the step divides them. */
export function tickValues(min: number, max: number, count = 6): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) throw new Error('Tick range must be finite and increasing');
  const step = niceStep(max - min, count), first = Math.ceil(min / step - 1e-9), last = Math.floor(max / step + 1e-9), out: number[] = [];
  for (let i = first; i <= last; i++) out.push(Math.abs(i * step) < step * 1e-9 ? 0 : i * step);
  return out;
}

/** Fixed-decimal rendering that hides binary floating-point noise for a given tick step. */
export function formatTick(value: number, step: number): string {
  const clean = Math.abs(value) < step * 1e-9 ? 0 : value, decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  return clean.toFixed(decimals);
}

export type PlotFrameOptions = { xTicks?: number; yTicks?: number; width?: number; tickSize?: number; grid?: boolean };
export type PlotFrame = { axes: Geometry; ticks: Geometry; grid: Geometry; labels: Anchor[] };

/** Cartesian axes, ticks, an optional grid, and text anchors for a y = f(x) plot. */
export function plotFrame(x: [number, number], y: [number, number], options: PlotFrameOptions = {}): PlotFrame {
  const { xTicks = 6, yTicks = 5, width = .008, tickSize = .05, grid = true } = options;
  if (![...x, ...y].every(Number.isFinite) || x[1] <= x[0] || y[1] <= y[0]) throw new Error('Plot frame needs finite increasing ranges');
  if (!(width > 0) || !(tickSize > 0)) throw new Error('Invalid plot frame line width or tick size');
  const xs = tickValues(x[0], x[1], xTicks), ys = tickValues(y[0], y[1], yTicks);
  const xStep = niceStep(x[1] - x[0], xTicks), yStep = niceStep(y[1] - y[0], yTicks);
  const originX = clamp(0, x[0], x[1]), originY = clamp(0, y[0], y[1]);
  const axes = merge(arrow([x[0], originY, 0], [x[1], originY, 0], width), arrow([originX, y[0], 0], [originX, y[1], 0], width));
  const ticks = merge(
    ...xs.map(v => polyline([[v, originY - tickSize, 0], [v, originY + tickSize, 0]], width)),
    ...ys.map(v => polyline([[originX - tickSize, v, 0], [originX + tickSize, v, 0]], width)),
  );
  const grid2d = grid
    ? merge(
      ...xs.map(v => polyline([[v, y[0], 0], [v, y[1], 0]], width * .5)),
      ...ys.map(v => polyline([[x[0], v, 0], [x[1], v, 0]], width * .5)),
    )
    : new Geometry([]);
  const labels: Anchor[] = [
    ...xs.map(v => ({ text: formatTick(v, xStep), position: [v, originY - tickSize * 1.6, 0] as Vec3 })),
    // The origin already carries an x label, so skip a second one on the y axis to avoid overlap.
    ...ys.filter(v => !(v === originY && xs.includes(originY))).map(v => ({ text: formatTick(v, yStep), position: [originX - tickSize * 1.6, v, 0] as Vec3 })),
  ];
  return { axes, ticks, grid: grid2d, labels };
}

/** Three positive-axis arrows, for orienting a 3D plot. */
export function axes3d(size = 1, width = .006): Geometry {
  if (!(size > 0) || !(width > 0)) throw new Error('Invalid axis size or width');
  return merge(arrow([0, 0, 0], [size, 0, 0], width), arrow([0, 0, 0], [0, size, 0], width), arrow([0, 0, 0], [0, 0, size], width));
}

/** Wireframe box outlining a finite 3D domain. */
export function boundsBox(min: Vec3, max: Vec3, width = .004): Geometry {
  if (![...min, ...max].every(Number.isFinite) || max.some((v, i) => v <= min[i]) || !(width > 0)) throw new Error('Invalid bounds or width');
  const corners: Vec3[] = Array.from({ length: 8 }, (_, i) => [i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]]);
  return merge(...[[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]].map(([a, b]) => polyline([corners[a], corners[b]], width)));
}
