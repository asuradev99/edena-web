import { cross, normalize, sub, type Vec3 } from './math.js';

/** Unindexed triangles. Immutable geometry is shareable across visual nodes. */
export class Geometry {
  readonly vertices: Float32Array;
  /** Optional per-vertex linear RGB (three floats per vertex, same length as `vertices`). */
  readonly colors?: Float32Array;
  constructor(vertices: number[] | Float32Array, colors?: number[] | Float32Array) {
    this.vertices = new Float32Array(vertices);
    if (this.vertices.length % 9 || !this.vertices.every(Number.isFinite)) throw new Error('Geometry requires finite triangle coordinates');
    if (colors !== undefined) {
      const data = new Float32Array(colors);
      if (data.length !== this.vertices.length || !data.every(Number.isFinite)) throw new Error('Geometry colors must be finite and match the vertex count');
      this.colors = data;
    }
  }
}
function triangle(out: number[], a: Vec3, b: Vec3, c: Vec3) { out.push(...a,...b,...c); }

/** Upper bound on points per tube, shared by `polyline` and the sampler that feeds it. */
const MAX_LINE_POINTS = 100_000;

/** Tubes give lines consistent world-space width in 3D (including WebGPU). */
export function polyline(points: Vec3[], width = .012, sides = 4): Geometry {
  if (!(width > 0) || !Number.isInteger(sides) || sides < 3 || sides > 32 || points.length > MAX_LINE_POINTS) throw new Error('Invalid line resolution or width');
  const out: number[]=[];
  for (let i=1;i<points.length;i++) {
    const a=points[i-1], b=points[i];
    if (![...a,...b].every(Number.isFinite)) continue;
    const d=sub(b,a); if (Math.hypot(...d)<1e-9) continue;
    const n=normalize(cross(d, Math.abs(normalize(d)[1])>.9 ? [1,0,0] : [0,1,0]));
    const v=normalize(cross(d,n));
    const ring=(p:Vec3,j:number):Vec3 => p.map((x,k)=>x+width*.5*(n[k]*Math.cos(j*2*Math.PI/sides)+v[k]*Math.sin(j*2*Math.PI/sides))) as Vec3;
    for(let j=0;j<sides;j++) { const p=ring(a,j), q=ring(a,j+1), r=ring(b,j), s=ring(b,j+1); triangle(out,p,q,r); triangle(out,q,s,r); }
  }
  return new Geometry(out);
}
/** Concatenate geometries. Colors survive a merge; uncolored inputs become white. */
export function merge(...geometries: Geometry[]): Geometry {
  const colored = geometries.some(g => g.colors);
  const total = geometries.reduce((sum, g) => sum + g.vertices.length, 0);
  const vertices = new Float32Array(total), colors = colored ? new Float32Array(total) : undefined;
  let offset = 0;
  for (const geometry of geometries) {
    vertices.set(geometry.vertices, offset);
    if (colors) {
      colors.fill(1, offset, offset + geometry.vertices.length);
      if (geometry.colors) colors.set(geometry.colors, offset);
    }
    offset += geometry.vertices.length;
  }
  return new Geometry(vertices, colors);
}
export function circle(radius = 1, segments = 96, plane: 'xy'|'xz'|'yz' = 'xy', width = .012): Geometry {
  const points:Vec3[]=[];
  for(let i=0;i<=segments;i++) { const a=i/segments*Math.PI*2, x=radius*Math.cos(a), y=radius*Math.sin(a); points.push(plane==='xy'?[x,y,0]:plane==='xz'?[x,0,y]:[0,x,y]); }
  return polyline(points,width);
}
export function wireSphere(radius=1, meridians=12, parallels=7, width=.008): Geometry {
  const lines:Geometry[]=[];
  for(let j=0;j<meridians;j++) {
    const a=j/meridians*Math.PI;
    lines.push(polyline(Array.from({length:97},(_,i)=>{ const t=i/96*2*Math.PI; return [radius*Math.sin(t)*Math.cos(a),radius*Math.cos(t),radius*Math.sin(t)*Math.sin(a)] as Vec3; }),width));
  }
  for(let j=1;j<=parallels;j++) {
    const y=-radius+2*radius*j/(parallels+1), r=Math.sqrt(radius*radius-y*y);
    lines.push(polyline(Array.from({length:97},(_,i)=>[r*Math.cos(i/96*2*Math.PI),y,r*Math.sin(i/96*2*Math.PI)]),width));
  }
  return merge(...lines);
}
export function parametricSurface(fn:(u:number,v:number)=>Vec3, uRange:[number,number], vRange:[number,number], resolution:[number,number]=[24,48]): Geometry {
  const [nu,nv]=resolution;
  if (![nu,nv].every(n=>Number.isInteger(n)&&n>0) || nu*nv>250_000) throw new Error('Surface resolution exceeds budget');
  const grid:Vec3[][]=Array.from({length:nu+1},(_,i)=>Array.from({length:nv+1},(_,j)=>fn(uRange[0]+(uRange[1]-uRange[0])*i/nu,vRange[0]+(vRange[1]-vRange[0])*j/nv)));
  const out:number[]=[];
  for(let i=0;i<nu;i++) for(let j=0;j<nv;j++) {
    const a=grid[i][j],b=grid[i+1][j],c=grid[i][j+1],d=grid[i+1][j+1];
    if ([...a,...b,...c,...d].every(Number.isFinite)) { triangle(out,a,b,c); triangle(out,b,d,c); }
  }
  return new Geometry(out);
}
export const sphere = (radius=1) => parametricSurface((u,v)=>[radius*Math.sin(u)*Math.cos(v),radius*Math.cos(u),radius*Math.sin(u)*Math.sin(v)],[0,Math.PI],[0,2*Math.PI]);
export const functionSurface = (f:(x:number,y:number)=>number,x:[number,number],y:[number,number],resolution:[number,number]=[32,32]) => parametricSurface((u,v)=>[u,f(u,v),v],x,y,resolution);
export function functionCurve(fn:(x:number)=>number, domain:[number,number], samples=200, width=.015, maxJump=Infinity): Geometry {
  if (!domain.every(Number.isFinite)||domain[1]<=domain[0]||!Number.isInteger(samples)||samples<2||samples>100_000) throw new Error('Invalid curve domain or sampling budget');
  const lines:Geometry[]=[]; let points:Vec3[]=[];
  const flush=()=>{ if(points.length>1) lines.push(polyline(points,width)); points=[]; };
  for(let i=0;i<=samples;i++) { const x=domain[0]+(domain[1]-domain[0])*i/samples, y=fn(x);
    if(!Number.isFinite(y)) { flush(); continue; }
    if(points.length&&Math.abs(y-points[points.length-1][1])>maxJump) flush();
    // Chunk runs that reach the tube point budget, repeating the joint so the seam is not a gap.
    if(points.length>=MAX_LINE_POINTS) { const joint=points[points.length-1]; flush(); points.push(joint); }
    points.push([x,y,0]);
  }
  flush(); return merge(...lines);
}
export function arrow(start:Vec3,end:Vec3,width=.018): Geometry {
  const d=sub(end,start), size=Math.hypot(...d), dir=normalize(d);
  if(size<1e-8) return new Geometry([]);
  const base=end.map((v,k)=>v-dir[k]*Math.min(.14,size*.3)) as Vec3;
  const n=normalize(cross(dir,Math.abs(dir[1])>.9?[1,0,0]:[0,1,0])), b=normalize(cross(dir,n));
  const out:number[]=[];
  const rim=(i:number):Vec3=>base.map((v,k)=>v+Math.min(.055,size*.13)*(n[k]*Math.cos(i*Math.PI/4)+b[k]*Math.sin(i*Math.PI/4))) as Vec3;
  for(let i=0;i<8;i++) triangle(out,rim(i),rim(i+1),end);
  return merge(polyline([start,base],width,6),new Geometry(out));
}
