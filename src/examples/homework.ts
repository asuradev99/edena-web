import {WebGPUView,LabelLayer,Visual,Geometry,polyline,merge,rgba,viridis,plasma,mathml,row,mi,mn,mo,msub,msup,frac,sqrt,matrix,integral,abs,type Vec3} from '../index.js';
import {potential,bands,bandGrids,grid,contours,xBands,xCoefficients,singularDOS,numericalDOS,criticalEnergy,type Grid,type CriticalKind,type Segment} from './homework-model.js';
import {eigenstates,planeWaveMatrix,xWavefunction,RECIPROCAL} from './homework-model.js';

const $=<T extends HTMLElement>(id:string)=>{const el=document.getElementById(id);if(!el)throw new Error(`Missing ${id}`);return el as T;};
const svg=(id:string)=>document.getElementById(id)!;
const value=(id:string)=>Number($<HTMLInputElement>(id).value);
const C={teal:'#68d5cd',gold:'#f4cc79',rose:'#f19cae',blue:'#91b9ff',muted:'#637687',grid:'#243441'};
const bandColors=[C.teal,C.rose,C.blue,C.gold];
// Resolve narrow avoided crossings without interpolating a coarse mesh across them.
const BAND_RESOLUTION=96;
const state={v1:.06,v3:.025,mu:.22,band:0,delta:-.25,upper:false,both:false,showBands:false,showFree:false,kind:'saddle' as CriticalKind,a:1,b:1,eta:.024,dosEnergy:.08};
const views:WebGPUView[]=[],layers:LabelLayer[]=[];
const visible=new Set<HTMLCanvasElement>();
let spectra:Grid[]=[],disposed=false,frame=0,muPlay=false,transitionPlay=false,last=0,phase=0;
let schedule=0,dosSchedule=0;
let zoomX=false;
let freeSpectra=bandGrids(0,0);
let globalSpectra:Grid[]=[];
let bandDOSBase='';let bandDOSChart:ReturnType<typeof chart>;
let bandCuts:Visual[]=[];let bandPlane:Visual;
let localGrids:Grid[]=[];let localCuts:Visual[]=[];let localPlane:Visual;
let localMap:(x:number,y:number,e:number)=>Vec3;
let localEc=0,localStep=.01;
let dosGrid:Grid,dosPlane:Visual,dosCut:Visual,dosChart:ReturnType<typeof chart>,dosValues:number[]=[];
let dosScale=1;
let bandEnergyCenter=.4;
const bandCenter=()=>bandEnergyCenter;
const bandScale=()=>zoomX?12:4;
const bandExtent=()=>zoomX?.12:.5;
const bandMap=(x:number,y:number,e:number):Vec3=>[x/bandExtent()*2.9,(e-bandCenter())*bandScale(),y/bandExtent()*2.9];
const bandFloor=-2.2,localFloor=-2.15;
function plane(size:number):Geometry{return new Geometry([-size,0,-size,size,0,-size,-size,0,size,-size,0,size,size,0,-size,size,0,size]);}
function resetLabels(index:number,id:string):LabelLayer{layers[index].dispose();layers[index]=new LabelLayer($(id),views[index].camera);return layers[index];}
const observer=new IntersectionObserver(entries=>{for(const e of entries){if(e.isIntersecting)visible.add(e.target as HTMLCanvasElement);else visible.delete(e.target as HTMLCanvasElement);}},{rootMargin:'100px'});

function line(points:[number,number][],color:string,width=2,extra=''):string{return `<path d="${points.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="${width}" ${extra}/>`;}
function text(x:number,y:number,label:string,anchor='middle',color=''):string{return `<text x="${x}" y="${y}" text-anchor="${anchor}"${color?` style="fill:${color}"`:''}>${label}</text>`;}
function chart(xmin:number,xmax:number,ymin:number,ymax:number,xlabel:string,ylabel:string,w=600,h=380){
  const left=62,right=w-22,top=28,bottom=h-50;
  const x=(v:number)=>left+(v-xmin)/(xmax-xmin)*(right-left),y=(v:number)=>bottom-(v-ymin)/(ymax-ymin)*(bottom-top);
  let base='';
  for(let i=0;i<=4;i++){
    const a=xmin+(xmax-xmin)*i/4,b=ymin+(ymax-ymin)*i/4;
    base+=line([[x(a),top],[x(a),bottom]],C.grid,.7)+line([[left,y(b)],[right,y(b)]],C.grid,.7);
    base+=text(x(a),bottom+21,format(a))+text(left-10,y(b)+4,format(b),'end');
  }
  base+=text((left+right)/2,h-5,xlabel)+text(left,14,ylabel,'start');
  return {x,y,base,top,bottom,left,right,w,h};
}
const format=(v:number)=>Math.abs(v)<1e-10?'0':Math.abs(v)<.01?v.toExponential(1):Number(v.toFixed(3)).toString().replace('-','−');
function segmentPath(segments:Segment[],x:(v:number)=>number,y:(v:number)=>number,color:string,width=2):string{
  return `<path d="${segments.map(([a,b])=>`M${x(a[0]).toFixed(2)},${y(a[1]).toFixed(2)}L${x(b[0]).toFixed(2)},${y(b[1]).toFixed(2)}`).join('')}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;
}
function mesh(g:Grid,map:(x:number,y:number,e:number)=>Vec3,range:[number,number],palette=viridis):Geometry{
  const positions:number[]=[],colors:number[]=[],{n,min,max,values}=g;
  const vertex=(i:number,j:number)=>{const e=values[j*(n+1)+i],p=map(min+(max-min)*i/n,min+(max-min)*j/n,e);positions.push(...p);colors.push(...palette((e-range[0])/(range[1]-range[0]||1)));};
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){vertex(i,j);vertex(i+1,j+1);vertex(i+1,j);vertex(i,j);vertex(i,j+1);vertex(i+1,j+1);}
  return new Geometry(positions,colors);
}
function contourMesh(segments:Segment[],map:(x:number,y:number)=>Vec3,width=.012):Geometry{
  return merge(...segments.map(([a,b])=>polyline([map(...a),map(...b)],width,4)));
}
function floorGrid(size=2.6,y=-.85):Geometry{
  const parts:Geometry[]=[];
  for(let i=-4;i<=4;i++){const p=size*i/4;parts.push(polyline([[-size,y,p],[size,y,p]],.005),polyline([[p,y,-size],[p,y,size]],.005));}
  return merge(...parts);
}
function setScene(view:WebGPUView,surface:Geometry,lines:Geometry[]=[],floorY?:number){
  view.world.clear();view.world.add(new Visual(surface));
  if(floorY!==undefined)view.world.add(new Visual(floorGrid(2.6,floorY),rgba(C.muted,.24)));
  for(const g of lines)view.world.add(new Visual(g,rgba(C.gold)));
}
async function createView(id:string,height:number):Promise<WebGPUView>{
  const view=await WebGPUView.create($<HTMLCanvasElement>(`${id}-canvas`),{device:views[0]?.device,onError:report,maxDpr:2,samples:4});
  if(disposed){view.dispose();throw new Error('Page disposed during initialization');}
  view.camera.height=height;view.camera.yaw=.62;view.camera.pitch=.50;
  views.push(view);visible.add(view.canvas);observer.observe(view.canvas);
  layers.push(new LabelLayer($(`${id}-labels`),view.camera));return view;
}
function report(error:string){$('status').textContent=error;$('status').hidden=false;}
function formulas(){
  const eg=msub(mi('E'),mi('G')),q=(axis:string)=>msub(mi('q'),mi(axis));
  const v1=msub(mi('V'),mn(1)),v3=msub(mi('V'),mn(3));
  const cos=(inner:string)=>row(mi('cos'),mo('('),inner,mo(')'));
  const cx=cos(row(mi('G'),mi('x'))),cy=cos(row(mi('G'),mi('y')));
  $('potential-equation').innerHTML=mathml(row(mi('U'),mo('='),v1,mo('['),cx,mo('+'),cy,mo(']'),mo('+'),mn(2),v3,cx,cy));
  const diagonal=(sign:string)=>row(msup(row(mo('('),frac(mn(1),mn(2)),mo(sign),q('x'),mo(')')),mn(2)),mo('+'),msup(q('y'),mn(2)));
  const off=frac(msub(mi('v'),mn(1)),mn(2));
  $('x-equation').innerHTML=mathml(row(frac(msub(mi('H'),mi('X')),eg),mo('='),matrix([[diagonal('+'),off],[off,diagonal('−')]])))+'<span class="small"> &nbsp; here q is in units of G and v₁ = V₁/E<sub>G</sub></span>';
  $('x-matrix').textContent='Subtract the mean kinetic energy. The remaining matrix is qₓ σz + (v₁/2) σx, whose eigenvalues are ±√(qₓ² + v₁²/4) in units of E_G.';
  const split=sqrt(row(msup(q('x'),mn(2)),mo('+'),frac(msup(msub(mi('v'),mn(1)),mn(2)),mn(4))));
  $('eigen-equation').innerHTML=mathml(row(frac(msub(mi('E'),mo('±')),eg),mo('='),frac(mn(1),mn(4)),mo('+'),msup(q('x'),mn(2)),mo('+'),msup(q('y'),mn(2)),mo('±'),split));
  $('mass-equation').innerHTML=mathml(row(frac(mi('m'),msub(msup(mi('m'),mo('*')),mi('x'))),mo('='),mn(1),mo('±'),frac(eg,abs(v1)),mo(','),msub(msup(mi('m'),mo('*')),mi('y')),mo('='),mi('m')));
  const mass=sqrt(abs(row(msub(mi('m'),mi('x')),msub(mi('m'),mi('y'))))),h2=msup(mi('ℏ'),mn(2));
  $('dos-extrema').innerHTML=mathml(row(mi('ν'),mo('='),frac(mass,row(mi('π'),h2)),mi('Θ'),mo('('),mo('±'),mo('('),mi('E'),mo('−'),msub(mi('E'),mi('c')),mo(')'),mo(')')));
  const logarg=frac(msub(mi('E'),mi('cut')),abs(row(mi('E'),mo('−'),msub(mi('E'),mi('c')))));
  $('dos-saddle').innerHTML=mathml(row(msub(mi('ν'),mi('sing')),mo('='),frac(mass,row(msup(mi('π'),mn(2)),h2)),mi('ln'),logarg))+'<span class="small"> + regular terms</span>';
  $('dos-contour').innerHTML=mathml(row(mi('ν'),mo('='),frac(mn(2),msup(row(mo('('),mn(2),mi('π'),mo(')')),mn(2))),integral(row(),row(mi('E'),mo('('),mi('q'),mo(')'),mo('='),mi('E'))),frac(row(mi('d'),mi('ℓ')),abs(row(mi('∇'),mi('E'))))));
}
function drawPotential(){
  const g=grid((x,y)=>potential(x,y,state.v1,state.v3),56,-1,1);
  const lo=Math.min(...g.values),hi=Math.max(...g.values);
  const floor=lo*7-.3;
  setScene(views[0],mesh(g,(x,y,e)=>[x*2.3,e*7,y*2.3],[lo,hi||.001]),[],floor);
  views[0].world.add(new Visual(polyline([[0,floor+.02,0],[2.3,floor+.02,0],[2.3,floor+.02,2.3],[0,floor+.02,2.3],[0,floor+.02,0]],.022),rgba(C.gold)));
  $('potential-range').textContent=`Range ${lo.toFixed(3)} to ${hi.toFixed(3)} E_G · fixed height scale; no hidden amplitude normalization.`;
  layers[0].dispose();layers[0]=new LabelLayer($('potential-labels'),views[0].camera);
  layers[0].add('x/a',()=>[2.55,floor,0],C.teal);layers[0].add('y/a',()=>[0,floor,2.55],C.teal);layers[0].add('U / E_G',()=>[-2.3,Math.max(1,hi*7+.3),-2.3],C.gold);
  layers[0].add('a',()=>[1.15,floor,2.5],C.gold);
  drawReciprocal();
}
function drawReciprocal(){
  $('lattice-note').textContent=state.v1===0?(state.v3===0?'Free space: the square cell is only a folding convention.':'V₁ = 0: (a/2, ±a/2) are additional primitive translations; the displayed cell is nonprimitive.'):'Primitive square lattice: a₁ = (a,0), a₂ = (0,a). Reciprocal vectors are G(nₓ,nᵧ).';
}
function drawBandScene(){
  bandEnergyCenter=zoomX?bands(.5,0,state.v1,state.v3)[state.band]:.4;
  const view=views[1];view.world.clear();bandCuts=[];
  for(let b=0;b<4;b++){
    if(!state.showBands&&b!==state.band)continue;
    const g=spectra[b],lo=Math.min(...g.values),hi=Math.max(...g.values),rgb=rgba(bandColors[b]);
    const visual=new Visual(mesh(g,bandMap,[lo,hi],t=>[rgb[0]*(.55+.45*t),rgb[1]*(.55+.45*t),rgb[2]*(.55+.45*t)]));
    // Solid sheets must write depth: object-sorted transparency cannot correctly
    // composite these overlapping, curved surfaces and looks like doubled bands.
    view.world.add(visual);
    const edge=(i:number,j:number)=>bandMap(g.min+(g.max-g.min)*i/g.n,g.min+(g.max-g.min)*j/g.n,g.values[j*(g.n+1)+i]);
    const boundary:Vec3[]=[];
    for(let i=0;i<=g.n;i++)boundary.push(edge(i,0));
    for(let j=1;j<=g.n;j++)boundary.push(edge(g.n,j));
    for(let i=g.n-1;i>=0;i--)boundary.push(edge(i,g.n));
    for(let j=g.n-1;j>=0;j--)boundary.push(edge(0,j));
    view.world.add(new Visual(polyline(boundary,.009,4),rgba(bandColors[b])));
    const cut=new Visual(new Geometry([]),rgba(b===state.band?C.gold:bandColors[b]));bandCuts[b]=cut;view.world.add(cut);
  }
  if(state.showFree){
    const g=freeSpectra[state.band],parts:Geometry[]=[];
    // A coarse grid on the free dispersion compares it in the same coordinates.
    for(let j=0;j<=g.n;j+=4){
      parts.push(polyline(Array.from({length:g.n+1},(_,i)=>bandMap(g.min+(g.max-g.min)*i/g.n,g.min+(g.max-g.min)*j/g.n,g.values[j*(g.n+1)+i])),.006));
      parts.push(polyline(Array.from({length:g.n+1},(_,i)=>bandMap(g.min+(g.max-g.min)*j/g.n,g.min+(g.max-g.min)*i/g.n,g.values[i*(g.n+1)+j])),.006));
    }
    view.world.add(new Visual(merge(...parts),rgba('#dce5ed',.55)));
  }
  view.world.add(new Visual(floorGrid(2.9,bandFloor),rgba(C.muted,.34)));
  const box=polyline([[-2.9,bandFloor,-2.9],[2.9,bandFloor,-2.9],[2.9,bandFloor,2.9],[-2.9,bandFloor,2.9],[-2.9,bandFloor,-2.9]],.013);
  view.world.add(new Visual(box,rgba(C.teal,.6)));
  view.world.add(new Visual(polyline([[-3.15,bandFloor,-2.9],[-3.15,2.9,-2.9]],.01),rgba(C.muted)));
  bandPlane=new Visual(plane(2.9),rgba(C.gold,.12));view.world.add(bandPlane);
  const labels=resetLabels(1,'band-labels');
  labels.add(zoomX?'qₓ / G: ±0.12':'kₓ / G',()=>[0,bandFloor,3.3],C.teal);labels.add(zoomX?'qᵧ / G: ±0.12':'kᵧ / G',()=>[-3.4,bandFloor,0],C.teal);
  for(const [kx,ky,name] of (zoomX?[[0,0,'X']]:[[0,0,'Γ'],[.5,0,'X'],[.5,.5,'M']]) as [number,number,string][])labels.add(name,()=>[kx/bandExtent()*2.9,bandFloor+.05,ky/bandExtent()*2.9],C.gold);
  for(const offset of [-.4,-.15,.1,.35,.6]){const energy=bandCenter()+offset*4/bandScale();labels.add(energy.toFixed(2),()=>[-3.45,(energy-bandCenter())*bandScale(),-2.9],C.muted,'right');}
  labels.add('E / E_G',()=>[-3.15,3.1,-2.9],C.gold);
}
function drawFermi(){
  const extent=bandExtent(),p=chart(-extent,extent,-extent,extent,zoomX?'qₓ / G':'kₓ / G',zoomX?'qᵧ / G':'kᵧ / G',500,400);let out=p.base;
  const selected=spectra[state.band],{n,values}=selected,h=2*extent/n;
  let occupied='';
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
    const mean=(values[j*(n+1)+i]+values[j*(n+1)+i+1]+values[(j+1)*(n+1)+i]+values[(j+1)*(n+1)+i+1])/4;
    if(mean<state.mu)occupied+=`M${p.x(-extent+i*h)},${p.y(-extent+(j+1)*h)}h${(p.right-p.left)/n+.1}v${(p.bottom-p.top)/n+.1}h-${(p.right-p.left)/n+.1}Z`;
  }
  out+=`<path d="${occupied}" fill="${bandColors[state.band]}" opacity=".13"/>`;
  spectra.forEach((g,b)=>{
    if(!state.showBands&&b!==state.band)return;
    const segments=contours(g,state.mu);
    out+=segmentPath(segments,p.x,p.y,b===state.band?C.gold:bandColors[b],b===state.band?2.8:1.5);
    bandCuts[b].geometry=contourMesh(segments,(x,y)=>bandMap(x,y,state.mu+.0015));
  });
  bandPlane.position[1]=(state.mu-bandCenter())*bandScale();
  out+=text(p.x(0)+8,p.y(0)-8,zoomX?'X':'Γ','start',C.gold);
  if(!zoomX)out+=text(p.x(.5)-7,p.y(0)-10,'X','end',C.gold)+text(p.x(.5)-7,p.y(.5)+17,'M','end',C.gold);
  svg('fermi').innerHTML=out;$('mu-out').textContent=state.mu.toFixed(3);
  $('fermi-note').textContent=`Band ${state.band+1} shaded · μ = ${state.mu.toFixed(3)} E_G. X: two-state saddle ${xCoefficients(state.v1).critical.toFixed(3)}, finite-basis lower energy ${bands(.5,0,state.v1,state.v3)[0].toFixed(3)} E_G.`;
  if(bandDOSChart){const d=bandDOSChart;svg('band-dos').innerHTML=bandDOSBase+line([[d.x(state.mu),d.top],[d.x(state.mu),d.bottom]],C.gold,2);}
}
function drawBandDOS(){
  // Whole-zone, spin-included DOS of the four displayed bands. Histogram first,
  // then broaden: inexpensive when only the energy probe moves.
  const bins=360,min=-.15,max=2,width=(max-min)/bins,hist=new Float64Array(bins);
  for(const g of globalSpectra)for(let j=0;j<=g.n;j++)for(let i=0;i<=g.n;i++){
    const bin=Math.floor((g.values[j*(g.n+1)+i]-min)/width);
    const weight=(i===0||i===g.n?.5:1)*(j===0||j===g.n?.5:1);
    if(bin>=0&&bin<bins)hist[bin]+=weight/(2*Math.PI**2*g.n*g.n);
  }
  const points=Array.from({length:241},(_,i)=>{const e=-.06+1.66*i/240;let density=0;for(let b=0;b<bins;b++){const delta=e-(min+(b+.5)*width);density+=hist[b]*.015/(Math.PI*(delta*delta+.015**2));}return [e,density] as [number,number];});
  const p=chart(-.06,1.6,0,Math.max(...points.map(v=>v[1]))*1.15,'E / E_G','ν · E_G / G²',500,280);bandDOSChart=p;
  bandDOSBase=p.base+line(points.map(([e,d])=>[p.x(e),p.y(d)]),C.teal,2);
}
function sampleBandRegion(){
  spectra=zoomX?bandGrids(state.v1,state.v3,BAND_RESOLUTION,-.12,.12,.5):globalSpectra;
  freeSpectra=zoomX?bandGrids(0,0,BAND_RESOLUTION,-.12,.12,.5):bandGrids(0,0,BAND_RESOLUTION);
}
function drawX(){
  const c=xCoefficients(state.v1);
  $('gap-note').textContent=c.gap?`Gap |V₁| = ${c.gap.toFixed(3)} E_G; E₋(X) = ${c.critical.toFixed(3)}, E₊(X) = ${(.25+c.gap/2).toFixed(3)}. Select both branches to see the vertical gap marker.`:'Zero coupling: an unsplit crossing, not a smooth isolated saddle.';
  $('mass-note').textContent=c.gap?`At X: lower m*ₓ/m = ${(1/c.lower).toFixed(4)} (saddle); upper m*ₓ/m = ${(1/c.upper).toFixed(4)} (minimum). Both m*ᵧ/m = 1. Surfaces use the full two-state eigenvalues; contours below are their exact sampled intersections, not a quadratic fit. Axes have different stated magnifications.`:'At V₁ = 0 the sorted branches have a cusp. The nondegenerate effective masses are undefined.';
  const view=views[2];view.world.clear();localCuts=[];
  const lx=.10,ly=.25,scale=10;
  localEc=.25+(state.upper?1:-1)*c.gap/2;localStep=Math.max(.005,c.gap*.25);
  localMap=(u,v,e)=>[u/lx*2.25,(e-.25)*scale,v/ly*2.25];
  // Store a unit-square sampling domain, then map back to physical q/G in both views.
  localGrids=[0,1].map(branch=>grid((u,v)=>xBands(u*lx,v*ly,state.v1)[branch],64,-1,1));
  for(let branch=0;branch<2;branch++){
    if(!state.both&&branch!==(state.upper?1:0))continue;
    const g=localGrids[branch],lo=Math.min(...g.values),hi=Math.max(...g.values);
    const visual=new Visual(mesh(g,(u,v,e)=>localMap(u*lx,v*ly,e),[lo,hi],branch?plasma:viridis));
    visual.opacity=state.both&&branch===1?.4:1;view.world.add(visual);
    const cut=new Visual(new Geometry([]),rgba(branch?C.rose:C.gold));view.world.add(cut);localCuts[branch]=cut;
  }
  view.world.add(new Visual(floorGrid(2.25,localFloor),rgba(C.muted,.36)));
  if(state.both&&c.gap)view.world.add(new Visual(polyline([localMap(0,0,.25-c.gap/2),localMap(0,0,.25+c.gap/2)],.02),rgba(C.gold)));
  localPlane=new Visual(plane(2.25),rgba(C.gold,.12));view.world.add(localPlane);
  const labels=resetLabels(2,'x-labels');
  labels.add('qₓ / G: −0.10 … +0.10',()=>[0,localFloor,2.65],C.teal);
  labels.add('qᵧ / G: −0.25 … +0.25',()=>[-2.65,localFloor,0],C.teal);
  labels.add('X',()=>[0,localFloor+.05,0],C.gold);
  labels.add('E / E_G',()=>[-2.55,1.6,-2.3],C.gold);
  for(const e of [.15,.25,.35])labels.add(e.toFixed(2),()=>[-2.55,(e-.25)*scale,-2.3],C.muted,'right');
  if(state.both)labels.add('|V₁|',()=>[.3,0,0],C.gold);
  drawTransition();
}
function drawTransition(){
  const energy=localEc+state.delta*localStep,p=chart(-.1,.1,-.25,.25,'qₓ / G','qᵧ / G',500,400);
  let out=p.base;
  for(let b=0;b<2;b++){
    if(!localCuts[b])continue;
    const segments=contours(localGrids[b],energy),actual:Segment[]=segments.map(([a,b])=>[[a[0]*.1,a[1]*.25],[b[0]*.1,b[1]*.25]]);
    out+=segmentPath(actual,p.x,p.y,b?C.rose:C.gold,2.5);
    localCuts[b].geometry=merge(contourMesh(actual,(x,y)=>localMap(x,y,energy+.0008)),contourMesh(actual,(x,y)=>[x/.1*2.25,localFloor+.015,y/.25*2.25],.012));
  }
  localPlane.position[1]=(energy-.25)*10;
  out+=`<circle cx="${p.x(0)}" cy="${p.y(0)}" r="3" fill="${C.rose}"/>`;
  svg('at').innerHTML=out;
  $('delta-out').textContent=`Δ = ${(state.delta*localStep).toFixed(4)} E_G`;
  $('current-title').textContent=state.upper?'Upper-branch energy slice':Math.abs(state.delta)<.005?'At the saddle energy':state.delta<0?'Below the saddle':'Above the saddle';
  $('topology-note').textContent=!state.v1?'No isolated saddle at zero coupling.':state.upper?(state.delta<0?'Below the minimum: no local upper-band contour.':'Above the minimum: a closed contour grows around X.'):'The gold intersection on the 3D surface projects to this curve. Near X, branches open along qₓ below the saddle and along qᵧ above it. The reconnection is a local Lifshitz transition. At larger |q| the exact two-state contours curve away from their quadratic asymptotes.';
}
function drawDOS(){
  const {a,b,kind,eta}=state;
  $('a-out').textContent=a.toFixed(2);$('b-out').textContent=b.toFixed(2);$('eta-out').textContent=eta.toFixed(3);
  const g=grid((x,y)=>criticalEnergy(x,y,a,b,kind),64,-1,1),lo=Math.min(...g.values),hi=Math.max(...g.values);
  dosGrid=g;dosScale=1.8/Math.max(a+b,1);
  const map=(x:number,y:number,e:number):Vec3=>[x*2,e*dosScale,y*2];
  setScene(views[3],mesh(g,map,[lo,hi],plasma),[],-2.1);
  dosPlane=new Visual(plane(2),rgba(C.gold,.12));dosCut=new Visual(new Geometry([]),rgba(C.gold));views[3].world.add(dosPlane,dosCut);
  const labels=resetLabels(3,'critical-labels');
  labels.add('qₓ / G',()=>[0,-2.1,2.45],C.teal);labels.add('qᵧ / G',()=>[-2.45,-2.1,0],C.teal);labels.add('E − E_c',()=>[-2.2,1.9,-2],C.gold);
  $('critical-heading').textContent=`A ${kind} in momentum space`;
  $('critical-note').textContent=`ε/E_G = ${kind==='maximum'?'−':''}${a.toFixed(2)}(qₓ/G)² ${kind==='minimum'?'+':'−'} ${b.toFixed(2)}(qᵧ/G)². Height rescaled for framing. Effective mass magnitudes: |mₓ|/m = ${(1/a).toFixed(2)}, |mᵧ|/m = ${(1/b).toFixed(2)}.`;
  const energies=Array.from({length:181},(_,i)=>-.55+1.1*i/180),numeric=numericalDOS(energies,a,b,kind,eta,120);
  dosValues=numeric;
  const ymax=Math.max(...numeric)*1.35,p=chart(-.55,.55,0,ymax,'(E − E_c) / E_G','ν · E_G / G²');dosChart=p;let out=p.base;
  out+=line(energies.map((e,i)=>[p.x(e),p.y(numeric[i])]),C.teal,2.6);
  if(kind==='saddle'){
    for(const sign of [-1,1]){
      const points:[number,number][]=[];
      for(let i=0;i<=160;i++){const e=sign*(.004+(.55-.004)*i/160),dos=singularDOS(e,a,b,kind,4);if(dos<=ymax)points.push([p.x(e),p.y(dos)]);}
      out+=line(points,C.gold,1.8,'stroke-dasharray="5 4"');
    }
    out+=line([[p.x(0),p.top+22],[p.x(0),p.top]],C.gold,1.5)+text(p.x(0)+14,p.top+10,'∞','start',C.gold);
    $('dos-note').textContent=`Singular prefactor ${ (1/(2*Math.PI**2*Math.sqrt(a*b))).toFixed(4)} in plotted units; the analytic curve uses E_cut = 4 E_G, matching this patch asymptotically. Its logarithm diverges; the finite-η integral does not.`;
  }else{
    const height=singularDOS(kind==='minimum'?.1:-.1,a,b,kind);
    out+=line([[p.x(-.55),p.y(kind==='maximum'?height:0)],[p.x(0),p.y(kind==='maximum'?height:0)],[p.x(0),p.y(kind==='minimum'?height:0)],[p.x(.55),p.y(kind==='minimum'?height:0)]],C.gold,2,'stroke-dasharray="5 4"');
    $('dos-note').textContent=`Step height ${height.toFixed(4)} G²/E_G. The ideal value exactly at the step is convention-dependent; only the one-sided limits matter.`;
  }
  svg('dos-chart').innerHTML=out+'<g id="dos-probe"></g>';
  drawDosProbe();
}
function drawDosProbe(){
  const e=state.dosEnergy,segments=contours(dosGrid,e),p=dosChart;
  dosPlane.position[1]=e*dosScale;
  dosCut.geometry=merge(contourMesh(segments,(x,y)=>[x*2,(e+.008)*dosScale,y*2]),contourMesh(segments,(x,y)=>[x*2,-2.085,y*2]));
  const position=(e+.55)/1.1*(dosValues.length-1),index=Math.floor(position),f=position-index;
  const density=dosValues[index]*(1-f)+dosValues[Math.min(index+1,dosValues.length-1)]*f;
  svg('dos-probe').innerHTML=line([[p.x(e),p.bottom],[p.x(e),p.top]],C.rose,1,'stroke-dasharray="3 4"')+`<circle cx="${p.x(e)}" cy="${p.y(density)}" r="4" fill="${C.rose}"/>`;
  $('dos-energy-out').textContent=`${e.toFixed(3)} · ν̃ ≈ ${density.toFixed(3)}`;
}
function drawWavefunction(){
  const states=eigenstates(planeWaveMatrix(.5,0,state.v1,state.v3)),selected=states[state.band];
  const phase=value('wave-phase'),mode=$<HTMLSelectElement>('wave-mode').value as 'real'|'imag'|'density';
  const sample=(x:number,y:number)=>xWavefunction(selected.coefficients,x,y,phase);
  const g=grid((x,y)=>sample(x,y)[mode],96,-1,1);
  const amplitude=Math.max(Math.abs(Math.min(...g.values)),Math.abs(Math.max(...g.values)),.001);
  const palette=(t:number):[number,number,number]=>{
    const rgb=rgba(t<.5?C.rose:C.teal),strength=.25+.75*Math.abs(2*t-1);
    return [rgb[0]*strength,rgb[1]*strength,rgb[2]*strength];
  };
  setScene(views[4],mesh(g,(x,y,e)=>[x*2.3,e*1.5/amplitude,y*2.3],mode==='density'?[0,amplitude]:[-amplitude,amplitude],mode==='density'?viridis:palette),[],-1.8);
  const labels=resetLabels(4,'wave-labels');
  labels.add('x / a: −1 … 1',()=>[0,-1.8,2.65],C.teal);labels.add('y / a: −1 … 1',()=>[-2.65,-1.8,0],C.teal);
  labels.add(mode==='density'?'|ψ|²':mode==='real'?'Re ψ':'Im ψ',()=>[-2.3,1.8,-2.3],C.gold);
  const samples=Array.from({length:241},(_,i)=>{const x=-1+i/120;return {x,...sample(x,0)};});
  const limit=Math.max(1,...samples.flatMap(s=>[Math.abs(s.real),Math.abs(s.imag),s.density]))*1.1;
  const p=chart(-1,1,-limit,limit,'x / a','dimensionless amplitude / density',500,320);
  svg('wave-cut').innerHTML=p.base+(['real','imag','density'] as const).map((key,i)=>line(samples.map(s=>[p.x(s.x),p.y(s[key])]),[C.teal,C.rose,C.gold][i],2)).join('');
  $('wave-phase-out').textContent=`${(phase/Math.PI).toFixed(2)}π`;
  const degenerate=states.some((s,i)=>i!==state.band&&Math.abs(s.energy-selected.energy)<1e-7);
  $('wave-info').textContent=`Band ${state.band+1} at X · E = ${selected.energy.toFixed(5)} E_G. Surface height normalized for framing; line cut retains actual amplitudes.${degenerate?' Degenerate eigenvalue: the displayed basis choice is not unique.':''}`;
  $('wave-components').innerHTML=selected.coefficients.map((c,i)=>({c,g:RECIPROCAL[i]})).sort((a,b)=>b.c*b.c-a.c*a.c).map(({c,g})=>`<div class="wave-component"><span>g/G = (${g[0]}, ${g[1]})</span><span>c = ${c.toFixed(3)}</span><span>${(100*c*c).toFixed(1)}%</span></div>`).join('');
}
function rebuild(){
  state.v1=value('v1');state.v3=value('v3');$('v1-out').textContent=state.v1.toFixed(3);$('v3-out').textContent=state.v3.toFixed(3);
  globalSpectra=bandGrids(state.v1,state.v3,BAND_RESOLUTION);sampleBandRegion();drawBandDOS();drawPotential();drawBandScene();drawFermi();drawX();drawWavefunction();
}
function wire(){
  $('wave-mode').addEventListener('change',drawWavefunction);
  $('wave-phase').addEventListener('input',drawWavefunction);
  $('wave-band').addEventListener('change',()=>{state.band=value('wave-band');$<HTMLSelectElement>('band').value=String(state.band);drawBandScene();drawFermi();drawWavefunction();});
  $('band-region').addEventListener('change',()=>{zoomX=$<HTMLSelectElement>('band-region').value==='x';sampleBandRegion();if(zoomX){state.mu=bands(.5,0,state.v1,state.v3)[state.band];$<HTMLInputElement>('mu').value=String(state.mu);}views[1].camera.height=7.8;views[1].camera.target=[0,0,0];drawBandScene();drawFermi();});
  $('dos-energy').addEventListener('input',()=>{state.dosEnergy=value('dos-energy');drawDosProbe();});
  for(const [id,key] of [['show-bands','showBands'],['show-free','showFree']] as const)$(id).addEventListener('change',()=>{state[key]=$<HTMLInputElement>(id).checked;drawBandScene();drawFermi();});
  for(const [id,delta] of [['slice-below',-.3],['slice-at',0],['slice-above',.3]] as const)$(id).addEventListener('click',()=>{state.delta=delta;$<HTMLInputElement>('delta').value=String(delta);drawTransition();});
  for(const id of ['v1','v3'])$(id).addEventListener('input',()=>{clearTimeout(schedule);schedule=window.setTimeout(rebuild,70);});
  $('empty-preset').addEventListener('click',()=>{$<HTMLInputElement>('v1').value='0';$<HTMLInputElement>('v3').value='0';clearTimeout(schedule);rebuild();});
  $('weak-preset').addEventListener('click',()=>{$<HTMLInputElement>('v1').value='.06';$<HTMLInputElement>('v3').value='.025';clearTimeout(schedule);rebuild();});
  $('mu').addEventListener('input',()=>{state.mu=value('mu');drawFermi();});
  $('mu-saddle').addEventListener('click',()=>{state.mu=bands(.5,0,state.v1,state.v3)[0];$<HTMLInputElement>('mu').value=String(state.mu);drawFermi();});
  $('band').addEventListener('change',()=>{state.band=value('band');$<HTMLSelectElement>('wave-band').value=String(state.band);drawBandScene();drawFermi();drawWavefunction();});
  $('x-branch').addEventListener('change',()=>{state.upper=value('x-branch')===1;state.both=value('x-branch')===2;drawX();});
  $('delta').addEventListener('input',()=>{state.delta=value('delta');drawTransition();});
  for(const [id,key] of [['curvature-a','a'],['curvature-b','b'],['eta','eta']] as const)$(id).addEventListener('input',()=>{state[key]=value(id);clearTimeout(dosSchedule);dosSchedule=window.setTimeout(drawDOS,60);});
  $('critical-kind').addEventListener('change',()=>{state.kind=$<HTMLSelectElement>('critical-kind').value as CriticalKind;drawDOS();});
  $('mu-play').addEventListener('click',()=>{muPlay=!muPlay;$('mu-play').textContent=muPlay?'Pause sweep':'Sweep energy';$('mu-play').setAttribute('aria-pressed',String(muPlay));});
  $('transition-play').addEventListener('click',()=>{transitionPlay=!transitionPlay;$('transition-play').textContent=transitionPlay?'Pause reconnection':'Animate reconnection';$('transition-play').setAttribute('aria-pressed',String(transitionPlay));});
}
let elapsed=0;
function animate(now:number){
  if(disposed)return;
  const dt=last?Math.max(0,Math.min(.05,(now-last)/1000)):0;last=now;phase+=dt;elapsed+=dt;
  if(elapsed>.065){
    elapsed=0;
    if(muPlay&&visible.has(views[1].canvas)){state.mu=.22+.17*Math.sin(phase*.65);$<HTMLInputElement>('mu').value=String(state.mu);drawFermi();}
    if(transitionPlay&&visible.has(views[2].canvas)){state.delta=.5*Math.sin(phase*.8);$<HTMLInputElement>('delta').value=String(state.delta);drawTransition();}
  }
  for(let i=0;i<views.length;i++)if(visible.has(views[i].canvas)){layers[i].update();views[i].render();}
  frame=requestAnimationFrame(animate);
}
function dispose(){disposed=true;cancelAnimationFrame(frame);clearTimeout(schedule);clearTimeout(dosSchedule);observer.disconnect();for(const layer of layers)layer.dispose();for(const view of [...views].reverse())view.dispose();}
window.addEventListener('pagehide',dispose,{once:true});document.addEventListener('visibilitychange',()=>{last=0;});
async function boot(){
  formulas();
  try{
    await createView('potential',6.6);await createView('band',7.8);await createView('x',6.6);await createView('critical',6.8);
    await createView('wave',6.6);
    rebuild();drawDOS();wire();
    $('render-info').textContent='5 shared-device WebGPU views · SVG/MathML text · no autoplay';
    animate(performance.now());
  }catch(error){report(error instanceof Error?error.message:String(error));$('render-info').textContent='WebGPU unavailable · worked solutions remain readable';}
}
void boot();
