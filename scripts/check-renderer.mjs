// Real WebGPU and DOM regression: node scripts/check-renderer.mjs [CDP port]
import assert from 'node:assert/strict';
const port = process.argv[2] ?? 9444;
const origin = process.env.EDENA_ORIGIN ?? 'http://127.0.0.1:5173';
const target = await fetch(`http://localhost:${port}/json/new?about:blank`, {method:'PUT'}).then(r=>r.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
let next=0;
const pending=new Map();
socket.onmessage=event=>{
  const message=JSON.parse(event.data), request=pending.get(message.id);
  if(request){pending.delete(message.id);clearTimeout(request.timer);message.error?request.reject(message.error):request.resolve(message.result);}
};
const call=(method,params={})=>new Promise((resolve,reject)=>{
  const id=++next;
  const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`${method} timed out`));},30000);
  pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
});
try {
  await call('Page.enable');await call('Network.enable');
  await call('Network.setCacheDisabled',{cacheDisabled:true});
  // A source document avoids starting any showcase animation in the measurement tab.
  await call('Page.navigate',{url:`${origin}/legacy.html`});
  await new Promise(resolve=>setTimeout(resolve,300));
  const response=await call('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{
    const {WebGPUView,Visual,Geometry,LabelLayer,OrbitCamera,GpuParticleSimulation}=await import('/build/index.js');
    document.body.innerHTML='';
    const errors=[];
    const canvas=document.createElement('canvas');canvas.style.cssText='width:200px;height:200px';document.body.append(canvas);
    const view=await WebGPUView.create(canvas,{interactive:false,samples:1,maxDpr:1});
    view.device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
    view.camera.yaw=0;view.camera.pitch=0;view.camera.height=4;
    const geometry=new Geometry(new Float32Array([-.1,-.1,0,.1,-.1,0,0,.1,0]));
    const nodes=Array.from({length:1000},(_,i)=>{const node=new Visual(geometry);node.position=[(i%30)*.1-1.5,Math.floor(i/30)*.1-1.5,0];return node;});
    view.world.add(...nodes);
    let writes=0,bytes=0,submissions=0;
    const queue=view.device.queue,write=queue.writeBuffer.bind(queue),submit=queue.submit.bind(queue);
    queue.submit=(...args)=>{submissions++;return submit(...args);};
    queue.writeBuffer=(...args)=>{writes++;bytes+=(args[4]??args[2].length??args[2].byteLength)*(args[2].BYTES_PER_ELEMENT??1);return write(...args);};
    const measure=()=>{writes=0;bytes=0;submissions=0;const start=performance.now();view.render();return {writes,bytes,submissions,ms:performance.now()-start};};
    const initial=measure(),idle=measure();
    view.camera.yaw=.1;const camera=measure();
    nodes[500].position[0]+=.125;const sparse=measure();
    nodes[500].opacity=.9;const transparent=measure();
    nodes[500].opacity=1;measure();
    view.world.remove(...nodes.slice(10));measure();
    view.world.add(...nodes.slice(10));const regrow=measure();
    view.world.add(new Visual(geometry));const grow=measure();
    const idleAfterGrow=measure();
    const createBuffer=view.device.createBuffer.bind(view.device);let tintAllocations=0;
    view.device.createBuffer=(...args)=>{tintAllocations++;return createBuffer(...args);};
    for(let frame=0;frame<20;frame++){
      for(const node of view.world.children)node.color=[.5+frame/40,1,1,1];
      measure();
    }
    view.device.createBuffer=createBuffer;
    await queue.onSubmittedWorkDone();
    // Capture before yielding a browser frame; presented WebGPU textures need not retain pixels.
    const image=new Image();image.src=canvas.toDataURL();await image.decode();
    const read=document.createElement('canvas');read.width=200;read.height=200;
    const ctx=read.getContext('2d');ctx.drawImage(image,0,0);
    const pixels=ctx.getImageData(0,0,200,200).data;
    let lit=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>30)lit++;
    view.world.clear();const dynamic=new Visual(geometry);view.world.add(dynamic);measure();
    let geometryAllocations=0;
    view.device.createBuffer=(...args)=>{geometryAllocations++;return createBuffer(...args);};
    for(let frame=0;frame<20;frame++){
      dynamic.geometry=new Geometry(new Float32Array([-.1,-.1,frame*.001,.1,-.1,0,0,.1,0]));measure();
    }
    view.device.createBuffer=createBuffer;
    queue.writeBuffer=write;queue.submit=submit;
    const simulation=await GpuParticleSimulation.create({device:view.device,count:128,seed:23});
    const timing=[];
    // The old implementation called a missing encoder method, and 65+ iterations failed the
    // unrelated per-frame substep cap. Test both boundaries against an actual GPU.
    for(const count of [1,65,1024]){
      const before=simulation.steps,ms=await simulation.measure(count);
      timing.push({count,ms,steps:simulation.steps-before,error:simulation.timingError});
    }
    let rejected=false;try{await simulation.measure(1025);}catch{rejected=true;}
    const supportsTiming=simulation.supportsTiming;
    simulation.reset();const afterReset=simulation.steps;
    simulation.destroy();
    view.dispose();canvas.remove();

    const host=document.createElement('div');host.style.cssText='position:relative;width:400px;height:200px';document.body.append(host);
    const cam=new OrbitCamera();cam.yaw=0;cam.pitch=0;cam.height=4;cam.projection='perspective';cam.distance=10;
    const layer=new LabelLayer(host,cam);
    let point=[0,0,0];const label=layer.add('anchor',()=>point);
    layer.update();
    const rect=()=>{const a=label.getBoundingClientRect(),b=host.getBoundingClientRect();return [a.x+a.width/2-b.x,a.y+a.height/2-b.y];};
    const center=rect(),visible=label.style.visibility;
    const mutations=[];const observer=new MutationObserver(records=>mutations.push(...records));observer.observe(label,{attributes:true});
    for(let i=0;i<30;i++)layer.update();await Promise.resolve();const idleMutations=mutations.length;observer.disconnect();
    const clipped=[];
    for(const p of [[0,0,11],[0,0,10],[0,0,9.999],[0,0,-2000],[1e4,0,0],[NaN,0,0]]){point=p;layer.update();clipped.push(label.style.visibility);}
    point=[0,0,0];host.style.width='600px';
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));layer.update();const resized=rect();
    host.style.display='none';await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));layer.update();const hidden=label.style.visibility;
    host.style.display='block';await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));layer.update();const restored=label.style.visibility;
    layer.dispose();const remaining=host.children.length;host.remove();
    return {initial,idle,camera,sparse,transparent,regrow,grow,idleAfterGrow,tintAllocations,geometryAllocations,lit,errors,center,visible,idleMutations,clipped,resized,hidden,restored,remaining,timing,supportsTiming,rejected,afterReset};
  })()`});
  assert.ok(!response.exceptionDetails,JSON.stringify(response.exceptionDetails));
  const r=response.result.value;
  assert.deepEqual(r.errors,[]);
  assert.ok(r.rejected);assert.equal(r.afterReset,0);
  for(const row of r.timing){
    if(r.supportsTiming){assert.ok(Number.isFinite(row.ms)&&row.ms>=0,JSON.stringify(row));assert.equal(row.steps,row.count);assert.equal(row.error,null);}
    else{assert.equal(row.ms,null);assert.equal(row.steps,0);}
  }
  assert.ok(r.initial.writes>=3);
  assert.equal(r.idle.submissions,0,'unchanged scenes do not submit GPU work');
  assert.equal(r.camera.submissions,1,'camera movement redraws the scene');
  assert.equal(r.idle.writes,0,'static scene must not upload');
  assert.equal(r.camera.writes,1,'camera motion only uploads camera uniforms');
  assert.equal(r.sparse.bytes,4,'one changed translation component uploads one float');
  assert.ok(r.transparent.writes>0);
  assert.ok(r.regrow.writes>0);
  assert.ok(r.grow.writes>0);
  assert.equal(r.idleAfterGrow.writes,0);
  assert.equal(r.geometryAllocations,0,'same-sized dynamic geometry reuses retired GPU buffers');
  assert.equal(r.tintAllocations,0,'tint animation must reuse retired batch buffers');
  assert.ok(r.lit>100,'the batch must still draw real pixels');
  assert.deepEqual(r.center,[200,100]);
  assert.equal(r.visible,'visible');
  assert.equal(r.idleMutations,0,'unchanged labels must not mutate the DOM');
  assert.ok(r.clipped.every(value=>value==='hidden'),'anchors outside the clip volume must disappear');
  assert.deepEqual(r.resized,[300,100]);
  assert.equal(r.hidden,'hidden');assert.equal(r.restored,'visible');assert.equal(r.remaining,0);
  console.log('PASS: GPU upload reuse, sparse updates, batch growth, pixels, label clipping, resize and DOM stability',JSON.stringify(r));
} finally {
  await call('Target.closeTarget',{targetId:target.id});socket.close();
}
