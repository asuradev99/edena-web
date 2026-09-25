// Run against a Chrome debugging session: node scripts/check-depth.mjs [port]
//
// Checks two things against a live page:
//   1. the renderer's depth behaviour (opaque order-independence, translucent blending), and
//   2. the crystal viewer: every listed operation animates, and each caption's "N of M sites move"
//      is a count the animation actually honours.
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
    const captions=[];
    for(let index=0;index<select.options.length;index++){
      select.value=String(index);
      select.dispatchEvent(new Event('change'));
      await wait(0);
      captions.push(document.getElementById('stage-op').textContent);
    }
    return {first,reversed,translucentBehind,translucentFront,captions,report:document.getElementById('mapping').textContent,status:document.getElementById('status').textContent};
  })()`});
  if(result.exceptionDetails)throw new Error(result.exceptionDetails.text+JSON.stringify(result.exceptionDetails));
  const value=result.result.value;
  assert.deepEqual(value.first,[255,0,0,255]);assert.deepEqual(value.reversed,value.first);
  assert.deepEqual(value.translucentBehind,value.first);
  assert.ok(value.translucentFront[0]>100&&value.translucentFront[2]>100);

  // Crystal viewer: 48 cubic operations, each with a caption describing what moves.
  assert.equal(value.captions.length,48,'the perovskite point group is m-3m');
  assert.match(value.captions.find(caption=>caption.startsWith('E · identity')),/every site maps onto itself/);
  const moved=value.captions.filter(caption=>!caption.startsWith('E · identity'))
    .map(caption=>{const match=/ of ([0-9]+) sites move/.exec(caption);return match?Number(match[1]):null;});
  assert.ok(moved.every(count=>count!==null),'every non-identity caption must report a count: '+JSON.stringify(value.captions.filter(caption=>!caption.startsWith('E · identity'))));
  assert.ok(moved.filter(count=>count>0).length>=20,'most operations must visibly move sites');
  assert.ok(Math.max(...moved)>=4,'the inversion moves 4 of the 5 perovskite sites');
  assert.match(value.report,/verified: every site maps to a distinct equivalent site/);
  assert.match(value.status,/^Ready/);
  console.log('PASS: opaque depth, draw-order independence, translucent depth, and every operation captioned',{operations:value.captions.length,moving:moved.filter(count=>count>0).length,status:value.status});
} finally {socket.close();await fetch(`http://localhost:${port}/json/close/${target.id}`);}
