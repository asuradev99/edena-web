// Independent tests for the Homework 3 model (problems 1-3).
//
// These call the *actual* functions in src/examples/homework-model.ts -- nothing here re-implements
// the physics. Where an assertion encodes an analytic result, the result is derived in the comment
// (or in docs/homework-3-solutions.md) and the test only checks that the model reproduces it.
//
// Conventions, matching the model: energies in E_G = hbar^2 G^2/(2m), momenta in G, so the
// empty-lattice energy of the plane wave folded by G0 = (m,n)G is |k/G - (m,n)|^2. The Fourier
// components are V1/2 on the axis neighbours and V3/2 on the diagonal ones. v1 = V1/E_G is signed;
// every local X result depends on |v1| only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RECIPROCAL, potential, coupling, planeWaveMatrix, eigenvalues, bands,
  xBands, xCoefficients, xVelocity, grid, bandGrids, contours,
  criticalEnergy, singularDOS, numericalDOS,
} from '../build/examples/homework-model.js';

const v1 = 0.08, v3 = 0.03;                       // weak potential, as in the problem
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} !~ ${b} (tol ${eps})`);

// ---------------------------------------------------------------------------------------------
// 1. Zero-potential folded energies
// ---------------------------------------------------------------------------------------------
test('zero potential: the nine plane-wave energies fold exactly as |k/G - G0|^2', () => {
  // G0 runs over {(-1,-1) ... (1,1)}; at Gamma the nine values are the squared norms 0, 1(×4), 2(×4).
  const gamma = bands(0, 0, 0, 0);
  assert.deepEqual([...gamma].map(v => +v.toFixed(12)), [0, 1, 1, 1, 1, 2, 2, 2, 2]);

  // At X = (1/2, 0): (1/2 - gx)^2 + gy^2 gives 0.25 twice, 1.25 four times, 2.25 once, 3.25 twice.
  const x = bands(0.5, 0, 0, 0);
  assert.deepEqual([...x].map(v => +v.toFixed(12)), [0.25, 0.25, 1.25, 1.25, 1.25, 1.25, 2.25, 3.25, 3.25]);

  // At M = (1/2, 1/2): 0.5 four times (the fourfold shell), 2.5 four times, 4.5 once.
  const m = bands(0.5, 0.5, 0, 0);
  assert.deepEqual([...m].map(v => +v.toFixed(12)), [0.5, 0.5, 0.5, 0.5, 2.5, 2.5, 2.5, 2.5, 4.5]);

  // And the zero-potential matrix really is diagonal, so the eigenvalues are its diagonal.
  const diagonal = planeWaveMatrix(0.3, -0.2, 0, 0).map((row, i) => row[i]).sort((a, b) => a - b);
  const spectrum = bands(0.3, -0.2, 0, 0);
  diagonal.forEach((value, i) => near(value, spectrum[i], 1e-12));
});

// ---------------------------------------------------------------------------------------------
// 2. Degeneracies at X and M with the potential on
// ---------------------------------------------------------------------------------------------
test('degeneracies at zero potential; splittings at nonzero V1 where the states separate', () => {
  // --- degeneracies: only at zero potential is the spectrum exactly degenerate, so that is where
  // --- degeneracy is asserted (problem 1b). v1 = v3 = 0 makes the matrix diagonal.
  const x0 = bands(0.5, 0, 0, 0);
  assert.equal(x0[0], x0[1], 'at zero potential the two lowest states at X are exactly degenerate');
  assert.ok(x0[2] > x0[1], 'and the next state is a full shell higher');
  const m0 = bands(0.5, 0.5, 0, 0);
  for (let i = 1; i < 4; i++) assert.equal(m0[i], m0[0], 'at zero potential the four lowest states at M are exactly degenerate');
  assert.ok(m0[4] > m0[3], 'and the fifth state is a full shell higher');

  // --- nonzero V1: the X pair SPLITS. The 2x2 result is exact, so xBands gives the gap |v1| exactly.
  const [lo, hi] = xBands(0, 0, v1);
  near(hi - lo, Math.abs(v1), 1e-15);
  near(xCoefficients(v1).gap, Math.abs(v1), 1e-15);
  assert.ok(hi - lo > 0, 'a nonzero potential lifts the X degeneracy');
  // Negative V1 lifts it by the same amount: the pair splits by |v1|, not by v1.
  const [loNeg, hiNeg] = xBands(0, 0, -v1);
  near(hiNeg - loNeg, Math.abs(v1), 1e-15);

  // The nine-state model is a truncation, so its gap only approaches |v1|. The two X states are
  // mirror partners in the full basis, so their O(v1^2) self-energies cancel in the difference: the
  // ABSOLUTE discrepancy is O(v1^3) (ratio ~8 per halving) and the RELATIVE one is O(v1^2) (ratio ~4).
  const gapAt = (v) => { const e = bands(0.5, 0, v, 0); return e[1] - e[0]; };
  const gaps = [0.08, 0.04, 0.02, 0.01];
  const absolute = gaps.map(v => Math.abs(gapAt(v) - v));
  const relative = gaps.map((v, i) => absolute[i] / v);
  relative.forEach((value, i) => assert.ok(value < 1e-3, `relative gap error should be small: ${value}`));
  for (let i = 0; i + 1 < gaps.length; i++) {
    const ratio = relative[i] / relative[i + 1];
    assert.ok(ratio > 3 && ratio < 5, `relative discrepancy should fall as v1^2, ratio ${ratio}`);
  }
  assert.ok(absolute[0] < 2e-5 && absolute[3] < 1e-7, `absolute discrepancy should be tiny: ${absolute}`);

  // --- nonzero V1, V3: the four M states SPLIT into the pattern of the 4x4 block of problem 4,
  // --- (2V1+V3)/2, -V3/2, -V3/2, (V3-2V1)/2 above 0.5. This is a leading-order statement, so the
  // --- tolerance is the O(V^2) shift from the next shell (~2e-3), not machine precision. No
  // --- degeneracy is asserted here: the nine-state truncation splits the nominal pair by ~2.5e-5.
  const m = bands(0.5, 0.5, v1, v3).slice(0, 4);
  const shifts = m.map(value => value - 0.5);
  const trace = shifts.reduce((a, b) => a + b, 0);
  assert.ok(trace < 0 && Math.abs(trace) < 8e-3,
    `the 4x4 block has zero trace; at second order all four are pushed down, so the sum is negative: ${trace}`);
  const expected = [(2 * v1 + v3) / 2, -v3 / 2, -v3 / 2, (v3 - 2 * v1) / 2].sort((a, b) => a - b);
  shifts.sort((a, b) => a - b).forEach((value, i) => near(value, expected[i], 4e-3));
  // the pair that is exactly degenerate in the full basis is the closest pair here
  const spacings = [shifts[1] - shifts[0], shifts[2] - shifts[1], shifts[3] - shifts[2]];
  assert.ok(spacings[1] < Math.min(spacings[0], spacings[2]),
    `the middle pair should be the closest pair, spacings ${spacings}`);
});

// ---------------------------------------------------------------------------------------------
// 2b. The sampling helpers the contour and DOS tests rely on
// ---------------------------------------------------------------------------------------------
test('grid() samples [min,max]^2 with x fastest, and criticalEnergy() builds the three local forms', () => {
  assert.equal(RECIPROCAL.length, 9);
  RECIPROCAL.forEach(([gx, gy]) => {
    assert.ok(Number.isInteger(gx) && Number.isInteger(gy) && Math.abs(gx) <= 1 && Math.abs(gy) <= 1);
  });

  const g = grid((x, y) => x + 2 * y, 4, -1, 1);
  assert.equal(g.values.length, 25);                 // (n+1)^2
  near(g.values[0], -1 + 2 * -1, 1e-15);             // (x, y) = (-1, -1)
  near(g.values[1], -0.5 + 2 * -1, 1e-15);           // x advances fastest
  near(g.values[5], -1 + 2 * -0.5, 1e-15);           // row 1 is the next y
  near(g.values[24], 1 + 2 * 1, 1e-15);              // far corner
  // the grid's own extents, which contours() reads back
  assert.equal(g.n, 4);
  near(g.min, -1, 0);
  near(g.max, 1, 0);

  // E = +a x^2 + b y^2 for a minimum, -(...) for a maximum, and +a x^2 - b y^2 for a saddle.
  for (const [x, y] of [[0.3, 0.7], [-0.4, 0.2], [0, 0.5]]) {
    near(criticalEnergy(x, y, 2, 3, 'minimum'), 2 * x * x + 3 * y * y, 1e-15);
    near(criticalEnergy(x, y, 2, 3, 'maximum'), -(2 * x * x + 3 * y * y), 1e-15);
    near(criticalEnergy(x, y, 2, 3, 'saddle'), 2 * x * x - 3 * y * y, 1e-15);
  }
  // the saddle's level sets are the ones the reconnection test measures: negative along y, positive along x
  assert.ok(criticalEnergy(0, 1, 2, 3, 'saddle') < 0);
  assert.ok(criticalEnergy(1, 0, 2, 3, 'saddle') > 0);
  // and a maximum is the mirror of a minimum
  near(criticalEnergy(0.2, 0.3, 1.5, 2.5, 'maximum'), -criticalEnergy(0.2, 0.3, 1.5, 2.5, 'minimum'), 1e-15);
});

// ---------------------------------------------------------------------------------------------
// 3. Fourier components: selection rules, values, symmetry
// ---------------------------------------------------------------------------------------------
test('coupling() selects the stated components, and potential() has exactly those Fourier coefficients', () => {
  // Values and selection.
  near(coupling(1, 0, v1, v3), v1 / 2, 0);
  near(coupling(0, -1, v1, v3), v1 / 2, 0);
  near(coupling(1, 1, v1, v3), v3 / 2, 0);
  near(coupling(-1, 1, v1, v3), v3 / 2, 0);
  for (const [dx, dy] of [[0, 0], [2, 0], [0, 2], [1, 2], [2, 2], [2, 1], [-2, 0]]) {
    near(coupling(dx, dy, v1, v3), 0, 0);
  }
  // Symmetry of the real potential: symmetric under (dx,dy) -> (-dx,-dy) and -> (dy,dx).
  for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1], [-1, 1], [2, 0], [1, 2]]) {
    near(coupling(dx, dy, v1, v3), coupling(-dx, -dy, v1, v3), 0);
    near(coupling(dx, dy, v1, v3), coupling(dy, dx, v1, v3), 0);
  }

  // Quadrature: U_Q = int_0^1 int_0^1 U(x,y) exp(-2 pi i (m x + n y)) dx dy must equal coupling().
  // The integrand is a low-order trigonometric polynomial and the grid is periodic and fine, so the
  // trapezoid rule is exact here.
  const N = 64, h = 1 / N;
  const fourier = (mx, my) => {
    let re = 0, im = 0;
    for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) {
      const x = (a + 0.5) * h, y = (b + 0.5) * h;
      const phase = 2 * Math.PI * (mx * x + my * y);
      re += potential(x, y, v1, v3) * Math.cos(phase);
      im -= potential(x, y, v1, v3) * Math.sin(phase);
    }
    return { re: re * h * h, im: im * h * h };
  };
  for (let mx = -2; mx <= 2; mx++) for (let my = -2; my <= 2; my++) {
    const parts = fourier(mx, my);
    near(parts.re, coupling(mx, my, v1, v3), 1e-12);
    near(parts.im, 0, 1e-12);
  }

  // The potential's symmetries: x -> -x, y -> -y, x <-> y, and V1 = 0 reduces to 2 V3 cos cos.
  for (const [x, y] of [[0.13, 0.37], [0.5, 0.25], [0.7, 0.02]]) {
    near(potential(-x, y, v1, v3), potential(x, y, v1, v3), 1e-14);
    near(potential(x, -y, v1, v3), potential(x, y, v1, v3), 1e-14);
    near(potential(y, x, v1, v3), potential(x, y, v1, v3), 1e-14);
    near(potential(x, y, 0, v3), 2 * v3 * Math.cos(2 * Math.PI * x) * Math.cos(2 * Math.PI * y), 1e-14);
  }
});

// ---------------------------------------------------------------------------------------------
// 4. Jacobi invariants
// ---------------------------------------------------------------------------------------------
test('eigenvalues() is orthogonal: it preserves the trace and the sum of squares', () => {
  for (const [kx, ky] of [[0, 0], [0.5, 0], [0.5, 0.5], [0.3, -0.2], [0.11, 0.42]]) {
    const matrix = planeWaveMatrix(kx, ky, v1, v3);
    // symmetric, as it must be
    matrix.forEach((row, i) => row.forEach((value, j) => near(value, matrix[j][i], 1e-15)));
    const values = eigenvalues(matrix);
    const trace = matrix.reduce((sum, row, i) => sum + row[i], 0);
    const squares = matrix.reduce((sum, row) => sum + row.reduce((s, value) => s + value * value, 0), 0);
    near(values.reduce((a, b) => a + b, 0), trace, 1e-10);
    near(values.reduce((a, b) => a + b * b, 0), squares, 1e-9);
    // sorted ascending, and the plane-wave diagonal is the k-independent part of the trace
    for (let i = 1; i < values.length; i++) assert.ok(values[i] >= values[i - 1] - 1e-12, 'eigenvalues must be sorted');
  }
  // A small matrix with known spectrum, to pin the routine itself.
  near(eigenvalues([[2, 1], [1, 2]])[0], 1, 1e-12);
  near(eigenvalues([[2, 1], [1, 2]])[1], 3, 1e-12);
  near(eigenvalues([[1, 0, 0], [0, 2, 0], [0, 0, 3]])[2], 3, 1e-12);
});

// ---------------------------------------------------------------------------------------------
// 5. Sign of V1
// ---------------------------------------------------------------------------------------------
test('every local X quantity is even in V1 (only |v1| enters)', () => {
  for (const [qx, qy] of [[0.02, 0.05], [0, 0], [-0.07, 0.11], [0.2, -0.3]]) {
    const plus = xBands(qx, qy, v1), minus = xBands(qx, qy, -v1);
    near(plus[0], minus[0], 0);
    near(plus[1], minus[1], 0);
    near(xVelocity(qx, qy, v1, true)[0], xVelocity(qx, qy, -v1, true)[0], 0);
    near(xVelocity(qx, qy, v1, false)[1], xVelocity(qx, qy, -v1, false)[1], 0);
  }
  assert.deepEqual(xCoefficients(v1), xCoefficients(-v1));
  // v1 -> -v1 is a gauge transformation (diag((-1)^(gx+gy))) on the nine-state basis, so the whole
  // plane-wave spectrum must be identical -- an exact check, not an approximate one.
  for (const [kx, ky] of [[0.5, 0], [0.4, 0.2], [0.5, 0.5]]) {
    const plus = bands(kx, ky, v1, v3), minus = bands(kx, ky, -v1, v3);
    plus.forEach((value, i) => near(value, minus[i], 1e-11));
  }
});

// ---------------------------------------------------------------------------------------------
// 6. Gap, effective masses and velocity
// ---------------------------------------------------------------------------------------------
test('the gap is |v1|; finite differences of xBands reproduce the effective masses and velocities', () => {
  const coefficients = xCoefficients(v1);
  near(coefficients.gap, Math.abs(v1), 0);
  near(coefficients.critical, 0.25 - Math.abs(v1) / 2, 0);
  // The expansion E± = E±(0) + qx^2 (1 ± 1/|v1|) + qy^2, so m/m*_x = 1 ± 1/|v1| and m/m*_y = 1.
  near(coefficients.lower, 1 - 1 / Math.abs(v1), 1e-15);
  near(coefficients.upper, 1 + 1 / Math.abs(v1), 1e-15);

  // Curvature of the *exact* two-state dispersion, by central difference with h << |v1|/2.
  const h = 1e-4;
  const curvature = (band) => (xBands(h, 0, v1)[band] - 2 * xBands(0, 0, v1)[band] + xBands(-h, 0, v1)[band]) / (h * h) / 2;
  near(curvature(0), coefficients.lower, 2e-3);
  near(curvature(1), coefficients.upper, 2e-3);
  const curvatureY = (band) => (xBands(0, h, v1)[band] - 2 * xBands(0, 0, v1)[band] + xBands(0, -h, v1)[band]) / (h * h) / 2;
  near(curvatureY(0), 1, 1e-9);            // m/m*_y = 1 for both bands
  near(curvatureY(1), 1, 1e-9);

  // Velocity: xVelocity must equal the gradient of xBands, and the normal component must vanish at X.
  for (const [qx, qy] of [[0.03, 0.04], [-0.02, 0.07], [0.05, -0.03]]) {
    for (const upper of [false, true]) {
      const band = upper ? 1 : 0;
      const dx = (xBands(qx + h, qy, v1)[band] - xBands(qx - h, qy, v1)[band]) / (2 * h);
      const dy = (xBands(qx, qy + h, v1)[band] - xBands(qx, qy - h, v1)[band]) / (2 * h);
      const velocity = xVelocity(qx, qy, v1, upper);
      near(velocity[0], dx, 1e-4);
      near(velocity[1], dy, 1e-4);
    }
  }
  for (const upper of [false, true]) {
    near(xVelocity(0, 0.13, v1, upper)[0], 0, 1e-15);
    near(xVelocity(0, 0.13, v1, upper)[1], 2 * 0.13, 1e-15);
  }
});

// ---------------------------------------------------------------------------------------------
// 7. Contours: the pocket is closed below the saddle and reconnects through X above it
// ---------------------------------------------------------------------------------------------
test('contours reconnect at X: closed below the saddle energy, reaching the edge above it', () => {
  const n = 80;
  const lowest = bandGrids(v1, v3, n)[0];
  const critical = xCoefficients(v1).critical;        // 0.25 - |v1|/2
  const delta = 0.05;
  const onBoundary = (segments) => segments.some(([a, b]) =>
    [a, b].some(([x, y]) => Math.abs(Math.abs(x) - 0.5) < 1e-9 || Math.abs(Math.abs(y) - 0.5) < 1e-9));

  const below = contours(lowest, critical - delta);
  const above = contours(lowest, critical + delta);
  assert.ok(below.length > 0 && above.length > 0, 'both levels should produce contour segments');
  assert.equal(onBoundary(below), false, 'below the saddle the pocket must not reach the zone boundary');
  assert.equal(onBoundary(above), true, 'above the saddle the contour must reach the zone boundary');

  // Local reconnection direction. Writing E - Ec = -A qx'^2 + B qy^2 with qx' = qx - 0.5,
  // A = m/|m*_x| = (1-|v1|)/|v1| and B = m/m*_y = 1:
  //   below, the two branches split along qx': |qx'| >= sqrt(|d|/A)   (vertices on the qx' axis)
  //   above, they split along qy:            |qy|  >= sqrt(d/B)
  const A = (1 - Math.abs(v1)) / Math.abs(v1), B = 1;
  const endpoints = (segments) => segments.flatMap(([a, b]) => [a, b]);
  const nearX = (segments, window) => endpoints(segments).filter(([x, y]) => Math.abs(x - 0.5) < window && Math.abs(y) < window);

  const splitBelow = Math.sqrt(delta / A);            // ≈ 0.063
  const vertices = nearX(below, 0.15).filter(([, y]) => Math.abs(y) < 0.03).map(([x]) => Math.abs(x - 0.5));
  assert.ok(vertices.length > 0, 'below the saddle the contour should cross the qy = 0 line near X');
  const closest = Math.min(...vertices);
  assert.ok(Math.abs(closest - splitBelow) < 3 / n + 0.02, `below: closest approach ${closest} vs ${splitBelow}`);

  const splitAbove = Math.sqrt(delta / B);            // ≈ 0.224
  // Above the saddle the two branches are separated in qy, so within a narrow strip around qy = 0
  // there must be NO contour at all -- that is the direction flip.
  const nearAxis = nearX(above, 0.12).filter(([, y]) => Math.abs(y) < splitAbove * 0.6);
  assert.equal(nearAxis.length, 0, 'above the saddle the contour must stay away from the qy = 0 line near X');
  // ... and the closest approach to that line is the branch separation sqrt(delta/B).
  const aboveBranches = endpoints(above).filter(([x, y]) => Math.abs(x - 0.5) < 0.06 && Math.abs(y) < 0.45);
  assert.ok(aboveBranches.length > 0, 'above the saddle the branches should be visible near X');
  const closestAbove = Math.min(...aboveBranches.map(([, y]) => Math.abs(y)));
  assert.ok(Math.abs(closestAbove - splitAbove) < 0.05,
    `above: closest approach ${closestAbove} vs ${splitAbove}`);
});

// ---------------------------------------------------------------------------------------------
// 8. DOS: the step at an extremum and the logarithmic coefficient at a saddle
// ---------------------------------------------------------------------------------------------
test('singularDOS: spin-included step of 1/(2 pi sqrt(ab)), and the saddle log prefactor', () => {
  // Derived from nu(e) = 2 int d2q/(2 pi)^2 delta(e - (a qx^2 + b qy^2)): the step height is
  // 1/(2 pi sqrt(ab)); the saddle gives -(1/(2 pi^2 sqrt(ab))) d/d ln|e|.
  for (const [a, b] of [[1, 1], [4, 1], [2, 8], [0.25, 0.5]]) {
    near(singularDOS(0.1, a, b, 'minimum'), 1 / (2 * Math.PI * Math.sqrt(a * b)), 1e-15);
    near(singularDOS(-0.1, a, b, 'minimum'), 0, 0);
    near(singularDOS(-0.1, a, b, 'maximum'), 1 / (2 * Math.PI * Math.sqrt(a * b)), 1e-15);
    near(singularDOS(0.1, a, b, 'maximum'), 0, 0);
    const slope = (singularDOS(0.02, a, b, 'saddle') - singularDOS(0.04, a, b, 'saddle')) / Math.log(2);
    near(slope, 1 / (2 * Math.PI ** 2 * Math.sqrt(a * b)), 1e-15);
  }
  assert.equal(singularDOS(0, 1, 1, 'saddle'), Infinity);
  assert.throws(() => singularDOS(0.1, -1, 1, 'saddle'));
  assert.throws(() => singularDOS(0.1, 1, 1, 'minimum', 0));
});

// ---------------------------------------------------------------------------------------------
// 9. Anisotropic scaling: 1/sqrt(ab) in both the analytic and the numerical DOS
// ---------------------------------------------------------------------------------------------
test('the DOS scales as 1/sqrt(ab): quadrupling one curvature halves it, and numericalDOS follows', () => {
  for (const kind of ['minimum', 'saddle']) {
    const energy = kind === 'saddle' ? 0.05 : 0.1;
    const base = singularDOS(energy, 1, 1, kind);
    near(singularDOS(energy, 4, 1, kind), base / 2, 1e-15);
    near(singularDOS(energy, 1, 16, kind), base / 4, 1e-15);
    near(singularDOS(energy, 9, 4, kind), base / 6, 1e-15);
  }
  const energies = [0.02, 0.05, 0.1];
  for (const kind of ['minimum', 'saddle']) {
    const one = numericalDOS(energies, 1, 1, kind, 0.01, 60, 1);
    const four = numericalDOS(energies, 4, 1, kind, 0.01, 60, 1);
    one.forEach((value, i) => near(four[i], value / 2, 1e-12));
  }
});

// ---------------------------------------------------------------------------------------------
// 10. numericalDOS: positivity, evenness, mirrored extrema, and agreement in slope
// ---------------------------------------------------------------------------------------------
test('numericalDOS is non-negative, even for a saddle, mirrors min<->max, and matches the log slope', () => {
  const energies = [-0.2, -0.1, -0.05, -0.02, 0, 0.02, 0.05, 0.1, 0.2];
  const saddle = numericalDOS(energies, 1, 1, 'saddle', 0.005, 200, 1);
  saddle.forEach(value => assert.ok(Number.isFinite(value) && value >= 0, `saddle DOS must be >= 0, got ${value}`));
  // The sampled saddle dispersion +- (u^2 - v^2) on a symmetric square is invariant under
  // (e -> -e), so the numerical DOS is even to rounding.
  saddle.forEach((value, i) => near(value, saddle[saddle.length - 1 - i], 1e-10));

  // Mirrored extrema: max at e is the min at -e, exactly.
  const minimum = numericalDOS(energies, 1, 3, 'minimum', 0.005, 120, 1);
  const maximum = numericalDOS(energies.map(e => -e), 1, 3, 'maximum', 0.005, 120, 1);
  minimum.forEach((value, i) => near(value, maximum[i], 1e-10));

  // The log coefficient from the numerical side. The Lorentzian ridge has width ~eta/|grad E| in the
  // sampled plane, so the grid must resolve it: with eta = 0.002 and n = 800 (h = 0.0025) the ridge
  // is resolved for |e| up to ~0.1, and the window below stays inside that. (Tiny eta with a coarse
  // grid misses the ridge and biases the slope low -- measured 0.043 at eta = 1e-4, n = 400.)
  const coefficient = 1 / (2 * Math.PI ** 2);
  const numerical = numericalDOS([0.02, 0.05, 0.1], 1, 1, 'saddle', 0.002, 800, 1);
  // nu(0.02) - nu(0.10) over ln(0.1/0.02) is the slope against ln|e|.
  near((numerical[0] - numerical[2]) / Math.log(0.1 / 0.02), coefficient, 4e-3);
  // The log law itself: nu + C ln|e| is constant across the window (the cutoff only sets the constant).
  const offsets = [0.02, 0.05, 0.1].map((e, i) => numerical[i] + coefficient * Math.log(e));
  assert.ok(Math.max(...offsets) - Math.min(...offsets) < 4e-3,
    `nu + C ln|e| should be constant, spread ${Math.max(...offsets) - Math.min(...offsets)}`);

  // Convergence of the rounded step: away from the broadening and the cutoff, the numerical DOS at
  // a minimum approaches its analytic step height.
  const step = numericalDOS([0.05, 0.2], 1, 1, 'minimum', 1e-3, 400, 1);
  near(step[0], 1 / (2 * Math.PI), 0.02);
  near(step[1], 1 / (2 * Math.PI), 0.02);
});
