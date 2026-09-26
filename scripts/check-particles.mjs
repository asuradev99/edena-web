// Exercise tail lanes, summation accuracy, multi-dispatch synchronization and reset on real WebGPU.
import assert from 'node:assert/strict';
import { openPage } from './cdp.mjs';
const page=await openPage(Number(process.argv[2]??9444));
try {
  await page.call('Page.enable');
  await page.call('Page.navigate',{url:`${process.env.EDENA_ORIGIN??'http://127.0.0.1:5173'}/legacy.html`});
  await new Promise(resolve=>setTimeout(resolve,300));
  const result=await page.evaluate(`(async()=>{
    const {GpuParticleSimulation}=await import('/build/index.js');
    const adapter=await navigator.gpu.requestAdapter();const device=await adapter.requestDevice();
    const errors=[];device.addEventListener('uncapturederror',event=>errors.push(event.error.message));
    const rows=[];
    for(const count of [1,7,8,9,63,64,65,129]){
      const sim=await GpuParticleSimulation.create({device,count,mode:'nbody',seed:17,stiffness:.3,timeStep:.01,damping:.99});
      const initial=Array.from(sim.initialPositions),velocity=Array.from(sim.initialVelocities);
      const step=(n)=>{const encoder=device.createCommandEncoder();sim.step(encoder,n);device.queue.submit([encoder.finish()]);};
      step(1);
      const buffer=device.createBuffer({size:sim.byteLength,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
      const encoder=device.createCommandEncoder();encoder.copyBufferToBuffer(sim.positionB,0,buffer,0,sim.byteLength);device.queue.submit([encoder.finish()]);
      await buffer.mapAsync(GPUMapMode.READ);const positions=new Float32Array(buffer.getMappedRange());
      let maxError=0;
      for(let i=0;i<count;i++){
        const acceleration=[0,0,0];
        for(let j=0;j<count;j++){
          const delta=[0,1,2].map(k=>initial[j*4+k]-initial[i*4+k]);
          const inverse=1/Math.sqrt(delta.reduce((sum,x)=>sum+x*x,.05*.05));
          for(let k=0;k<3;k++)acceleration[k]+=delta[k]*inverse**3;
        }
        for(let k=0;k<3;k++){
          const expected=initial[i*4+k]+(velocity[i*4+k]+.3*acceleration[k]*.01)*.99*.01;
          maxError=Math.max(maxError,Math.abs(expected-positions[i*4+k]));
        }
      }
      buffer.unmap();buffer.destroy();
      sim.reset();step(5);const batched=await sim.checksum();
      sim.reset();for(let i=0;i<5;i++)step(1);const separate=await sim.checksum();
      rows.push({count,maxError,batched,separate});sim.destroy();
    }
    await device.queue.onSubmittedWorkDone();device.destroy();return {rows,errors};
  })()`);
  assert.deepEqual(result.errors,[]);
  for(const row of result.rows){assert.ok(row.maxError<2e-6,JSON.stringify(row));assert.equal(row.batched,row.separate);}
  console.log('PASS: CPU force reference, tail counts, batched dispatches and reset',JSON.stringify(result));
} finally {await page.close();}
