import {WebGPUView,LabelLayer,PlotLayer,Visual,Geometry,lineSegments,circle,rgba,viridis,plotFrame,
  TightBinding2D,tightBindingPreset,nearestHoppings,latticePoint,insideZone,fermiContours,fermiArea,bandTriangles,bandFilling,
  type TightBindingModel,type KPoint,type BandSample,type Point2,type Vec3} from '../index.js';
const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const input=(id:string)=>$<HTMLInputElement>(id);
const colors=['#80d4df','#f3cf84','#f098b6','#a0e5a4','#bca7ff','#ff9a75'];
let model:TightBindingModel,path:KPoint[],sample:BandSample|undefined,view:WebGPUView;
let labels:LabelLayer,frame:PlotLayer|undefined,worker:Worker|undefined,request=0,disposed=false;
let timer=0,last=0,phase=0,sweepElapsed=0,playing=false;
let flatLevels:number[]=[];
let dynamic:Visual[]=[],bounds={x:[-5,5] as Point2,y:[-5,5] as Point2};
let current=tightBindingPreset();model=current.model;path=current.path;
let solvedModel=structuredClone(model),solvedPath=structuredClone(path);
const status=(message:string,error=false)=>{$('status').textContent=message;$('status').setAttribute('role',error?'alert':'status');};
function numericCell(row:HTMLTableRowElement,value:number,label:string,integer=false){
  const cell=row.insertCell(),field=document.createElement('input');field.type='number';field.step=integer?'1':'any';field.value=String(value);field.setAttribute('aria-label',label);cell.append(field);return field;
}
function removeCell(row:HTMLTableRowElement,action:()=>void){const button=document.createElement('button');button.textContent='×';button.title='Remove row';button.type='button';button.onclick=action;row.insertCell().append(button);}
function writeEditors(){
  ['a1x','a1y','a2x','a2y'].forEach((id,i)=>input(id).value=String(model.lattice[Math.floor(i/2)][i%2]));
  $('sites').replaceChildren();
  model.sites.forEach((site,index)=>{
    const row=document.createElement('tr');row.insertCell().textContent=String(index);
    [site.position[0],site.position[1],site.energy].forEach((v,i)=>numericCell(row,v,`Site ${index}: ${['u','v','energy'][i]}`));
    removeCell(row,()=>{try{readEditors();if(model.sites.length===1)throw new Error('Keep at least one orbital.');model.sites.splice(index,1);model.hoppings=model.hoppings.filter(h=>h.from!==index&&h.to!==index).map(h=>({...h,from:h.from>index?h.from-1:h.from,to:h.to>index?h.to-1:h.to}));writeEditors();}catch(e){status(String(e),true);}});$('sites').append(row);
  });
  $('bonds').replaceChildren();
  model.hoppings.forEach((h,index)=>{const row=document.createElement('tr');[h.from,h.to,...h.cell,h.real,h.imag??0].forEach((v,i)=>numericCell(row,v,`Bond ${index}: ${['from','to','R1','R2','real','imaginary'][i]}`,i<4));removeCell(row,()=>{row.remove();status('Bond removed. Choose Apply model to solve.');});$('bonds').append(row);});
  $<HTMLTextAreaElement>('path').value=JSON.stringify(path,null,2);
}
function readEditors(){
  const number=(field:HTMLInputElement)=>{if(!field.value.trim()||!Number.isFinite(field.valueAsNumber))throw new Error('Fill every numeric field with a finite number.');return field.valueAsNumber;};
  const lattice=['a1x','a1y','a2x','a2y'].map(id=>number(input(id)));
  const sites=Array.from($('sites').querySelectorAll('tr'),(row,i)=>{const v=Array.from(row.querySelectorAll('input'),number);return {position:[v[0],v[1]] as Point2,energy:v[2],label:model.sites[i]?.label??String(i)};});
  const hoppings=Array.from($('bonds').querySelectorAll('tr'),row=>{const v=Array.from(row.querySelectorAll('input'),number);return {from:v[0],to:v[1],cell:[v[2],v[3]] as Point2,real:v[4],imag:v[5]};});
  const next:TightBindingModel={lattice:[[lattice[0],lattice[1]],[lattice[2],lattice[3]]],sites,hoppings};
  const nextPath=JSON.parse($<HTMLTextAreaElement>('path').value) as KPoint[];
  if(!Array.isArray(nextPath))throw new Error('The k path must be an array.');model=next;path=nextPath;
}
function solve(){
  try{readEditors();new TightBinding2D(model);}catch(error){status(error instanceof Error?error.message:String(error),true);return;}
  playing=false;$('sweep').textContent='Evolve Fermi energy';$('sweep').setAttribute('aria-pressed','false');
  worker?.terminate();worker=new Worker(new URL('./tight-binding-worker.js',import.meta.url),{type:'module'});
  const version=++request,requestedModel=structuredClone(model),requestedPath=structuredClone(path);status('Solving bands…');$('apply').setAttribute('aria-busy','true');
  worker.onerror=event=>{status(event.message,true);$('apply').removeAttribute('aria-busy');};
  worker.onmessage=event=>{
    if(disposed||version!==request)return;
    $('apply').removeAttribute('aria-busy');
    if(event.data.error){status(event.data.error,true);return;}
    sample=event.data.sample as BandSample;solvedModel=requestedModel;solvedPath=requestedPath;
    flatLevels=sample.bands.flatMap(values=>{let lo=Infinity,hi=-Infinity;for(const v of values){lo=Math.min(lo,v);hi=Math.max(hi,v);}return hi-lo<1e-10*Math.max(1,Math.abs(lo),Math.abs(hi))?[lo]:[];});
    const span=Math.max(1e-3,sample.max-sample.min),mu=Number(input('mu').value);
    input('mu').min=String(sample.min-.03*span);input('mu').max=String(sample.max+.03*span);input('mu').step='any';input('mu').value=String(Math.max(sample.min,Math.min(sample.max,mu)));
    const selector=$<HTMLSelectElement>('band'),selected=Number(selector.value);selector.replaceChildren(...sample.bands.map((_,i)=>new Option(`Band ${i+1}`,String(i))));selector.value=String(Math.min(selected,sample.bands.length-1));
    $('emin').textContent=sample.min.toFixed(3);$('emax').textContent=sample.max.toFixed(3);
    status(`${model.sites.length} orbital${model.sites.length===1?'':'s'} · ${model.hoppings.length} bonds + conjugates · ${sample.n}×${sample.n} grid`);
    buildScene();
  };
  worker.postMessage({model,path,resolution:Number(input('resolution').value)});
}
function fit(){
  if(sample&&input('view').value==='dispersion'){
    const size=Math.max(sample.x[1]-sample.x[0],sample.y[1]-sample.y[0],sample.max-sample.min);
    view.camera.target=[0,(sample.min+sample.max)/2,0];
    view.camera.distance=size*2;view.camera.height=size*1.8*Math.max(1,view.canvas.clientHeight/Math.max(1,view.canvas.clientWidth));return;
  }
  const width=bounds.x[1]-bounds.x[0],height=bounds.y[1]-bounds.y[0];
  view.camera.target=[(bounds.x[0]+bounds.x[1])/2,(bounds.y[0]+bounds.y[1])/2,0];
  view.camera.height=Math.max(height*1.22,width*1.22*view.canvas.clientHeight/Math.max(1,view.canvas.clientWidth));
}
function stroke(points:Vec3[],color:string,width=1.8){const node=new Visual(lineSegments(points,width),rgba(color));view.world.add(node);return node;}
function pathStroke(points:Vec3[],color:string,width=1.8){return stroke(points.slice(1).flatMap((p,i)=>[points[i],p]),color,width);}
function title(text:string,position:Vec3,color='#cfe4ea'){return labels.add(text,()=>position,color);}
function chart(x:Point2,y:Point2,xTitle:string,yTitle:string){bounds={x,y};fit();const data=plotFrame(x,y,{xTitle,yTitle,minor:false,xTicks:5,yTicks:5});if(xTitle==='k path')data.labels=data.labels.filter(a=>Math.abs(a.position[1])>1e-8);frame=new PlotLayer(view.world,labels,data);}
function zoneOutline(){const zone=sample!.zone;pathStroke([...zone,zone[0]].map(p=>[...p,.03] as Vec3),'#d9e9ef',2);}
function dispersion(){
  const s=sample!,positions:number[]=[],colorsOut:number[]=[];
  for(const triangle of bandTriangles(s,Number(input('band').value)))for(const [kx,ky,e] of triangle){
    positions.push(kx,e,ky);colorsOut.push(...viridis((e-s.min)/(s.max-s.min||1)));
  }
  view.world.add(new Visual(new Geometry(positions,colorsOut)));
  const floor=s.min-.08*Math.max(1,s.max-s.min),zone=s.zone;
  pathStroke([...zone,zone[0]].map(([x,y])=>[x,floor,y]),'#a1b5c0',2);
  const x=s.x[0],y=s.y[0];
  stroke([[x,floor,y],[s.x[1],floor,y],[x,floor,y],[x,floor,s.y[1]],[x,floor,y],[x,s.max,y]],'#8ea9ba',1.8);
  title('kₓ',[s.x[1]+.3,floor,y]);title('kᵧ',[x,floor,s.y[1]+.3]);title('Energy',[x,s.max+.5,y]);
  for(let i=0;i<=4;i++){
    const e=s.min+(s.max-s.min)*i/4;
    stroke([[x-.12,e,y],[x+.12,e,y]],'#8ea9ba',1.5);title(e.toFixed(1),[x-.5,e,y]);
  }
  fit();
}
function buildScene(){
  if(!sample)return;
  frame?.dispose();frame=undefined;labels.dispose();view.world.clear();dynamic=[];
  labels=new LabelLayer($('tb-labels'),view.camera,{faceCamera:true});
  const model=solvedModel,path=solvedPath;
  const mode=input('view').value,s=sample,span=Math.max(.1,s.max-s.min),range:Point2=[s.min-span*.08,s.max+span*.08];
  const was3d=view.camera.mode==='3d';view.camera.mode=mode==='dispersion'?'3d':'2d';
  if(mode==='dispersion'&&!was3d){view.camera.yaw=.55;view.camera.pitch=.55;}
  if(mode==='dispersion'){dispersion();
  }else if(mode==='bands'){
    const length=s.path.distance.at(-1)!;chart([0,length],range,'k path','Energy');
    s.path.ticks.forEach(t=>{stroke([[t.at,range[0],.01],[t.at,range[1],.01]],'#637580',1);title(t.label,[t.at,range[0]-.25,.05]);});
    s.bands.forEach((_,band)=>pathStroke(s.path.distance.map((x,i)=>[x,s.path.energies[i][band],.03]),colors[band%colors.length],2));
  }else if(mode==='lattice'){
    const points:Point2[]=[];
    for(let i=-2;i<=2;i++)for(let j=-2;j<=2;j++)for(const site of model.sites)points.push(latticePoint([i+site.position[0],j+site.position[1]],model.lattice));
    chart([Math.min(...points.map(p=>p[0]))-.5,Math.max(...points.map(p=>p[0]))+.5],[Math.min(...points.map(p=>p[1]))-.5,Math.max(...points.map(p=>p[1]))+.5],'x','y');
    const bonds:Vec3[]=[];
    for(let i=-2;i<=2;i++)for(let j=-2;j<=2;j++)for(const h of model.hoppings){if(Math.abs(i+h.cell[0])>2||Math.abs(j+h.cell[1])>2)continue;const a=model.sites[h.from].position,b=model.sites[h.to].position;bonds.push([...latticePoint([i+a[0],j+a[1]],model.lattice),0],[...latticePoint([i+h.cell[0]+b[0],j+h.cell[1]+b[1]],model.lattice),0]);}
    stroke(bonds,'#466773',1.6);
    const radius=Math.min(...model.lattice.map(p=>Math.hypot(...p)))*.055,geometry=circle(radius,16,'xy',radius*.7);
    points.forEach((p,i)=>{const node=new Visual(geometry,rgba(colors[(i%model.sites.length)%colors.length]));node.position=[...p,.05];view.world.add(node);});
    const a=model.lattice[0],b=model.lattice[1];pathStroke([[0,0,.07],[...a,.07],[a[0]+b[0],a[1]+b[1],.07],[...b,.07],[0,0,.07]],'#f3cf84',2.5);
    title('a₁',[a[0]/2,a[1]/2-.18,.1]);title('a₂',[b[0]/2-.18,b[1]/2,.1]);
  }else if(mode==='dos'){
    const count=100,bins=new Float64Array(count),step=(s.max-s.min||1)/count;let total=0;
    for(let j=0;j<=s.n;j++)for(let i=0;i<=s.n;i++){
      const p:Point2=[s.x[0]+(s.x[1]-s.x[0])*i/s.n,s.y[0]+(s.y[1]-s.y[0])*j/s.n];if(!insideZone(p,s.zone))continue;total++;
      for(const band of s.bands)bins[Math.min(count-1,Math.max(0,Math.floor((band[j*(s.n+1)+i]-s.min)/step)))]++;
    }
    const density=Array.from(bins,v=>v/Math.max(1,total)/step);chart(range,[0,Math.max(...density)*1.1||1],'Energy','DOS / cell');
    pathStroke(density.map((v,i)=>[s.min+(i+.5)*step,v,.02]),colors[0],2);
  }else{
    chart(s.x,s.y,'kₓ','kᵧ');
    zoneOutline();
    if(mode==='bz'){
      const reciprocal=new TightBinding2D(model).reciprocal;
      pathStroke(path.map(p=>[...latticePoint(p.k,reciprocal),.05]),'#f3cf84',2);
      for(const p of path.slice(0,-1)){const k=latticePoint(p.k,reciprocal);title(p.label,[k[0]+.12,k[1]+.15,.07]);}
      title('Γ',[0,-.2,.07]);
    }
  }
  updateEnergy();view.render();
}
function updateEnergy(){
  if(!sample)return;
  view.world.remove(...dynamic);dynamic=[];
  const mu=Number(input('mu').value),mode=input('view').value;
  $('mu-value').textContent=mu.toFixed(3);input('mu-number').value=String(mu);
  $('fermi-note').textContent=flatLevels.some(e=>Math.abs(mu-e)<1e-10*Math.max(1,Math.abs(mu)))?'A flat band equals μ: its Fermi set fills the Brillouin zone.':'';$('filling').textContent=`Occupation ≈ ${bandFilling(sample,mu).toFixed(3)} / cell`;
  if(mode==='bands')dynamic.push(stroke([[bounds.x[0],mu,.06],[bounds.x[1],mu,.06]],'#f3cf84',2));
  if(mode==='dos')dynamic.push(stroke([[mu,0,.06],[mu,bounds.y[1],.06]],'#f3cf84',2));
  if(mode==='fermi'||mode==='dispersion'){
    const band=Number(input('band').value),area=fermiArea(sample,mu,band);
    if(mode==='dispersion')for(let i=0;i<area.length;i+=3){area[i+2]=area[i+1];area[i+1]=mu;}
    else for(let i=2;i<area.length;i+=3)area[i]=.01;
    const slice=new Visual(new Geometry(area),rgba('#397d91'));dynamic.push(slice);view.world.add(slice);
    const points=fermiContours(sample,mu,band).flatMap(segment=>segment.map(([x,y])=>
      mode==='dispersion'?[x,mu+.008,y] as Vec3:[x,y,.06] as Vec3));
    dynamic.push(stroke(points,'#f3cf84',2.2));
    if(mode==='dispersion'){
      const zone=sample.zone;dynamic.push(pathStroke([...zone,zone[0]].map(([x,y])=>[x,mu,y]),'#f3cf84',1.5));
    }
  }
}
async function main(){
  view=await WebGPUView.create($<HTMLCanvasElement>('tb-canvas'),{samples:4,maxDpr:2,onError:message=>status(message,true)});
  view.camera.mode='2d';view.camera.yaw=view.camera.pitch=0;view.onResize=fit;
  labels=new LabelLayer($('tb-labels'),view.camera,{faceCamera:true});writeEditors();solve();
  $('apply').onclick=solve;
  for(const id of ['view','band'])$(id).addEventListener('change',buildScene);
  $('mu').addEventListener('input',()=>{updateEnergy();view.render();});
  $('mu-number').addEventListener('change',()=>{if(Number.isFinite(input('mu-number').valueAsNumber)){input('mu').value=input('mu-number').value;updateEnergy();view.render();}});
  $('reset-camera').onclick=fit;
  $('preset').addEventListener('change',()=>{current=tightBindingPreset(input('preset').value,Number(input('hopping').value));model=current.model;path=current.path;writeEditors();$('description').textContent=input('preset').value==='hexagonal'?'One-atom hexagonal (triangular) lattice: six equal nearest neighbors, ε₀ = 0. For t = −1: Γ = −6, M = 2, K = 3.':'A spinless model with one orbital per basis site. Edit the basis, site energies, and bonds below.';solve();});
  const edit=(action:()=>void)=>()=>{try{readEditors();action();writeEditors();status('Model edited. Choose Apply model to solve.');}catch(error){status(String(error),true);}};
  $('add-site').onclick=edit(()=>{if(model.sites.length>=16)throw new Error('At most 16 orbitals.');model.sites.push({position:[.5,.5],energy:0});});
  $('add-bond').onclick=edit(()=>{model.hoppings.push({from:0,to:0,cell:[1,1],real:Number(input('hopping').value)});});
  $('nearest').onclick=edit(()=>{model.hoppings=nearestHoppings(model,Number(input('hopping').value));});
  $('equal-hopping').onclick=()=>{try{readEditors();const t=Number(input('hopping').value);if(!Number.isFinite(t))throw new Error('Hopping must be finite.');model.hoppings.forEach(h=>{h.real=t;h.imag=0;});writeEditors();solve();}catch(error){status(String(error),true);}};
  $('sweep').onclick=()=>{if(!sample)return;playing=!playing;phase=Math.asin(Math.max(-1,Math.min(1,2*(Number(input('mu').value)-sample!.min)/(sample!.max-sample!.min||1)-1)));$('sweep').textContent=playing?'Pause evolution':'Evolve Fermi energy';$('sweep').setAttribute('aria-pressed',String(playing));};
  $('download').onclick=()=>{try{readEditors();const url=URL.createObjectURL(new Blob([JSON.stringify({model,path},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='tight-binding-2d.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){status(String(error),true);}};
  $('upload').addEventListener('change',async()=>{try{const file=input('upload').files?.[0];if(!file)return;const data=JSON.parse(await file.text());new TightBinding2D(data.model);if(!Array.isArray(data.path))throw new Error('Missing k path.');model=data.model;path=data.path;writeEditors();solve();}catch(error){status(String(error),true);}});
  const tick=(now:number)=>{if(disposed)return;const dt=last?Math.min(.05,(now-last)/1000):0;last=now;if(playing&&sample){phase+=dt*.6;sweepElapsed+=dt;if(sweepElapsed>=1/30){sweepElapsed=0;input('mu').value=String(sample.min+(sample.max-sample.min)*(.5+.5*Math.sin(phase)));updateEnergy();}}labels.update();view.render();timer=requestAnimationFrame(tick);};timer=requestAnimationFrame(tick);
}
addEventListener('pagehide',()=>{disposed=true;worker?.terminate();cancelAnimationFrame(timer);labels?.dispose();view?.dispose();},{once:true});
main().catch(error=>status(error instanceof Error?error.message:String(error),true));
