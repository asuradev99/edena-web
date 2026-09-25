import { Geometry, arrow, merge, polyline } from './geometry.js';
import { clamp, type Vec3 } from './math.js';
import { number as mathNumber, type M } from './mathtext.js';

/**
 * A world-space point paired with the text a caller renders there.
 *
 * `text` is the plain form, for a caller with no typesetter; `math` is the same label as MathML,
 * which is what a maths-aware caller should prefer — a real minus sign and proper exponents instead
 * of an ASCII approximation.
 */
export type Anchor = { text: string; position: Vec3; math?: M };

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

/** Decimals needed to print a tick of this step size without floating-point noise. */
export function tickDecimals(step: number): number {
  if (!(step > 0) || !Number.isFinite(step)) throw new Error('Tick step must be positive and finite');
  return Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
}

/** The same tick as MathML: a real minus, grouped digits, and an exponent when the value needs one. */
export function tickMath(value: number, step: number): M {
  const clean = Math.abs(value) < step * 1e-9 ? 0 : value;
  return mathNumber(clean, tickDecimals(step));
}

/** Fixed-decimal rendering that hides binary floating-point noise for a given tick step. */
export function formatTick(value: number, step: number): string {
  const clean = Math.abs(value) < step * 1e-9 ? 0 : value, decimals = tickDecimals(step);
  const magnitude = Math.abs(clean);
  if (clean !== 0 && (magnitude >= 1e5 || magnitude < 10 ** -decimals)) {
    // Plain text has no superscripts, so an extreme tick becomes scientific notation, still with U+2212.
    const exponent = Math.floor(Math.log10(magnitude));
    return `${clean < 0 ? '\u2212' : ''}${(magnitude / 10 ** exponent).toFixed(1)}\u00d710^${exponent}`;
  }
  return clean.toFixed(decimals).replace('-', '\u2212');
}

export type PlotFrameOptions = {
  xTicks?: number;
  yTicks?: number;
  width?: number;
  tickSize?: number;
  grid?: boolean;
  /** Divisions between major ticks; `false` turns them off. Five reads well on decimal steps. */
  minor?: number | false;
  /**
   * Labels set past the end of each axis. A plain string is set upright; a MathML fragment (anything
   * starting with `<`) is used as-is, so `mi('x')` gives the italic axis name a reader expects.
   */
  xTitle?: string;
  yTitle?: string;
};
export type PlotFrame = {
  axes: Geometry;
  ticks: Geometry;
  minor: Geometry;
  grid: Geometry;
  minorGrid: Geometry;
  labels: Anchor[];
  titles: Anchor[];
};

/** Cartesian axes, ticks, an optional grid, and text anchors for a y = f(x) plot. */
export function plotFrame(x: [number, number], y: [number, number], options: PlotFrameOptions = {}): PlotFrame {
  const { xTicks = 6, yTicks = 5, width = .008, tickSize = .05, grid = true, minor = 5, xTitle, yTitle } = options;
  if (![...x, ...y].every(Number.isFinite) || x[1] <= x[0] || y[1] <= y[0]) throw new Error('Plot frame needs finite increasing ranges');
  if (!(width > 0) || !(tickSize > 0)) throw new Error('Invalid plot frame line width or tick size');
  if (minor !== false && (!Number.isInteger(minor) || minor < 2)) throw new Error('Minor ticks take an integer division of at least 2');
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
  // Minor marks are the divisions a reader counts by: they subdivide the major step exactly, stop
  // short of the major marks, and skip the majors themselves.
  const minorMarks: Geometry[] = [], minorLines: Geometry[] = [];
  if (minor !== false) {
    const spine = tickSize * .55;
    const subdivide = (values: number[], step: number, origin: number, horizontal: boolean) => {
      if (values.length < 2) return;
      const low = values[0], high = values[values.length - 1];
      const count = Math.round((high - low) / step) * minor;
      for (let index = 0; index <= count; index++) {
        const value = low + (index * step) / minor;
        if (value > high + 1e-9) break;
        if (values.some(major => Math.abs(major - value) < step * 1e-6)) continue;
        minorMarks.push(horizontal
          ? polyline([[value, origin - spine, 0], [value, origin + spine, 0]], width * .7)
          : polyline([[origin - spine, value, 0], [origin + spine, value, 0]], width * .7));
        if (!grid) continue;
        minorLines.push(horizontal
          ? polyline([[value, y[0], 0], [value, y[1], 0]], width * .35)
          : polyline([[x[0], value, 0], [x[1], value, 0]], width * .35));
      }
    };
    subdivide(xs, xStep, originY, true);
    subdivide(ys, yStep, originX, false);
  }
  const labels: Anchor[] = [
    ...xs.map(v => ({ text: formatTick(v, xStep), math: tickMath(v, xStep), position: [v, originY - tickSize * 1.9, 0] as Vec3 })),
    // The origin already carries an x label, so skip a second one on the y axis to avoid overlap.
    ...ys.filter(v => !(v === originY && xs.includes(originY)))
      .map(v => ({ text: formatTick(v, yStep), math: tickMath(v, yStep), position: [originX - tickSize * 1.9, v, 0] as Vec3 })),
  ];
  const titles: Anchor[] = [];
  const title = (value: string, position: Vec3): Anchor => ({
    text: value.replace(/<[^>]+>/g, ''),
    math: value.startsWith('<') ? value : `<mtext>${value}</mtext>`,
    position,
  });
  // A title sits clear of the tick labels: the x title below the right end of the axis, the y title
  // to the left of its top, which is where a reader looks for them.
  if (xTitle) titles.push(title(xTitle, [x[1], originY - tickSize * 4.2, 0]));
  // Above the arrow tip: the tick labels are to the left of the axis, so anything at the top of the
  // axis column would collide with them.
  if (yTitle) titles.push(title(yTitle, [originX, y[1] + tickSize * 5.2, 0]));
  return {
    axes, ticks, grid: grid2d, labels, titles,
    minor: merge(...minorMarks),
    minorGrid: merge(...minorLines),
  };
}

export type AreaOptions = {
  /** The value the strip closes down to: a number, or a function of x for a curved baseline. */
  baseline?: number | ((x: number) => number);
  /** Samples across the range; more gives a smoother edge. */
  samples?: number;
};

/**
 * The region between a curve and a baseline, as a triangle strip. Shading the area under a curve is
 * the quickest way to make an integral mean something, and it stays one geometry rather than a mesh.
 * Where the function is not finite the strip simply skips that column instead of filling nonsense.
 */
export function areaUnder(fn: (x: number) => number, x: [number, number], options: AreaOptions = {}): Geometry {
  const { baseline = 0, samples = 96 } = options;
  if (!Number.isFinite(x[0]) || !Number.isFinite(x[1]) || x[1] <= x[0]) throw new Error('Area needs a finite increasing range');
  if (!Number.isInteger(samples) || samples < 2) throw new Error('Area needs at least two samples');
  if (typeof baseline === 'number' && !Number.isFinite(baseline)) throw new Error('Area baseline must be finite');
  const base = (value: number) => typeof baseline === 'number' ? baseline : baseline(value);
  const out: number[] = [];
  const at = (index: number) => x[0] + (x[1] - x[0]) * index / samples;
  for (let index = 1; index <= samples; index++) {
    const left = at(index - 1), right = at(index);
    const highLeft = fn(left), highRight = fn(right);
    if (![highLeft, highRight, base(left), base(right)].every(Number.isFinite)) continue;
    const topLeft: Vec3 = [left, highLeft, 0], topRight: Vec3 = [right, highRight, 0];
    const bottomLeft: Vec3 = [left, base(left), 0], bottomRight: Vec3 = [right, base(right), 0];
    out.push(...bottomLeft, ...topLeft, ...topRight, ...bottomLeft, ...topRight, ...bottomRight);
  }
  return new Geometry(out);
}

/** A straight line through `point` with the given slope, drawn across an x range. */
export function lineThrough(point: Vec3, slope: number, x: [number, number], width = .006): Geometry {
  if (!Number.isFinite(slope) || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) throw new Error('A line needs a finite point and slope');
  const at = (value: number): Vec3 => [value, point[1] + slope * (value - point[0]), point[2]];
  return polyline([at(x[0]), at(x[1])], width);
}

/** The slope of the chord from `a` to `b`: the quantity that becomes the derivative as b → a. */
export function secantSlope(fn: (x: number) => number, a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(b - a) < 1e-12) throw new Error('A secant needs two distinct x values');
  return (fn(b) - fn(a)) / (b - a);
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
