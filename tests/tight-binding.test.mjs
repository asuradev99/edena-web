import test from 'node:test';
import assert from 'node:assert/strict';
import {TightBinding2D,tightBindingPreset,brillouinZone,reciprocalLattice,latticePoint,sampleTightBinding,fermiContours,insideZone,bandFilling,hermitianEigenvalues} from '../build/index.js';
const close=(a,b,tol=1e-9)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
test('one-site hexagonal lattice has six neighbors and the analytic triangular dispersion',()=>{
 const {model}=tightBindingPreset();assert.equal(model.sites.length,1);assert.equal(model.hoppings.length,3);
 const solver=new TightBinding2D(model);
 for(const [u,v] of [[0,0],[.5,0],[2/3,1/3],[.123,.456]])close(solver.energies([u,v])[0],-2*(Math.cos(2*Math.PI*u)+Math.cos(2*Math.PI*v)+Math.cos(2*Math.PI*(u-v))));
 close(solver.energies([0,0])[0],-6);close(solver.energies([.5,0])[0],2);close(solver.energies([2/3,1/3])[0],3);
 assert.equal(solver.zone.length,6);
});
test('square and honeycomb reference spectra, onsite shifts, and reciprocal periodicity',()=>{
 const square=new TightBinding2D(tightBindingPreset('square').model);close(square.energies([0,0])[0],-4);close(square.energies([.5,.5])[0],4);
 const {model}=tightBindingPreset('honeycomb');const solver=new TightBinding2D(model);solver.energies([2/3,1/3]).forEach(e=>close(e,0));
 assert.deepEqual(solver.energies([0,0]),[-3,3]);
 model.sites.forEach(s=>s.energy=1.5);const shifted=new TightBinding2D(model);
 const a=shifted.energies([.21,.31]),b=shifted.energies([1.21,-.69]);a.forEach((e,i)=>close(e,b[i]));
 close(a[0]-solver.energies([.21,.31])[0],1.5);
});
test('complex hopping is Hermitian and general eigensolver preserves spectrum',()=>{
 const {model}=tightBindingPreset('kagome');model.hoppings[0].imag=.4;const h=new TightBinding2D(model).hamiltonian([.2,.4]);
 for(let i=0;i<3;i++)for(let j=0;j<3;j++){close(h.real[i*3+j],h.real[j*3+i]);close(h.imag[i*3+j],-h.imag[j*3+i]);}
 const e=hermitianEigenvalues(h.real,h.imag,3);close(e.reduce((a,b)=>a+b,0),0);
 close(e.reduce((a,b)=>a+b*b,0),Array.from(h.real).reduce((sum,r,i)=>sum+r*r+h.imag[i]*h.imag[i],0));
 // Complex 3x3 matrix unitarily similar to a real tridiagonal chain: eigenvalues 0, ±sqrt(2).
 const r=new Float64Array(9),im=new Float64Array(9);im[1]=1;im[3]=-1;r[5]=r[7]=1;
 const chain=hermitianEigenvalues(r,im,3);[-Math.SQRT2,0,Math.SQRT2].forEach((v,i)=>close(chain[i],v));
});
test('BZ has reciprocal-cell area even for a skewed unreduced basis',()=>{
 for(const lat of [[[1,0],[.5,Math.sqrt(3)/2]],[[1,0],[17.3,.2]],[[0,2],[1,0]]]){
  const zone=brillouinZone(lat),b=reciprocalLattice(lat);
  const area=Math.abs(zone.reduce((sum,p,i)=>{const q=zone[(i+1)%zone.length];return sum+p[0]*q[1]-p[1]*q[0];},0))/2;
  close(area,Math.abs(b[0][0]*b[1][1]-b[0][1]*b[1][0]),1e-7);
 }
});
test('sampled Fermi contours stay inside BZ and solve the requested energy',()=>{
 const {model,path}=tightBindingPreset();const sample=sampleTightBinding(model,path,64),solver=new TightBinding2D(model);
 const lines=fermiContours(sample,0,0);assert.ok(lines.length>50);
 for(const segment of lines)for(const p of segment){assert.ok(insideZone(p,sample.zone));const k=[(p[0]*model.lattice[0][0]+p[1]*model.lattice[0][1])/(2*Math.PI),(p[0]*model.lattice[1][0]+p[1]*model.lattice[1][1])/(2*Math.PI)];close(solver.energies(k)[0],0,.025);}
 assert.equal(fermiContours(sample,10,0).length,0);close(bandFilling(sample,-10),0);close(bandFilling(sample,10),1);
 assert.ok(bandFilling(sample,1)>bandFilling(sample,-1));
});
test('invalid models reject singular cells and duplicate conjugate bonds',()=>{
 const {model}=tightBindingPreset();model.hoppings.push({...model.hoppings[0]});assert.throws(()=>new TightBinding2D(model),/once/);
 assert.throws(()=>brillouinZone([[1,0],[2,0]]),/independent/);
});
test('kagome flat band is flat across the BZ and is not drawn as spurious isolines',()=>{
 const {model,path}=tightBindingPreset('kagome');const solver=new TightBinding2D(model);
 for(const k of [[0,0],[.2,.3],[.5,.1],[2/3,1/3]])close(solver.energies(k)[2],2);
 const sampled=sampleTightBinding(model,path,16);assert.equal(fermiContours(sampled,2,2).length,0);
});
test('energy overflow and zero-length paths fail explicitly',()=>{
 const {model,path}=tightBindingPreset();model.hoppings.forEach(h=>h.real=1e308);
 assert.throws(()=>sampleTightBinding(model,path,8),/finite/);
 assert.throws(()=>sampleTightBinding(tightBindingPreset().model,[{label:'A',k:[0,0]},{label:'B',k:[0,0]}],8),/nonzero/);
});
test('filled Fermi slices have the correct area and remain inside the BZ',async()=>{
 const {fermiArea,bandTriangles}=await import('../build/index.js');
 const {model,path}=tightBindingPreset('square'),sample=sampleTightBinding(model,path,32);
 const area=vertices=>{let sum=0;for(let i=0;i<vertices.length;i+=9)sum+=Math.abs((vertices[i+3]-vertices[i])*(vertices[i+7]-vertices[i+1])-(vertices[i+6]-vertices[i])*(vertices[i+4]-vertices[i+1]))/2;return sum;};
 assert.equal(fermiArea(sample,-5,0).length,0);
 close(area(fermiArea(sample,5,0)),4*Math.PI**2,1e-5);
 close(area(fermiArea(sample,0,0)),2*Math.PI**2,1e-5);
 const vertices=fermiArea(sample,1,0);
 for(let i=0;i<vertices.length;i+=3)for(let edge=0;edge<sample.zone.length;edge++){const a=sample.zone[edge],b=sample.zone[(edge+1)%sample.zone.length];assert.ok((b[0]-a[0])*(vertices[i+1]-a[1])-(b[1]-a[1])*(vertices[i]-a[0])>=-1e-5,'Float32 vertices stay within rounding tolerance of the BZ');}
 assert.ok(area(vertices)>area(fermiArea(sample,0,0)));
 assert.strictEqual(bandTriangles(sample,0),bandTriangles(sample,0),'clipped triangles are reused');
 assert.throws(()=>fermiArea(sample,NaN,0),/Invalid/);
});
