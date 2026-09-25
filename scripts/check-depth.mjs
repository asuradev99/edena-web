// Run against a Chrome debugging session: node scripts/check-depth.mjs [port]
import assert from 'node:assert/strict';
const port=process.argv[2]??'9333';
const target=await(await fetch(`http://localhost:${port}/json/new?http://127.0.0.1:5173/symmetry.html`,{method:'PUT'})).json();
const socket=new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve=>socket.onopen=resolve);
let id=0;const pending=new Map();
socket.onmessage=event=>{const message=JSON.parse(event.data);pending.get(message.id)?.(message);};
const call=(method,params)=>new Promise((resolve,reject)=>{const key=++id;const timer=setTimeout(()=>reject(new Error('Browser check timed out')),15000);pending.set(key,message=>{clearTimeout(timer);pending.delete(key);message.error?reject(message.error):resolve(message.result);});socket.send(JSON.stringify({id:key,method,params}));});
try {
  await new Promise(resolve=>setTimeout(resolve,2000));
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
    const mappings={};for(const operation of ['c4','c3','mirror','inversion']){const select=document.getElementById('operation');select.value=operation;select.dispatchEvent(new Event('change'));const slider=document.getElementById('progress');slider.value='1';slider.dispatchEvent(new Event('input'));mappings[operation]=document.getElementById('mapping').textContent;}
    return {first,reversed,translucentBehind,translucentFront,mappings,error:document.getElementById('status').textContent};
  })()`});
  if(result.exceptionDetails)throw new Error(result.exceptionDetails.text+JSON.stringify(result.exceptionDetails));
  const value=result.result.value;
  assert.deepEqual(value.first,[255,0,0,255]);assert.deepEqual(value.reversed,value.first);
  assert.deepEqual(value.translucentBehind,value.first);
  assert.ok(value.translucentFront[0]>100&&value.translucentFront[2]>100);
  for(const mapping of Object.values(value.mappings))assert.match(mapping,/8\/8 sites coincide/);
  assert.equal(value.error,'');console.log('PASS: opaque depth, draw-order independence, translucent depth, four symmetry operations',value);
} finally {socket.close();await fetch(`http://localhost:${port}/json/close/${target.id}`);}
