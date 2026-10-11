import test from 'node:test';
import assert from 'node:assert/strict';
import { fractionalDistanceSquared, spaceGroupOperations, siteMapping, periodicDistance } from '../build/index.js';
import { HBN_GAP, boronNitrideCell, boronNitrideSheet, boronNitrideVacancy } from '../build/examples/hbn.js';

const centre = [.5, .5, .5];
const tally = symbols => symbols.reduce((counts, symbol) => ({ ...counts, [symbol]: (counts[symbol] ?? 0) + 1 }), {});

test('the h-BN monolayer cell is the standard two-atom honeycomb, centred in its vacuum gap', () => {
  const cell = boronNitrideCell();
  assert.deepEqual(cell.species, ['B', 'N']);
  // a = 2.504 Å puts the B–N bond at a/√3 ≈ 1.446 Å.
  const bond = periodicDistance(cell.positions[0], cell.positions[1], cell.lattice);
  assert.ok(Math.abs(bond - 2.504 / Math.sqrt(3)) < 1e-9, `B–N bond was ${bond}`);
  // The layer sits at the middle of the gap, and the gap is long enough that no image crosses it.
  assert.ok(cell.positions.every(position => Math.abs(position[2] - .5) < 1e-12));
  assert.equal(cell.lattice[2][2], HBN_GAP);
  assert.ok(HBN_GAP > 3 * bond);
});

test('a 9 × 9 h-BN sheet holds 162 atoms, and the monovacancy removes the boron nearest the middle', () => {
  const sheet = boronNitrideSheet(9);
  assert.equal(sheet.positions.length, 162);
  assert.deepEqual(tally(sheet.species), { B: 81, N: 81 });

  const patch = boronNitrideVacancy(9);
  assert.equal(patch.positions.length, 161);
  assert.deepEqual(tally(patch.species), { B: 80, N: 81 });

  // Exactly one site of the sheet is absent, and it is the boron closest to the centre.
  const missing = sheet.positions.filter(position =>
    !patch.positions.some(candidate => candidate.every((value, axis) => Math.abs(value - position[axis]) < 1e-12)));
  assert.equal(missing.length, 1);
  const nearestBoron = sheet.positions
    .map((position, index) => ({ position, index }))
    .filter(({ index }) => sheet.species[index] === 'B')
    .reduce((best, entry) => fractionalDistanceSquared(entry.position, centre) < fractionalDistanceSquared(best.position, centre) ? entry : best);
  assert.deepEqual(missing[0], nearestBoron.position);
});

test('the defected sheet keeps the symmetries of the perfect layer, and every one maps it onto itself', () => {
  const patch = boronNitrideVacancy(9);
  const operations = spaceGroupOperations(patch);
  // A monovacancy sits on a site the layer's point group fixes, so it lowers no symmetry: the sheet
  // keeps the twelve D3h operations of the perfect 2-atom cell.
  assert.deepEqual(operations.length, spaceGroupOperations(boronNitrideCell()).length);
  assert.equal(operations.length, 12);
  for (const operation of operations) {
    const mapping = siteMapping(patch, operation);
    assert.ok(mapping.every(index => index >= 0), 'the hole maps to the hole, never onto a drawn site');
    assert.equal(new Set(mapping).size, mapping.length, 'the mapping is a bijection');
  }
});
