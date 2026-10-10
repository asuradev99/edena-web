import { Geometry, arrow, merge, polyline, lineSegments } from './geometry.js';
import { clamp } from './math.js';
import { number as mathNumber } from './mathtext.js';
/** Smallest round step (1, 2 or 5 times a power of ten) fitting `count` intervals into `span`. */
export function niceStep(span, count) {
    if (!Number.isFinite(span) || span <= 0)
        throw new Error('Span must be positive and finite');
    if (!Number.isInteger(count) || count < 1)
        throw new Error('Tick count must be a positive integer');
    const raw = span / count, power = 10 ** Math.floor(Math.log10(raw)), error = raw / power;
    return (error >= 5 ? 5 : error >= 2 ? 2 : 1) * power;
}
/** Round tick values inside a finite increasing range; endpoints appear when the step divides them. */
export function tickValues(min, max, count = 6) {
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min)
        throw new Error('Tick range must be finite and increasing');
    const step = niceStep(max - min, count), first = Math.ceil(min / step - 1e-9), last = Math.floor(max / step + 1e-9), out = [];
    for (let i = first; i <= last; i++)
        out.push(Math.abs(i * step) < step * 1e-9 ? 0 : i * step);
    return out;
}
/** Decimals needed to print a tick of this step size without floating-point noise. */
export function tickDecimals(step) {
    if (!(step > 0) || !Number.isFinite(step))
        throw new Error('Tick step must be positive and finite');
    return Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
}
/** The same tick as MathML: a real minus, grouped digits, and an exponent when the value needs one. */
export function tickMath(value, step) {
    const clean = Math.abs(value) < step * 1e-9 ? 0 : value;
    return mathNumber(clean, tickDecimals(step));
}
/** Fixed-decimal rendering that hides binary floating-point noise for a given tick step. */
export function formatTick(value, step) {
    const clean = Math.abs(value) < step * 1e-9 ? 0 : value, decimals = tickDecimals(step);
    const magnitude = Math.abs(clean);
    if (clean !== 0 && (magnitude >= 1e5 || magnitude < 10 ** -decimals)) {
        // Plain text has no superscripts, so an extreme tick becomes scientific notation, still with U+2212.
        const exponent = Math.floor(Math.log10(magnitude));
        return `${clean < 0 ? '\u2212' : ''}${(magnitude / 10 ** exponent).toFixed(1)}\u00d710^${exponent}`;
    }
    return clean.toFixed(decimals).replace('-', '\u2212');
}
/** Cartesian axes, ticks, an optional grid, and text anchors for a y = f(x) plot. */
export function plotFrame(x, y, options = {}) {
    const { xTicks = 6, yTicks = 5, width = .008, tickSize = .05, grid = true, gridWidth = 1.8, minor = 5, xTitle, yTitle } = options;
    if (![...x, ...y].every(Number.isFinite) || x[1] <= x[0] || y[1] <= y[0])
        throw new Error('Plot frame needs finite increasing ranges');
    if (!(width > 0) || !(tickSize > 0))
        throw new Error('Invalid plot frame line width or tick size');
    if (minor !== false && (!Number.isInteger(minor) || minor < 2))
        throw new Error('Minor ticks take an integer division of at least 2');
    const xs = tickValues(x[0], x[1], xTicks), ys = tickValues(y[0], y[1], yTicks);
    const xStep = niceStep(x[1] - x[0], xTicks), yStep = niceStep(y[1] - y[0], yTicks);
    const originX = clamp(0, x[0], x[1]), originY = clamp(0, y[0], y[1]);
    const axes = merge(arrow([x[0], originY, 0], [x[1], originY, 0], width), arrow([originX, y[0], 0], [originX, y[1], 0], width));
    const ticks = lineSegments([
        ...xs.flatMap(v => [[v, originY - tickSize, 0], [v, originY + tickSize, 0]]),
        ...ys.flatMap(v => [[originX - tickSize, v, 0], [originX + tickSize, v, 0]]),
    ], gridWidth);
    const grid2d = lineSegments(grid ? [
        ...xs.filter(v => v !== originX).flatMap(v => [[v, y[0], 0], [v, y[1], 0]]),
        ...ys.filter(v => v !== originY).flatMap(v => [[x[0], v, 0], [x[1], v, 0]]),
    ] : [], gridWidth);
    // Minor marks are the divisions a reader counts by: they subdivide the major step exactly, stop
    // short of the major marks, and skip the majors themselves.
    const minorMarks = [], minorLines = [];
    if (minor !== false) {
        const spine = tickSize * .55;
        const subdivide = (values, step, origin, horizontal) => {
            if (values.length < 2)
                return;
            const low = values[0], high = values[values.length - 1];
            const count = Math.round((high - low) / step) * minor;
            for (let index = 0; index <= count; index++) {
                const value = low + (index * step) / minor;
                if (value > high + 1e-9)
                    break;
                if (values.some(major => Math.abs(major - value) < step * 1e-6))
                    continue;
                minorMarks.push(...(horizontal
                    ? [[value, origin - spine, 0], [value, origin + spine, 0]]
                    : [[origin - spine, value, 0], [origin + spine, value, 0]]));
                if (!grid)
                    continue;
                minorLines.push(...(horizontal
                    ? [[value, y[0], 0], [value, y[1], 0]]
                    : [[x[0], value, 0], [x[1], value, 0]]));
            }
        };
        subdivide(xs, xStep, originY, true);
        subdivide(ys, yStep, originX, false);
    }
    const labels = [
        ...xs.map(v => ({ text: formatTick(v, xStep), math: tickMath(v, xStep), position: [v, originY - tickSize, 0], vertical: 'top', offset: [0, 5] })),
        // The origin already carries an x label, so skip a second one on the y axis to avoid overlap.
        ...ys.filter(v => !(v === originY && xs.includes(originX)))
            .map(v => ({ text: formatTick(v, yStep), math: tickMath(v, yStep), position: [originX - tickSize, v, 0], anchor: 'right', offset: [-5, 0] })),
    ];
    const titles = [];
    const title = (value, position) => ({
        text: value.replace(/<[^>]+>/g, ''),
        math: value.startsWith('<') ? value : `<mtext>${value}</mtext>`,
        position,
    });
    // A title sits clear of the tick labels: the x title below the right end of the axis, the y title
    // to the left of its top, which is where a reader looks for them.
    if (xTitle)
        titles.push({ ...title(xTitle, [x[1], originY - tickSize, 0]), anchor: 'right', vertical: 'top', offset: [0, 28] });
    // Above the arrow tip: the tick labels are to the left of the axis, so anything at the top of the
    // axis column would collide with them.
    if (yTitle)
        titles.push({ ...title(yTitle, [originX, y[1] + tickSize, 0]), vertical: 'bottom', offset: [0, -8] });
    return {
        axes, ticks, grid: grid2d, labels, titles,
        minor: lineSegments(minorMarks, gridWidth),
        minorGrid: lineSegments(minorLines, gridWidth),
    };
}
/**
 * The region between a curve and a baseline, as a triangle strip. Shading the area under a curve is
 * the quickest way to make an integral mean something, and it stays one geometry rather than a mesh.
 * Where the function is not finite the strip simply skips that column instead of filling nonsense.
 */
export function areaUnder(fn, x, options = {}) {
    const { baseline = 0, samples = 96 } = options;
    if (!Number.isFinite(x[0]) || !Number.isFinite(x[1]) || x[1] <= x[0])
        throw new Error('Area needs a finite increasing range');
    if (!Number.isInteger(samples) || samples < 2)
        throw new Error('Area needs at least two samples');
    if (typeof baseline === 'number' && !Number.isFinite(baseline))
        throw new Error('Area baseline must be finite');
    const base = (value) => typeof baseline === 'number' ? baseline : baseline(value);
    const out = [];
    const at = (index) => x[0] + (x[1] - x[0]) * index / samples;
    for (let index = 1; index <= samples; index++) {
        const left = at(index - 1), right = at(index);
        const highLeft = fn(left), highRight = fn(right);
        if (![highLeft, highRight, base(left), base(right)].every(Number.isFinite))
            continue;
        const topLeft = [left, highLeft, 0], topRight = [right, highRight, 0];
        const bottomLeft = [left, base(left), 0], bottomRight = [right, base(right), 0];
        out.push(...bottomLeft, ...topLeft, ...topRight, ...bottomLeft, ...topRight, ...bottomRight);
    }
    return new Geometry(out);
}
/** A straight line through `point` with the given slope, drawn across an x range. */
export function lineThrough(point, slope, x, width = .006) {
    if (!Number.isFinite(slope) || !Number.isFinite(point[0]) || !Number.isFinite(point[1]))
        throw new Error('A line needs a finite point and slope');
    const at = (value) => [value, point[1] + slope * (value - point[0]), point[2]];
    return polyline([at(x[0]), at(x[1])], width);
}
/** The slope of the chord from `a` to `b`: the quantity that becomes the derivative as b → a. */
export function secantSlope(fn, a, b) {
    if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(b - a) < 1e-12)
        throw new Error('A secant needs two distinct x values');
    return (fn(b) - fn(a)) / (b - a);
}
/** Three positive-axis arrows, for orienting a 3D plot. */
export function axes3d(size = 1, width = .006) {
    if (!(size > 0) || !(width > 0))
        throw new Error('Invalid axis size or width');
    return merge(arrow([0, 0, 0], [size, 0, 0], width), arrow([0, 0, 0], [0, size, 0], width), arrow([0, 0, 0], [0, 0, size], width));
}
/** Wireframe box outlining a finite 3D domain. */
export function boundsBox(min, max, width = .004) {
    if (![...min, ...max].every(Number.isFinite) || max.some((v, i) => v <= min[i]) || !(width > 0))
        throw new Error('Invalid bounds or width');
    const corners = Array.from({ length: 8 }, (_, i) => [i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]]);
    return merge(...[[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]].map(([a, b]) => polyline([corners[a], corners[b]], width)));
}
/** Sample a function throughout its domain, including interior extrema missed by endpoint checks. */
export function functionRange(fn, domain, samples = 128) {
    if (!domain.every(Number.isFinite) || domain[1] <= domain[0] || !Number.isInteger(samples) || samples < 1 || samples > 100_000)
        throw new Error('Function range needs a finite increasing domain and 1–100000 samples');
    let low = Infinity, high = -Infinity;
    for (let i = 0; i <= samples; i++) {
        const value = fn(domain[0] + (domain[1] - domain[0]) * i / samples);
        if (Number.isFinite(value)) {
            low = Math.min(low, value);
            high = Math.max(high, value);
        }
    }
    if (low === Infinity)
        throw new Error('Function has no finite samples');
    return [low, high];
}
/** A planar grid made of antialiased screen-space strokes. */
export function gridPlane(x, y, options = {}) {
    const { plane = 'xy', offset = 0, ticks = 10, width = 1.8 } = options;
    const point = (u, v) => plane === 'xy' ? [u, v, offset] : plane === 'xz' ? [u, offset, v] : [offset, u, v];
    const points = [];
    for (const value of tickValues(...x, ticks))
        points.push(point(value, y[0]), point(value, y[1]));
    for (const value of tickValues(...y, ticks))
        points.push(point(x[0], value), point(x[1], value));
    return lineSegments(points, width);
}
//# sourceMappingURL=plot.js.map