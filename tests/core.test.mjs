import test from 'node:test';
import assert from 'node:assert/strict';
import { Timeline, tween, Group, Visual, Geometry, functionCurve, functionSurface, arrow, box, cylinder, sphere, shadedSphere, parametricSurface, OrbitCamera } from '../build/index.js';
import { normalizedField, enclosedFraction, chapters, DURATION, chapterAt } from '../build/demo/physics.js';

test('field is finite at the center, continuous at R, and decays outside',()=>{
  assert.equal(normalizedField(0),0);assert.equal(normalizedField(.5),.5);
  assert.equal(normalizedField(1),1);assert.equal(normalizedField(2),.25);
  assert.ok(Math.abs(normalizedField(1+1e-8)-normalizedField(1-1e-8))<1e-7);
  assert.equal(enclosedFraction(.5),.125);assert.equal(enclosedFraction(2),1);
  for(const r of [-1,NaN,Infinity])assert.throws(()=>normalizedField(r));
});

test('independent angular quadrature confirms shell cancellation and contribution',()=>{
  const integrate=(r,s)=>{
    const n=30000,h=Math.PI/n;let sum=0;
    for(let i=0;i<n;i++){const theta=(i+.5)*h;sum+=(r-s*Math.cos(theta))*Math.sin(theta)/(r*r+s*s-2*r*s*Math.cos(theta))**1.5;}
    return sum*h;
  };
  for(const [r,s] of [[1.5,.7],[.6,.2],[2,1]])assert.ok(Math.abs(integrate(r,s)-2/r**2)<1e-6);
  for(const [r,s] of [[.3,.8],[.7,1],[.9,1.5]])assert.ok(Math.abs(integrate(r,s))<1e-6);
  assert.ok(Math.abs(integrate(1,1)-1)<1e-6);
});

test('absolute timeline cues survive backward seeking, replay, and frame subdivision',()=>{
  let value=0;const t=new Timeline(10).add({start:2,duration:4,update:p=>{value=p;}});
  t.seek(4);assert.equal(value,.5);t.seek(9);assert.equal(value,1);t.seek(0);assert.equal(value,0);
  t.play();for(let i=0;i<40;i++)t.tick(.1);assert.ok(Math.abs(value-.5)<1e-12);
  t.tick(100);assert.equal(t.time,10);assert.equal(t.playing,false);
  t.play();assert.equal(t.time,0);assert.equal(value,0);assert.throws(()=>t.seek(NaN));
  assert.equal(tween(0,1,2,5,8),5);assert.equal(tween(5,1,2,5,8),8);
});

test('curve sampling breaks at invalid values instead of bridging the gap',()=>{
  const curve=functionCurve(x=>Math.abs(x)<.2?NaN:x,[-1,1],100);
  assert.ok(curve.vertices.length>0);
  for(let i=0;i<curve.vertices.length;i+=9){const xs=[curve.vertices[i],curve.vertices[i+3],curve.vertices[i+6]];assert.ok(!(Math.min(...xs)<-.19&&Math.max(...xs)>.19));}
  assert.throws(()=>functionCurve(x=>x,[1,0]));assert.throws(()=>functionCurve(x=>x,[0,1],1e8));
});

test('surface triangles honor resolution and geometry stays finite',()=>{
  const g=functionSurface((x,y)=>x*x+y*y,[-1,1],[-1,1],[4,5]);
  assert.equal(g.vertices.length,4*5*2*9);assert.ok(g.vertices.every(Number.isFinite));
  assert.equal(arrow([0,0,0],[0,0,0]).vertices.length,0);
  assert.throws(()=>new Geometry([NaN,0,0]));
});

test('group transforms compose and cycles are rejected',()=>{
  const parent=new Group(),child=new Group(),visual=new Visual(new Geometry([]));
  parent.position=[2,0,0];child.position=[0,3,0];visual.position=[0,0,4];parent.add(child);child.add(visual);
  const item=[...parent.flatten()][0];assert.deepEqual(Array.from(item.matrix.slice(12,15)),[2,3,4]);
  assert.throws(()=>child.add(parent));parent.remove(child);assert.equal([...parent.flatten()].length,0);
});

test('camera projection and chapter boundaries are deterministic',()=>{
  const camera=new OrbitCamera();camera.yaw=0;camera.pitch=0;camera.height=4;
  assert.deepEqual(camera.project([0,0,0],800,400),[400,200]);assert.deepEqual(camera.project([1,0,0],800,400),[500,200]);
  const shared=camera.matrix(2);
  for(const point of [[0,0,0],[1,2,3],[-2,.5,4]])assert.deepEqual(camera.projectWith(shared,point,800,400),camera.project(point,800,400));
  assert.equal(chapters[chapters.length-1].end,DURATION);
  chapters.forEach((c,i)=>{assert.equal(chapterAt(c.start),i);if(i)assert.equal(chapters[i-1].end,c.start);});
});

test('box builds six outward-wound faces around its bounds', () => {
  const min = [-1, 0, .5], max = [2, 3, 4];
  const geometry = box(min, max);
  // Six quads, two triangles each, three vertices each, three floats each.
  assert.equal(geometry.vertices.length, 6 * 2 * 3 * 3);
  const points = [];
  for (let i = 0; i < geometry.vertices.length; i += 3) points.push([geometry.vertices[i], geometry.vertices[i + 1], geometry.vertices[i + 2]]);
  // Every vertex sits on the surface: each coordinate is one of the two bounds.
  for (const point of points) point.forEach((value, axis) => assert.ok(Math.abs(value - min[axis]) < 1e-6 || Math.abs(value - max[axis]) < 1e-6, 'vertex off the surface'));
  // The bounds really are the given ones in every direction.
  for (let axis = 0; axis < 3; axis++) {
    assert.equal(Math.min(...points.map(point => point[axis])), min[axis]);
    assert.equal(Math.max(...points.map(point => point[axis])), max[axis]);
  }
  // Divergence theorem on the triangle soup: a face wound the other way would flip its own term, so
  // an exact volume means an exactly consistent winding.
  let volume = 0;
  for (let i = 0; i < geometry.vertices.length; i += 9) {
    const [a, b, c] = [0, 1, 2].map(corner => points[i / 3 + corner]);
    volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  assert.ok(Math.abs(volume - 3 * 3 * 3.5) < 1e-9, `an outward winding encloses a positive volume, got ${volume}`);
  // The surface's centroid is the centre of the box, so no face is missing or doubled.
  for (let axis = 0; axis < 3; axis++) {
    const mean = points.reduce((sum, point) => sum + point[axis], 0) / points.length;
    assert.ok(Math.abs(mean - (min[axis] + max[axis]) / 2) < 1e-9);
  }
  assert.throws(() => box([0, 0, 0], [0, 1, 1]));
  assert.throws(() => box([0, 0, 0], [1, 1, Infinity]));
});

test('cylinder encloses its volume for any taper, and a cone closes to a point', () => {
  // Divergence theorem again: the volume of the triangle soup must match the shape it claims to be.
  const volume = geometry => {
    let sum = 0;
    for (let i = 0; i < geometry.vertices.length; i += 9) {
      const a = [geometry.vertices[i], geometry.vertices[i + 1], geometry.vertices[i + 2]];
      const b = [geometry.vertices[i + 3], geometry.vertices[i + 4], geometry.vertices[i + 5]];
      const c = [geometry.vertices[i + 6], geometry.vertices[i + 7], geometry.vertices[i + 8]];
      sum += (a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    }
    return Math.abs(sum);
  };
  const sides = 512;   // the polygon approximation, so compare within its own area deficit
  const straight = cylinder(1.3, 2.4, sides);
  assert.ok(Math.abs(volume(straight) - Math.PI * 1.3 ** 2 * 2.4) < .002 * Math.PI * 1.3 ** 2 * 2.4);
  const frustum = cylinder(1.1, 2, sides, .45);
  assert.ok(Math.abs(volume(frustum) - Math.PI * 2 / 3 * (1.1 ** 2 + 1.1 * .45 + .45 ** 2)) < .004 * Math.PI * 2 / 3 * (1.1 ** 2 + 1.1 * .45 + .45 ** 2));
  const cone = cylinder(1, 3, sides, 0);
  assert.ok(Math.abs(volume(cone) - Math.PI * 1 ** 2 * 3 / 3) < .004 * Math.PI);
  // Capped or not, and the bounds follow the arguments.
  assert.ok(volume(cylinder(1, 2, 32, 1, false, false)) < volume(cylinder(1, 2, 32)));
  const points = [];
  for (let i = 0; i < cone.vertices.length; i += 3) points.push(cone.vertices[i + 1]);
  assert.equal(Math.min(...points), -1.5); assert.equal(Math.max(...points), 1.5);
  for (const bad of [() => cylinder(0, 1), () => cylinder(1, 0), () => cylinder(1, 1, 2), () => cylinder(1, 1, 4, -1)]) assert.throws(bad);
});

test('every closed solid is wound outward, so its signed volume is positive', () => {
  const signed = geometry => {
    let sum = 0;
    for (let i = 0; i < geometry.vertices.length; i += 9) {
      const a = [geometry.vertices[i], geometry.vertices[i + 1], geometry.vertices[i + 2]];
      const b = [geometry.vertices[i + 3], geometry.vertices[i + 4], geometry.vertices[i + 5]];
      const c = [geometry.vertices[i + 6], geometry.vertices[i + 7], geometry.vertices[i + 8]];
      sum += (a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    }
    return sum;
  };
  // The renderer neither culls nor lights, so this rule is invisible on screen — which is exactly why
  // it is worth a test: it is the kind of thing that rots silently.
  const solids = [
    ['box', box([-2, -1, -.5], [2, 1, .5]), (2 - -2) * (1 - -1) * (.5 - -.5)],
    ['cylinder', cylinder(1, 2, 128), Math.PI * 2],
    ['cone', cylinder(1, 2, 128, 0), Math.PI * 2 / 3],
    ['sphere', sphere(1), 4 * Math.PI / 3],
    ['shadedSphere', shadedSphere(1), 4 * Math.PI / 3],
    ['torus', parametricSurface((u, v) => [(1 + .3 * Math.cos(v)) * Math.cos(u), .3 * Math.sin(v), (1 + .3 * Math.cos(v)) * Math.sin(u)], [0, Math.PI * 2], [0, Math.PI * 2], [128, 64]), 2 * Math.PI * Math.PI * 1 * .3 ** 2],
  ];
  for (const [name, geometry, expected] of solids) {
    const volume = signed(geometry);
    assert.ok(volume > 0, `${name} is wound inward (${volume.toFixed(4)})`);
    assert.ok(Math.abs(volume - expected) < .01 * expected + 1e-6, `${name} encloses ${volume.toFixed(4)}, expected about ${expected.toFixed(4)}`);
  }
});
