import test from 'node:test';
import assert from 'node:assert/strict';
import { OrbitCamera, rayPlane, rayDistance, screenDistance } from '../build/index.js';

test('orbit camera keeps orthographic projection as the default',()=>{
  const camera=new OrbitCamera();camera.yaw=0;camera.pitch=0;camera.height=4;
  assert.deepEqual(camera.project([0,0,0],800,400),[400,200]);
  assert.deepEqual(camera.project([1,0,0],800,400),[500,200]);
  assert.equal(camera.projection,'orthographic');
});

test('perspective projection makes apparent size depend on depth',()=>{
  const camera=new OrbitCamera();camera.yaw=0;camera.pitch=0;camera.projection='perspective';camera.distance=6;camera.fovY=Math.PI/2;
  const near=camera.project([1,0,0],800,400), far=camera.project([1,0,-2],800,400);
  assert.ok(near[0]>400 && far[0]>400);
  assert.ok(Math.abs(near[0]-400)>Math.abs(far[0]-400));
});

test('perspective parameters and aspect are validated',()=>{
  const camera=new OrbitCamera();camera.projection='perspective';camera.near=2;camera.far=1;
  assert.throws(()=>camera.matrix(2));
  camera.near=.1;camera.far=100;assert.throws(()=>camera.matrix(0));
});

test('a picking ray leaves the camera plane and reaches the plane under the pointer', () => {
  for (const projection of ['orthographic', 'perspective']) {
    const camera = new OrbitCamera();
    camera.projection = projection;
    camera.yaw = .6; camera.pitch = .35; camera.height = 5; camera.distance = 12; camera.fovY = Math.PI / 4;
    // The ray through the middle of the viewport runs down the camera's own axis.
    const middle = camera.ray(320, 180, 640, 360);
    assert.ok(Math.abs(rayDistance(middle, camera.target)) < 1e-9, `${projection}: the centre ray misses the point it looks at`);
    assert.ok(Math.abs(Math.hypot(...middle.direction) - 1) < 1e-12, 'the direction is normalised');
    // And every pixel, unprojected onto the ground plane and projected again, comes back to itself.
    for (const [px, py] of [[10, 10], [320, 180], [630, 350], [200, 40]]) {
      const hit = rayPlane(camera.ray(px, py, 640, 360), camera.target, [0, 1, 0]);
      assert.ok(hit, `${projection}: the ground plane should be hit`);
      const [x, y] = camera.project(hit, 640, 360);
      // The projection matrix is Float32, so the round trip is exact to about a hundredth of a pixel.
      assert.ok(Math.hypot(x - px, y - py) < .01, `${projection}: round trip drifted (${px},${py}) -> (${x},${y})`);
    }
  }
});

test('a ray never meets a plane it runs parallel to, and the helpers measure true distances', () => {
  const camera = new OrbitCamera(); camera.yaw = 0; camera.pitch = 0; camera.height = 4; camera.distance = 10;
  const straight = camera.ray(400, 200, 800, 400);
  assert.ok(Math.abs(straight.direction[0]) < 1e-12 && Math.abs(straight.direction[1]) < 1e-12 && straight.direction[2] < 0,
    'the centre ray of a level camera runs along -z');
  // Planes that contain the ray's direction are edge-on: no crossing at all.
  assert.equal(rayPlane(straight, [0, 0, 0], [0, 1, 0]), undefined);
  assert.equal(rayPlane(straight, [0, 0, 0], [1, 0, 0]), undefined);
  // A plane facing the ray is met where the ray stands, at whatever depth the plane sits.
  const facing = rayPlane(straight, [0, 0, -3], [0, 0, 1]);
  assert.ok(facing && Math.abs(facing[2] + 3) < 1e-9, 'the crossing lands on the plane');
  assert.equal(rayDistance(straight, [0, 0, -5]), 0);
  assert.ok(Math.abs(rayDistance(straight, [1.5, 0, -5]) - 1.5) < 1e-9);
  assert.throws(() => camera.ray(0, 0, 0, 0), /positive viewport/);
  assert.ok(Math.abs(screenDistance(camera, [1, 1, 0], ...camera.project([1, 1, 0], 800, 400), 800, 400)) < .01);
});
