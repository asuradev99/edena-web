import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePOSCAR, spaceGroupOperations, closedCell, siteMapping, operationIsometry,
  symmetryAnimationPoint, fractionalToCartesian, cartesianOperation, latticeSites, supercell } from '../build/index.js';

const mos2 = parsePOSCAR(readFileSync(new URL('../examples/MoS2.POSCAR', import.meta.url), 'utf8'));
const close = (a, b) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-7, `${a} != ${b}`));

test('bulk 2H-MoS2 POSCAR yields 24 operations, including 12 translated representatives', () => {
  assert.deepEqual(mos2.species, ['Mo', 'Mo', 'S', 'S', 'S', 'S']);
  const ops = spaceGroupOperations(mos2);
  assert.equal(ops.length, 24);
  assert.equal(ops.filter(op => op.translation.some(v => Math.abs(v) > 1e-8)).length, 12);
  for (const op of ops) {
    const mapping = siteMapping(mos2, op);
    assert.equal(new Set(mapping).size, 6);
    assert.ok(mapping.every((j, i) => j >= 0 && mos2.species[i] === mos2.species[j]));
    const motion = operationIsometry(mos2.lattice, op);
    mos2.positions.forEach(f => {
      const p = fractionalToCartesian(f, mos2.lattice);
      close(symmetryAnimationPoint(motion, p, 0), p);
      const end = op.rotation.map((row, a) => row.reduce((sum, v, k) => sum + v * f[k], op.translation[a]));
      close(symmetryAnimationPoint(motion, p, 1), fractionalToCartesian(end, mos2.lattice));
    });
    const u = [.3, -.2, .7], origin = symmetryAnimationPoint(motion, [0, 0, 0], 1);
    const end = symmetryAnimationPoint(motion, u, 1).map((v, a) => v - origin[a]);
    close(end, cartesianOperation(mos2.lattice, op.rotation).map(row => row.reduce((v, r, a) => v + r * u[a], 0)));
  }
});

test('closed cells include boundary-equivalent atoms and deduplicate shared faces', () => {
  const structure = latticeSites('perovskite');
  assert.equal(structure.positions.length, 5);
  assert.equal(closedCell(structure).positions.length, 15);
  assert.equal(closedCell(closedCell(structure)).positions.length, 15);
  assert.equal(closedCell(mos2).positions.length, 6);
  const big = closedCell(supercell(structure, [2, 2, 2]));
  assert.equal(big.positions.length, 71);
  assert.ok(big.positions.every(p => p.every(v => v >= 0 && v <= 1)));
});

test('composite animation pauses between stages without changing its endpoint', () => {
  const lattice = [[1,0,0],[0,1,0],[0,0,1]];
  const roto = operationIsometry(lattice, { rotation: [[0,-1,0],[1,0,0],[0,0,-1]], translation: [0,0,0] });
  close(symmetryAnimationPoint(roto, [1,0,1], .4), [0,1,1]);
  close(symmetryAnimationPoint(roto, [1,0,1], .6), [0,1,1]);
  const screw = operationIsometry(lattice, { rotation: [[0,-1,0],[1,0,0],[0,0,1]], translation: [0,0,.5] });
  close(symmetryAnimationPoint(screw, [1,0,1], .65), [0,1,1]);
  close(symmetryAnimationPoint(screw, [1,0,1], .75), [0,1,1]);
  close(symmetryAnimationPoint(screw, [1,0,1], 1), [0,1,1.5]);
});

test('nearby symmetry elements preserve every MoS2 operation modulo a lattice translation', async () => {
  const { centeredIsometry, cartesianToFractional } = await import('../build/index.js');
  for (const n of [1, 2, 3]) for (const op of spaceGroupOperations(mos2)) {
    const motion = centeredIsometry(mos2.lattice, op, [n / 2, n / 2, n / 2]);
    assert.ok(motion.latticeShift.every(Number.isInteger));
    for (const f of mos2.positions) {
      const p = fractionalToCartesian(f, mos2.lattice);
      const local = p.map((v, a) => v - motion.centre[a]);
      const end = symmetryAnimationPoint(motion, local, 1).map((v, a) => v + motion.centre[a]);
      const expected = op.rotation.map((row, a) => row.reduce((sum, v, k) => sum + v * f[k], op.translation[a] + motion.latticeShift[a]));
      close(cartesianToFractional(end, mos2.lattice), expected);
    }
    // Residual translation lies in the fixed subspace: shifting the element cannot remove it.
    close(cartesianOperation(mos2.lattice, op.rotation).map(row => row.reduce((v, r, a) => v + r * motion.translation[a], 0)), motion.translation);
  }
});

test('cubic point operations stay at the cell centre with no translation or periodic return', async () => {
  const { centeredIsometry, cartesianToFractional } = await import('../build/index.js');
  const cell = closedCell(latticeSites('perovskite'));
  for (const op of spaceGroupOperations(latticeSites('perovskite'))) {
    const motion = centeredIsometry(cell.lattice, op);
    close(motion.translation, [0, 0, 0]);
    close(motion.centre, fractionalToCartesian([.5, .5, .5], cell.lattice));
    for (const f of cell.positions) {
      const p = fractionalToCartesian(f, cell.lattice).map((v, a) => v - motion.centre[a]);
      const end = symmetryAnimationPoint(motion, p, 1).map((v, a) => v + motion.centre[a]);
      assert.ok(cartesianToFractional(end, cell.lattice).every(v => v >= -1e-8 && v <= 1 + 1e-8));
    }
  }
});

test('shared frame transforms match atom motion and displacement at every animation stage', async () => {
  const { centeredIsometry, symmetryAnimationTransform } = await import('../build/index.js');
  for (const op of spaceGroupOperations(mos2)) {
    const motion = centeredIsometry(mos2.lattice, op);
    for (const t of [0, .2, .4, .5, .7, .9, 1]) {
      const { translation, columns } = symmetryAnimationTransform(motion, t);
      const p = [1.2, -.4, 3.1];
      const result = translation.map((v, a) => v + columns[0][a] * p[0] + columns[1][a] * p[1] + columns[2][a] * p[2]);
      close(result, symmetryAnimationPoint(motion, p, t));
    }
  }
});
