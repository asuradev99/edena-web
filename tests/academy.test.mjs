// node --test tests/academy.test.mjs  (via `npm test`, which builds first)
//
// The academy page makes numeric claims in its prose: an observed convergence order, two different
// 250 000-sample budgets, orbit and fixed-site counts. Those are the model's job, so they are tested
// here rather than only looked at in a browser. The last few tests are static: they keep the page
// and the wiring in step, which is the browser check's job to *drive* but this file's job to catch
// as a plain text mismatch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { functionSurface } from '../build/index.js';
import {
  CPU_BUDGET, surfaceCost, fieldCost, relativeSize, normalise, clamped,
  decaySolution, finalAbsoluteError, observedOrder, harmonicEnergy,
  operationNamed, orbitReport, centredAtoms, structureFor, displaced, structureBounds,
} from '../build/examples/academy-model.js';

/* ---------------------------------------------------------------------------------------------
 * 01 · Projection
 * ------------------------------------------------------------------------------------------- */

test('orthographic has no foreshortening; perspective falls off as 1/depth', () => {
  assert.equal(relativeSize(2, 8, 'orthographic'), 1);
  assert.equal(relativeSize(2, 8, 'perspective'), 4);
  // The ratio is exactly the depth ratio, for any pair.
  assert.equal(relativeSize(3.5, 12.25, 'perspective'), 3.5);
  assert.throws(() => relativeSize(0, 5, 'perspective'));
  assert.throws(() => relativeSize(5, -1, 'orthographic'));
});

/* ---------------------------------------------------------------------------------------------
 * 02 · The two budgets
 * ------------------------------------------------------------------------------------------- */

test('surfaces are refused on quads, so a square grid is legal to 500x500', () => {
  const legal = surfaceCost(500), over = surfaceCost(501);
  assert.equal(legal.quads, 250_000);
  assert.equal(legal.triangles, 500_000);
  assert.equal(legal.samples, 501 * 501); // evaluated points, which is NOT what the guard counts
  assert.ok(legal.withinBudget);
  assert.equal(over.quads, 251_001);
  assert.ok(!over.withinBudget);
});

test('the library guard fires before any sampling, at exactly the model boundary', () => {
  // 501x501 is one step past the quad budget; the guard rejects it without evaluating the field.
  let evaluated = 0;
  assert.throws(() => functionSurface((x) => { evaluated++; return x; }, [0, 1], [0, 1], [501, 501]));
  assert.equal(evaluated, 0, 'the guard must fire before the field is sampled');
  // A legal request does reach the field.
  functionSurface((x) => { evaluated++; return x; }, [0, 1], [0, 1], [4, 4]);
  assert.ok(evaluated > 0);
});

test('isosurfaces are refused on samples, so a cubic grid is legal to 61^3', () => {
  const legal = fieldCost(61), over = fieldCost(62);
  assert.equal(legal.samples, 62 ** 3);
  assert.ok(legal.samples <= CPU_BUDGET);
  assert.ok(legal.withinBudget);
  assert.equal(over.samples, 63 ** 3);
  assert.ok(over.samples > CPU_BUDGET);
  assert.ok(!over.withinBudget);
});

/* ---------------------------------------------------------------------------------------------
 * 03 · Colour
 * ------------------------------------------------------------------------------------------- */

test('range normalisation is exact at the ends and clamping is the complement of the range', () => {
  assert.equal(normalise(-2, [-2, 6]), 0);
  assert.equal(normalise(6, [-2, 6]), 1);
  assert.equal(normalise(2, [-2, 6]), .5);
  assert.throws(() => normalise(0, [1, 1]));
  assert.ok(!clamped(2, [0, 4]));
  assert.ok(clamped(-1, [0, 4]));
  assert.ok(clamped(5, [0, 4]));
});

/* ---------------------------------------------------------------------------------------------
 * 04 · Integration
 * ------------------------------------------------------------------------------------------- */

test('the decay solution is exact at t = 0 and matches the closed form', () => {
  const sample = decaySolution(1, .1, 20, 'rk4');
  assert.equal(sample.y[0], 1);
  assert.equal(sample.exact[0], 1);
  assert.equal(sample.t.length, 21);
  // Both methods start from the same initial condition and integrate the same interval.
  for (const method of ['euler', 'rk4']) {
    const run = decaySolution(1, .25, 8, method);
    assert.equal(run.t.at(-1), 2);
    assert.ok(Math.abs(run.exact.at(-1) - Math.exp(-2)) < 1e-15);
  }
});

test('RK4 beats Euler at the same step, and the observed orders are 1 and 4', () => {
  const eulerCoarse = finalAbsoluteError(decaySolution(1, .25, 8, 'euler'));
  const eulerFine = finalAbsoluteError(decaySolution(1, .125, 16, 'euler'));
  const rk4Coarse = finalAbsoluteError(decaySolution(1, .25, 8, 'rk4'));
  const rk4Fine = finalAbsoluteError(decaySolution(1, .125, 16, 'rk4'));
  assert.ok(rk4Coarse < eulerCoarse, 'RK4 should be more accurate at dt = 0.25');
  const eulerOrder = observedOrder(eulerCoarse, eulerFine);
  const rk4Order = observedOrder(rk4Coarse, rk4Fine);
  assert.ok(eulerOrder > .8 && eulerOrder < 1.4, `Euler order was ${eulerOrder}`);
  assert.ok(rk4Order > 3.5 && rk4Order < 4.6, `RK4 order was ${rk4Order}`);
  // A method that never improves would divide by zero and report order 0 rather than fail loudly.
  assert.equal(observedOrder(0, 1), 0);
});

/* ---------------------------------------------------------------------------------------------
 * 05 · The simulation seam
 * ------------------------------------------------------------------------------------------- */

test('harmonic energy is the sum of kinetic and potential, and is constant on a circular orbit', () => {
  const k = 1, radius = 2, speed = Math.sqrt(k) * radius;
  const positions = new Float32Array([radius, 0]);
  const velocities = new Float32Array([0, speed]);
  const expected = .5 * speed * speed + .5 * k * radius * radius;
  assert.ok(Math.abs(harmonicEnergy(positions, velocities, k) - expected) < 1e-12);
});

/* ---------------------------------------------------------------------------------------------
 * 06 · Symmetry
 * ------------------------------------------------------------------------------------------- */

test('the same C4 operation fixes a different number of atoms in fcc and perovskite', () => {
  const c4z = operationNamed('c4z');
  const fcc = orbitReport(structureFor('fcc'), c4z);
  assert.equal(fcc.ontoSelf, true);
  assert.equal(fcc.fixed.length, 2);
  assert.equal(fcc.moved.length, 2);
  assert.deepEqual(fcc.orbits, [[0], [1, 2], [3]]);
  assert.equal(fcc.latticeOperations, 48);

  const perovskite = orbitReport(structureFor('perovskite'), c4z);
  assert.equal(perovskite.ontoSelf, true);
  assert.equal(perovskite.fixed.length, 3);
  assert.equal(perovskite.moved.length, 2);
  assert.deepEqual(perovskite.orbits, [[0], [1], [2], [3, 4]]);
});

test('the identity fixes every site, and every named operation is invertible on the sites', () => {
  for (const kind of ['sc', 'bcc', 'fcc', 'perovskite']) {
    const structure = structureFor(kind);
    const report = orbitReport(structure, operationNamed('identity'));
    assert.deepEqual(report.fixed, structure.positions.map((_, index) => index));
    assert.deepEqual(report.moved, []);
    assert.equal(report.ontoSelf, true);
    // A mapping of a symmetry is a permutation.
    const mapping = report.mapping;
    assert.deepEqual([...mapping].sort((a, b) => a - b), structure.positions.map((_, index) => index));
  }
  assert.throws(() => operationNamed('nonsense'));
});

test('symmetry is a statement about tolerance: a displacement flips the verdict', () => {
  const base = structureFor('perovskite');
  const c4z = operationNamed('c4z');
  assert.equal(orbitReport(base, c4z, 1e-4).ontoSelf, true);
  // Below tolerance the displaced atom is treated as being on its ideal site.
  assert.equal(orbitReport(displaced(base, base.positions.length - 1, 5e-5), c4z, 1e-4).ontoSelf, true);
  // Above it, the structure is no longer invariant.
  assert.equal(orbitReport(displaced(base, base.positions.length - 1, .01), c4z, 1e-4).ontoSelf, false);
  assert.throws(() => displaced(base, 99, .01));
});

test('centred atoms sit inside the cell centred on the origin', () => {
  const structure = structureFor('perovskite');
  const atoms = centredAtoms(structure);
  const { centre, extent, min, max } = structureBounds(structure);
  assert.equal(atoms.length, 5);
  // `structureBounds` includes the cell corners, so the centre is half a cell along each axis and
  // the extent is the cell side.
  for (const value of centre) assert.ok(Math.abs(value - 3.905 / 2) < 1e-9, `cell centre was ${value}`);
  assert.ok(Math.abs(extent - 3.905) < 1e-9, `extent was ${extent}`);
  for (const value of min) assert.ok(Math.abs(value) < 1e-9);
  for (const value of max) assert.ok(Math.abs(value - 3.905) < 1e-9);
  // Centred coordinates therefore lie inside [-half, +half].
  for (const atom of atoms) for (const value of atom.position) assert.ok(Math.abs(value) <= 3.905 / 2 + 1e-9);
});

/* ---------------------------------------------------------------------------------------------
 * Static contracts: page ↔ wiring ↔ chapters
 * ------------------------------------------------------------------------------------------- */

const html = readFileSync('academy.html', 'utf8');
const source = readFileSync('src/examples/academy.ts', 'utf8');

const panels = ['projection', 'mesh', 'colour', 'integration', 'simulation', 'symmetry'];

test('academy.html declares a canvas, labels, and a stage for every panel', () => {
  assert.match(html, /<title>Edena · academy<\/title>/);
  for (const panel of panels) {
    assert.ok(html.includes(`id="${panel}-canvas"`), `missing ${panel}-canvas`);
    assert.ok(html.includes(`id="${panel}-labels"`), `missing ${panel}-labels`);
    assert.ok(html.includes(`id="${panel}-stage"`), `missing ${panel}-stage`);
  }
  // check-links.mjs requires every page other than basics.html to reach the tour.
  assert.ok(/href="basics\.html"/.test(html), 'academy.html must link to basics.html');
});

test('every id the page module looks up exists in academy.html', () => {
  const ids = new Set();
  const pattern = /\$<[^>]*>\(\s*'([^']+)'\s*\)|\$\(\s*'([^']+)'\s*\)/g;
  for (const match of source.matchAll(pattern)) ids.add(match[1] ?? match[2]);
  assert.ok(ids.size >= panels.length * 3, `expected the page to look up many ids, saw ${ids.size}`);
  for (const id of ids) assert.ok(html.includes(`id="${id}"`), `academy.ts looks up #${id}, which academy.html does not define`);
});

test('every control in the page is wired by the module', () => {
  const wired = new Set();
  const pattern = /\$<[^>]*>\(\s*'([^']+)'\s*\)|\$\(\s*'([^']+)'\s*\)/g;
  for (const match of source.matchAll(pattern)) wired.add(match[1] ?? match[2]);
  const controls = [...html.matchAll(/<(?:select|input|button)[^>]*\bid="([^"]+)"/g)].map(match => match[1]);
  assert.ok(controls.length >= 12, `expected interactive controls, saw ${controls.length}`);
  for (const id of controls) assert.ok(wired.has(id), `#${id} is a control with no reference in academy.ts`);
});

test('every local link in academy.html resolves, and every chapter exists', () => {
  for (const match of html.matchAll(/href="([^"]+)"/g)) {
    const href = match[1];
    if (/^(https?:|mailto:|#)/.test(href)) continue;
    const path = href.split('#')[0];
    assert.ok(existsSync(path), `academy.html links to ${href}, which does not exist`);
  }
  for (const chapter of [...html.matchAll(/docs\/academy\/([A-Za-z0-9._-]+\.md)/g)].map(match => match[1])) {
    assert.ok(existsSync(`docs/academy/${chapter}`), `chapter ${chapter} is missing`);
  }
});
