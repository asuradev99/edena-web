import assert from 'node:assert/strict';
import {bandGrids,bands} from '../build/examples/homework-model.js';

// Zoom samples the original nine-wave Hamiltonian on both sides of X.
const n=12,local=bandGrids(.06,.025,n,-.12,.12,.5);
assert.equal(local.length,4);
for(const [i,j] of [[0,0],[6,6],[12,12],[3,9]]){
  const expected=bands(.5-.12+.24*i/n,-.12+.24*j/n,.06,.025);
  for(let b=0;b<4;b++)assert.ok(Math.abs(local[b].values[j*(n+1)+i]-expected[b])<1e-12);
}
assert.equal(local[0].min,-.12);
assert.equal(local[0].max,.12);
const full=bandGrids(.06,.025,n);
assert.equal(full[0].min,-.5);
assert.equal(full[0].max,.5);
