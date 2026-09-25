import test from 'node:test';
import assert from 'node:assert/strict';
import { OrbitCamera } from '../build/index.js';

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
