// Run against a Chrome debugging session: node scripts/check-depth.mjs [port]
//
// Checks three things against a live page:
//   1. the renderer's depth behaviour (opaque order-independence, translucent blending),
//   2. the crystal viewer: every listed operation animates, each caption's "N of M sites move" is a
//      count the animation actually honours, and every operation reads distinctly, and
//   3. the viewer's interaction locks: the identity cannot be played, a zoom survives an operation
//      change, and choosing an operation stays well under a frame budget.
import assert from 'node:assert/strict';
const port=process.argv[2]??'9333';
const target=await(await fetch(`http://localhost:${port}/json/new?http://127.0.0.1:5173/symmetry.html`,{method:'PUT'})).json();
const socket=new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve=>socket.onopen=resolve);
let id=0;const pending=new Map();
socket.onmessage=event=>{const message=JSON.parse(event.data);pending.get(message.id)?.(message);};
const call=(method,params)=>new Promise((resolve,reject)=>{const key=++id;const timer=setTimeout(()=>reject(new Error('Browser check timed out')),20000);pending.set(key,message=>{clearTimeout(timer);pending.delete(key);message.error?reject(message.error):resolve(message.result);});socket.send(JSON.stringify({id:key,method,params}));});
try {
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
    return {first,reversed,translucentBehind,translucentFront,captions,report:document.getElementById('mapping').textContent,status:document.getElementById('status').textContent,
      distinctLabels,beforeZoom,zoomed,zoomedAfterSwitch,afterReset,countMismatches,slowestSwitch:Math.max(...switchTimes),identityPlayDisabled,rotationPlayDisabled};
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
  assert.match(value.status,/^Ready/);
  assert.equal(value.distinctLabels,48,'every operation must read distinctly (S4 and S4^3 differ only by the power)');

  // Viewer interaction locks.
  assert.equal(value.identityPlayDisabled,true,'the identity relocates nothing, so it cannot be played');
  assert.equal(value.rotationPlayDisabled,false,'a rotation must be playable');
  assert.ok(value.zoomed>value.beforeZoom+5,`zooming must enlarge the drawn box (${value.beforeZoom} -> ${value.zoomed})`);
  assert.ok(Math.abs(value.zoomedAfterSwitch-value.zoomed)<=3,`choosing an operation must keep the zoom (${value.zoomed} -> ${value.zoomedAfterSwitch})`);
  assert.ok(Math.abs(value.afterReset-value.beforeZoom)<=2,`a double-click must put the camera back (${value.beforeZoom} -> ${value.afterReset})`);
  assert.ok(value.slowestSwitch<80,`choosing an operation must stay inside a frame budget (slowest ${value.slowestSwitch.toFixed(1)} ms)`);
  assert.deepEqual(value.countMismatches,[],'the picker and the caption must agree on how many sites move');
  console.log('PASS: opaque depth, draw-order independence, translucent depth, every operation captioned, and the viewer interaction locks',
    {operations:value.captions.length,moving:counts.filter(count=>count.movers>0).length,movedPerOperation:counts.map(count=>count.movers),slowestSwitchMs:Number(value.slowestSwitch.toFixed(1)),status:value.status});
} finally {socket.close();await fetch(`http://localhost:${port}/json/close/${target.id}`);}
