/** Homework 3, problems 1–3. Energies in E_G = ℏ²G²/(2m); momenta in G. */
export const RECIPROCAL = Array.from({length:9},(_,i)=>[i%3-1,Math.floor(i/3)-1] as [number,number]);
export const potential=(x:number,y:number,v1:number,v3:number)=>
  v1*(Math.cos(2*Math.PI*x)+Math.cos(2*Math.PI*y))+2*v3*Math.cos(2*Math.PI*x)*Math.cos(2*Math.PI*y);
export function coupling(dx:number,dy:number,v1:number,v3:number):number{
  if(Math.abs(dx)+Math.abs(dy)===1)return v1/2;
  if(Math.abs(dx)===1&&Math.abs(dy)===1)return v3/2;
  return 0;
}
export function planeWaveMatrix(kx:number,ky:number,v1:number,v3:number):number[][]{
  return RECIPROCAL.map(([gx,gy],i)=>RECIPROCAL.map(([hx,hy],j)=>i===j?(kx-gx)**2+(ky-gy)**2:coupling(gx-hx,gy-hy,v1,v3)));
}
/** Symmetric Jacobi diagonalization. Nine plane waves, not a full-basis exact solution. */
export function eigenvalues(matrix:readonly (readonly number[])[]):number[]{
  return diagonalize(matrix,false).map(state=>state.energy);
}
export function eigenstates(matrix:readonly (readonly number[])[]):{energy:number;coefficients:number[]}[]{
  return diagonalize(matrix,true);
}
function diagonalize(matrix:readonly (readonly number[])[],vectors:boolean):{energy:number;coefficients:number[]}[]{
  const n=matrix.length,a=matrix.map(row=>[...row]);
  const basis=vectors?Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>i===j?1:0) as number[]):[];
  for(let sweep=0;sweep<30;sweep++){
    let largest=0;
    for(let p=0;p<n;p++)for(let q=p+1;q<n;q++){
      const off=a[p][q];largest=Math.max(largest,Math.abs(off));if(Math.abs(off)<1e-13)continue;
      const tau=(a[q][q]-a[p][p])/(2*off);
      const t=(tau>=0?1:-1)/(Math.abs(tau)+Math.hypot(1,tau)),c=1/Math.hypot(1,t),s=t*c;
      a[p][p]-=t*off;a[q][q]+=t*off;a[p][q]=a[q][p]=0;
      for(let r=0;r<n;r++)if(r!==p&&r!==q){const x=a[r][p],y=a[r][q];a[r][p]=a[p][r]=c*x-s*y;a[r][q]=a[q][r]=s*x+c*y;}
      if(vectors)for(let r=0;r<n;r++){const x=basis[r][p],y=basis[r][q];basis[r][p]=c*x-s*y;basis[r][q]=s*x+c*y;}
    }
    if(largest<1e-12)break;
  }
  return a.map((row,i)=>{
    const coefficients=vectors?basis.map(r=>r[i]):[];
    // Fix a reproducible global phase; it has no effect on the density.
    const largest=coefficients.reduce((best,c,j)=>Math.abs(c)>Math.abs(coefficients[best])?j:best,0);
    if(coefficients[largest]<0)for(let j=0;j<n;j++)coefficients[j]*=-1;
    return {energy:row[i],coefficients};
  }).sort((a,b)=>a.energy-b.energy);
}
/** Dimensionless Bloch amplitude, coordinates in a; cell-average |psi|² = 1. */
export function xWavefunction(coefficients:readonly number[],x:number,y:number,phase=0):{real:number;imag:number;density:number}{
  let real=0,imag=0;
  for(let i=0;i<RECIPROCAL.length;i++){
    const [gx,gy]=RECIPROCAL[i],angle=2*Math.PI*((.5-gx)*x-gy*y)+phase;
    real+=coefficients[i]*Math.cos(angle);imag+=coefficients[i]*Math.sin(angle);
  }
  return {real,imag,density:real*real+imag*imag};
}
const SIZE=9;
/** Reused scratch for the structured 9x9 Hamiltonian, so a k-grid costs no per-point allocation. */
const spectrumScratch=new Float64Array(SIZE*SIZE);
/** Diagonalize H(k)=diag((kx−gx)²+(ky−gy)²)+V in place; the eigenvalues land on the diagonal. */
function diagonalizeGrid(kx:number,ky:number,v1:number,v3:number):Float64Array{
  const a=spectrumScratch;
  for(let i=0;i<SIZE;i++){
    const gx=RECIPROCAL[i][0],gy=RECIPROCAL[i][1],dx=kx-gx,dy=ky-gy;
    for(let j=0;j<SIZE;j++){
      if(i===j)a[i*SIZE+j]=dx*dx+dy*dy;
      else{const h=RECIPROCAL[j];a[i*SIZE+j]=coupling(gx-h[0],gy-h[1],v1,v3);}
    }
  }
  for(let sweep=0;sweep<30;sweep++){
    let largest=0;
    for(let p=0;p<SIZE;p++)for(let q=p+1;q<SIZE;q++){
      const off=a[p*SIZE+q],magnitude=Math.abs(off);if(magnitude>largest)largest=magnitude;
      if(magnitude<1e-13)continue;
      const tau=(a[q*SIZE+q]-a[p*SIZE+p])/(2*off);
      const t=(tau>=0?1:-1)/(Math.abs(tau)+Math.hypot(1,tau)),c=1/Math.hypot(1,t),s=t*c;
      a[p*SIZE+p]-=t*off;a[q*SIZE+q]+=t*off;a[p*SIZE+q]=a[q*SIZE+p]=0;
      for(let r=0;r<SIZE;r++)if(r!==p&&r!==q){const x=a[r*SIZE+p],y=a[r*SIZE+q];a[r*SIZE+p]=a[p*SIZE+r]=c*x-s*y;a[r*SIZE+q]=a[q*SIZE+r]=s*x+c*y;}
    }
    if(largest<1e-12)break;
  }
  return a;
}
export const bands=(kx:number,ky:number,v1:number,v3:number)=>{
  const a=diagonalizeGrid(kx,ky,v1,v3),values:number[]=[];
  for(let i=0;i<SIZE;i++)values.push(a[i*SIZE+i]);
  return values.sort((x,y)=>x-y);
};
export function xBands(qx:number,qy:number,v1:number):[number,number]{
  const mean=.25+qx*qx+qy*qy,split=Math.hypot(qx,v1/2);return [mean-split,mean+split];
}
export function xCoefficients(v1:number):{lower:number;upper:number;critical:number;gap:number}{
  const gap=Math.abs(v1);return {lower:gap?1-1/gap:-Infinity,upper:gap?1+1/gap:Infinity,critical:.25-gap/2,gap};
}
export function xVelocity(qx:number,qy:number,v1:number,upper=false):[number,number]{
  const split=Math.hypot(qx,v1/2);return [2*qx+(upper?1:-1)*(split?qx/split:0),2*qy];
}
export type Grid={n:number;min:number;max:number;values:Float64Array};
export function grid(fn:(x:number,y:number)=>number,n=64,min=-.5,max=.5):Grid{
  const values=new Float64Array((n+1)**2);
  for(let j=0;j<=n;j++)for(let i=0;i<=n;i++)values[j*(n+1)+i]=fn(min+(max-min)*i/n,min+(max-min)*j/n);
  return {n,min,max,values};
}
export function bandGrids(v1:number,v3:number,n=36,min=-.5,max=.5,centerX=0):Grid[]{
  const result=Array.from({length:4},()=>({n,min,max,values:new Float64Array((n+1)**2)}));
  // E(k) = E(−k) exactly: the basis set is closed under g → −g, so a domain centred on the origin
  // can be solved on one quadrant and mirrored. The nine-wave basis is *not* periodic (g + 1 leaves
  // the set), so a domain centred on X, or any other centre, must be solved point by point.
  const mirror=Math.abs(centerX+(min+max)/2)<1e-9;
  const eigenvalues=new Float64Array(SIZE);
  const set=(i:number,j:number)=>{const k=j*(n+1)+i;for(let b=0;b<4;b++)result[b].values[k]=eigenvalues[b];};
  for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){
    const im=n-i,jm=n-j;
    if(mirror&&(i>im||j>jm))continue;
    const a=diagonalizeGrid(centerX+min+(max-min)*i/n,min+(max-min)*j/n,v1,v3);
    for(let b=0;b<SIZE;b++)eigenvalues[b]=a[b*SIZE+b];
    eigenvalues.sort();
    set(i,j);
    if(mirror){
      if(im!==i)set(im,j);
      if(jm!==j){set(i,jm);if(im!==i)set(im,jm);}
    }
  }
  return result;
}
export type Segment=[[number,number],[number,number]];
/** Marching triangles: fixed triangulation avoids ambiguous four-edge square cases. */
const CONTOUR_TRIANGLES=[[0,1,3],[0,3,2]] as const;
export function contours(g:Grid,level:number):Segment[]{
  const segments:Segment[]=[],{n,min,max,values}=g,h=(max-min)/n;
  // Reused per-cell scratch: the marching loops run up to (n+1)² times, so nothing allocates here.
  const px=[0,0,0,0],py=[0,0,0,0],value=[0,0,0,0],hitX=[0,0,0],hitY=[0,0,0];
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
    const k=j*(n+1)+i,x=min+i*h,y=min+j*h;
    value[0]=values[k]-level;value[1]=values[k+1]-level;value[2]=values[k+n+1]-level;value[3]=values[k+n+2]-level;
    px[0]=x;py[0]=y;px[1]=x+h;py[1]=y;px[2]=x;py[2]=y+h;px[3]=x+h;py[3]=y+h;
    for(let t=0;t<2;t++){
      const tri=CONTOUR_TRIANGLES[t];let count=0;
      for(let edge=0;edge<3;edge++){
        const a=tri[edge],b=tri[(edge+1)%3],va=value[a],vb=value[b];
        if((va>=0)===(vb>=0))continue;
        const s=va/(va-vb);
        hitX[count]=px[a]+s*(px[b]-px[a]);hitY[count]=py[a]+s*(py[b]-py[a]);count++;
      }
      if(count===2)segments.push([[hitX[0],hitY[0]],[hitX[1],hitY[1]]]);
    }
  }
  return segments;
}
export type CriticalKind='minimum'|'saddle'|'maximum';
export const criticalEnergy=(x:number,y:number,a:number,b:number,kind:CriticalKind)=>
  (kind==='maximum'?-1:1)*a*x*x+(kind==='minimum'?1:-1)*b*y*y;
/** Spin-included DOS in G²/E_G units, for ε=A qx²+B qy² in dimensionless variables.
 * The saddle result is its universal singular part, valid |ε| << cutoff, not a whole-band DOS.
 */
export function singularDOS(energy:number,a:number,b:number,kind:CriticalKind,cutoff=1):number{
  if(!(a>0&&b>0&&cutoff>0))throw new Error('Positive curvature magnitudes and cutoff required');
  if(kind==='saddle')return energy===0?Infinity:Math.log(cutoff/Math.abs(energy))/(2*Math.PI**2*Math.sqrt(a*b));
  return (kind==='minimum'?energy>0:energy<0)?1/(2*Math.PI*Math.sqrt(a*b)):0;
}
/** Lorentzian delta on a bounded patch; numerical broadening rounds both steps and logarithms. */
export function numericalDOS(energies:readonly number[],a:number,b:number,kind:CriticalKind,eta:number,n=100,cutoff=1):number[]{
  if(!(eta>0))throw new Error('Positive broadening required');
  // Rectangular cutoff in scaled coordinates u=√a qx,v=√b qy.
  const edge=Math.sqrt(cutoff),h=2*edge/n,weight=h*h/(2*Math.PI**2*Math.sqrt(a*b));
  const samples:number[]=[];
  for(let j=0;j<n;j++)for(let i=0;i<n;i++)samples.push(criticalEnergy(-edge+(i+.5)*h,-edge+(j+.5)*h,1,1,kind));
  return energies.map(e=>{let sum=0;for(const sample of samples)sum+=eta/(Math.PI*((e-sample)**2+eta*eta));return sum*weight;});
}
