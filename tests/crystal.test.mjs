import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePOSCAR, parsePhonopySymmetry } from '../build/index.js';

test('POSCAR parser handles direct fractional positions and species', () => {
  const crystal = parsePOSCAR(`NaCl\n1.0\n2 0 0\n0 2 0\n0 0 2\nNa Cl\n1 1\nDirect\n0 0 0\n.5 .5 .5`);
  assert.deepEqual(crystal.species, ['Na', 'Cl']); assert.deepEqual(crystal.positions[1], [.5, .5, .5]); assert.equal(crystal.lattice[0][0], 2);
});

test('POSCAR parser handles Cartesian positions and selective dynamics', () => {
  const crystal = parsePOSCAR(`Si\n1\n3 0 0\n0 3 0\n0 0 3\nSi\n2\nSelective dynamics\nCartesian\n0 0 0 T T T\n1.5 1.5 1.5 F F F`);
  assert.deepEqual(crystal.positions[1], [.5, .5, .5]);
});

test('phonopy parser extracts unique rotation matrices', () => {
  const operations = parsePhonopySymmetry('rotations:\n- [[1, 0, 0], [0, 1, 0], [0, 0, 1]]\n- [[0, -1, 0], [1, 0, 0], [0, 0, 1]]');
  assert.equal(operations.length, 2); assert.deepEqual(operations[1].rotation[0], [0, -1, 0]);
});

test('phonopy parser accepts canonical row-oriented YAML', () => {
  const operations = parsePhonopySymmetry('rotations:\n- - [ 1 0 0 ]\n  - [ 0 1 0 ]\n  - [ 0 0 1 ]\n- - [ 0 -1 0 ]\n  - [ 1 0 0 ]\n  - [ 0 0 1 ]\ntranslations:\n- [ 0 0 0 ]');
  assert.equal(operations.length, 2); assert.deepEqual(operations[1].rotation[0], [0, -1, 0]);
});

test('phonopy parser accepts phonopy flat nine-number YAML and translations', () => {
  const operations = parsePhonopySymmetry(`rotations:\n- [ 1, 0, 0, 0, 1, 0, 0, 0, 1 ]\n- [ 0, -1, 0, 1, 0, 0, 0, 0, 1 ]\ntranslations:\n- [ 0, 0, 0 ]\n- [ 0.5, 0, 0 ]`);
  assert.equal(operations.length, 2); assert.deepEqual(operations[1].translation, [.5, 0, 0]);
});
