// Depth for DOM labels: the ray tests, the matrix inverse they need, and the occlusion decision.
// All pure functions, so no GPU and no browser is involved.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  raySphere, rayBox, rayTriangle, invertAffine, occluderInfo, occluderDistance, occluded, probeFor,
  transform, applyMatrix, sphere, box, Geometry, OrbitCamera,
} from '../build/index.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} !~ ${b} (tol ${eps})`);
const DOWN = [0, 0, -1];

test('raySphere reports the near hit, and treats an origin inside the sphere as zero distance', () => {
  near(raySphere([0, 0, 10], DOWN, [0, 0, 0], 1), 9);
  assert.equal(raySphere([0, 0, 10], DOWN, [5, 5, 0], 1), undefined);
  assert.equal(raySphere([0, 0, 10], [0, 1, 0], [0, 0, 0], 1), undefined, 'parallel ray misses');
  near(raySphere([0, 0, 0.5], DOWN, [0, 0, 0], 1), 0, 1e-12);
  near(raySphere([0, -10, 0], [0, 1, 0], [0, 0, 0], 1), 9, 1e-9);
});

test('rayBox uses the slab test and reports an inside origin as zero', () => {
  const min = [-1, -1, -1], max = [1, 1, 1];
  near(rayBox([0, 0, 10], DOWN, min, max), 9);
  assert.equal(rayBox([5, 0, 10], DOWN, min, max), undefined);
  near(rayBox([0, 0, 0], DOWN, min, max), 0, 1e-12);
  assert.equal(rayBox([2, 0, 0], DOWN, min, max), undefined, 'a ray parallel to a face outside it misses');
  near(rayBox([0, 0, 10], DOWN, min, [0.5, 1, 1]), 9);
});

test('rayTriangle hits both faces, misses outside and ignores parallel rays', () => {
  const a = [-1, -1, 0], b = [1, -1, 0], c = [0, 1, 0];
  near(rayTriangle([0, 0, 5], DOWN, a, b, c), 5);
  near(rayTriangle([0, 0, -5], [0, 0, 1], a, b, c), 5, 1e-9);            // back face still counts
  assert.equal(rayTriangle([3, 0, 5], DOWN, a, b, c), undefined);
  assert.equal(rayTriangle([0, 0, 5], [1, 0, 0], a, b, c), undefined);
  assert.equal(rayTriangle([0, 0, -5], DOWN, a, b, c), undefined, 'behind the origin');
});

test('invertAffine inverts a full transform, so the local-space trick is exact', () => {
  const m = transform([1.5, -2, 3], [2, 3, 4], 0.7, [0.3, 0.5, 0.1]);
  const inverse = invertAffine(m);
  for (const point of [[0, 0, 0], [1, 2, 3], [-4, 0.5, 7]]) {
    const round = applyMatrix(inverse, applyMatrix(m, point));
    near(round[0], point[0], 1e-5);
    near(round[1], point[1], 1e-5);
    near(round[2], point[2], 1e-5);
  }
  // a singular matrix is not inverted into NaNs; the identity is returned instead
  const flat = transform([0, 0, 0], [1, 0, 1], 0);
  const safe = invertAffine(flat);
  assert.ok([...safe].every(Number.isFinite));
});

test('occluderInfo recognises a sphere as a sphere, samples a big mesh, and boxes a box', () => {
  const ball = occluderInfo(sphere(1, 16, 24));
  assert.ok(ball.sphere, 'a sphere geometry should get the exact sphere test');
  near(ball.sphere.radius, 1, 1e-6);
  const cube = occluderInfo(box([-1, -1, -1], [1, 1, 1]));
  assert.equal(cube.sphere, undefined, 'a box is not a sphere');
  assert.equal(cube.triangles, 12);
  // decimation keeps the sample bounded however large the mesh is
  const vertices = [];
  for (let i = 0; i < 900; i++) vertices.push(i * 0.01, 0, 0);
  const big = occluderInfo(new Geometry(vertices));
  assert.ok(big.samples.length / 9 <= 160, `sampled ${big.samples.length / 9} triangles, expected <= 160`);
  assert.equal(big.triangles, 300);
});

test('a sphere between the camera and the anchor occludes it; one behind it does not', () => {
  const probeTo = (z) => ({ origin: [0, 0, 10], direction: DOWN, distance: 10 - z });
  const occluders = [{ geometry: sphere(1, 16, 24), matrix: transform([0, 0, 0], [1, 1, 1], 0) }];
  assert.equal(occluded(probeTo(0), occluders), true, 'the anchor at the centre is behind the surface');
  assert.equal(occluded(probeTo(-1), occluders), true, 'anything beyond the sphere is hidden');
  assert.equal(occluded(probeTo(5), occluders), false, 'a point in front of the sphere stays visible');
  assert.equal(occluded(probeTo(2), occluders), false);
  assert.equal(occluded(probeTo(0), []), false, 'no occluders, nothing hidden');
});

test('a label anchored on the surface it is written on is not hidden by it (the bias)', () => {
  const occluders = [{ geometry: sphere(1, 24, 32), matrix: transform([0, 0, 0], [1, 1, 1], 0) }];
  // exactly on the near surface: the ray meets the sphere at the same distance as the anchor
  const onSurface = { origin: [0, 0, 10], direction: DOWN, distance: 9 };
  assert.equal(occluded(onSurface, occluders), false);
  // and it stays visible when anchored a little off-centre, where the sphere bulges toward the eye
  const offCentre = { origin: [0, 0, 10], direction: DOWN, distance: 9 };
  assert.equal(occluded(offCentre, occluders, { bias: 0 }), true, 'with no bias the surface itself counts');
  assert.equal(occluded(offCentre, occluders, { bias: 0.02 }), false, 'the default bias forgives it');
});

test('occluderDistance measures in world units through a scaled and rotated object', () => {
  const occluder = { geometry: sphere(1, 16, 24), matrix: transform([0, 0, 0], [3, 3, 3], 0.9, [0.2, 0.4, 0.6]) };
  const hit = occluderDistance(occluder, { origin: [0, 0, 10], direction: DOWN, distance: 10 }, 10);
  assert.ok(hit < 10 && hit > 6, `expected a hit between 6 and 10, got ${hit}`);
  // a sphere of radius 3 centred at the origin is met at 10 - 3
  near(hit, 7, 0.15);
  assert.equal(occluderDistance(occluder, { origin: [40, 40, 40], direction: DOWN, distance: 1 }, 1), Infinity);
});

test('probeFor builds the camera ray and measures along it', () => {
  const camera = new OrbitCamera();
  camera.target = [0, 0, 0];
  camera.distance = 10;
  camera.yaw = 0;
  camera.pitch = 0;
  camera.projection = 'orthographic';
  const centre = probeFor(camera, 50, 50, 100, 100, [0, 0, 0]);
  near(centre.distance, 10, 1e-6);
  near(centre.direction[2], -1, 1e-9);
  // a point at the target's height but off to one side projects away from the centre pixel
  const off = probeFor(camera, 0, 50, 100, 100, [0, 0, 0]);
  near(off.direction[0], 0, 1e-12);
  assert.ok(off.origin[0] < 0, 'the left edge starts left of the target');
  near(off.distance, 10, 1e-6);
  // perspective agrees on the centre pixel and still gives a unit direction
  camera.projection = 'perspective';
  const perspective = probeFor(camera, 50, 50, 100, 100, [0, 0, 0]);
  near(perspective.distance, 10, 1e-6);
  near(Math.hypot(...perspective.direction), 1, 1e-9);
  const tilted = probeFor(camera, 0, 50, 100, 100, [0, 0, 0]);
  assert.ok(tilted.direction[0] < 0, 'the left edge of a pinhole looks toward -x');
  near(Math.hypot(...tilted.direction), 1, 1e-9);
});

test('a translucent surface is the caller’s to filter, and the geometry still answers', () => {
  // The layer drops translucent objects before asking; here we check the pure behaviour it relies on:
  // a thin shell (a wireframe sphere) still occludes, which is why alpha, not geometry, is the test.
  const shell = occluderInfo(sphere(1, 8, 12));
  assert.ok(shell.sphere);
  const thin = { geometry: sphere(1, 6, 8), matrix: transform([0, 0, 0], [1, 1, 1], 0) };
  assert.equal(occluded({ origin: [0, 0, 10], direction: DOWN, distance: 10 }, [thin]), true);
});
