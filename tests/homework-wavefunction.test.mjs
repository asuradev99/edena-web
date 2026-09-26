import assert from 'node:assert/strict';
import {eigenstates,eigenvalues,planeWaveMatrix,xWavefunction} from '../build/examples/homework-model.js';
for(const [v1,v3] of [[.06,.025],[-.06,.025],[0,0],[0,.04]]){
  const h=planeWaveMatrix(.5,0,v1,v3),states=eigenstates(h),energies=eigenvalues(h);
  for(const [i,{energy,coefficients:c}] of states.entries()){
    assert.ok(Math.abs(energy-energies[i])<1e-12);
    assert.ok(Math.abs(c.reduce((s,v)=>s+v*v,0)-1)<1e-12);
    for(let r=0;r<9;r++)assert.ok(Math.abs(h[r].reduce((s,v,j)=>s+v*c[j],0)-energy*c[r])<1e-10);
    for(let j=0;j<i;j++)assert.ok(Math.abs(c.reduce((s,v,k)=>s+v*states[j].coefficients[k],0))<1e-12);
    const a=xWavefunction(c,.17,.31),b=xWavefunction(c,1.17,.31),p=xWavefunction(c,.17,.31,1.2);
    assert.ok(Math.abs(a.real+b.real)<1e-12);
    assert.ok(Math.abs(a.imag+b.imag)<1e-12);
    assert.ok(Math.abs(a.density-p.density)<1e-12);
    let integral=0;
    for(let y=0;y<16;y++)for(let x=0;x<16;x++)integral+=xWavefunction(c,x/16,y/16).density/256;
    assert.ok(Math.abs(integral-1)<1e-12);
  }
}
