import test from 'node:test';
import assert from 'node:assert/strict';
import {World,Group,Visual,Geometry} from '../build/index.js';
import {RenderList} from '../build/lib/render-list.js';

test('render traversal observes mutable transforms, nested parents, visibility and reparenting',()=>{
  const world=new World(),a=new Group(),b=new Group(),v=new Visual(new Geometry(new Float32Array()));
  world.add(a,b);a.add(v);const list=new RenderList();
  const check=()=>{
    const cached=list.collect(world),reference=[...world.flatten()];
    assert.equal(cached.length,reference.length);
    for(let i=0;i<cached.length;i++){
      assert.equal(cached[i].node,reference[i].node);
      assert.deepEqual(cached[i].matrix,reference[i].matrix);
      assert.equal(cached[i].opacity,reference[i].opacity);
    }
  };
  check();const initial=list.collect(world)[0].matrix;check();
  assert.equal(list.collect(world)[0].matrix,initial,'unchanged nodes reuse their world matrix');
  v.position[0]=2;check();a.rotation=.7;check();v.scale[2]=.3;check();
  v.orientation=[.1,.2,.3];check();v.orientation[0]=.8;check();v.orientation=undefined;check();
  world.position=[1,2,3];check();a.opacity=.5;v.opacity=.2;check();
  a.visible=false;check();a.position[1]=2;a.visible=true;check();
  a.remove(v);b.position=[-2,3,1];b.add(v);check();
  a.add(v);check(); // shared nodes have a separate world pose on each path
  a.clear();b.clear();check();b.add(v);check();
});
