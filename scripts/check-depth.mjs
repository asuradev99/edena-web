// Run against a Chrome debugging session: node scripts/check-depth.mjs [port]
//
// Checks three things against a live page:
//   1. the renderer's depth behaviour (opaque order-independence, translucent blending),
//   2. the crystal viewer: every listed operation animates, each caption's "N of M sites move" is a
//      count the animation actually honours, and every operation reads distinctly, and
//   3. the viewer's interaction locks: the identity cannot be played, a zoom survives an operation
//      change, a double-click restores the camera, choosing an operation stays well under a frame
//      budget, the picker's counts match the captions at every supercell size, a phonopy file keeps
//      its operations when a structure loads, and rutile lists the 8 point operations it really has.
//   4. the drawn path itself, family by family: a rotation samples to a projected circle, a mirror
//      and an inversion to straight chords (the inversion's through the box centre), and a
//      roto-reflection's first half to that circle while its second half folds straight.
// It also fails if the page throws, logs an error, or reports a severe entry while all of that runs.
import assert from 'node:assert/strict';
const port=process.argv[2]??'9333';
const target=await(await fetch(`http://localhost:${port}/json/new?http://127.0.0.1:5173/symmetry.html`,{method:'PUT'})).json();
const socket=new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve=>socket.onopen=resolve);
let id=0;const pending=new Map();const events=[];
socket.onmessage=event=>{const message=JSON.parse(event.data);if(message.id)pending.get(message.id)?.(message);else events.push(message);};
const call=(method,params)=>new Promise((resolve,reject)=>{const key=++id;const timer=setTimeout(()=>reject(new Error('Browser check timed out')),20000);pending.set(key,message=>{clearTimeout(timer);pending.delete(key);message.error?reject(message.error):resolve(message.result);});socket.send(JSON.stringify({id:key,method,params}));});
try {
  // Enable the domains before the page runs so nothing it reports is missed, and reload so the load
  // itself is covered too.
  await call('Runtime.enable');await call('Log.enable');await call('Page.enable');
  await call('Page.navigate',{url:'http://127.0.0.1:5173/symmetry.html'});
  await new Promise(resolve=>setTimeout(resolve,2500));
  const result=await call('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{
    const {WebGPUView,Geometry,Visual}=await import('/build/index.js');
    const canvas=document.createElement('canvas');canvas.style.cssText='width:64px;height:64px';document.body.append(canvas);
    const view=await WebGPUView.create(canvas,{interactive:false,samples:1,maxDpr:1,alphaMode:'opaque'});
    view.camera.yaw=0;view.camera.pitch=0;view.camera.height=2;
    const triangle=new Geometry(new Float32Array([-1,-1,0,1,-1,0,0,1,0]));
    const front=new Visual(triangle,[1,0,0,1]);front.position=[0,0,1];
    const back=new Visual(triangle,[0,0,1,1]);back.position=[0,0,-1];
    const sample=async()=>{view.render();await view.device.queue.onSubmittedWorkDone();const img=new Image();img.src=canvas.toDataURL();await img.decode();const c=document.createElement('canvas');c.width=64;c.height=64;const ctx=c.getContext('2d');ctx.drawImage(img,0,0,64,64);return [...ctx.getImageData(32,32,1,1).data];};
    view.world.add(front,back);const first=await sample();view.world.clear();view.world.add(back,front);const reversed=await sample();
    back.color=[0,0,1,.5];const translucentBehind=await sample();
    back.position=[0,0,1.5];const translucentFront=await sample();
    view.dispose();canvas.remove();

    // The viewer animates one operation at a time, so give every option a turn.
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const select=document.getElementById('operation');
    const play=document.getElementById('play');
    const scene=document.getElementById('scene');
    const captions=[];
    for(let index=0;index<select.options.length;index++){
      select.value=String(index);
      select.dispatchEvent(new Event('change'));
      await wait(0);
      captions.push(document.getElementById('stage-op').textContent);
    }
    // Every operation must read distinctly: without the power suffix S4 and S4^3 about [100] were
    // the same words for two different maps.
    const labels=[...select.options].map(option=>option.textContent.replace(/^[0-9]+\\.\\s*/,'').replace(/\\s*·\\s*[0-9]+ moved$/,''));
    const distinctLabels=new Set(labels).size;

    // Pausing keeps the measured frames comparable; choosing an operation otherwise plays it.
    const pause=async()=>{if(play.textContent==='Ⅱ')play.click();await wait(0);};
    select.value='0';select.dispatchEvent(new Event('change'));await wait(0);
    const identityPlayDisabled=play.disabled;
    select.value='1';select.dispatchEvent(new Event('change'));await wait(0);
    const rotationPlayDisabled=play.disabled;
    await pause();

    // How much of the stage the drawn box fills, sampled from the canvas.
    const drawnHeight=async()=>{
      const image=new Image();image.src=scene.toDataURL();await image.decode();
      const probe=document.createElement('canvas');probe.width=216;probe.height=174;
      const context=probe.getContext('2d');context.drawImage(image,0,0,216,174);
      const data=context.getImageData(0,0,216,174).data;
      let top=174,bottom=0;
      for(let y=0;y<174;y++)for(let x=0;x<216;x++){const i=(y*216+x)*4;if(data[i]+data[i+1]+data[i+2]>160){top=Math.min(top,y);bottom=Math.max(bottom,y);break;}}
      return bottom-top;
    };
    const beforeZoom=await drawnHeight();
    for(let step=0;step<6;step++){
      scene.dispatchEvent(new WheelEvent('wheel',{deltaY:-120,clientX:scene.clientWidth/2,clientY:scene.clientHeight/2,bubbles:true,cancelable:true}));
      await wait(25);
    }
    await wait(250);
    const zoomed=await drawnHeight();
    select.value='7';select.dispatchEvent(new Event('change'));await wait(300);await pause();await wait(200);
    const zoomedAfterSwitch=await drawnHeight();

    // Double-clicking the stage puts the camera back where it started.
    scene.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));
    await wait(300);
    const afterReset=await drawnHeight();

    // Choosing an operation rebuilds the scene; it used to cost 55-95 ms because the shaded sphere
    // was rebuilt per element, which is thousands of vertices.
    const switchTimes=[];
    for(const index of [2,8,16,24,32,40]){
      const started=performance.now();
      select.value=String(index);select.dispatchEvent(new Event('change'));
      switchTimes.push(performance.now()-started);
    }

    // The picker's "N moved" and the caption's "N of M sites move" describe the same thing and must
    // agree — at every supercell size, since both count the drawn cell.
    const countMismatches=[];
    const supercell=document.getElementById('supercell');
    for(const size of ['1','2','3']){
      supercell.value=size;supercell.dispatchEvent(new Event('change'));
      await wait(500);
      for(let index=0;index<select.options.length;index++){
        const label=select.options[index].textContent;
        select.value=String(index);select.dispatchEvent(new Event('change'));
        await wait(0);
        const caption=document.getElementById('stage-op').textContent;
        const claimed=/· ([0-9]+) moved/.exec(label);
        const actual=/([0-9]+) of [0-9]+ sites move/.exec(caption);
        if(Number(claimed?.[1]??-1)!==(actual?Number(actual[1]):0))countMismatches.push(size+'x: '+label+' vs '+caption);
      }
    }
    // Files: a hexagonal POSCAR loads to its own point group, and a file that cannot be parsed
    // leaves the crystal alone and says why.
    const newline=String.fromCharCode(10);
    const statusBeforeFiles=document.getElementById('status').textContent;
    const hex=['Hexagonal','1.0','3.16 0 0','-1.58 2.7366 0','0 0 12.9','Mo','1','Direct','0 0 0'].join(newline);
    const drop=async(name,text,target)=>{const dt=new DataTransfer();dt.items.add(new File([text],name));const input=document.getElementById(target);input.files=dt.files;input.dispatchEvent(new Event('change'));await wait(900);};
    await drop('hex.vasp',hex,'poscar-file');
    const loaded={status:document.getElementById('status').textContent,state:document.getElementById('status').dataset.state,options:select.options.length,report:document.getElementById('mapping').textContent};
    const captionBefore=document.getElementById('stage-op').textContent;
    await drop('broken.vasp','not a poscar at all','poscar-file');
    const rejected={status:document.getElementById('status').textContent,state:document.getElementById('status').dataset.state,caption:document.getElementById('stage-op').textContent};
    // A real material: rutile's origin-centred point operations are the identity, three 2-folds,
    // three mirrors and the inversion — 8 of the tetragonal lattice's 16. The 4-fold needs the 4_2
    // screw's translation, so it must not appear.
    const rutile=['Rutile TiO2','1.0','4.5937 0 0','0 4.5937 0','0 0 2.9587','Ti O','2 4','Direct',
      '0 0 0','0.5 0.5 0.5','0.3053 0.3053 0','0.6947 0.6947 0','0.8053 0.1947 0.5','0.1947 0.8053 0.5'].join(newline);
    await drop('rutile.vasp',rutile,'poscar-file');
    const rutileFamilies={};
    for(const option of select.options){const label=option.textContent;const family=/· ([^·]*?) ·/.exec(label);const key=family?family[1].trim():'?';rutileFamilies[key]=(rutileFamilies[key]??0)+1;}
    const rutileResult={options:select.options.length,report:[...document.querySelectorAll('#mapping .report-line')].map(node=>node.textContent).join(' '),families:rutileFamilies};
    // A phonopy file's own operations must survive a structure load: dropping the two files in
    // either order has to keep both.
    const yaml=['rotations:','- [1, 0, 0, 0, 1, 0, 0, 0, 1]','- [-1, 0, 0, 0, -1, 0, 0, 0, 1]','translations:','- [0, 0, 0]','- [0, 0, 0]'].join(newline);
    await drop('sym.yaml',yaml,'symmetry-file');
    const afterYaml=select.options.length;
    await drop('cubic.vasp',['Cubic','1.0','5 0 0','0 5 0','0 0 5','Si','1','Direct','0 0 0'].join(newline),'poscar-file');
    const afterStructure=select.options.length;
    return {first,reversed,translucentBehind,translucentFront,captions,report:document.getElementById('mapping').textContent,status:document.getElementById('status').textContent,
      distinctLabels,beforeZoom,zoomed,zoomedAfterSwitch,afterReset,countMismatches,loaded,rejected,afterYaml,afterStructure,rutileResult,captionBefore,statusBeforeFiles,slowestSwitch:Math.max(...switchTimes),identityPlayDisabled,rotationPlayDisabled};
  })()`});
  if(result.exceptionDetails)throw new Error(result.exceptionDetails.text+JSON.stringify(result.exceptionDetails));
  const value=result.result.value;
  assert.deepEqual(value.first,[255,0,0,255]);assert.deepEqual(value.reversed,value.first);
  assert.deepEqual(value.translucentBehind,value.first);
  assert.ok(value.translucentFront[0]>100&&value.translucentFront[2]>100);

  // Crystal viewer: 48 cubic operations, each with a caption describing what moves.
  assert.equal(value.captions.length,48,'the perovskite point group is m-3m');
  assert.match(value.captions.find(caption=>caption.startsWith('E · identity')),/every site maps onto itself/);
  const nonIdentity=value.captions.filter(caption=>!caption.startsWith('E · identity'));
  // The caption reads "M of N sites move · P lie on the element". M is the count the animation
  // honours; a regex that grabbed N instead would make the checks below vacuous, which is exactly
  // what an earlier revision of this script did.
  const counts=nonIdentity.map(caption=>{
    const movedMatch=/([0-9]+) of ([0-9]+) sites move/.exec(caption);
    if(!movedMatch)return null;
    const pinnedMatch=/· ([0-9]+) l/.exec(caption);
    return {movers:Number(movedMatch[1]),total:Number(movedMatch[2]),pinned:pinnedMatch?Number(pinnedMatch[1]):0};
  });
  assert.ok(counts.every(count=>count!==null),'every non-identity caption must report a count: '+JSON.stringify(nonIdentity));
  assert.ok(counts.every(count=>count.movers+count.pinned===count.total),'movers plus pinned sites must cover the cell: '+JSON.stringify(nonIdentity.filter((caption,index)=>counts[index]&&counts[index].movers+counts[index].pinned!==counts[index].total)));
  assert.ok(counts.filter(count=>count.movers>0).length>=20,'most operations must visibly move sites');
  assert.ok(Math.max(...counts.map(count=>count.movers))>=4,'the inversion moves 4 of the 5 perovskite sites');
  assert.match(value.report,/verified: every site maps to a distinct equivalent site/);
  assert.match(value.statusBeforeFiles,/^Ready/);
  assert.equal(value.distinctLabels,48,'every operation must read distinctly (S4 and S4^3 differ only by the power)');

  // Viewer interaction locks.
  assert.equal(value.identityPlayDisabled,true,'the identity relocates nothing, so it cannot be played');
  assert.equal(value.rotationPlayDisabled,false,'a rotation must be playable');
  assert.ok(value.zoomed>value.beforeZoom+5,`zooming must enlarge the drawn box (${value.beforeZoom} -> ${value.zoomed})`);
  assert.ok(Math.abs(value.zoomedAfterSwitch-value.zoomed)<=3,`choosing an operation must keep the zoom (${value.zoomed} -> ${value.zoomedAfterSwitch})`);
  assert.ok(Math.abs(value.afterReset-value.beforeZoom)<=2,`a double-click must put the camera back (${value.beforeZoom} -> ${value.afterReset})`);
  assert.ok(value.slowestSwitch<80,`choosing an operation must stay inside a frame budget (slowest ${value.slowestSwitch.toFixed(1)} ms)`);
  assert.deepEqual(value.countMismatches,[],'the picker and the caption must agree on how many sites move');

  // Loading a file, and refusing one.
  assert.match(value.loaded.status,/loaded$/);
  assert.equal(value.loaded.state,'ok');
  assert.equal(value.loaded.options,24,`a hexagonal lattice shows 6/mmm: 24 operations (got ${value.loaded.options})`);
  assert.match(value.loaded.report,/map this cell onto itself/);
  assert.match(value.rejected.status,/broken\.vasp: /);
  assert.equal(value.rejected.state,'error');
  assert.equal(value.rejected.caption,value.captionBefore,'a rejected file must leave the crystal alone');
  assert.equal(value.afterYaml,2,'the phonopy file supplies two operations');
  assert.equal(value.afterStructure,2,'a structure load must keep the phonopy file\'s operations');
  assert.equal(value.rutileResult.options,8,`rutile has 8 origin-centred point operations (got ${value.rutileResult.options})`);
  assert.match(value.rutileResult.report,/8 of the lattice's 16 point-group operations/);
  assert.match(value.rutileResult.report,/need a lattice translation/,'the report explains the missing operations');
  // The drawn animation, measured rather than assumed: a rotation about a fixed axis projects onto an
  // ellipse whatever the timing, so hide everything that shares the element's colour, sample the
  // atom's centroid through the sweep, and fit the general conic. A chord or a stray loop misses it
  // by tens of pixels; a real projected circle sits inside a fraction of one.
  await call('Page.navigate',{url:'http://127.0.0.1:5173/symmetry.html'});
  await new Promise(resolve=>setTimeout(resolve,2500));
  const shape=await call('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const select=document.getElementById('operation');
    const index=[...select.options].findIndex(option=>option.textContent.includes('180° ‖ [010]'));
    select.value=String(index);select.dispatchEvent(new Event('change'));
    await wait(250);
    const play=document.getElementById('play');if(play.textContent==='Ⅱ')play.click();
    for(const id of ['trails','start-sites','cell','bonds']){const input=document.getElementById(id);if(input.checked)input.click();}
    await wait(300);
    const scene=document.getElementById('scene');
    const probe=document.createElement('canvas');probe.width=440;probe.height=360;
    const context=probe.getContext('2d',{willReadFrequently:true});
    const measure=async()=>{
      const image=new Image();image.src=scene.toDataURL();await image.decode();
      context.clearRect(0,0,440,360);context.drawImage(image,0,0,440,360);
      const data=context.getImageData(0,0,440,360).data;
      let sx=0,sy=0,n=0;
      for(let y=0;y<360;y++)for(let x=0;x<440;x++){
        const i=(y*440+x)*4,r=data[i],g=data[i+1],b=data[i+2];
        if(g>150&&g>r*1.45&&g>b*1.35){sx+=x;sy+=y;n++;}
      }
      return n?[sx/n,sy/n,n]:null;
    };
    const samples=[];
    for(let step=0;step<=16;step++){
      const progress=document.getElementById('progress');
      progress.value=String(step/16);progress.dispatchEvent(new Event('input'));
      await wait(80);
      const sprite=await measure();
      samples.push({t:step/16,x:sprite?sprite[0]:null,y:sprite?sprite[1]:null,pixels:sprite?sprite[2]:0});
    }
    return {label:select.options[Number(select.value)].textContent,samples};
  })()`});
  const solveLinear=(matrix,rhs)=>{
    const size=rhs.length,rows=matrix.map(row=>[...row]);
    for(let col=0;col<size;col++){
      let pivot=col;for(let row=col+1;row<size;row++)if(Math.abs(rows[row][col])>Math.abs(rows[pivot][col]))pivot=row;
      [rows[col],rows[pivot]]=[rows[pivot],rows[col]];[rhs[col],rhs[pivot]]=[rhs[pivot],rhs[col]];
      for(let row=0;row<size;row++)if(row!==col){const factor=rows[row][col]/rows[col][col];rhs[row]-=factor*rhs[col];for(let k=0;k<size;k++)rows[row][k]-=factor*rows[col][k];}
    }
    return rhs.map((value,index)=>value/rows[index][index]);
  };
  // Fit the general conic ax^2+bxy+cy^2+dx+ey=1 and report how far the drawn path sits from it.
  const fitEllipse=(list)=>{
    const size=5,matrix=Array.from({length:size},()=>new Array(size).fill(0)),rhs=new Array(size).fill(0);
    for(const point of list){const row=[point.x*point.x,point.x*point.y,point.y*point.y,point.x,point.y];for(let a=0;a<size;a++){rhs[a]+=row[a];for(let b=0;b<size;b++)matrix[a][b]+=row[a]*row[b];}}
    const [A,B,C,D,E]=solveLinear(matrix,rhs);
    const deviations=list.map(point=>{
      const F=A*point.x*point.x+B*point.x*point.y+C*point.y*point.y+D*point.x+E*point.y-1;
      return Math.abs(F)/Math.hypot(2*A*point.x+B*point.y+D,B*point.x+2*C*point.y+E);
    });
    return {discriminant:B*B-4*A*C,worst:Math.max(...deviations)};
  };
  const rotationPoints=(shape.result?.value?.samples??[]).filter(sample=>sample.x!==null&&sample.pixels>150);
  assert.ok(rotationPoints.length>=15,`the shape check must see the atom in every frame (${rotationPoints.length})`);
  const rotation=fitEllipse(rotationPoints);
  assert.ok(rotation.discriminant<0,'the drawn path must be an ellipse, not a line or a hyperbola');
  assert.ok(rotation.worst<=4,`the drawn animation must follow the projected circle (worst ${rotation.worst.toFixed(2)} px off)`);

  // A roto-reflection has to be two moves in turn, so measure its two halves separately: the first is
  // a rotation, and the second folds straight through the plane. Asserted from the drawn pixels.
  await call('Page.navigate',{url:'http://127.0.0.1:5173/symmetry.html'});
  await new Promise(resolve=>setTimeout(resolve,2500));
  const split=await call('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const poscar=['Single Sr','1.0','4 0 0','0 4 0','0 0 4','Sr','1','Direct','0.12 0.22 0.34'].join(String.fromCharCode(10));
    const dt=new DataTransfer();dt.items.add(new File([poscar],'sr.vasp'));
    const input=document.getElementById('poscar-file');input.files=dt.files;input.dispatchEvent(new Event('change'));
    let guard=0;while(!/loaded/.test(document.getElementById('status').textContent)&&guard++<200)await wait(25);
    await wait(700);
    // Colour by site index: site 0 is cyan, while every symmetry element is drawn in the green that
    // strontium would share.
    const colour=document.getElementById('colour');colour.value='site';colour.dispatchEvent(new Event('change'));
    await wait(400);
    const select=document.getElementById('operation');
    for(const id of ['trails','start-sites','cell','bonds']){const node=document.getElementById(id);if(node.checked)node.click();}
    await wait(300);
    const scene=document.getElementById('scene');
    const probe=document.createElement('canvas');probe.width=440;probe.height=360;
    const context=probe.getContext('2d',{willReadFrequently:true});
    const measure=async()=>{
      const image=new Image();image.src=scene.toDataURL();await image.decode();
      context.clearRect(0,0,440,360);context.drawImage(image,0,0,440,360);
      const data=context.getImageData(0,0,440,360).data;
      let sx=0,sy=0,n=0;
      for(let y=0;y<360;y++)for(let x=0;x<440;x++){
        const i=(y*440+x)*4,r=data[i],g=data[i+1],b=data[i+2];
        if(b>150&&b>r*1.7&&g>110&&b>=g){sx+=x;sy+=y;n++;}
      }
      return n?[sx/n,sy/n,n]:null;
    };
    const sweep=async(match,steps)=>{
      const index=[...select.options].findIndex(option=>option.textContent.includes(match));
      if(index<0)return {label:'not found: '+match,samples:[]};
      select.value=String(index);select.dispatchEvent(new Event('change'));
      await wait(250);
      const play=document.getElementById('play');if(play.textContent==='Ⅱ')play.click();
      const samples=[];
      for(let step=0;step<=steps;step++){
        const progress=document.getElementById('progress');
        progress.value=String(step/steps);progress.dispatchEvent(new Event('input'));
        await wait(80);
        const point=await measure();
        samples.push({t:step/steps,x:point?point[0]:null,y:point?point[1]:null,pixels:point?point[2]:0});
      }
      return {label:select.options[Number(select.value)].textContent,samples};
    };
    const spin=await sweep('S₄ · rotoreflection ‖ [001]',16);
    // A mirror folds straight through its plane and an inversion slides straight through the centre;
    // both are chords, unlike the arc above.
    const mirror=await sweep('σ · mirror ⟂ [001]',12);
    const inversion=await sweep('i · inversion',12);
    return {spin,mirror,inversion};
  })()`});
  const pixel=split.result?.value??{};
  const collect=(list)=>list.filter(sample=>sample.x!==null&&sample.pixels>120);
  // Straightness is the bow away from the chord through the first and last sample: a fold and an
  // inversion are that chord, while the arc above bows away from it by tens of pixels.
  const bow=(list)=>{
    const from=list[0],to=list[list.length-1];
    const span=Math.hypot(to.x-from.x,to.y-from.y);
    const deviations=list.map(point=>Math.abs((point.x-from.x)*(to.y-from.y)-(point.y-from.y)*(to.x-from.x))/span);
    return {span,worst:Math.max(...deviations)};
  };
  const splitPoints=collect(pixel.spin?.samples??[]);
  assert.ok(splitPoints.length>=15,`the roto-reflection check must see the atom in every frame (${splitPoints.length})`);
  const spun=fitEllipse(splitPoints.filter(point=>point.t<=0.5+1e-9));
  assert.ok(spun.discriminant<0,'the first half of a roto-reflection must turn about the axis');
  assert.ok(spun.worst<=4,`the first half must be a rotation arc (worst ${spun.worst.toFixed(2)} px off)`);
  const folded=bow(splitPoints.filter(point=>point.t>=0.5-1e-9));
  assert.ok(folded.span>10,`the second half must actually move (${folded.span.toFixed(1)} px)`);
  assert.ok(folded.worst<=5,`the second half must be a straight fold, not an arc (bows ${folded.worst.toFixed(2)} px)`);
  const mirrorPoints=collect(pixel.mirror?.samples??[]);
  const inversionPoints=collect(pixel.inversion?.samples??[]);
  assert.ok(mirrorPoints.length>=11&&inversionPoints.length>=11,'the mirror and inversion sweeps must see the atom');
  const mirror=bow(mirrorPoints),inversion=bow(inversionPoints);
  assert.ok(mirror.span>10&&mirror.worst<=5,`a mirror must fold straight through its plane (bows ${mirror.worst.toFixed(2)} px)`);
  assert.ok(inversion.span>10&&inversion.worst<=5,`an inversion must slide straight through the centre (bows ${inversion.worst.toFixed(2)} px)`);
  // The inversion's chord passes through the box centre, which is where the camera is aimed.
  const from=inversionPoints[0],to=inversionPoints[inversionPoints.length-1];
  const toCentre=Math.abs((220-from.x)*(to.y-from.y)-(180-from.y)*(to.x-from.x))/inversion.span;
  assert.ok(toCentre<=12,`an inversion must pass through the centre (line misses it by ${toCentre.toFixed(2)} px)`);
  const worst=rotation.worst;

  // Nothing may have complained along the way: no exception, no console.error, no severe log entry.
  const complaints=events.filter(event=>event.method==='Runtime.exceptionThrown'
    || (event.method==='Runtime.consoleAPICalled'&&event.params.type==='error')
    || (event.method==='Log.entryAdded'&&event.params.entry.level==='error'))
    .map(event=>event.params.exceptionDetails?.text ?? event.params.entry?.text ?? event.params.args?.map(arg=>arg.value).join(' ') ?? event.method);
  assert.deepEqual(complaints,[],'the page must run without errors');
  console.log('PASS: opaque depth, draw-order independence, translucent depth, every operation captioned, the drawn path is a projected circle, and the viewer interaction locks',
    {operations:value.captions.length,moving:counts.filter(count=>count.movers>0).length,movedPerOperation:counts.map(count=>count.movers),slowestSwitchMs:Number(value.slowestSwitch.toFixed(1)),loaded:value.loaded.options,rutile:value.rutileResult.options,rutileFamilies:value.rutileResult.families,pathDeviationPx:Number(worst.toFixed(2)),spinDeviationPx:Number(spun.worst.toFixed(2)),foldBowPx:Number(folded.worst.toFixed(2)),mirrorBowPx:Number(mirror.worst.toFixed(2)),inversionBowPx:Number(inversion.worst.toFixed(2)),status:value.statusBeforeFiles});
} finally {socket.close();await fetch(`http://localhost:${port}/json/close/${target.id}`);}
