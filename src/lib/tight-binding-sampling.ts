import {TightBinding2D, latticePoint, reducedK, insideZone, clipToZone, type Point2, type KPoint, type TightBindingModel} from './tight-binding.js';
export type BandSample = {
  n:number; x:[number,number]; y:[number,number]; zone:Point2[];
  bands:Float64Array[]; min:number; max:number;
  path:{distance:number[];energies:number[][];ticks:{label:string;at:number}[]};
};
export function sampleTightBinding(model:TightBindingModel,path:KPoint[],n=64):BandSample{
  if(!Number.isInteger(n)||n<8||n>192)throw new Error('Grid resolution must be an integer from 8 to 192.');
  if(path.length<2||path.length>32||path.some(p=>!Array.isArray(p.k)||p.k.length!==2||!p.k.every(Number.isFinite)||typeof p.label!=='string'))throw new Error('Provide 2–32 labeled k points in reciprocal fractional coordinates.');
  const solver=new TightBinding2D(model),zone=solver.zone;
  const x:[number,number]=[Math.min(...zone.map(p=>p[0])),Math.max(...zone.map(p=>p[0]))];
  const y:[number,number]=[Math.min(...zone.map(p=>p[1])),Math.max(...zone.map(p=>p[1]))];
  const bands=Array.from({length:model.sites.length},()=>new Float64Array((n+1)**2));
  let min=Infinity,max=-Infinity;
  for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){
    const p:Point2=[x[0]+(x[1]-x[0])*i/n,y[0]+(y[1]-y[0])*j/n];
    const energies=solver.energies(reducedK(p,model.lattice)),inside=insideZone(p,zone);
    energies.forEach((e,b)=>{bands[b][j*(n+1)+i]=e;if(inside){min=Math.min(min,e);max=Math.max(max,e);}});
  }
  const distance:number[]=[],energies:number[][]=[],ticks:{label:string;at:number}[]=[];
  let length=0;
  for(let segment=0;segment<path.length-1;segment++){
    const a=path[segment],b=path[segment+1],cart=latticePoint([b.k[0]-a.k[0],b.k[1]-a.k[1]],solver.reciprocal),step=Math.hypot(...cart);
    ticks.push({label:a.label,at:length});
    for(let i=0;i<64;i++){const t=i/64;distance.push(length+step*t);energies.push(solver.energies([a.k[0]+(b.k[0]-a.k[0])*t,a.k[1]+(b.k[1]-a.k[1])*t]));}
    length+=step;
  }
  if(length===0)throw new Error('The k path must have nonzero length.');
  ticks.push({label:path.at(-1)!.label,at:length});distance.push(length);energies.push(solver.energies(path.at(-1)!.k));
  for(const es of energies)for(const e of es){min=Math.min(min,e);max=Math.max(max,e);}
  return {n,x,y,zone,bands,min,max,path:{distance,energies,ticks}};
}
export type Contour2D = [Point2,Point2];
/** Marching triangles, clipped to the first Brillouin zone. No eigenvalue solves while sweeping μ. */
export function fermiContours(sample:BandSample,energy:number,band:number):Contour2D[]{
  const {n,x,y,zone}=sample,values=sample.bands[band];
  if(!values||!Number.isFinite(energy))throw new Error('Invalid band or Fermi energy.');
  let low=Infinity,high=-Infinity;for(const value of values){low=Math.min(low,value);high=Math.max(high,value);}
  // A flat band has a two-dimensional level set, not a collection of isolines.
  if(high-low<=1e-12*Math.max(1,Math.abs(low),Math.abs(high)))return [];
  const result:Contour2D[]=[];
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
    const ids=[j*(n+1)+i,j*(n+1)+i+1,(j+1)*(n+1)+i+1,(j+1)*(n+1)+i];
    const v0=values[ids[0]],v1=values[ids[1]],v2=values[ids[2]],v3=values[ids[3]];
    if(Math.min(v0,v1,v2,v3)>energy||Math.max(v0,v1,v2,v3)<energy)continue;
    const px=x[0]+(x[1]-x[0])*i/n,py=y[0]+(y[1]-y[0])*j/n,dx=(x[1]-x[0])/n,dy=(y[1]-y[0])/n;
    const p:Point2[]=[[px,py],[px+dx,py],[px+dx,py+dy],[px,py+dy]];
    for(const tri of [[0,1,2],[0,2,3]]){
      const hits:Point2[]=[];
      for(let edge=0;edge<3;edge++){
        const a=tri[edge],b=tri[(edge+1)%3],va=values[ids[a]]-energy,vb=values[ids[b]]-energy;
        if((va>=0)===(vb>=0))continue;
        const t=va/(va-vb);hits.push([p[a][0]+t*(p[b][0]-p[a][0]),p[a][1]+t*(p[b][1]-p[a][1])]);
      }
      if(hits.length===2){
        // Clipping a two-vertex polygon yields duplicate crossings; keep its extreme endpoints.
        const clipped=clipToZone(hits,zone);
        if(clipped.length>=2){let far=clipped[0],distance=0;for(const p of clipped){const d=Math.hypot(p[0]-clipped[0][0],p[1]-clipped[0][1]);if(d>distance){distance=d;far=p;}}if(distance>1e-10)result.push([clipped[0],far]);}
      }
    }
  }
  return result;
}
export type BandVertex = [number,number,number]; // Cartesian kx, ky, energy
const triangleCache=new WeakMap<BandSample,Map<number,BandVertex[][]>>();
/** Piecewise-linear band triangles clipped to the BZ, shared by surfaces and occupied slices. */
export function bandTriangles(sample:BandSample,band:number):BandVertex[][]{
  const values=sample.bands[band];
  if(!values)throw new Error('Invalid band.');
  let cache=triangleCache.get(sample);
  if(!cache){cache=new Map();triangleCache.set(sample,cache);}
  const cached=cache.get(band);if(cached)return cached;
  const {n,x,y,zone}=sample,dx=(x[1]-x[0])/n,dy=(y[1]-y[0])/n,result:BandVertex[][]=[];
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
    const k=j*(n+1)+i,px=x[0]+i*dx,py=y[0]+j*dy;
    const points:BandVertex[]=[[px,py,values[k]],[px+dx,py,values[k+1]],
      [px+dx,py+dy,values[k+n+2]],[px,py+dy,values[k+n+1]]];
    for(const ids of [[0,1,2],[0,2,3]]){
      const polygon=clipToZone(ids.map(i=>points[i]),zone);
      for(let t=1;t<polygon.length-1;t++)result.push([polygon[0],polygon[t],polygon[t+1]]);
    }
  }
  cache.set(band,result);return result;
}
/** Triangulated occupied area E(k) ≤ μ. Energy clipping interpolates edges without new solves. */
export function fermiArea(sample:BandSample,energy:number,band:number):Float32Array{
  if(!Number.isFinite(energy))throw new Error('Invalid Fermi energy.');
  const positions:number[]=[];
  for(const tri of bandTriangles(sample,band)){
    const polygon:BandVertex[]=[];
    for(let i=0;i<3;i++){
      const a=tri[i],b=tri[(i+1)%3],insideA=a[2]<=energy,insideB=b[2]<=energy;
      if(insideA)polygon.push(a);
      if(insideA!==insideB){const t=(energy-a[2])/(b[2]-a[2]);polygon.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1]),energy]);}
    }
    for(let i=1;i<polygon.length-1;i++)for(const p of [polygon[0],polygon[i],polygon[i+1]])positions.push(p[0],p[1],0);
  }
  return Float32Array.from(positions);
}
const fillingCache=new WeakMap<BandSample,{values:Float64Array;cells:number}>();
/** Approximate integrated occupation, spinless states per primitive cell. */
export function bandFilling(sample:BandSample,energy:number):number{
  let cached=fillingCache.get(sample);
  if(!cached){
    const values:number[]=[];let cells=0;
    for(let j=0;j<sample.n;j++)for(let i=0;i<sample.n;i++){
      const p:Point2=[sample.x[0]+(sample.x[1]-sample.x[0])*(i+.5)/sample.n,sample.y[0]+(sample.y[1]-sample.y[0])*(j+.5)/sample.n];
      if(!insideZone(p,sample.zone))continue;
      cells++;const k=j*(sample.n+1)+i;
      for(const band of sample.bands)values.push((band[k]+band[k+1]+band[k+sample.n+1]+band[k+sample.n+2])/4);
    }
    cached={values:Float64Array.from(values).sort(),cells};fillingCache.set(sample,cached);
  }
  let lo=0,hi=cached.values.length;
  while(lo<hi){const mid=(lo+hi)>>>1;if(cached.values[mid]<=energy)lo=mid+1;else hi=mid;}
  return lo/Math.max(1,cached.cells);
}
