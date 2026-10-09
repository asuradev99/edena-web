/** Spinless, orthogonal-orbital tight binding in two periodic dimensions. */
export type Point2 = [number, number];
export type TightBindingModel = {
  lattice: [Point2, Point2];
  sites: { position: Point2; energy: number; label?: string }[];
  /** Each undirected bond is entered once; its Hermitian conjugate is added automatically. */
  hoppings: { from: number; to: number; cell: Point2; real: number; imag?: number }[];
};
export type KPoint = { label: string; k: Point2 };
const dot = (a: Point2, b: Point2) => a[0]*b[0]+a[1]*b[1];
const cross = (a: Point2, b: Point2) => a[0]*b[1]-a[1]*b[0];
const finitePoint = (p: Point2) => Array.isArray(p) && p.length===2 && p.every(Number.isFinite);
export function reciprocalLattice(lattice: [Point2, Point2]): [Point2, Point2] {
  if (!Array.isArray(lattice) || lattice.length!==2 || !lattice.every(finitePoint)) throw new Error('Enter two finite lattice vectors.');
  const [a,b]=lattice, area=cross(a,b);
  if (!Number.isFinite(area) || Math.abs(area)<1e-10*Math.hypot(...a)*Math.hypot(...b) || !Number.isFinite(1/area)) throw new Error('Lattice vectors must be nonzero and independent.');
  return [[2*Math.PI*b[1]/area,-2*Math.PI*b[0]/area],[-2*Math.PI*a[1]/area,2*Math.PI*a[0]/area]];
}
export function latticePoint(p: Point2, basis: [Point2, Point2]): Point2 {
  return [p[0]*basis[0][0]+p[1]*basis[1][0],p[0]*basis[0][1]+p[1]*basis[1][1]];
}
export function reducedK(k: Point2, lattice: [Point2, Point2]): Point2 {
  return [dot(k,lattice[0])/(2*Math.PI),dot(k,lattice[1])/(2*Math.PI)];
}

/** Clip a convex polygon against n·p <= bound. Extra coordinates interpolate with its edges. */
export function clipHalfPlane<T extends number[]>(polygon: T[], normal: Point2, bound: number): T[] {
  const result:T[]=[];
  for(let i=0;i<polygon.length;i++){
    const a=polygon[i],b=polygon[(i+1)%polygon.length];
    const da=a[0]*normal[0]+a[1]*normal[1]-bound,db=b[0]*normal[0]+b[1]*normal[1]-bound;
    if(da<=1e-10)result.push(a);
    if((da<0)!==(db<0))result.push(a.map((v,j)=>v+(b[j]-v)*da/(da-db)) as T);
  }
  return result;
}
/** Wigner–Seitz cell of the reciprocal lattice, in Cartesian k coordinates, counterclockwise. */
export function brillouinZone(lattice: [Point2, Point2]): Point2[] {
  let [a,b]=reciprocalLattice(lattice);
  // Gauss reduction keeps the finite neighbor search valid even for strongly skewed input bases.
  for(let i=0;i<100;i++){
    if(dot(b,b)<dot(a,a))[a,b]=[b,a];
    const m=Math.round(dot(a,b)/dot(a,a));
    if(!m)break;
    b=[b[0]-m*a[0],b[1]-m*a[1]];
  }
  const radius=4*(Math.hypot(...a)+Math.hypot(...b));
  let polygon:Point2[]=[[-radius,-radius],[radius,-radius],[radius,radius],[-radius,radius]];
  const neighbors:Point2[]=[];
  for(let i=-2;i<=2;i++)for(let j=-2;j<=2;j++)if(i||j)neighbors.push(latticePoint([i,j],[a,b]));
  neighbors.sort((u,v)=>dot(u,u)-dot(v,v));
  for(const g of neighbors)polygon=clipHalfPlane(polygon,g,dot(g,g)/2);
  return polygon.filter((p,i)=>Math.hypot(p[0]-polygon[(i+1)%polygon.length][0],p[1]-polygon[(i+1)%polygon.length][1])>1e-9);
}
export function insideZone(p: Point2, polygon: Point2[]): boolean {
  return polygon.every((a,i)=>{const b=polygon[(i+1)%polygon.length];return (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])>=-1e-9;});
}
export function clipToZone<T extends number[]>(points:T[], zone:Point2[]):T[]{
  for(let i=0;i<zone.length;i++){
    const a=zone[i],b=zone[(i+1)%zone.length],n:Point2=[b[1]-a[1],a[0]-b[0]];
    points=clipHalfPlane(points,n,dot(n,a));
  }
  return points;
}

/** Eigenvalues of a complex Hermitian matrix, stored as separate row-major real/imaginary arrays. */
export function hermitianEigenvalues(real: Float64Array, imag: Float64Array, n: number): number[] {
  if(!Number.isInteger(n)||n<1||real.length!==n*n||imag.length!==n*n)throw new Error('Matrix dimensions do not match.');
  for(let i=0;i<real.length;i++)if(!Number.isFinite(real[i])||!Number.isFinite(imag[i]))throw new Error('Hamiltonian entries must be finite; reduce the energy scales.');
  if(n===1)return [real[0]];
  if(n===2){const mean=(real[0]+real[3])/2,r=Math.hypot((real[0]-real[3])/2,real[1],imag[1]);return [mean-r,mean+r];}
  // Realification [Re H, -Im H; Im H, Re H] has each eigenvalue twice.
  const size=2*n,a=new Float64Array(size*size);
  let scale=0;
  for(let i=0;i<n;i++)for(let j=0;j<n;j++){
    const r=real[i*n+j],v=imag[i*n+j];scale=Math.max(scale,Math.abs(r),Math.abs(v));
    a[i*size+j]=a[(i+n)*size+j+n]=r;a[i*size+j+n]=-v;a[(i+n)*size+j]=v;
  }
  const tolerance=Math.max(Number.MIN_VALUE,scale*1e-13);
  let converged=false;
  for(let sweep=0;sweep<60;sweep++){
    let largest=0;
    for(let p=0;p<size;p++)for(let q=p+1;q<size;q++){
      const off=a[p*size+q];largest=Math.max(largest,Math.abs(off));if(Math.abs(off)<=tolerance)continue;
      const tau=(a[q*size+q]-a[p*size+p])/(2*off),t=(tau>=0?1:-1)/(Math.abs(tau)+Math.hypot(1,tau));
      const c=1/Math.hypot(1,t),s=t*c;
      a[p*size+p]-=t*off;a[q*size+q]+=t*off;a[p*size+q]=a[q*size+p]=0;
      for(let r=0;r<size;r++)if(r!==p&&r!==q){const x=a[r*size+p],y=a[r*size+q];a[r*size+p]=a[p*size+r]=c*x-s*y;a[r*size+q]=a[q*size+r]=s*x+c*y;}
    }
    if(largest<=tolerance){converged=true;break;}
  }
  if(!converged)throw new Error('The eigensolver did not converge. Check the energy scales.');
  const values=Array.from({length:size},(_,i)=>a[i*size+i]).sort((x,y)=>x-y);
  return Array.from({length:n},(_,i)=>(values[2*i]+values[2*i+1])/2);
}

export class TightBinding2D {
  readonly model:TightBindingModel;
  readonly reciprocal:[Point2,Point2];
  readonly zone:Point2[];
  constructor(model:TightBindingModel){
    this.reciprocal=reciprocalLattice(model.lattice);
    if(!Array.isArray(model.sites)||!model.sites.length||model.sites.length>16)throw new Error('Use between 1 and 16 orbitals.');
    if(model.sites.some(s=>!finitePoint(s.position)||!Number.isFinite(s.energy)))throw new Error('Site coordinates and energies must be finite.');
    if(!Array.isArray(model.hoppings)||model.hoppings.length>2048)throw new Error('Use at most 2048 bonds.');
    const seen=new Set<string>();
    for(const h of model.hoppings){
      if(![h.from,h.to].every(i=>Number.isInteger(i)&&i>=0&&i<model.sites.length)||!finitePoint(h.cell)||!h.cell.every(Number.isInteger)||!Number.isFinite(h.real)||!Number.isFinite(h.imag??0))throw new Error('Bonds need valid orbital indices, integer cell offsets and finite amplitudes.');
      if(h.from===h.to&&h.cell[0]===0&&h.cell[1]===0)throw new Error('Use the site energy for a same-site, same-cell term.');
      const forward=[h.from,h.to,...h.cell].join(','),reverse=[h.to,h.from,-h.cell[0],-h.cell[1]].join(',');
      if(seen.has(forward)||seen.has(reverse))throw new Error('Enter each bond only once; its conjugate is automatic.');
      seen.add(forward);
    }
    this.model=structuredClone(model);this.zone=brillouinZone(model.lattice);
  }
  /** k is in reciprocal fractional coordinates. H_ij = t exp[2πi k·(R+τ_j−τ_i)]. */
  hamiltonian(k:Point2):{real:Float64Array;imag:Float64Array}{
    if(!finitePoint(k))throw new Error('k must have two finite coordinates.');
    const {sites,hoppings}=this.model,n=sites.length,real=new Float64Array(n*n),imag=new Float64Array(n*n);
    sites.forEach((site,i)=>real[i*n+i]=site.energy);
    for(const h of hoppings){
      const from=sites[h.from].position,to=sites[h.to].position;
      const angle=2*Math.PI*(k[0]*(h.cell[0]+to[0]-from[0])+k[1]*(h.cell[1]+to[1]-from[1]));
      const c=Math.cos(angle),s=Math.sin(angle),r=h.real*c-(h.imag??0)*s,v=h.real*s+(h.imag??0)*c;
      real[h.from*n+h.to]+=r;imag[h.from*n+h.to]+=v;
      real[h.to*n+h.from]+=r;imag[h.to*n+h.from]-=v;
    }
    return {real,imag};
  }
  energies(k:Point2):number[]{const h=this.hamiltonian(k);return hermitianEigenvalues(h.real,h.imag,this.model.sites.length);}
}

export function tightBindingPreset(name='hexagonal',t=-1):{model:TightBindingModel;path:KPoint[]}{
  const hex:[Point2,Point2]=[[1,0],[.5,Math.sqrt(3)/2]];
  const model:TightBindingModel={lattice:name==='square'?[[1,0],[0,1]]:hex,sites:[{position:[0,0],energy:0,label:'A'}],hoppings:[]};
  if(name==='honeycomb')model.sites.push({position:[1/3,1/3],energy:0,label:'B'});
  if(name==='kagome')model.sites.push({position:[.5,0],energy:0,label:'B'},{position:[0,.5],energy:0,label:'C'});
  model.hoppings=nearestHoppings(model,t);
  const path:KPoint[]=name==='square'?[{label:'Γ',k:[0,0]},{label:'X',k:[.5,0]},{label:'M',k:[.5,.5]},{label:'Γ',k:[0,0]}]:[{label:'Γ',k:[0,0]},{label:'M',k:[.5,0]},{label:'K',k:[2/3,1/3]},{label:'Γ',k:[0,0]}];
  return {model,path};
}
/** Nearest-neighbor shell among cells in a configurable search radius. */
export function nearestHoppings(model:TightBindingModel,t:number,radius=2):TightBindingModel['hoppings']{
  reciprocalLattice(model.lattice);
  if(!Number.isFinite(t)||!Number.isInteger(radius)||radius<1||radius>8)throw new Error('Invalid hopping or neighbor search radius.');
  const candidates:{bond:TightBindingModel['hoppings'][number];distance:number}[]=[];
  let nearest=Infinity;
  for(let i=0;i<model.sites.length;i++)for(let j=i;j<model.sites.length;j++)for(let x=-radius;x<=radius;x++)for(let y=-radius;y<=radius;y++){
    if(i===j&&(x<0||(x===0&&y<=0)))continue;
    const a=model.sites[i].position,b=model.sites[j].position,p=latticePoint([x+b[0]-a[0],y+b[1]-a[1]],model.lattice),distance=Math.hypot(...p);
    if(distance<1e-10)continue;
    nearest=Math.min(nearest,distance);candidates.push({bond:{from:i,to:j,cell:[x,y],real:t},distance});
  }
  return candidates.filter(c=>Math.abs(c.distance-nearest)<nearest*1e-7).map(c=>c.bond);
}
