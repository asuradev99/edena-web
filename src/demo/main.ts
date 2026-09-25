import { WebGPUView, LabelLayer, Geometry, Visual, Group, Timeline, sphere, wireSphere, circle, polyline, arrow, merge, functionCurve, rgba, clamp, smooth, tween, sphericalPoint, sphericalWedge, sphericalWedgeOutline, streamline, streamlines, sphereSeeds, mathml, mi, mn, mo, msub, msup, frac, row, type Vec3 } from '../index.js';
import { chapters, chapterAt, scriptedRadius, normalizedField, enclosedFraction, DURATION } from './physics.js';
import { story, narration } from './story.js';

const get=<T extends HTMLElement>(id:string)=>{const node=document.getElementById(id);if(!node)throw new Error(`Missing ${id}`);return node as T;};
const canvas=get<HTMLCanvasElement>('scene'), graphCanvas=get<HTMLCanvasElement>('graph');
const play=get<HTMLButtonElement>('play'), restart=get<HTMLButtonElement>('restart'), scrubber=get<HTMLInputElement>('scrubber');
const equationPanel=get('equations'), opening=get('opening'), thought=get('thought'), subtitle=get('subtitle'), graphScene=get('graph-scene');
const radiusInput=get<HTMLInputElement>('radius'), error=get('error');
const timeline=new Timeline(DURATION);
const blue='#58c4dd', yellow='#ffff00', pink='#e892c7', white='#eeeeee', green='#83c167';
const alpha=(node:HTMLElement,value:number)=>{node.style.opacity=String(clamp(value));node.style.visibility=value>.001?'visible':'hidden';};
const show=(t:number,start:number,duration=1)=>smooth((t-start)/duration);
const windowAt=(t:number,start:number,end:number,fade=1)=>show(t,start,fade)*(1-show(t,end-fade,fade));
const fmt=(time:number)=>`${Math.floor(time/60)}:${Math.floor(time%60).toString().padStart(2,'0')}`;
let view:WebGPUView|undefined, plot:WebGPUView|undefined, labels:LabelLayer|undefined, graphLabels:LabelLayer|undefined;
let frame=0, last=0, ready=false, disposed=false, override:number|null=null, activeChapter=-1, captionIndex=-1, captions=true;
/** When the explorer sliders drive the volume element, the film pauses and follows them. */
let elementOverride:{s:number;theta:number;phi:number}|null=null;
/** Current state of the animated volume element (radius, polar angle, azimuth, extents). */
const elementState={s:.62,theta:.95,phi:.7,dr:.07,dtheta:.18,dphi:.18};
/** Live tips of the ds, s dθ and s sinθ dφ edges, so labels can ride them. */
const edgeTip={r:[0,0,0] as Vec3,t:[0,0,0] as Vec3,p:[0,0,0] as Vec3};
const lifetime=new AbortController();const events={signal:lifetime.signal};
const buttons:HTMLButtonElement[]=[];
for(const [i,chapter] of chapters.entries()) {
  const button=document.createElement('button');button.className='chapter';button.disabled=true;
  button.innerHTML=`<span class="number">${String(i+1).padStart(2,'0')} <span>${fmt(chapter.start)}</span></span>${chapter.title}`;
  button.addEventListener('click',()=>{override=null;timeline.seek(chapter.start+.05);timeline.play();},events);
  buttons.push(button);get('chapters').append(button);
}
function report(message:string){console.error(message);error.textContent=message;error.hidden=false;get('loading').hidden=true;timeline.pause();play.disabled=true;restart.disabled=true;radiusInput.disabled=true;scrubber.disabled=true;for(const button of buttons)button.disabled=true;ready=false;}

async function initialize(){
  view=await WebGPUView.create(canvas,{onError:report});
  plot=await WebGPUView.create(graphCanvas,{device:view.device,interactive:false,onError:report});
  if(disposed){plot.dispose();view.dispose();return;}
  view.camera.height=4.8;
  plot.camera.yaw=0;plot.camera.pitch=0;plot.camera.target=[1.36,.54,0];plot.camera.height=1.64;
  const scene=new Group();view.world.add(scene);
  const fill=new Visual(sphere(),rgba(blue,.022));
  const ball=new Visual(wireSphere(1,12,7,.008),rgba(blue,.52));
  const silhouette=new Visual(circle(1,128,'xy',.012),rgba(blue,.8));
  const chargeGeometry=new Geometry([0,.021,0, -.018,0,0, 0,0,.018, 0,.021,0, 0,0,.018, .018,0,0, 0,.021,0, .018,0,0, 0,0,-.018, 0,.021,0, 0,0,-.018, -.018,0,0, 0,-.021,0, 0,0,.018, -.018,0,0, 0,-.021,0, .018,0,0, 0,0,.018, 0,-.021,0, 0,0,-.018, .018,0,0, 0,-.021,0, -.018,0,0, 0,0,-.018]);
  const charges=new Group();
  // Deterministic uniform-volume sample; no randomness changes on replay.
  for(let i=0;i<95;i++) {const y=1-2*((i*.61803398875)%1),a=i*2.3999632297,r=.94*Math.cbrt((i+.5)/95),s=Math.sqrt(1-y*y);const dot=new Visual(chargeGeometry,rgba(blue,.85));dot.position=[r*s*Math.cos(a),r*y,r*s*Math.sin(a)];charges.add(dot);}
  const shell=new Visual(wireSphere(1,8,4,.009),rgba(pink,.7));
  const gaussian=new Visual(merge(...(['xy','xz','yz'] as const).map(p=>circle(1,128,p,.009))),rgba(green,.85));
  const radiusR=new Visual(polyline([[0,0,0],[-.8,-.6,0]],.011),rgba(blue));
  const axis=new Visual(arrow([-.3,0,0],[2.1,0,0],.008),rgba(white,.3));
  const radiusLine=new Visual(polyline([[0,0,0],[1,0,0]],.013),rgba(yellow));
  const center=new Visual(chargeGeometry,rgba(white));center.scale=[2,2,2];
  const observer=new Visual(chargeGeometry,rgba(yellow));observer.scale=[3,3,3];
  const source=new Visual(chargeGeometry,rgba(pink));source.scale=[4,4,4];source.position=[.39,.52,0];
  const mirror=new Visual(chargeGeometry,rgba(pink));mirror.scale=[4,4,4];mirror.position=[.39,-.52,0];
  const sourceRadius=new Visual(polyline([[0,0,0],source.position],.014),rgba(pink));
  const connection=new Visual(polyline([source.position,[1.55,0,0]],.009),rgba(white,.7));
  const component1=new Visual(arrow([1.55,0,0],[2.1,-.32,0]),rgba(pink));
  const component2=new Visual(arrow([1.55,0,0],[2.1,.32,0]),rgba(pink));
  const net=new Visual(arrow([1.55,0,0],[2.25,0,0],.021),rgba(yellow));
  const theta=new Visual(polyline(Array.from({length:32},(_,i)=>{const a=i/31*Math.atan2(.52,.39);return [.28*Math.cos(a),.28*Math.sin(a),0];}),.01),rgba(white));
  const arrows=new Group();
  const directions:Vec3[]=[];
  for(let i=0;i<14;i++){const z=1-2*(i+.5)/14,a=i*2.39996,rr=Math.sqrt(1-z*z),dir:Vec3=[rr*Math.cos(a),rr*Math.sin(a),z];directions.push(dir);arrows.add(new Visual(arrow([0,0,0],dir.map(x=>x*.42) as Vec3,.013),rgba(yellow,.9)));}
  // --- The volume element dV = s² sinθ ds dθ dφ, and its three edge vectors --------------
  const wedge=new Visual(sphericalWedge(elementState.s-elementState.dr,elementState.s+elementState.dr,elementState.theta-elementState.dtheta,elementState.theta+elementState.dtheta,elementState.phi-elementState.dphi,elementState.phi+elementState.dphi,3),rgba(pink,.16));
  const wedgeOutline=new Visual(sphericalWedgeOutline(elementState.s-elementState.dr,elementState.s+elementState.dr,elementState.theta-elementState.dtheta,elementState.theta+elementState.dtheta,elementState.phi-elementState.dphi,elementState.phi+elementState.dphi,.006,10),rgba(pink,.9));
  const edgeR=new Visual(polyline([[0,0,0],[.1,0,0]],.009),rgba(white,.9));
  const edgeT=new Visual(polyline([[0,0,0],[.1,0,0]],.009),rgba(white,.9));
  const edgeP=new Visual(polyline([[0,0,0],[.1,0,0]],.009),rgba(white,.9));
  // A ring of the same (s, θ) at every φ: what the φ-integral sweeps through.
  const phiRing=new Visual(merge(...Array.from({length:48},(_,i)=>{const p=sphericalPoint(elementState.s,elementState.theta,i/48*2*Math.PI);return new Geometry([p[0]-.015,p[1],p[2], p[0]+.015,p[1],p[2], p[0],p[1]-.015,p[2], p[0],p[1]+.015,p[2], p[0],p[1],p[2]-.015, p[0],p[1],p[2]+.015]);})),rgba(pink,.5));
  // --- Field lines: RK4 streamlines of E(r), so the picture is computed, not sampled -----
  const electricField=(p:Vec3):Vec3=>{const len=Math.hypot(...p)||1,strength=len<=1?len:1/(len*len);return [p[0]/len*strength,p[1]/len*strength,p[2]/len*strength];};
  const traced=streamlines(electricField,sphereSeeds(18,.42),0,{step:.05,steps:80,maxLength:.98,bounds:{min:[-1.32,-1.32,-1.32],max:[1.32,1.32,1.32]},minPoints:4});
  const fieldLines=new Visual(merge(...traced.flatMap(line=>line.length>1?[polyline(line,.007),arrow(line[Math.max(0,line.length-3)],line[line.length-1],.012)]:[])),rgba(yellow,.5));
  const equipotential=new Visual(merge(wireSphere(.55,10,6,.006),wireSphere(1.5,10,6,.006)),rgba(green,.3));
  scene.add(fill,ball,silhouette,charges,shell,gaussian,axis,radiusR,radiusLine,sourceRadius,connection,theta,center,source,mirror,observer,component1,component2,net,arrows,wedge,wedgeOutline,edgeR,edgeT,edgeP,phiRing,fieldLines,equipotential);
  labels=new LabelLayer(get('labels'),view.camera);
  const labelR=labels.addHTML(mathml(mi('R')),()=>[-.49,-.42,0],blue,'math-label'),labelQ=labels.addHTML(mathml(row(mo('+'),mi('Q'))),()=>[-.78,.9,0],blue,'math-label');
  const labelr=labels.addHTML(mathml(mi('r')),()=>[observer.position[0]/2,-.13,0],yellow,'math-label'),labelP=labels.addHTML(mathml(mi('P')),()=>[observer.position[0],.14,0],yellow,'math-label');
  const labeldq=labels.addHTML(mathml(row(mi('d'),mi('q'))),()=>[source.position[0]+.02,source.position[1]+.14,source.position[2]],pink,'math-label');
  const labelsVar=labels.addHTML(mathml(mi('s')),()=>[source.position[0]*.55,source.position[1]*.55-.1,source.position[2]*.55],pink,'math-label');
  const labeltheta=labels.addHTML(mathml(mi('θ')),()=>[.38,.15,0],white,'math-label');
  const labelShell=labels.add('source shell',()=>[-.9,-1.18,0],pink),labelGauss=labels.add('Gaussian surface',()=>[0,-1.75,0],green);
  const labelDs=labels.addHTML(mathml(row(mi('d'),mi('s'))),()=>edgeTip.r,white,'math-label');
  const labelSdT=labels.addHTML(mathml(row(mi('s'),mi('d'),mi('θ'))),()=>edgeTip.t,white,'math-label');
  const labelSdP=labels.addHTML(mathml(row(mi('s'),mo('sin'),mi('θ'),mi('d'),mi('φ'))),()=>edgeTip.p,white,'math-label');
  const labeldV=labels.addHTML(mathml(row(mi('d'),mi('V'))),()=>[source.position[0]*.22,source.position[1]*.22-.2,source.position[2]*.22],pink,'math-label');

  const axes=new Visual(merge(arrow([0,0,0],[2.95,0,0],.006),arrow([0,0,0],[0,1.2,0],.006)),rgba(white,.72));
  const ticks=new Visual(merge(...[1,2].map(x=>polyline([[x,-.025,0],[x,.025,0]],.006)),polyline([[-.025,1,0],[.025,1,0]],.006)),rgba(white,.7));
  const guide=new Visual(merge(...Array.from({length:16},(_,i)=>polyline([[1,i/16,0],[1,(i+.5)/16,0]],.004))),rgba(white,.25));
  const inside=new Visual(functionCurve(x=>x,[0,1],140,.014),rgba(blue));
  const outside=new Visual(functionCurve(x=>1/(x*x),[1,2.8],250,.014),rgba(yellow));
  const plotDot=new Visual(circle(.025,32,'xy',.02),rgba(white));
  const dotGuide=new Visual(polyline([[0,0,0],[0,1,0]],.004),rgba(white,.4));
  plot.world.add(axes,ticks,guide,inside,outside,dotGuide,plotDot);
  graphLabels=new LabelLayer(get('graph-labels'),plot.camera);
  const gl=[graphLabels.add('0',()=>[-.045,-.085,0]),graphLabels.add('R',()=>[1,-.09,0],blue),graphLabels.add('2R',()=>[2,-.09,0]),graphLabels.add('r',()=>[2.96,-.07,0]),graphLabels.add('E(r) / E(R)',()=>[.1,1.31,0]),graphLabels.add('1',()=>[-.09,1,0]),graphLabels.add('∝ r',()=>[.45,.75,0],blue),graphLabels.add('∝ 1/r²',()=>[1.92,.63,0],yellow)];
  const movingValue=graphLabels.add('',()=>[plotDot.position[0],plotDot.position[1]+.14,0]);
  let lines:HTMLElement[]=[];
  const renderAt=(t:number)=>{
    if(!view||!plot||!labels||!graphLabels)return;
    const chapter=chapterAt(t),local=t-chapters[chapter].start,r=override??scriptedRadius(t);
    if(chapter!==activeChapter){
      activeChapter=chapter;const info=story[chapter];
      equationPanel.innerHTML=`<div class="kicker">${info.kicker}</div><h2>${info.title}</h2>${info.lines.map(line=>`<div class="eq-line ${line.kind??''}">${line.html}</div>`).join('')}`;
      lines=Array.from(equationPanel.querySelectorAll<HTMLElement>('.eq-line'));
      get('chapter-number').textContent=String(chapter+1).padStart(2,'0');get('chapter-name').textContent=chapters[chapter].title;
      get('now-playing').textContent=chapters[chapter].title.toUpperCase();
      buttons.forEach((button,i)=>button.setAttribute('aria-current',String(i===chapter)));
    }
    const storyFade=show(t,4.5,1.5),graphFade=windowAt(t,153,178,1.2);
    scene.opacity=storyFade*(1-graphFade);
    view.camera.target=[tween(t,4.5,2,0,1.82),0,0];
    // Camera input remains live. Object rotation follows time, so scrubbing never accumulates drift.
    ball.rotation=.06*t;fill.rotation=ball.rotation;charges.rotation=ball.rotation;
    ball.reveal=show(t,4.5,3);silhouette.reveal=show(t,4.5,2);
    charges.children.forEach((node,i)=>{node.opacity=show(t,5.5+i*.025,1.3)*(.65+.35*(1-show(t,50,2)));});
    fill.opacity=.9;ball.opacity=t>=50&&t<136?.6:1;silhouette.opacity=.75;
    radiusR.opacity=show(t,8,1);radiusLine.opacity=show(t,11,1);radiusLine.scale=[r,1,1];
    axis.opacity=show(t,16,1)*(.5+.5*(1-show(t,50,1)));
    observer.opacity=show(t,11,1);observer.position=[r,0,0];center.opacity=show(t,7,1);
    // The spherical volume element: grows into a wedge, then sweeps in φ to trace its ring.
    const elementFade=windowAt(t,16,116,1.6);
    const sweep=t<52?0:clamp((t-52)/20);
    const es=elementOverride?elementOverride.s:.62;
    const et=elementOverride?elementOverride.theta:.95;
    const ep=elementOverride?elementOverride.phi:.7+sweep*2*Math.PI;
    const grow=elementOverride?1:smooth((t-16.5)/3.5);
    const edr=elementOverride?Math.max(.04,es*.12):.04+.12*grow;
    const edt=elementOverride?.28:.07+.36*grow;
    const edp=elementOverride?.28:.07+.36*grow;
    elementState.s=es;elementState.theta=et;elementState.phi=ep;elementState.dr=edr;elementState.dtheta=edt;elementState.dphi=edp;
    source.position=sphericalPoint(es,et,ep);
    source.opacity=elementFade;sourceRadius.opacity=elementFade;connection.opacity=windowAt(t,16,50);theta.opacity=show(t,20)*elementFade;
    sourceRadius.geometry=polyline([[0,0,0],source.position],.014);
    connection.geometry=polyline([source.position,observer.position],.009);
    wedge.geometry=sphericalWedge(es-edr,es+edr,et-edt,et+edt,ep-edp,ep+edp,3);
    wedgeOutline.geometry=sphericalWedgeOutline(es-edr,es+edr,et-edt,et+edt,ep-edp,ep+edp,.006,10);
    wedge.opacity=elementFade*.95;wedgeOutline.opacity=elementFade;
    const corner=sphericalPoint(es-edr,et-edt,ep-edp);
    const tipR=sphericalPoint(es+edr,et-edt,ep-edp),tipT=sphericalPoint(es-edr,et+edt,ep-edp),tipP=sphericalPoint(es-edr,et-edt,ep+edp);
    edgeR.geometry=polyline([corner,tipR],.009);edgeT.geometry=polyline([corner,tipT],.009);edgeP.geometry=polyline([corner,tipP],.009);
    edgeR.opacity=elementFade;edgeT.opacity=elementFade;edgeP.opacity=elementFade;
    edgeTip.r=tipR.map(x=>x*1.12) as Vec3;edgeTip.t=tipT.map(x=>x*1.12) as Vec3;edgeTip.p=tipP.map(x=>x*1.12) as Vec3;
    phiRing.opacity=elementFade*sweep*(1-show(t,74,3));
    fieldLines.opacity=(windowAt(t,40,50)+windowAt(t,136,153)+show(t,180,3))*.9;
    equipotential.opacity=windowAt(t,178,192,1.5)*.85;
    refreshElementReadout();
    mirror.opacity=windowAt(t,34,50);component1.opacity=windowAt(t,27,50);component2.opacity=windowAt(t,35,50);net.opacity=windowAt(t,39,50);
    component1.reveal=show(t,27,2);component2.reveal=show(t,35,2);net.reveal=show(t,39,2);
    shell.opacity=windowAt(t,20,136)*(.55+.45*show(t,98));
    const shellRadius=t<116?.78:tween(t,116,14,.04,.72);
    shell.scale=[shellRadius,shellRadius,shellRadius];shell.reveal=show(t,20,3);
    gaussian.opacity=show(t,178,2);gaussian.scale=[r,r,r];gaussian.reveal=show(t,178,2);
    arrows.opacity=(windowAt(t,40,50)+windowAt(t,136,153)+show(t,180,2))*(1-graphFade);
    arrows.children.forEach((node,i)=>{node.position=directions[i].map(x=>x*r) as Vec3;const strength=normalizedField(r);node.scale=[strength,strength,strength];node.opacity=show(t,40+i*.1,1);});
    alpha(opening,1-show(t,4,1.3));opening.style.transform=`translateY(${-12*show(t,4,1.3)}px)`;
    alpha(thought,windowAt(t,6,16));thought.innerHTML='A <span class="blue">uniformly charged</span> ball.';
    const eqFade=storyFade*(1-graphFade)*show(local,0,.65);
    alpha(equationPanel,eqFade);
    equationPanel.classList.toggle('wide',chapter===3||chapter===4||chapter===5);
    lines.forEach((line,i)=>{const p=show(local,story[chapter].lines[i].at,1.1);alpha(line,p);line.style.transform=`translateY(${(1-p)*14}px)`;line.style.clipPath=`inset(0 ${(1-p)*100}% 0 0)`;});
    for(const label of [labelR,labelQ])alpha(label,scene.opacity*show(t,8,1));
    for(const label of [labelr,labelP])alpha(label,scene.opacity*show(t,11,1));
    alpha(labeldq,scene.opacity*elementFade);alpha(labelsVar,scene.opacity*elementFade);alpha(labeltheta,scene.opacity*theta.opacity);
    const edgeFade=elementFade*(1-show(t,98,2));
    alpha(labelDs,scene.opacity*edgeFade);alpha(labelSdT,scene.opacity*edgeFade);alpha(labelSdP,scene.opacity*edgeFade);alpha(labeldV,scene.opacity*elementFade);
    alpha(labelShell,scene.opacity*shell.opacity*show(t,98));alpha(labelGauss,scene.opacity*gaussian.opacity);
    alpha(graphScene,graphFade);axes.reveal=show(t,153.6,2);ticks.opacity=show(t,155,1);guide.opacity=show(t,161,2);
    inside.reveal=show(t,157,7);outside.reveal=show(t,166,8);
    plotDot.position=[r,normalizedField(r),0];plotDot.opacity=show(t,157);dotGuide.position=[r,0,0];dotGuide.scale=[1,normalizedField(r),1];dotGuide.opacity=plotDot.opacity;
    gl.forEach((label,i)=>alpha(label,show(t,i===6?160:i===7?169:155,1)));
    movingValue.textContent=`${normalizedField(r).toFixed(2)}`;alpha(movingValue,show(t,157,1));
    const graphCaption=get('graph-scene').querySelector<HTMLElement>('.graph-caption')!;alpha(graphCaption,show(t,169,2));
    const title=get('graph-scene').querySelector<HTMLElement>('.graph-title')!;alpha(title,show(t,153,1));
    let nextCaption=0;for(let i=0;i<narration.length;i++)if(t>=narration[i][0])nextCaption=i;
    if(nextCaption!==captionIndex){captionIndex=nextCaption;subtitle.textContent=narration[nextCaption][1];}
    subtitle.hidden=!captions;
    get('time').innerHTML=`${fmt(t)} <span>/ ${fmt(DURATION)}</span>`;scrubber.value=String(t);
    play.textContent=timeline.playing?'Ⅱ':t>=DURATION?'↺':'▶';play.setAttribute('aria-label',timeline.playing?'Pause animation':t>=DURATION?'Replay animation':'Play animation');
    radiusInput.value=String(r);get('radius-value').textContent=`r = ${r.toFixed(2)} R`;
    get('region').textContent=r<1?'Inside the ball':r===1?'At the surface':'Outside the ball';
    get('field-value').textContent=`E / E(R) = ${normalizedField(r).toFixed(3)}`;
    radiusInput.setAttribute('aria-valuetext',`${r.toFixed(2)} times the ball radius; enclosed charge fraction ${enclosedFraction(r).toFixed(3)}`);
    labels.update();graphLabels.update();view.render();if(graphFade>.001)plot.render();
  };
  get('loading').hidden=true;ready=true;play.disabled=false;restart.disabled=false;for(const button of buttons)button.disabled=false;
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches)timeline.play();
  const animate=(now:number)=>{
    if(disposed)return;
    const delta=last?(now-last)/1000:0;last=now;
    try{if(ready){if(!document.hidden)timeline.tick(Math.min(delta,.1));renderAt(timeline.time);}}catch(e){report(e instanceof Error?e.message:String(e));}
    frame=requestAnimationFrame(animate);
  };
  frame=requestAnimationFrame(animate);
}
function toggle(){if(!ready)return;override=null;elementOverride=null;if(timeline.playing)timeline.pause();else timeline.play();}
play.addEventListener('click',toggle,events);
restart.addEventListener('click',()=>{override=null;elementOverride=null;timeline.seek(0);timeline.play();},events);
scrubber.addEventListener('input',()=>{override=null;elementOverride=null;timeline.pause();timeline.seek(Number(scrubber.value));},events);
radiusInput.addEventListener('input',()=>{if(!ready)return;const r=Number(radiusInput.value);timeline.pause();timeline.seek(176);override=r;},events);
// Explorer: drive the volume element's spherical coordinates by hand.
function refreshElementReadout(){const toDeg=(x:number)=>(((x*180/Math.PI)%360)+360)%360;get('element-s-value').textContent=`s = ${elementState.s.toFixed(2)} R`;get('element-theta-value').textContent=`θ = ${toDeg(elementState.theta).toFixed(0)}°`;get('element-phi-value').textContent=`φ = ${toDeg(elementState.phi).toFixed(0)}°`;get('element-dv-value').textContent=`s² sinθ = ${(elementState.s*elementState.s*Math.sin(elementState.theta)).toFixed(3)}`;if(!elementOverride){get<HTMLInputElement>('element-s').value=String(elementState.s);get<HTMLInputElement>('element-theta').value=String(toDeg(elementState.theta));get<HTMLInputElement>('element-phi').value=String(toDeg(elementState.phi));}}
const elementInputs=['element-s','element-theta','element-phi'].map(id=>get<HTMLInputElement>(id));
for(const input of elementInputs)input.addEventListener('input',()=>{
  if(!ready)return;
  timeline.pause();
  if(timeline.time<16||timeline.time>50){override=null;timeline.seek(24);}
  elementOverride={s:Number(get<HTMLInputElement>('element-s').value),theta:Number(get<HTMLInputElement>('element-theta').value)*Math.PI/180,phi:Number(get<HTMLInputElement>('element-phi').value)*Math.PI/180};
},events);
get<HTMLSelectElement>('speed').addEventListener('change',e=>{timeline.speed=Number((e.target as HTMLSelectElement).value);},events);
get('captions').addEventListener('click',()=>{captions=!captions;get('captions').setAttribute('aria-pressed',String(captions));},events);
get('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await get('player').requestFullscreen();}catch{/* Browser may disallow fullscreen in embedded contexts. */}},events);
document.addEventListener('keydown',e=>{
  if(!ready||e.altKey||e.ctrlKey||e.metaKey||(e.target instanceof HTMLElement&&/INPUT|SELECT|BUTTON|TEXTAREA/.test(e.target.tagName)))return;
  if(e.code==='Space'){e.preventDefault();toggle();}
  if(e.code==='ArrowLeft'||e.code==='ArrowRight'){e.preventDefault();override=null;timeline.pause();timeline.seek(timeline.time+(e.code==='ArrowLeft'?-5:5));}
},events);
document.addEventListener('visibilitychange',()=>{last=0;},events);
window.addEventListener('pagehide',()=>{disposed=true;cancelAnimationFrame(frame);lifetime.abort();labels?.dispose();graphLabels?.dispose();plot?.dispose();view?.dispose();},{once:true});
void initialize().catch(e=>{plot?.dispose();view?.dispose();report(e instanceof Error?e.message:String(e));});
