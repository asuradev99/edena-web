// Reproducible browser CPU and GPU medians. Run after npm run build with the dev server running.
import { openPage } from './cdp.mjs';
const page = await openPage(Number(process.argv[2] ?? 9444));
try {
  await page.call('Page.enable');
  await page.call('Page.navigate', { url: `${process.env.EDENA_ORIGIN ?? 'http://127.0.0.1:5173'}/legacy.html` });
  await new Promise(resolve => setTimeout(resolve, 300));
  const result = await page.evaluate(`(async () => {
    const {Visual, Geometry, GpuParticleSimulation, LabelLayer} = await import('/build/index.js');
    const {WebGPUView}=await import(${JSON.stringify(process.env.EDENA_VIEW_MODULE ?? '/build/lib/view.js')});
    document.body.innerHTML = '<canvas style="width:640px;height:480px"></canvas>';
    const view = await WebGPUView.create(document.querySelector('canvas'), {interactive:false, samples:1});
    const errors=[]; view.device.addEventListener('uncapturederror', e=>errors.push(e.error.message));
    const median = values => values.sort((a,b)=>a-b)[Math.floor(values.length/2)];
    const gpu=[];
    for (const [mode,count] of [['oscillator',50000],['nbody',1024],['nbody',8192],['nbody',32768]]) {
      const simulation=await GpuParticleSimulation.create({device:view.device, mode, count, seed:23});
      await simulation.measure(8);
      const times=[];
      for(let run=0;run<5;run++){simulation.reset();times.push(await simulation.measure(16));}
      simulation.reset();const encoder=view.device.createCommandEncoder();simulation.step(encoder,3);view.device.queue.submit([encoder.finish()]);
      gpu.push({mode,count,ms:median(times),checksum:await simulation.checksum()}); simulation.destroy();
    }
    const geometry=new Geometry(new Float32Array([-.01,-.01,0,.01,-.01,0,0,.01,0]));
    const nodes=Array.from({length:10000},(_,i)=>{const v=new Visual(geometry);v.position=[i%100/30-1.6,Math.floor(i/100)/30-1.6,0];return v;});
    view.world.add(...nodes);
    const scenes=[];
    for(const mode of ['static','camera','animated','translucent']) {
      const times=[];
      if(mode==='translucent')for(const node of nodes)node.opacity=.5;
      for(let frame=0;frame<80;frame++){
        if(mode==='camera'||mode==='translucent')view.camera.yaw+=.001;
        if(mode==='animated')for(const node of nodes)node.position[2]+=.0001;
        const start=performance.now();view.render();const elapsed=performance.now()-start;
        if(frame>=20)times.push(elapsed);
        await view.device.queue.onSubmittedWorkDone();
      }
      scenes.push({mode,count:nodes.length,cpuMs:median(times)});
    }
    view.world.clear();
    const host=document.createElement('div');host.style.cssText='position:relative;width:640px;height:480px';
    document.body.append(host);host.append(view.canvas);
    const labels=new LabelLayer(host,view.camera);
    for(let i=0;i<100;i++)labels.add('Label '+i,()=>[i%10/3-1.5,Math.floor(i/10)/3-1.5,0]);
    for(let i=0;i<20;i++){labels.update();view.render();await new Promise(resolve=>requestAnimationFrame(resolve));}
    const text=[];
    for(const mode of ['static','camera']){
      const times=[];let submissions=0;
      const submit=view.device.queue.submit.bind(view.device.queue);
      view.device.queue.submit=(...args)=>{submissions++;return submit(...args);};
      for(let i=0;i<80;i++){
        if(mode==='camera')view.camera.yaw+=.001;
        const start=performance.now();labels.update();view.render();
        if(i>=20)times.push(performance.now()-start);
        await view.device.queue.onSubmittedWorkDone();
      }
      view.device.queue.submit=submit;
      text.push({mode,count:100,cpuMs:median(times),submissions});
    }
    labels.dispose();
    await view.device.queue.onSubmittedWorkDone();
    const info=view.adapterInfo;
    const adapter=info?{vendor:info.vendor,architecture:info.architecture,device:info.device,description:info.description}:undefined;view.dispose();
    return {adapter,gpu,scenes,text,errors};
  })()`);
  console.log(JSON.stringify(result,null,2));
  if(result.errors.length)process.exitCode=1;
} finally { await page.close(); }
