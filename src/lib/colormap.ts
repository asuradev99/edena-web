import { Geometry } from './geometry.js';

export type Rgb = [number, number, number];

const hex = (value: string): Rgb => {
  const n = parseInt(value.slice(1), 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/** Piecewise-linear color ramp from ordered stops; values outside the stop domain clamp. */
export function ramp(...stops: [number, Rgb][]): (t: number) => Rgb {
  if (stops.length < 2) throw new Error('A color ramp needs at least two stops');
  stops.forEach(([at, color], index) => {
    if (!Number.isFinite(at) || color.length !== 3 || !color.every(Number.isFinite)) throw new Error('Color stops must be finite RGB');
    if (index && at <= stops[index - 1][0]) throw new Error('Color stops must be in increasing order');
  });
  const first = stops[0], last = stops[stops.length - 1];
  return value => {
    const t = Number.isFinite(value) ? value : first[0];
    if (t <= first[0]) return [...first[1]] as Rgb;
    if (t >= last[0]) return [...last[1]] as Rgb;
    for (let i = 1; i < stops.length; i++) {
      if (t > stops[i][0]) continue;
      const [lowAt, low] = stops[i - 1], [highAt, high] = stops[i];
      const f = (t - lowAt) / (highAt - lowAt);
      return [low[0] + (high[0] - low[0]) * f, low[1] + (high[1] - low[1]) * f, low[2] + (high[2] - low[2]) * f];
    }
    return [...last[1]] as Rgb;
  };
}

/** Perceptually uniform sequential ramps, approximated with nine measured stops each. */
export const viridis = ramp(
  [0, hex('#440154')], [.125, hex('#482878')], [.25, hex('#3E4A89')], [.375, hex('#31688E')],
  [.5, hex('#26828E')], [.625, hex('#1F9E89')], [.75, hex('#35B779')], [.875, hex('#6DCD59')], [1, hex('#FDE725')],
);
export const plasma = ramp(
  [0, hex('#0D0887')], [.125, hex('#46039F')], [.25, hex('#7201A8')], [.375, hex('#9C179E')],
  [.5, hex('#BD3786')], [.625, hex('#D8576A')], [.75, hex('#ED7953')], [.875, hex('#FB9F3A')], [1, hex('#F0F921')],
);

/**
 * Sample z = f(x, y) over a rectangular domain and color every vertex by its own value,
 * normalised across the sampled range (or an explicit one). Quads touching a non-finite
 * sample are dropped, matching `functionSurface`. Positions follow `[x, f(x, y), y]`.
 */
export function colorMappedSurface(
  f: (x: number, y: number) => number,
  x: [number, number],
  y: [number, number],
  colorOf: (t: number) => Rgb = viridis,
  resolution: [number, number] = [32, 32],
  range?: [number, number],
): Geometry {
  const [nu, nv] = resolution;
  if (!Number.isInteger(nu) || !Number.isInteger(nv) || nu < 1 || nv < 1 || nu * nv > 250_000) throw new Error('Surface resolution exceeds budget');
  if (![...x, ...y].every(Number.isFinite) || x[1] <= x[0] || y[1] <= y[0]) throw new Error('Surface domain must be finite and increasing');
  const xs = Array.from({ length: nu + 1 }, (_, i) => x[0] + (x[1] - x[0]) * i / nu);
  const ys = Array.from({ length: nv + 1 }, (_, j) => y[0] + (y[1] - y[0]) * j / nv);
  const values = ys.map(py => xs.map(px => f(px, py)));
  let lo: number, hi: number;
  if (range) {
    [lo, hi] = range;
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) throw new Error('Color range must be finite and increasing');
  } else {
    lo = Infinity; hi = -Infinity;
    for (const row of values) for (const value of row) if (Number.isFinite(value)) { if (value < lo) lo = value; if (value > hi) hi = value; }
    if (!Number.isFinite(lo) || hi <= lo) { lo = 0; hi = lo + 1; }
  }
  const positions: number[] = [], colors: number[] = [];
  const vertex = (i: number, j: number) => {
    const value = values[j][i], [r, g, b] = colorOf((value - lo) / (hi - lo));
    positions.push(xs[i], value, ys[j]);
    colors.push(r, g, b);
  };
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    if (![values[j][i], values[j + 1][i], values[j][i + 1], values[j + 1][i + 1]].every(Number.isFinite)) continue;
    vertex(i, j); vertex(i + 1, j); vertex(i, j + 1);
    vertex(i + 1, j); vertex(i + 1, j + 1); vertex(i, j + 1);
  }
  return new Geometry(positions, colors);
}
