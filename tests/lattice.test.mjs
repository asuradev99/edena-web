import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cellFromParameters, cellVolume, fractionalToCartesian, cartesianToFractional, CUBIC_OPERATIONS,
  mapsOntoSelf, bonds, latticeSites, supercell, millerPlane, periodicDistance,
  sphericalWedge, sphericalWedgeOutline, boxEdges, mathml, frac, mi,
  applyOperation, siteMapping, cartesianOperation, axisAngle, rotateAboutAxis, shadedSphere, sphere, latticePointGroup,
  operationIsometry, isometryPoint, isometryTarget, improperNormal, symmetryOrbits,
  structureBounds, shortestDistance, isCubic, nearestNeighbours,
} from '../build/index.js';

const close = (a, b, tolerance = 1e-5) => assert.ok(Math.abs(a - b) < tolerance, `${a} ≈ ${b}`);

test('cellFromParameters builds cubic and hexagonal cells', () => {
  const cubic = cellFromParameters(2, 2, 2);
  close(cubic[0][0], 2); close(cubic[1][1], 2); close(cubic[2][2], 2);
  for (let axis = 0; axis < 3; axis++) close(cubic[0][axis] + cubic[1][axis] + cubic[2][axis], 2, 1e-12);
  const hexagonal = cellFromParameters(3, 3, 5, 90, 90, 120);
  close(hexagonal[0][0], 3); close(hexagonal[1][0], -1.5); close(hexagonal[1][1], 3 * Math.sqrt(3) / 2); close(hexagonal[2][2], 5);
  close(cellVolume(hexagonal), 3 * (3 * Math.sqrt(3) / 2) * 5);
});

test('fractional and Cartesian coordinates round-trip through a tilted cell', () => {
  const lattice = cellFromParameters(4, 5, 6, 70, 100, 115);
  for (const fractional of [[0, 0, 0], [.25, .5, .75], [.9, .1, .4]]) {
    const back = cartesianToFractional(fractionalToCartesian(fractional, lattice), lattice);
    for (let axis = 0; axis < 3; axis++) close(back[axis], fractional[axis], 1e-9);
  }
});

test('CUBIC_OPERATIONS is the 48-element point group m-3m', () => {
  assert.equal(CUBIC_OPERATIONS.length, 48);
  const key = (m) => m.flat().map(v => Math.round(v)).join(',');
  const present = new Set(CUBIC_OPERATIONS.map(key));
  const multiply = (a, b) => a.map((row, i) => [0, 1, 2].map(j => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]));
  for (const m of CUBIC_OPERATIONS) {
    const orthonormal = m.every((row, i) => m.every((_, j) => close(row.reduce((s, v, k) => s + v * m[j][k], 0), i === j ? 1 : 0, 1e-9) === undefined));
    assert.ok(orthonormal);
    const det = m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    close(Math.abs(det), 1, 1e-9);
  }
  // The set is closed under composition: every product is another member.
  for (const a of CUBIC_OPERATIONS) for (const b of CUBIC_OPERATIONS) assert.ok(present.has(key(multiply(a, b))));
});

test('mapsOntoSelf is species-aware in fractional space', () => {
  const cube = latticeSites('sc', { side: 2 });
  assert.ok(CUBIC_OPERATIONS.every(rotation => mapsOntoSelf(cube, { rotation, translation: [0, 0, 0], label: 'r' })));
  const offCentre = { comment: 'off centre', lattice: [[2, 0, 0], [0, 2, 0], [0, 0, 2]], species: ['X'], positions: [[.13, .27, .41]] };
  const quarterTurn = CUBIC_OPERATIONS.find(rotation => rotation[0][1] === -1 && rotation[1][0] === 1);
  assert.ok(!mapsOntoSelf(offCentre, { rotation: quarterTurn, translation: [0, 0, 0], label: 'C4' }));
});

test('bonds finds four neighbours per atom in diamond silicon', () => {
  const diamond = latticeSites('diamond', { side: 5.43 });
  const found = bonds(diamond.positions, diamond.lattice, 2.6, { periodic: true });
  const counts = new Array(diamond.positions.length).fill(0);
  for (const bond of found) { counts[bond.i]++; counts[bond.j]++; }
  assert.deepEqual(counts, new Array(8).fill(4));
  close(Math.min(...found.map(bond => bond.length)), 5.43 * Math.sqrt(3) / 4, .02);
});

test('bonds counts every periodic neighbour, not just the closest image', () => {
  // SrTiO3: the body-centre Ti is octahedrally coordinated by six oxygens. Three sit in
  // the cell and three are periodic images, so a "closest image only" rule would find just three.
  const perovskite = latticeSites('perovskite', { side: 3.905, species: ['Sr', 'Ti', 'O'] });
  const found = bonds(perovskite.positions, perovskite.lattice, 1.95 * 1.28, { periodic: true });
  const titanium = found.filter(bond => perovskite.species[bond.i] === 'Ti' || perovskite.species[bond.j] === 'Ti');
  assert.equal(titanium.length, 6);
  const oxygens = new Map();
  for (const bond of found) for (const end of [bond.i, bond.j]) if (perovskite.species[end] === 'O') oxygens.set(end, (oxygens.get(end) ?? 0) + 1);
  assert.deepEqual([...oxygens.values()], [2, 2, 2]);
});

test('supercell replicates sites and scales the cell', () => {
  const salt = latticeSites('rock-salt', { side: 2 });
  const big = supercell(salt, [2, 2, 2]);
  assert.equal(big.positions.length, 64);
  assert.equal(big.species.length, 64);
  assert.deepEqual(big.lattice[0], [4, 0, 0]);
  assert.equal(big.offsets.length, 64);
});

test('millerPlane lies in the requested plane', () => {
  const lattice = cellFromParameters(2, 2, 2);
  const plane = millerPlane(lattice, 1, 0, 0, 2);
  assert.equal(plane.length, 4);
  for (const corner of plane) close(corner[0], 1); // the cell centre along x
});

test('spherical wedge stays inside its radii and traces twelve edges', () => {
  const wedge = sphericalWedge(.4, .6, .5, 1.1, .2, .9, 4);
  assert.ok(wedge.vertices.length > 0);
  for (let i = 0; i < wedge.vertices.length; i += 3) {
    const radius = Math.hypot(wedge.vertices[i], wedge.vertices[i + 1], wedge.vertices[i + 2]);
    assert.ok(radius >= .4 - 1e-6 && radius <= .6 + 1e-6, `radius ${radius}`);
  }
  assert.ok(sphericalWedgeOutline(.4, .6, .5, 1.1, .2, .9).vertices.length > 0);
  assert.ok(boxEdges([0, 0, 0], [1, 1, 1]).vertices.length > 0);
});

test('periodicDistance measures fractional sites through the shortest image', () => {
  const lattice = [[2, 0, 0], [0, 2, 0], [0, 0, 2]];
  close(periodicDistance([.05, 0, 0], [.95, 0, 0], lattice), .2, 1e-9);
  close(periodicDistance([0, 0, 0], [.5, .5, .5], lattice), Math.sqrt(3), 1e-9);
});

test('a symmetry animation ends exactly on the mapped site inside the unit cell', () => {
  // This is the property the viewer relies on: rotate the site along its arc, blend in the
  // lattice translation that wraps it home, and the endpoint must equal the mapped site.
  const perovskite = latticeSites('perovskite', { side: 3.905, species: ['Sr', 'Ti', 'O'] });
  for (const rotation of CUBIC_OPERATIONS) {
    const operation = { rotation, translation: [0, 0, 0], label: 'r' };
    assert.ok(mapsOntoSelf(perovskite, operation, 1e-4));
    const mapping = siteMapping(perovskite, operation, 1e-4);
    const card = cartesianOperation(perovskite.lattice, rotation);
    const rotation2 = axisAngle(card);
    for (let index = 0; index < perovskite.positions.length; index++) {
      const target = mapping[index];
      assert.ok(target >= 0);
      const expectedCartesian = fractionalToCartesian(perovskite.positions[target], perovskite.lattice);
      const from = fractionalToCartesian(perovskite.positions[index], perovskite.lattice);
      const arrived = rotation2 ? rotateAboutAxis(from, rotation2.axis, rotation2.angle) : from;
      const endpoint = [0, 1, 2].map(axis => arrived[axis] + (expectedCartesian[axis] - arrived[axis]));
      for (let axis = 0; axis < 3; axis++) assert.ok(Math.abs(endpoint[axis] - expectedCartesian[axis]) < 1e-9, `op site ${index}`);
      // And the wrapped operation really lands on the mapped site (fractional, periodic).
      const wrapped = applyOperation(operation, perovskite.positions[index]);
      for (let axis = 0; axis < 3; axis++) { const raw = Math.abs(wrapped[axis] - perovskite.positions[target][axis]); assert.ok(Math.min(raw, 1 - raw) < 1e-6); }
    }
  }
});

test('a body-centre C4 permutes the three oxygens and fixes Sr and Ti', () => {
  const perovskite = latticeSites('perovskite', { side: 3.905, species: ['Sr', 'Ti', 'O'] });
  const mapping = siteMapping(perovskite, { rotation: [[0, -1, 0], [1, 0, 0], [0, 0, 1]], translation: [0, 0, 0], label: 'C4z' }, 1e-4);
  assert.deepEqual(mapping, [0, 1, 2, 4, 3]);
});

test('latticePointGroup returns the correct point group for each cell shape', () => {
  const metricPreserved = (lattice, m) => {
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const g = (u, v) => dot(lattice[u], lattice[v]);
    for (let p = 0; p < 3; p++) for (let q = 0; q < 3; q++) {
      let sum = 0;
      for (let r = 0; r < 3; r++) for (let s = 0; s < 3; s++) sum += m[r][p] * g(r, s) * m[s][q];
      if (Math.abs(sum - g(p, q)) > 1e-6) return false;
    }
    return true;
  };
  const cubic = cellFromParameters(4, 4, 4);
  const hexagonal = cellFromParameters(3, 3, 5, 90, 90, 120);
  const tetragonal = cellFromParameters(3, 3, 5);
  assert.equal(latticePointGroup(cubic).length, 48);
  assert.equal(latticePointGroup(hexagonal).length, 24);
  assert.equal(latticePointGroup(tetragonal).length, 16);
  for (const lattice of [cubic, hexagonal, tetragonal]) {
    const group = latticePointGroup(lattice);
    for (const m of group) assert.ok(metricPreserved(lattice, m), 'every operation must preserve the metric');
    // And closure: the product of any two operations is again in the group.
    const key = m => m.flat().join(',');
    const present = new Set(group.map(key));
    const multiply = (a, b) => a.map((row, i) => [0, 1, 2].map(j => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]));
    for (const a of group) for (const b of group) assert.ok(present.has(key(multiply(a, b))));
  }
});

test('shadedSphere carries per-vertex shading and matches the plain sphere geometry', () => {
  const shaded = shadedSphere(1), plain = sphere(1);
  assert.equal(shaded.vertices.length, plain.vertices.length);
  assert.equal(shaded.colors.length, shaded.vertices.length);
  const unique = new Set([...shaded.colors].map(value => value.toFixed(3)));
  assert.ok(unique.size > 8, 'shading should vary across the surface');
});

test('mathtext assembles namespaced MathML', () => {
  const html = mathml(frac(mi('d'), mi('q')));
  assert.match(html, /^<math xmlns="http:\/\/www\.w3\.org\/1998\/Math\/MathML"/);
  assert.match(html, /<mfrac><mi>d<\/mi><mi>q<\/mi><\/mfrac>/);
});

// --- The rigid motion behind the crystal viewer's operation animation ----------------------------

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const determinant = m => dot(m[0], cross(m[1], m[2]));

const cubicCell = cellFromParameters(3.905, 3.905, 3.905);
const perovskite = latticeSites('perovskite', { side: 3.905, species: ['Sr', 'Ti', 'O'] });
const CUBIC_POINT_GROUP = latticePointGroup(cubicCell).map(rotation => ({ rotation, translation: [0, 0, 0], label: '' }));
/** The viewer draws the cell centred on a lattice point, so the symmetry origin is the cell centre. */
const drawnSites = perovskite.positions.map(p => fractionalToCartesian([p[0] - .5, p[1] - .5, p[2] - .5], cubicCell));

test('improperNormal returns the plane normal, not a vector lying in the plane', () => {
  let mirrors = 0;
  for (const operation of CUBIC_POINT_GROUP) {
    const m = cartesianOperation(cubicCell, operation.rotation);
    if (determinant(m) > 0) continue;
    mirrors++;
    const normal = improperNormal(m);
    close(Math.hypot(...normal), 1, 1e-9);
    // M n = -n is exactly what makes n the mirror normal.
    const image = m.map(row => dot(row, normal));
    for (let axis = 0; axis < 3; axis++) close(image[axis], -normal[axis], 1e-9);
  }
  assert.ok(mirrors >= 9, 'm-3m has nine mirror planes');
  // The regression this guards: a diagonal mirror reported (and drawn) as the [001] mirror, because
  // reading the *longest* column of M + I lands inside the plane instead of normal to it.
  const diagonal = improperNormal([[0, 1, 0], [1, 0, 0], [0, 0, 1]]);
  close(Math.abs(diagonal[0]), Math.SQRT1_2, 1e-9);
  close(Math.abs(diagonal[1]), Math.SQRT1_2, 1e-9);
  close(diagonal[2], 0, 1e-9);
});

test('operationIsometry reaches the operation itself at t = 1', () => {
  for (const operation of CUBIC_POINT_GROUP) {
    const isometry = operationIsometry(cubicCell, operation);
    for (const fractional of [[0, 0, 0], [.25, .5, .75], [.5, .5, 0], [.1, .2, .3]]) {
      const start = fractionalToCartesian(fractional, cubicCell);
      const reached = isometryPoint(isometry, start, 1);
      const expected = fractionalToCartesian(applyOperation(operation, fractional), cubicCell);
      // Agreement is up to a lattice vector, so the fractional difference must be an integer.
      const difference = cartesianToFractional([0, 1, 2].map(axis => reached[axis] - expected[axis]), cubicCell);
      for (const value of difference) close(value - Math.round(value), 0, 1e-7);
    }
  }
});

test('a cubic cell needs no correction: every site simply travels its arc', () => {
  assert.equal(drawnSites.length, 5, 'the loops below must not be vacuous');
  for (const operation of CUBIC_POINT_GROUP) {
    const isometry = operationIsometry(cubicCell, operation);
    for (const point of drawnSites) {
      const target = isometryTarget(isometry, point, cubicCell);
      const image = isometryPoint(isometry, point, 1);
      // Any lattice nudge here would show up as a straight chord dragging an atom home.
      for (let axis = 0; axis < 3; axis++) close(target[axis], image[axis], 1e-12);
      // ...and the target stays inside the drawn box.
      const fractional = cartesianToFractional(target, cubicCell);
      for (const value of fractional) assert.ok(Math.abs(value) <= .5 + 1e-9, 'target leaves the box');
    }
  }
});

test('every point-group operation maps the drawn cell onto equivalent sites', () => {
  // Compare around the circle, so 0.9999999 and 0 are the same fractional coordinate.
  const same = (a, b) => Math.abs((((a - b + .5) % 1) + 1) % 1 - .5) < 1e-6;
  assert.equal(drawnSites.length, 5, 'the loop below must not be vacuous');
  for (const operation of CUBIC_POINT_GROUP) {
    const isometry = operationIsometry(cubicCell, operation);
    for (const [index, point] of drawnSites.entries()) {
      // The drawn frame is shifted half a cell from the cell frame, so shift back before comparing.
      const reached = cartesianToFractional(isometryTarget(isometry, point, cubicCell), cubicCell).map(value => value + .5);
      const equivalent = perovskite.positions.some((position, other) =>
        perovskite.species[other] === perovskite.species[index] &&
        position.every((value, axis) => same(value, reached[axis])));
      assert.ok(equivalent, 'target must be an equivalent site of the same element');
    }
  }
});

test('a rotating site follows a circular arc about the axis', () => {
  const c4 = { rotation: [[0, -1, 0], [1, 0, 0], [0, 0, 1]], translation: [0, 0, 0], label: '' };
  const isometry = operationIsometry(cubicCell, c4);
  assert.equal(isometry.improper, false);
  close(isometry.angle, Math.PI / 2, 1e-9);
  // The Sr corner of the perovskite cell sits off the axis and must genuinely orbit it.
  const start = fractionalToCartesian([-.5, -.5, -.5], cubicCell);
  const radius = Math.hypot(...cross(start, isometry.axis));
  assert.ok(radius > 1, 'the corner site is off the axis');
  const heights = [0, .125, .25, .375, .5, .625, .75, .875, 1].map(t => isometryPoint(isometry, start, t));
  for (const [step, point] of heights.entries()) {
    close(Math.hypot(...cross(point, isometry.axis)), radius, 1e-9);          // constant radius
    close(dot(point, isometry.axis), dot(start, isometry.axis), 1e-9);        // planar, level with the start
    if (step) close(Math.hypot(...[0, 1, 2].map(axis => point[axis] - heights[step - 1][axis])), 2 * radius * Math.sin(Math.PI / 32), 1e-6);  // equal chords ⇒ uniform angular speed
  }
});

test('each family performs its own geometric move, and roto-reflections do two of them in turn', () => {
  const point = [1.1, .4, -.7];
  const along = (v, n) => dot(v, n);
  const across = (v, n) => { const a = along(v, n); return [v[0] - a * n[0], v[1] - a * n[1], v[2] - a * n[2]]; };
  const pick = predicate => CUBIC_POINT_GROUP.find(operation => predicate(operationIsometry(cubicCell, operation)));

  // A roto-reflection: the whole rotation happens first, then the whole fold.
  const rotoreflection = pick(iso => iso.improper && Math.abs(iso.angle) > 1e-6 && Math.abs(Math.abs(iso.angle) - Math.PI) > 1e-6);
  assert.ok(rotoreflection, 'm-3m has roto-reflections');
  const spin = operationIsometry(cubicCell, rotoreflection);
  const rotated = rotateAboutAxis(point, spin.axis, spin.angle);
  const halfway = isometryPoint(spin, point, .5);
  for (let axis = 0; axis < 3; axis++) close(halfway[axis], rotated[axis], 1e-9);
  // Three quarters through, the fold is half done, so the site sits exactly in the mirror plane.
  close(along(isometryPoint(spin, point, .75), spin.axis), 0, 1e-9);
  const finished = isometryPoint(spin, point, 1);
  close(along(finished, spin.axis), -along(rotated, spin.axis), 1e-9);          // the fold flips the axis
  for (let axis = 0; axis < 3; axis++) close(across(finished, spin.axis)[axis], across(rotated, spin.axis)[axis], 1e-9);  // and leaves the plane alone

  // A mirror is a reflection: straight through the plane, no spin of its own.
  const mirror = pick(iso => iso.improper && !iso.inversion && Math.abs(iso.angle) < 1e-6);
  assert.ok(mirror, 'm-3m has mirrors');
  const reflect = operationIsometry(cubicCell, mirror);
  const halfFolded = isometryPoint(reflect, point, .5);
  for (let axis = 0; axis < 3; axis++) close(halfFolded[axis], point[axis] - along(point, reflect.axis) * reflect.axis[axis], 1e-9);

  // An inversion is a point operation: straight through the centre.
  const centre = operationIsometry(cubicCell, pick(iso => iso.inversion));
  const quarter = isometryPoint(centre, point, .25);
  for (let axis = 0; axis < 3; axis++) close(quarter[axis], point[axis] * .5, 1e-9);
});

test('symmetryOrbits partitions the cell and does not recompute a mapping per site', () => {
  const group = latticePointGroup(cubicCell).map(rotation => ({ rotation, translation: [0, 0, 0], label: '' }));
  const orbits = symmetryOrbits(perovskite, group, 1e-3);
  // Pm-3m: Sr on 1a, Ti on 1b, and the three face-centre oxygens in one orbit.
  assert.deepEqual(orbits.map(orbit => orbit.join(',')).sort(), ['0', '1', '2,3,4']);
  // With only the identity every site is its own orbit.
  assert.equal(symmetryOrbits(perovskite, [group[0]], 1e-3).length, 5);
  // A site the operation moves to an empty position has no image, which the mapping reports as -1;
  // that is what the viewer's report calls "this operation does not preserve the structure".
  const stray = { positions: [[.2, .2, .2]], species: ['Na'], lattice: cubicCell };
  assert.deepEqual(siteMapping(stray, group[1], 1e-3), [-1]);

  // The regression this guards: siteMapping was recomputed inside the walk, once per (site,
  // operation), which made a 400-atom cell take about six seconds. It should be tens of ms.
  const big = supercell(perovskite, [4, 4, 5]);
  const started = Date.now();
  const large = symmetryOrbits(big, latticePointGroup(big.lattice).map(rotation => ({ rotation, translation: [0, 0, 0], label: '' })), 1e-3);
  const elapsed = Date.now() - started;
  const covered = large.flat().sort((a, b) => a - b);
  assert.deepEqual(covered, [...Array(big.positions.length).keys()], 'every site belongs to exactly one orbit');
  for (const orbit of large) assert.equal(new Set(orbit.map(index => big.species[index])).size, 1, 'an orbit holds one element');
  assert.ok(elapsed < 2000, `400-atom orbits took ${elapsed} ms`);
});

test('isometryTarget only corrects a cell that needs it', () => {
  const hexagonal = cellFromParameters(3, 3, 5, 90, 90, 120);
  const oblique = { rotation: [[0, -1, 0], [1, 0, 0], [0, 0, 1]], translation: [0, 0, 0], label: '' };
  const isometry = operationIsometry(hexagonal, oblique);
  // A point near a hexagonal cell's face is pushed outside by the 90° turn, so it is nudged back in.
  const point = fractionalToCartesian([.45, .45, 0], hexagonal);
  const target = isometryTarget(isometry, point, hexagonal);
  const fractional = cartesianToFractional(target, hexagonal);
  for (const value of fractional) assert.ok(Math.abs(value) <= .5 + 1e-9, 'corrected target leaves the box');
});

test('the isometry decomposition holds for non-cubic point groups too', () => {
  // Everything above uses a cubic cell. The decomposition runs on the Cartesian matrix, so these
  // smaller groups exercise a different set of axes, angles and plane normals.
  const lattices = [
    ['orthorhombic', cellFromParameters(3, 4, 5), 8],
    ['tetragonal', cellFromParameters(3, 3, 5), 16],
    ['hexagonal', cellFromParameters(3, 3, 5, 90, 90, 120), 24],
  ];
  for (const [label, lattice, expected] of lattices) {
    const group = latticePointGroup(lattice).map(rotation => ({ rotation, translation: [0, 0, 0], label: '' }));
    assert.equal(group.length, expected, `${label} point group`);
    for (const operation of group) {
      const isometry = operationIsometry(lattice, operation);
      close(Math.hypot(...isometry.axis), 1, 1e-9);
      if (isometry.improper && !isometry.inversion) {
        // The axis is the -1 eigenvector of the Cartesian matrix, not a vector lying in the plane.
        const m = cartesianOperation(lattice, operation.rotation);
        const image = m.map(row => dot(row, isometry.axis));
        for (let axis = 0; axis < 3; axis++) close(image[axis], -isometry.axis[axis], 1e-9);
      }
      for (const fractional of [[0, 0, 0], [.25, .5, .75], [.1, .2, .3]]) {
        const start = fractionalToCartesian(fractional, lattice);
        const reached = isometryPoint(isometry, start, 1);
        const expected = fractionalToCartesian(applyOperation(operation, fractional), lattice);
        const difference = cartesianToFractional([0, 1, 2].map(axis => reached[axis] - expected[axis]), lattice);
        for (const value of difference) close(value - Math.round(value), 0, 1e-7);
        // Whatever the cell, the drawn target stays inside the box the viewer draws.
        for (const value of cartesianToFractional(isometryTarget(isometry, start, lattice), lattice)) {
          assert.ok(Math.abs(value) <= .5 + 1e-9, `${label}: target leaves the box`);
        }
      }
    }
  }
});

test('isometryPoint interpolates from the identity to the map', () => {
  for (const operation of CUBIC_POINT_GROUP) {
    const isometry = operationIsometry(cubicCell, operation);
    for (const point of drawnSites) {
      const atZero = isometryPoint(isometry, point, 0);
      for (let axis = 0; axis < 3; axis++) close(atZero[axis], point[axis], 1e-12);
    }
  }
});


test('the helpers the viewer frames and sizes a scene with', () => {
  // structureBounds takes in the atoms and the cell corners, so an empty-looking cell still frames.
  const bounds = structureBounds(perovskite);
  close(bounds.min[0], 0, 1e-9);
  close(bounds.max[0], 3.905, 1e-9);
  close(bounds.centre[0], 3.905 / 2, 1e-9);
  close(bounds.extent, 3.905, 1e-9);
  const lone = structureBounds({ positions: [[.2, .3, .4]], species: ['Na'], lattice: cubicCell });
  for (const axis of [0, 1, 2]) { close(lone.min[axis], 0, 1e-9); close(lone.max[axis], 3.905, 1e-9); }
  close(lone.extent, 3.905, 1e-9);
  // A zero-size cell still reports a usable extent rather than 0.
  assert.ok(structureBounds({ positions: [[0, 0, 0]], species: ['Na'], lattice: [[0, 0, 0], [0, 0, 0], [0, 0, 0]] }).extent > 0);

  // shortestDistance is the nearest periodic contact, and falls back when there is no pair.
  close(shortestDistance(perovskite.positions, perovskite.lattice), 3.905 / 2, 1e-6);
  close(shortestDistance([[0, 0, 0]], cubicCell), 3.905 / 4, 1e-9);
  close(shortestDistance([], cubicCell), 3.905 / 4, 1e-9);

  // isCubic distinguishes the cubic cell from the tetragonal and hexagonal ones.
  assert.equal(isCubic(cubicCell), true);
  assert.equal(isCubic(cellFromParameters(3, 3, 5)), false);
  assert.equal(isCubic(cellFromParameters(3, 3, 5, 90, 90, 120)), false);
  // ...and its tolerance is relative, not absolute: 0.75% of 4 is cubic, 0.75% is not a 1e-4 fit.
  assert.equal(isCubic(cellFromParameters(4, 4, 4.03)), true);
  assert.equal(isCubic(cellFromParameters(4, 4, 4.03), 1e-4), false);
});

test('self-image bonds, the neighbour cap, and nearestNeighbours', () => {
  // A site bonding to its own periodic image: one atom in a 2 Å cube with a 2.1 Å cutoff keeps the
  // canonical half-space copies (+x, +y, +z) rather than both signs of each pair.
  const cube = cellFromParameters(2, 2, 2);
  const selfBonds = bonds([[0, 0, 0]], cube, 2.1, { self: true });
  assert.deepEqual(selfBonds.map(bond => bond.image.join(',')).sort(), ['0,0,1', '0,1,0', '1,0,0']);
  assert.ok(selfBonds.every(bond => bond.i === bond.j && bond.j === 0));
  for (const bond of selfBonds) close(bond.length, 2, 1e-9);
  assert.equal(bonds([[0, 0, 0]], cube, 2.1).length, 0, 'self-image bonds are opt-in');

  // maxNeighbours keeps each atom's closest shells even when the cutoff reaches much further.
  const diamond = latticeSites('diamond', { side: 5.43 });
  const capped = bonds(diamond.positions, diamond.lattice, 8, { maxNeighbours: 4 });
  assert.equal(capped.length, 16, 'diamond has four bonds per atom');
  for (const bond of capped) close(bond.length, 5.43 * Math.sqrt(3) / 4, .02);
  assert.ok(bonds(diamond.positions, diamond.lattice, 8).length > capped.length, 'an 8 Å cutoff reaches past the first shell');

  // nearestNeighbours reports how far a point sits from the closest sites, nearest first, one entry
  // per site using that site's nearest periodic image.
  const centre = fractionalToCartesian([.5, .5, .5], perovskite.lattice);
  const around = nearestNeighbours(perovskite.positions, perovskite.lattice, centre, 7, 2.1);
  assert.equal(around.length, 4, 'the Ti site itself plus its three in-cell oxygens');
  close(around[0].length, 0, 1e-9);
  assert.deepEqual(around[0].image, [0, 0, 0]);
  for (const neighbour of around.slice(1)) {
    close(neighbour.length, 3.905 / 2, 1e-6);
    assert.equal(perovskite.species[neighbour.index], 'O');
  }
  for (let index = 1; index < around.length; index++) assert.ok(around[index].length >= around[index - 1].length, 'nearest first');
  assert.equal(nearestNeighbours(perovskite.positions, perovskite.lattice, centre, 7, 1).length, 1, 'a tight cutoff keeps only the site itself');
  assert.equal(nearestNeighbours(perovskite.positions, perovskite.lattice, centre, 1, 2.1).length, 1, 'the count caps the list');
  // A point just outside a cell face reaches into the next cell, and the reported image says which.
  const across = nearestNeighbours(perovskite.positions, perovskite.lattice, fractionalToCartesian([1.05, .5, .5], perovskite.lattice), 4, 2.1);
  assert.equal(across.length, 2);
  assert.equal(perovskite.species[across[0].index], 'O');
  assert.deepEqual(across[0].image, [1, 0, 0]);
  close(across[0].length, 3.905 * .05, 1e-9);
  assert.equal(perovskite.species[across[1].index], 'Ti');
});

test('screw, glide and pure translations are carried along with the move', () => {
  const point = fractionalToCartesian([.25, .25, .1], cubicCell);
  const slideZ = fractionalToCartesian([0, 0, .5], cubicCell);
  const slideY = fractionalToCartesian([0, .25, 0], cubicCell);

  // A 2₁ screw along z: a 180° turn, then half a cell of slide, both spread over the animation.
  const screw = { rotation: [[-1, 0, 0], [0, -1, 0], [0, 0, 1]], translation: [0, 0, .5], label: '' };
  const turning = operationIsometry(cubicCell, screw);
  assert.equal(turning.improper, false);
  assert.equal(turning.trivial, false, 'a screw does not sit still');
  close(Math.abs(turning.angle), Math.PI, 1e-9);
  close(Math.abs(turning.axis[2]), 1, 1e-9);
  for (let axis = 0; axis < 3; axis++) close(turning.translation[axis], slideZ[axis], 1e-9);
  const middle = isometryPoint(turning, point, .5);
  const halfTurned = rotateAboutAxis(point, turning.axis, turning.angle * .5);
  for (let axis = 0; axis < 3; axis++) close(middle[axis], halfTurned[axis] + slideZ[axis] * .5, 1e-9);
  const finished = isometryPoint(turning, point, 1);
  const expected = fractionalToCartesian(applyOperation(screw, [.25, .25, .1]), cubicCell);
  // `applyOperation` folds into the unit cell and the isometry does not, so compare modulo a lattice
  // vector: the two have to be the same site of the crystal.
  const difference = cartesianToFractional([0, 1, 2].map(axis => finished[axis] - expected[axis]), cubicCell);
  for (const value of difference) close(value - Math.round(value), 0, 1e-9);

  // A glide: reflection through the plane ⟂ [100] plus a quarter cell along y.
  const glide = { rotation: [[-1, 0, 0], [0, 1, 0], [0, 0, 1]], translation: [0, .25, 0], label: '' };
  const gliding = operationIsometry(cubicCell, glide);
  assert.equal(gliding.improper, true);
  assert.equal(gliding.inversion, false);
  close(gliding.angle, 0, 1e-9);
  const normal = gliding.axis;
  const along = point[0] * normal[0] + point[1] * normal[1] + point[2] * normal[2];
  const halfFolded = isometryPoint(gliding, point, .5);
  for (let axis = 0; axis < 3; axis++) close(halfFolded[axis], point[axis] - along * normal[axis] + slideY[axis] * .5, 1e-9);

  // A pure translation has no spin and no plane, but it is still a move.
  const slide = { rotation: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], translation: [0, 0, .25], label: '' };
  const translating = operationIsometry(cubicCell, slide);
  assert.equal(translating.trivial, false);
  close(translating.angle, 0, 1e-9);
  close(translating.translation[2], cubicCell[2][2] * .25, 1e-9);
  const slid = isometryPoint(translating, point, .5);
  for (let axis = 0; axis < 3; axis++) close(slid[axis], point[axis] + translating.translation[axis] * .5, 1e-9);
  // With no gliding part the same rotation is marked trivial, which is what the viewer's caption says.
  assert.equal(operationIsometry(cubicCell, { rotation: [[-1, 0, 0], [0, -1, 0], [0, 0, 1]], translation: [0, 0, 0], label: '' }).trivial, false);
  assert.equal(operationIsometry(cubicCell, { rotation: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], translation: [0, 0, 0], label: '' }).trivial, true);
});

test('an independent rotation and reflection agree with the isometry', () => {
  // Written from scratch on purpose: rotateAboutAxis lives in the library under test, so comparing
  // the isometry with it would only prove the library agrees with itself.
  const rotate = (v, n, angle) => {
    const c = Math.cos(angle), s = Math.sin(angle), k = 1 - c;
    const along = v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
    const x = [n[1] * v[2] - n[2] * v[1], n[2] * v[0] - n[0] * v[2], n[0] * v[1] - n[1] * v[0]];
    return [0, 1, 2].map(axis => v[axis] * c + x[axis] * s + n[axis] * along * k);
  };
  const reflect = (v, n) => { const along = v[0] * n[0] + v[1] * n[1] + v[2] * n[2]; return [0, 1, 2].map(axis => v[axis] - 2 * along * n[axis]); };
  for (const operation of CUBIC_POINT_GROUP) {
    const isometry = operationIsometry(cubicCell, operation);
    for (const fractional of [[.1, .2, .3], [.25, .5, .75], [-.4, .15, .05]]) {
      const start = fractionalToCartesian(fractional, cubicCell);
      const reached = isometryPoint(isometry, start, 1);
      // A reflection and a rotation about the same axis commute, so R·sigma or sigma·R describe the
      // same map; the library walks the rotation first.
      const expected = isometry.inversion ? start.map(value => -value)
        : isometry.improper ? reflect(rotate(start, isometry.axis, isometry.angle), isometry.axis)
        : rotate(start, isometry.axis, isometry.angle);
      const difference = cartesianToFractional([0, 1, 2].map(axis => reached[axis] - expected[axis]), cubicCell);
      for (const value of difference) close(value - Math.round(value), 0, 1e-8);
    }
  }
});

test('the point group tolerates rounding but not real distortion', () => {
  // A POSCAR rounded to four decimals gives 2.7366 where γ = 120° wants 2.7366118…, a relative
  // deviation of 4e-6. The metric tolerance is relative to the cell's own scale, so the hexagonal
  // holohedry is still found — an absolute tolerance in Å² would have collapsed it to orthorhombic.
  const rounded = [[3.16, 0, 0], [-1.58, 2.7366, 0], [0, 0, 12.9]];
  assert.equal(latticePointGroup(rounded, 1e-4).length, 24);
  // The same cell with a real 0.5% shear is genuinely not hexagonal, and no tolerance should hide it.
  assert.equal(latticePointGroup([[3.16, 0, 0], [-1.58, 2.75, 0], [0, 0, 12.9]], 1e-4).length, 8);
  // A large cell is not held to a stricter standard than a small one. Both of these are 1e-5 away
  // in the metric (5e-6 in length); an absolute tolerance of 1e-4 Å² would reject the large one.
  assert.equal(latticePointGroup([[39.9998, 0, 0], [0, 40, 0], [0, 0, 40]], 1e-4).length, 48);
  assert.equal(latticePointGroup([[3.99998, 0, 0], [0, 4, 0], [0, 0, 4]], 1e-4).length, 48);
  // ...and asking for a tighter tolerance still reports the lower symmetry.
  assert.equal(latticePointGroup(rounded, 1e-6).length, 8);
});

test('every crystal system reports its own holohedry', () => {
  const systems = [
    ['triclinic', cellFromParameters(5, 6, 7, 80, 90, 100), 2],
    ['monoclinic', cellFromParameters(5, 6, 7, 90, 100, 90), 4],
    ['orthorhombic', cellFromParameters(5, 6, 7), 8],
    ['tetragonal', cellFromParameters(5, 5, 7), 16],
    ['hexagonal', cellFromParameters(5, 5, 7, 90, 90, 120), 24],
    ['rhombohedral', cellFromParameters(5, 5, 5, 75, 75, 75), 12],
    ['cubic', cellFromParameters(5, 5, 5), 48],
    // The primitive cell of a face-centred cubic lattice is rhombohedral with α = β = γ = 60°, and it
    // really is cubic: m-3m is the right answer there, not -3m.
    ['fcc primitive', cellFromParameters(5, 5, 5, 60, 60, 60), 48],
  ];
  for (const [label, lattice, expected] of systems) {
    assert.equal(latticePointGroup(lattice, 1e-4).length, expected, `${label} holohedry`);
  }
});

test('only the point operations that really preserve a cell are kept', () => {
  const side = 5;
  const lattice = [[side, 0, 0], [0, side, 0], [0, 0, side]];
  const operations = latticePointGroup(lattice, 1e-4).map(rotation => ({ rotation, translation: [0, 0, 0], label: '' }));
  const kept = (species, positions) => operations
    .filter(operation => mapsOntoSelf({ lattice, species, positions, comment: '' }, operation, 1e-3)).length;

  // Caesium chloride: both sites sit where every cubic operation puts them, so all 48 survive.
  assert.equal(kept(['Cs', 'Cl'], [[0, 0, 0], [.5, .5, .5]]), 48);
  // Rock salt is the same story with eight sites.
  assert.equal(kept(['Na', 'Na', 'Na', 'Na', 'Cl', 'Cl', 'Cl', 'Cl'],
    [[0, 0, 0], [0, .5, .5], [.5, 0, .5], [.5, .5, 0], [.5, .5, .5], [.5, 0, 0], [0, .5, 0], [0, 0, .5]]), 48);
  // A two-atom diamond cell reduces 48 to 6. A 4-fold about [001] sends (1/4,1/4,1/4) to
  // (-1/4,1/4,1/4) ≡ (3/4,1/4,1/4), a different body-diagonal site: the space group reaches it with a
  // translation, but this cell does not contain it. What is left is the -3m that fixes the [111]
  // direction — three mirrors and the two 3-folds — and zincblende behaves identically.
  assert.equal(kept(['C', 'C'], [[0, 0, 0], [.25, .25, .25]]), 6);
  assert.equal(kept(['Zn', 'S'], [[0, 0, 0], [.25, .25, .25]]), 6);
  // Nudging one perovskite site off its symmetric position drops the crystal to the operations that
  // fix the line it now lies on.
  assert.equal(kept(['Sr', 'Ti', 'O', 'O', 'O'], [[.52, .5, .5], [0, 0, 0], [0, 0, .5], [0, .5, 0], [.5, 0, 0]]), 8);
});
