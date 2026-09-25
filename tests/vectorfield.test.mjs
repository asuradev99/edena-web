import test from 'node:test';
import assert from 'node:assert/strict';
import { streamline, streamlines, sphereSeeds } from '../build/index.js';

test('streamline follows a uniform field for the requested arc length', () => {
  const line = streamline(() => [1, 0, 0], [0, 0, 0], 0, { step: .1, steps: 10 });
  assert.equal(line.length, 11);
  assert.ok(Math.abs(line[10][0] - 1) < 1e-6);
  assert.ok(line.every(point => Math.abs(point[1]) < 1e-9 && Math.abs(point[2]) < 1e-9));
});

test('radial field lines are straight and outward', () => {
  const line = streamline(point => point, [1, 0, 0], 0, { step: .05, steps: 20 });
  assert.ok(line.every(point => Math.abs(point[1]) < 1e-9 && Math.abs(point[2]) < 1e-9));
  assert.ok(line[line.length - 1][0] > 1);
});

test('a stagnation point ends the line immediately', () => {
  assert.equal(streamline(() => [0, 0, 0], [.5, .5, .5]).length, 1);
});

test('streamlines drops runs that never leave the seed', () => {
  const lines = streamlines(point => point, [[0, 0, 0], [1, 0, 0]], 0, { step: .1, steps: 5 });
  assert.equal(lines.length, 1);
});

test('sphereSeeds are evenly spread on a shell', () => {
  const seeds = sphereSeeds(12, 2);
  assert.equal(seeds.length, 12);
  for (const seed of seeds) assert.ok(Math.abs(Math.hypot(...seed) - 2) < 1e-9);
});
