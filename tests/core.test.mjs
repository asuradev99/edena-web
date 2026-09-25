import test from 'node:test';
import assert from 'node:assert/strict';
import { Timeline, tween, Group, Visual, Geometry, functionCurve, functionSurface, arrow, OrbitCamera } from '../build/index.js';
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
