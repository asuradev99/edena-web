import { cross, normalize, sub, type Vec3 } from './math.js';

/**
 * Unindexed triangles. Immutable geometry is shareable across visual nodes.
 *
 * Closed solids are wound outward, so a model's signed volume is positive; `box`, `cylinder` and the
 * parametric surfaces all follow that rule. The renderer does not cull or light, so this is a
 * property of the data rather than of the picture, and tests can check it cheaply.
 */
export class Geometry {
  readonly vertices: Float32Array;
  /** Optional per-vertex linear RGB (three floats per vertex, same length as `vertices`). */
  readonly colors?: Float32Array;
  /**
   * Contour lines for a surface or solid, as a line list (two positions per segment). The renderer
   * draws them over the mesh when it is painted in one flat colour, which is the default look for a
   * 3D object. They are the mesh's own *grid* — a meridian and a parallel, never the triangulation
   * diagonal — because the point is to show the form with as few lines as possible. Line art (tubes)
   * and shaded or per-vertex-coloured meshes carry none: a shaded ball already reads as a solid, and
   * outlining a tube would look furry.
   */
  readonly outline?: Float32Array;
  /** True when this geometry carries contour lines. */
  get wireframe(): boolean { return this.outline !== undefined; }
  constructor(vertices: number[] | Float32Array, colors?: number[] | Float32Array, outline?: number[] | Float32Array) {
    this.vertices = new Float32Array(vertices);
    if (this.vertices.length % 9 || !this.vertices.every(Number.isFinite)) throw new Error('Geometry requires finite triangle coordinates');
    if (colors !== undefined) {
      const data = new Float32Array(colors);
      if (data.length !== this.vertices.length || !data.every(Number.isFinite)) throw new Error('Geometry colors must be finite and match the vertex count');
      this.colors = data;
    }
    if (outline !== undefined) {
      const lines = new Float32Array(outline);
      if (lines.length % 6 || !lines.every(Number.isFinite)) throw new Error('Geometry outline requires finite line segments');
      this.outline = lines;
    }
  }
}
function triangle(out: number[], a: Vec3, b: Vec3, c: Vec3) { out.push(...a,...b,...c); }

/** How many contour lines to draw along one direction of a grid, at most. */
const WIRE_LINES = 10;

/** Grid indices that always reach both ends, so a closed surface shows its seam. */
function wireIndices(count: number, lines = WIRE_LINES): number[] {
  const stride = Math.max(1, Math.ceil(count / lines)), index: number[] = [];
  for (let i = 0; i < count; i += stride) index.push(i);
  if (index[index.length - 1] !== count) index.push(count);
  return index;
}

/** Push one line segment, skipping a segment that touches a non-finite sample. */
function segment(out: number[], a: Vec3, b: Vec3): void {
  if (a.every(Number.isFinite) && b.every(Number.isFinite)) out.push(...a, ...b);
}

/** Upper bound on points per tube, shared by `polyline` and the sampler that feeds it. */
const MAX_LINE_POINTS = 100_000;

/** Tubes give lines consistent world-space width in 3D (including WebGPU). */
export function polyline(points: Vec3[], width = .012, sides = 4): Geometry {
  if (!(width > 0) || !Number.isInteger(sides) || sides < 3 || sides > 32 || points.length > MAX_LINE_POINTS) throw new Error('Invalid line resolution or width');
  const out = new Float32Array(Math.max(0, points.length - 1) * sides * 18);
  const cosine = new Float64Array(sides + 1), sine = new Float64Array(sides + 1);
  for (let j = 0; j <= sides; j++) {
    cosine[j] = Math.cos(j * 2 * Math.PI / sides);
    sine[j] = Math.sin(j * 2 * Math.PI / sides);
  }
  let offset = 0;
  const ring = new Float64Array((sides + 1) * 3);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (!a.every(Number.isFinite) || !b.every(Number.isFinite)) continue;
    const d = sub(b, a), distance = Math.hypot(...d);
    if (distance < 1e-9) continue;
    const n = normalize(cross(d, Math.abs(d[1] / distance) > .9 ? [1, 0, 0] : [0, 1, 0]));
    const v = normalize(cross(d, n));
    for (let j = 0; j <= sides; j++) for (let k = 0; k < 3; k++) {
      ring[j * 3 + k] = width * .5 * (n[k] * cosine[j] + v[k] * sine[j]);
    }
    for (let j = 0; j < sides; j++) {
      // Two triangles: (a[j], a[j+1], b[j]), (a[j+1], b[j+1], b[j]).
      for (let corner = 0; corner < 6; corner++) {
        const endpoint = corner === 0 || corner === 1 || corner === 3 ? a : b;
        const radial = (corner === 1 || corner === 3 || corner === 4 ? j + 1 : j) * 3;
        out[offset++] = endpoint[0] + ring[radial];
        out[offset++] = endpoint[1] + ring[radial + 1];
        out[offset++] = endpoint[2] + ring[radial + 2];
      }
    }
  }
  return new Geometry(out.subarray(0, offset));
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
  // A merge keeps contours only when every part carried them: merging a solid with a wire (or a
  // curve) must not drape the whole thing in somebody else's grid.
  let outline: Float32Array | undefined;
  if (geometries.length && geometries.every(g => g.outline)) {
    outline = new Float32Array(geometries.reduce((sum, g) => sum + g.outline!.length, 0));
    let lineOffset = 0;
    for (const geometry of geometries) {
      outline.set(geometry.outline!, lineOffset);
      lineOffset += geometry.outline!.length;
    }
  }
  return new Geometry(vertices, colors, outline);
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
  const finite = grid.map(row => row.map(point => point.every(Number.isFinite)));
  const out = new Float32Array(nu * nv * 18);
  let offset = 0;
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    if (!finite[i][j] || !finite[i + 1][j] || !finite[i][j + 1] || !finite[i + 1][j + 1]) continue;
    const a = grid[i][j], b = grid[i + 1][j], c = grid[i][j + 1], d = grid[i + 1][j + 1];
    // Preserve the outward winding and omit both triangles when any corner is invalid.
    out.set(a, offset); out.set(c, offset + 3); out.set(b, offset + 6);
    out.set(b, offset + 9); out.set(c, offset + 12); out.set(d, offset + 15);
    offset += 18;
  }
  // The contours are the grid lines themselves: a few parallels, a few meridians. Drawing the
  // triangle edges instead would show every quad's diagonal and turn a sphere into a ball of yarn.
  const outline: number[] = [];
  for (const i of wireIndices(nu)) for (let j = 0; j < nv; j++) segment(outline, grid[i][j], grid[i][j + 1]);
  for (const j of wireIndices(nv)) for (let i = 0; i < nu; i++) segment(outline, grid[i][j], grid[i + 1][j]);
  return new Geometry(out.subarray(0, offset), undefined, outline);
}
export const sphere = (radius=1) => parametricSurface((u,v)=>[radius*Math.sin(u)*Math.cos(v),radius*Math.cos(u),radius*Math.sin(u)*Math.sin(v)],[0,Math.PI],[0,2*Math.PI]);
/**
 * A sphere whose per-vertex colors carry a light-model shade, so the unlit triangle pipeline
 * still reads as a solid ball instead of a flat disc. The shade is greyscale; set the
 * `Visual` color to the element hue and the renderer multiplies the two together. Render a
 * larger, faint copy of the same mesh for a glow rim.
 */
export function shadedSphere(radius=1,options:{light?:Vec3;fill?:Vec3;ambient?:number;shininess?:number}={}):Geometry {
  const base=sphere(radius);
  const light=normalize(options.light??[-.45,.72,.52]);
  const fill=normalize(options.fill??[.65,-.4,-.35]);
  const ambient=options.ambient??.32,shininess=options.shininess??30;
  const half=normalize([light[0],light[1],light[2]+1]);
  const colors=new Float32Array(base.vertices.length);
  for(let i=0;i<base.vertices.length;i+=3){
    const n=normalize([base.vertices[i],base.vertices[i+1],base.vertices[i+2]]);
    const diffuse=Math.max(0,n[0]*light[0]+n[1]*light[1]+n[2]*light[2]);
    const back=Math.max(0,n[0]*fill[0]+n[1]*fill[1]+n[2]*fill[2])*.24;
    const specular=Math.pow(Math.max(0,n[0]*half[0]+n[1]*half[1]+n[2]*half[2]),shininess)*.85;
    const shade=Math.max(.22,Math.min(1.75,ambient+diffuse*.82+back+specular));
    colors[i]=shade;colors[i+1]=shade;colors[i+2]=shade;
  }
  return new Geometry(base.vertices,colors);
}
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
/** Point in the library's spherical convention: θ from +Y, φ in the xz-plane. */
export const sphericalPoint = (radius:number, theta:number, phi:number):Vec3 => [radius*Math.sin(theta)*Math.cos(phi),radius*Math.cos(theta),radius*Math.sin(theta)*Math.sin(phi)];

function gridFace(out:number[],surface:(u:number,v:number)=>Vec3,uRange:[number,number],vRange:[number,number],nu:number,nv:number) {
  for(let i=0;i<nu;i++) for(let j=0;j<nv;j++) {
    const u0=uRange[0]+(uRange[1]-uRange[0])*i/nu,u1=uRange[0]+(uRange[1]-uRange[0])*(i+1)/nu;
    const v0=vRange[0]+(vRange[1]-vRange[0])*j/nv,v1=vRange[0]+(vRange[1]-vRange[0])*(j+1)/nv;
    const a=surface(u0,v0),b=surface(u1,v0),c=surface(u1,v1),d=surface(u0,v1);
    if([...a,...b,...c,...d].every(Number.isFinite)) { triangle(out,a,b,c); triangle(out,a,c,d); }
  }
}
/**
 * The curvilinear box a volume element cuts out of a spherical shell: radii `r0…r1`, polar
 * angles `theta0…theta1`, azimuths `phi0…phi1`. Small extents read as one `dV`; large ones
 * read as a wedge of the ball. The six faces are subdivided so the curvature stays smooth.
 */
export function sphericalWedge(r0:number,r1:number,theta0:number,theta1:number,phi0:number,phi1:number,subdivision=6): Geometry {
  if(![r0,r1,theta0,theta1,phi0,phi1].every(Number.isFinite)||r1<=r0||theta1<=theta0||phi1<=phi0) throw new Error('Invalid spherical wedge bounds');
  const n=Math.max(1,Math.round(subdivision)),out:number[]=[];
  const radialP=(r:number,theta:number,phi:number)=>sphericalPoint(r,theta,phi);
  gridFace(out,(v,u)=>radialP(r1,u,v),[theta0,theta1],[phi0,phi1],n,n);          // outer shell
  gridFace(out,(v,u)=>radialP(r0,u,v),[theta0,theta1],[phi0,phi1],n,n);          // inner shell
  gridFace(out,(r,v)=>radialP(r,theta0,v),[r0,r1],[phi0,phi1],n,n);              // θ = θ0
  gridFace(out,(r,v)=>radialP(r,theta1,v),[r0,r1],[phi0,phi1],n,n);              // θ = θ1
  gridFace(out,(r,u)=>radialP(r,u,phi0),[r0,r1],[theta0,theta1],n,n);            // φ = φ0
  gridFace(out,(r,u)=>radialP(r,u,phi1),[r0,r1],[theta0,theta1],n,n);            // φ = φ1
  // No contour of its own: six subdivided faces would be a dense grid. A page that wants the edges
  // of a wedge draws `sphericalWedgeOutline`, which is exactly the twelve arcs a reader needs.
  return new Geometry(out);
}
/** The twelve edges of a spherical wedge as tubes, for a crisp wireframe over a translucent fill. */
export function sphericalWedgeOutline(r0:number,r1:number,theta0:number,theta1:number,phi0:number,phi1:number,width=.01,arc=24): Geometry {
  const edges:Geometry[]=[];
  const polar=(r:number,phi:number)=>polyline(Array.from({length:arc+1},(_,i)=>sphericalPoint(r,theta0+(theta1-theta0)*i/arc,phi)),width);
  const azimuth=(r:number,theta:number)=>polyline(Array.from({length:arc+1},(_,i)=>sphericalPoint(r,theta,phi0+(phi1-phi0)*i/arc)),width);
  const radial=(theta:number,phi:number)=>polyline([sphericalPoint(r0,theta,phi),sphericalPoint(r1,theta,phi)],width);
  for(const r of [r0,r1]) for(const phi of [phi0,phi1]) edges.push(polar(r,phi));
  for(const r of [r0,r1]) for(const theta of [theta0,theta1]) edges.push(azimuth(r,theta));
  for(const theta of [theta0,theta1]) for(const phi of [phi0,phi1]) edges.push(radial(theta,phi));
  return merge(...edges);
}
/** The twelve edges of an axis-aligned box, for cell and unit-cube wireframes. */
export function boxEdges(min:Vec3,max:Vec3,width=.008): Geometry {
  const [x0,y0,z0]=min,[x1,y1,z1]=max,corner=(x:number,y:number,z:number):Vec3=>[x?x1:x0,y?y1:y0,z?z1:z0];
  const edges:Geometry[]=[];
  for(const a of [0,1]) for(const b of [0,1]) edges.push(polyline([corner(a,b,0),corner(a,b,1)],width),polyline([corner(a,0,b),corner(a,1,b)],width),polyline([corner(0,a,b),corner(1,a,b)],width));
  return merge(...edges);
}
/**
 * A solid axis-aligned box: six quads, wound outward. `boxEdges` draws the cage of a cell; this is
 * the surface itself, which is what makes a translucent solid — nested boxes, a volume element, a
 * region of a field — visible rather than a wireframe. Faces share no vertices, so a `Visual` can
 * fade one box without touching its neighbours.
 */
export function box(min:Vec3,max:Vec3): Geometry {
  if (![...min,...max].every(Number.isFinite) || max.some((value,axis)=>value<=min[axis])) throw new Error('Invalid box bounds');
  const [x0,y0,z0]=min,[x1,y1,z1]=max;
  const out:number[]=[];
  const quad=(a:Vec3,b:Vec3,c:Vec3,d:Vec3)=>{ triangle(out,a,b,c); triangle(out,a,c,d); };
  quad([x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]);  // +z
  quad([x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0]);  // -z
  quad([x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]);  // -x
  quad([x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1]);  // +x
  quad([x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0]);  // +y
  quad([x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]);  // -y
  const corner=(x:number,y:number,z:number):Vec3=>[x?x1:x0,y?y1:y0,z?z1:z0], outline:number[]=[];
  for(const a of [0,1]) for(const b of [0,1]) {
    segment(outline,corner(a,b,0),corner(a,b,1));
    segment(outline,corner(a,0,b),corner(a,1,b));
    segment(outline,corner(0,a,b),corner(1,a,b));
  }
  return new Geometry(out, undefined, outline);
}
/**
 * A cylinder about the y axis, centred on the origin: the third solid the transparency demos want
 * beside `box` and `sphere`. Give `topRadius` a different value for a frustum, or zero for a cone.
 * Caps are on by default so the surface encloses a volume, which is what makes translucency read.
 */
export function cylinder(radius:number,height:number,sides=48,topRadius=radius,capTop=true,capBottom=true): Geometry {
  if (!(radius>0)||!(topRadius>=0)||!(height>0)||!Number.isInteger(sides)||sides<3||sides>512) throw new Error('Invalid cylinder parameters');
  const out:number[]=[],half=height/2,ring=(r:number,y:number,i:number):Vec3=>[r*Math.cos(i*2*Math.PI/sides),y,r*Math.sin(i*2*Math.PI/sides)];
  for(let i=0;i<sides;i++){
    const a=ring(radius,-half,i),b=ring(radius,-half,i+1),c=ring(topRadius,half,i),d=ring(topRadius,half,i+1);
    if (topRadius>0) { triangle(out,a,c,b); triangle(out,b,c,d); }
    else triangle(out,a,c,b);   // a cone: the top ring collapses to one point, so one triangle each
    if(capBottom) triangle(out,a,b,[0,-half,0]);
    if(capTop&&topRadius>0) triangle(out,d,c,[0,half,0]);
  }
  // Two rims plus a dozen verticals: enough to read the barrel and the taper, and no more.
  const outline:number[]=[];
  for(let i=0;i<sides;i++){
    segment(outline,ring(radius,-half,i),ring(radius,-half,i+1));
    if(topRadius>0) segment(outline,ring(topRadius,half,i),ring(topRadius,half,i+1));
  }
  for(const i of wireIndices(sides)) {
    if(topRadius>0) segment(outline,ring(radius,-half,i),ring(topRadius,half,i));
    else segment(outline,ring(radius,-half,i),[0,half,0]);
  }
  return new Geometry(out, undefined, outline);
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
