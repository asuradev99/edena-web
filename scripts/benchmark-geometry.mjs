import { performance } from 'node:perf_hooks';
import { polyline, parametricSurface, merge, box, isosurface, World, Visual } from '../build/index.js';
const points=Array.from({length:10000},(_,i)=>[Math.cos(i*.01),Math.sin(i*.01),i*.0001]);
const cubes=Array.from({length:500},()=>box([-1,-1,-1],[1,1,1]));
for(const [name,run] of [
  ['polyline-10k',()=>polyline(points)],
  ['surface-100x100',()=>parametricSurface((u,v)=>[u,v,Math.sin(u)*Math.cos(v)],[-3,3],[-3,3],[100,100])],
  ['merge-500-outlined-boxes',()=>merge(...cubes)],
  ['isosurface-48',()=>isosurface((x,y,z)=>x*x+y*y+z*z,{min:[-2,-2,-2],max:[2,2,2]},1,48)],
  ['isosurface-empty-48',()=>isosurface(()=>1,{min:[-2,-2,-2],max:[2,2,2]},0,48)],
]){
  run();const times=[];let geometry;
  for(let i=0;i<7;i++){const start=performance.now();geometry=run();times.push(performance.now()-start);}
  times.sort((a,b)=>a-b);console.log(JSON.stringify({name,medianMs:times[3],vertices:geometry.vertices.length/3}));
}
