import test from 'node:test';
import assert from 'node:assert/strict';
import { isosurface, plotFrame, tickValues, niceStep, formatTick, tickMath, tickDecimals, axes3d, boundsBox, areaUnder, lineThrough, secantSlope, Geometry, merge, ramp, viridis, plasma, colorMappedSurface, functionCurve } from '../build/index.js';

/** Colors round-trip through a Float32Array, so compare with a tolerance. */
const closeTo = (a, b, eps = 1e-6) => a.length === b.length && a.every((value, index) => Math.abs(value - b[index]) < eps);

test('tick helpers choose round steps, stay in range, and hide float noise', () => {
  assert.equal(niceStep(10, 5), 2);
  assert.equal(niceStep(1, 3), .2);
  assert.deepEqual(tickValues(0, 10, 5), [0, 2, 4, 6, 8, 10]);
  assert.deepEqual(tickValues(-1, 1, 4), [-1, -.5, 0, .5, 1]);
  for (const count of [3, 4, 5, 6, 7, 8]) {
    const values = tickValues(-3.3, 7.1, count);
    assert.ok(values.length >= 2);
    for (let i = 1; i < values.length; i++) assert.ok(values[i] > values[i - 1]);
    assert.ok(values[0] >= -3.3 && values[values.length - 1] <= 7.1);
  }
  assert.equal(formatTick(0.30000000000000004, .1), '0.3');
  assert.equal(formatTick(-1e-15, 1), '0');
  assert.equal(formatTick(.25, .05), '0.25');
  assert.throws(() => niceStep(0, 5));
  assert.throws(() => niceStep(1, 0));
  assert.throws(() => tickValues(1, 1));
});

test('plot frame builds finite axes, ticks, grid, and one label per tick', () => {
  const frame = plotFrame([-2, 2], [-1, 1]);
  assert.ok([frame.axes, frame.ticks, frame.grid].every(g => g.vertices.length > 0));
  assert.ok([frame.axes, frame.ticks, frame.grid].every(g => g.vertices.every(Number.isFinite)));
  const xs = tickValues(-2, 2, 6), ys = tickValues(-1, 1, 5);
  assert.equal(frame.labels.length, xs.length + ys.length - 1); // the origin is labelled once, not twice
  assert.equal(frame.labels.filter(l => l.text === '0.0').length, 1);
  assert.ok(frame.labels.every(l => Number.isFinite(l.position[0] + l.position[1] + l.position[2])));
  assert.equal(plotFrame([0, 1], [0, 1], { grid: false }).grid.vertices.length, 0);
  // When the clamped origin is not also a tick on the other axis, both labels are kept.
  const offset = plotFrame([.3, 1.7], [2.3, 3.7]);
  assert.equal(offset.labels.length, tickValues(.3, 1.7, 6).length + tickValues(2.3, 3.7, 5).length);
  assert.throws(() => plotFrame([1, 0], [0, 1]));
  assert.throws(() => plotFrame([0, 1], [0, 1], { width: 0 }));
});

test('3D axis and bounds helpers stay finite and reject bad input', () => {
  assert.ok(axes3d(2).vertices.every(Number.isFinite));
  assert.equal(boundsBox([-1, -1, -1], [1, 1, 1]).vertices.length, 12 * 4 * 2 * 9);
  const box = boundsBox([-2, -1, -3], [4, 5, 6], .01).vertices;
  assert.ok(box.every(Number.isFinite));
  // Tube rings expand each edge by half its width, so corners land within that tolerance.
  assert.ok(Math.abs(Math.min(...box.filter((_, i) => i % 3 === 0)) + 2) < .02);
  assert.ok(Math.abs(Math.max(...box.filter((_, i) => i % 3 === 1)) - 5) < .02);
  assert.throws(() => axes3d(0));
  assert.throws(() => boundsBox([1, 0, 0], [0, 1, 1]));
});

test('isosurface reconstructs a unit sphere within linear-interpolation error', () => {
  const bounds = { min: [-1.5, -1.5, -1.5], max: [1.5, 1.5, 1.5] };
  const field = (x, y, z) => x * x + y * y + z * z;
  const g = isosurface(field, bounds, 1, 40);
  assert.ok(g.vertices.length > 0 && g.vertices.length % 9 === 0);
  let area = 0, maxError = 0;
  for (let i = 0; i < g.vertices.length; i += 9) {
    const p = [g.vertices[i], g.vertices[i + 1], g.vertices[i + 2]];
    const q = [g.vertices[i + 3], g.vertices[i + 4], g.vertices[i + 5]];
    const r = [g.vertices[i + 6], g.vertices[i + 7], g.vertices[i + 8]];
    for (const v of [p, q, r]) maxError = Math.max(maxError, Math.abs(Math.hypot(...v) - 1));
    const u = q.map((x, k) => x - p[k]), w = r.map((x, k) => x - p[k]);
    area += .5 * Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]);
  }
  assert.ok(maxError < .01, `max radius error ${maxError}`);
  assert.ok(Math.abs(area / (4 * Math.PI) - 1) < .01, `area relative error ${area / (4 * Math.PI) - 1}`);
  assert.deepEqual(isosurface(field, bounds, 1, 40).vertices, g.vertices);
});

test('isosurface suppresses non-finite samples and validates its budget', () => {
  const bounds = { min: [-1, -1, -1], max: [1, 1, 1] };
  const g = isosurface((x, y, z) => x > .2 ? NaN : x * x + y * y + z * z, bounds, 1, 24);
  assert.ok(g.vertices.length > 0 && g.vertices.every(Number.isFinite));
  assert.equal(isosurface(() => 1, bounds, 5, 8).vertices.length, 0);
  assert.equal(isosurface(() => 1, bounds, -5, 8).vertices.length, 0);
  assert.ok(isosurface((x, y, z) => x + y + z, bounds, 0, [12, 8, 4]).vertices.length > 0);
  assert.throws(() => isosurface(() => 0, bounds, 0, 200));
  assert.throws(() => isosurface(() => 0, bounds, NaN, 8));
  assert.throws(() => isosurface(() => 0, bounds, 0, 0));
  assert.throws(() => isosurface(() => 0, { min: [1, 0, 0], max: [0, 1, 1] }, 0, 8));
});

test('color ramps interpolate between stops and clamp outside them', () => {
  const ramp2 = ramp([0, [0, 0, 0]], [1, [1, .5, .25]]);
  assert.deepEqual(ramp2(0), [0, 0, 0]);
  assert.deepEqual(ramp2(1), [1, .5, .25]);
  assert.deepEqual(ramp2(-5), [0, 0, 0]);
  assert.deepEqual(ramp2(9), [1, .5, .25]);
  const mid = ramp2(.5);
  assert.ok(Math.abs(mid[0] - .5) < 1e-12 && Math.abs(mid[1] - .25) < 1e-12 && Math.abs(mid[2] - .125) < 1e-12);
  assert.deepEqual(ramp2(NaN), [0, 0, 0]);
  for (const value of [0, .25, .5, .75, 1]) {
    for (const ramp3 of [viridis, plasma]) {
      const color = ramp3(value);
      assert.equal(color.length, 3);
      assert.ok(color.every(channel => channel >= 0 && channel <= 1));
    }
  }
  assert.notDeepEqual(viridis(0), viridis(1));
  assert.throws(() => ramp([0, [0, 0, 0]]));
  assert.throws(() => ramp([0, [0, 0, 0]], [0, [1, 1, 1]]));
  assert.throws(() => ramp([0, [0, 0, 0]], [1, [1, 1, NaN]]));
});

test('geometry keeps optional per-vertex colors through merge', () => {
  const plain = new Geometry([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const tinted = new Geometry([0, 0, 0, 1, 0, 0, 0, 1, 0], [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  assert.equal(plain.colors, undefined);
  assert.deepEqual(Array.from(tinted.colors), [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  const merged = merge(plain, tinted);
  assert.equal(merged.colors.length, merged.vertices.length);
  assert.deepEqual(Array.from(merged.colors.slice(0, 9)), Array(9).fill(1));       // uncolored input becomes white
  assert.deepEqual(Array.from(merged.colors.slice(9)), Array.from(tinted.colors));
  assert.equal(merge(plain, plain).colors, undefined);                             // stays uncolored when nothing is colored
  assert.throws(() => new Geometry([0, 0, 0, 1, 0, 0, 0, 1, 0], [1, 0, 0]));
  assert.throws(() => new Geometry([0, 0, 0, 1, 0, 0, 0, 1, 0], Array(9).fill(NaN)));
});

test('color-mapped surfaces color every vertex by its own value', () => {
  const surface = colorMappedSurface((x, y) => x + y, [-1, 1], [-1, 1], viridis, [4, 5]);
  assert.equal(surface.vertices.length, 4 * 5 * 2 * 9);
  assert.equal(surface.colors.length, surface.vertices.length);
  assert.ok(surface.colors.every(channel => channel >= 0 && channel <= 1));
  // Sampled range is [-2, 2]; the lowest value must take the ramp start and the highest its end.
  const perVertex = (index) => Array.from(surface.colors.slice(index * 3, index * 3 + 3));
  const values = [];
  for (let i = 0; i < surface.vertices.length; i += 3) values.push(surface.vertices[i + 1]);
  const lowest = values.indexOf(Math.min(...values)), highest = values.indexOf(Math.max(...values));
  assert.ok(closeTo(perVertex(lowest), viridis(0)));
  assert.ok(closeTo(perVertex(highest), viridis(1)));
  // An explicit range overrides the sampled one.
  const fixed = colorMappedSurface((x, y) => x + y, [-1, 1], [-1, 1], viridis, [4, 5], [-1, 1]);
  assert.ok(closeTo(perVertexOf(fixed, 0), viridis(0)));
  const clipped = colorMappedSurface(() => 0, [-1, 1], [-1, 1], viridis, [2, 2], [0, 1]);
  assert.ok(clipped.colors.every(channel => channel >= 0 && channel <= 1));
  // A constant field must not divide by zero.
  assert.ok(colorMappedSurface(() => 3, [-1, 1], [-1, 1], viridis, [3, 3]).colors.every(Number.isFinite));
  // Non-finite samples drop their quads instead of bridging.
  const gapped = colorMappedSurface((x, y) => x > .2 ? NaN : x + y, [-1, 1], [-1, 1], viridis, [16, 16]);
  assert.ok(gapped.vertices.every(Number.isFinite) && gapped.colors.every(Number.isFinite));
  assert.ok(gapped.vertices.length < 16 * 16 * 2 * 9);
  assert.throws(() => colorMappedSurface((x, y) => x, [1, 0], [-1, 1]));
  assert.throws(() => colorMappedSurface((x, y) => x, [-1, 1], [-1, 1], viridis, [2, 2], [0, 0]));
  assert.throws(() => colorMappedSurface((x, y) => x, [-1, 1], [-1, 1], viridis, [600, 600]));
});

test('functionCurve reaches its documented sample budget instead of tripping the tube cap', () => {
  // At exactly the advertised budget the run is chunked internally; it used to fail inside
  // `polyline` with an unrelated "Invalid line resolution or width" error.
  const curve = functionCurve(x => x, [0, 1], 100_000);
  assert.ok(curve.vertices.length > 0 && curve.vertices.every(Number.isFinite));
  assert.throws(() => functionCurve(x => x, [0, 1], 100_001), /sampling budget/);
});

function perVertexOf(geometry, index) {
  return Array.from(geometry.colors.slice(index * 3, index * 3 + 3));
}

test('tick labels use a real minus sign and hand an exponent to MathML when one is needed', () => {
  assert.equal(formatTick(-1.5, .5), '\u22121.5', 'a hyphen is not a minus');
  assert.equal(formatTick(-1.5, .5).includes('-'), false);
  assert.equal(formatTick(0, 1), '0');
  assert.equal(formatTick(2.5, .5), '2.5');
  assert.equal(formatTick(1.2e6, 1e5), '1.2\u00d710^6', 'plain text cannot do superscripts, so it says so');
  assert.equal(tickDecimals(.5), 1);
  assert.equal(tickDecimals(20), 0);
  assert.throws(() => tickDecimals(0), /positive/);
  // The MathML form keeps the exponent as an exponent.
  assert.match(tickMath(-1500, 1000), /<mo>\u2212<\/mo>/);
  assert.match(tickMath(1.2e6, 1e5), /<msup><mn>10<\/mn><mn>6<\/mn><\/msup>/);
});

test('the plot frame gains minor marks that stay inside their spine and titles outside the box', () => {
  const frame = plotFrame([-3, 3], [-2, 4], { xTicks: 6, yTicks: 6, tickSize: .05, xTitle: 'x', yTitle: 'f(x)' });
  assert.ok(frame.minor.vertices.length > 0, 'minor marks exist');
  assert.ok(frame.minorGrid.vertices.length > 0, 'minor gridlines exist when the grid is on');
  const originX = 0, originY = 0, spine = .05 * .55 + 1e-6;
  for (let index = 0; index < frame.minor.vertices.length; index += 3) {
    const x = frame.minor.vertices[index], y = frame.minor.vertices[index + 1];
    const onVerticalSpine = Math.abs(x - originX) < spine && y >= -2 - 1e-6 && y <= 4 + 1e-6;
    const onHorizontalSpine = Math.abs(y - originY) < spine && x >= -3 - 1e-6 && x <= 3 + 1e-6;
    assert.ok(onVerticalSpine || onHorizontalSpine, `a minor mark strayed from its axis (${x}, ${y})`);
  }
  // Titles sit past the ends of the axes, so they never collide with a tick label.
  assert.deepEqual(frame.titles.map(title => title.text), ['x', 'f(x)']);
  // The x title sits under the right end of its axis; the y title sits above the top of its own, clear
  // of the tick labels, which are stacked to the left of the axis.
  const xTitle = frame.titles.find(title => title.text === 'x'), yTitle = frame.titles.find(title => title.text === 'f(x)');
  assert.ok(xTitle.position[0] >= 3 && xTitle.position[1] < 0, 'the x title belongs under the right end');
  assert.ok(yTitle.position[1] > 4 && Math.abs(yTitle.position[0]) < 1e-9, 'the y title belongs above the axis top');
  assert.equal(plotFrame([-1, 1], [-1, 1], { minor: false }).minor.vertices.length, 0, 'minor marks can be switched off');
  assert.throws(() => plotFrame([-1, 1], [-1, 1], { minor: 1 }), /at least 2/);
});

test('each tick label carries a plain text and a MathML form', () => {
  const frame = plotFrame([-2, 2], [-1, 1], { xTicks: 4, yTicks: 2 });
  assert.ok(frame.labels.length >= 4);
  for (const label of frame.labels) {
    assert.equal(typeof label.text, 'string');
    assert.match(label.math, /^<mrow>/);
    assert.ok(!label.math.includes('-'), 'the MathML form must not fall back to a hyphen');
  }
});

test('the area under a curve is a strip that closes on its baseline and approximates the integral', () => {
  const strip = areaUnder(Math.sin, [0, Math.PI], { baseline: 0, samples: 400 });
  assert.equal(strip.vertices.length % 9, 0, 'triangles come in threes of vertices');
  let signed = 0;
  for (let index = 0; index < strip.vertices.length; index += 9) {
    const [ax, ay] = [strip.vertices[index], strip.vertices[index + 1]];
    const [bx, by] = [strip.vertices[index + 3], strip.vertices[index + 4]];
    const [cx, cy] = [strip.vertices[index + 6], strip.vertices[index + 7]];
    signed += ((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2;
  }
  // sin over [0, pi] encloses 2; the strip is two triangles per column, so it lands on it closely.
  assert.ok(Math.abs(Math.abs(signed) - 2) < .01, `strip area ${signed}`);
  // Every vertex sits between the curve and the baseline.
  for (let index = 0; index < strip.vertices.length; index += 3) {
    const x = strip.vertices[index], y = strip.vertices[index + 1];
    assert.ok(y >= -1e-6 && y <= Math.sin(x) + 1e-6, `vertex ${index} left the strip (${x}, ${y})`);
  }
  // A curved baseline and a function with a hole both behave.
  const lens = areaUnder(x => Math.exp(-x * x), [-2, 2], { baseline: x => -.5 * Math.cos(x), samples: 64 });
  assert.ok(lens.vertices.length > 0);
  const holed = areaUnder(x => Math.log(x), [-1, 1], { samples: 32 });
  assert.ok([...holed.vertices].every(Number.isFinite), 'a hole must not inject NaN vertices');
  assert.throws(() => areaUnder(Math.sin, [1, 0]), /increasing/);
  assert.throws(() => areaUnder(Math.sin, [0, 1], { samples: 1 }), /two samples/);
});

test('a line through a point carries its slope, and a secant becomes the derivative', () => {
  const line = lineThrough([1, 1], 2, [0, 3]);
  for (let index = 0; index < line.vertices.length; index += 3) {
    const x = line.vertices[index], y = line.vertices[index + 1];
    assert.ok(Math.abs(y - (1 + 2 * (x - 1))) < 1e-6, 'the line must satisfy y = y0 + m(x - x0)');
  }
  assert.equal(secantSlope(x => 3 * x + 1, -4, 9), 3, 'a straight line has one slope');
  assert.equal(secantSlope(x => x * x, 1, 3), 4);
  assert.ok(Math.abs(secantSlope(x => x * x, 2, 2.0001) - 4.0001) < 1e-9, 'as b nears a the secant nears the tangent');
  assert.throws(() => secantSlope(x => x, 1, 1), /distinct/);
  assert.throws(() => lineThrough([1, 1], Number.NaN, [0, 1]), /finite/);
});
