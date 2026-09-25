import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cellFromParameters, cellVolume, fractionalToCartesian, cartesianToFractional, CUBIC_OPERATIONS,
  mapsOntoSelf, bonds, latticeSites, supercell, millerPlane, periodicDistance,
  sphericalWedge, sphericalWedgeOutline, boxEdges, mathml, frac, mi,
  applyOperation, siteMapping, cartesianOperation, axisAngle, rotateAboutAxis, shadedSphere, sphere, latticePointGroup,
  operationIsometry, isometryPoint, isometryTarget, improperNormal,
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

test('isometryPoint interpolates from the identity to the map', () => {
  for (const operation of CUBIC_POINT_GROUP) {
    const isometry = operationIsometry(cubicCell, operation);
    for (const point of drawnSites) {
      const atZero = isometryPoint(isometry, point, 0);
      for (let axis = 0; axis < 3; axis++) close(atZero[axis], point[axis], 1e-12);
    }
  }
});

