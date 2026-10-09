import assert from 'node:assert/strict';
import { openPage } from './cdp.mjs';
const page=await openPage(Number(process.argv[2]??9444));
try {
  await page.call('Page.navigate',{url:`${process.env.EDENA_ORIGIN??'http://127.0.0.1:5173'}/legacy.html`});
  await new Promise(resolve=>setTimeout(resolve,300));
  const result=await page.evaluate(`(async()=>{
    const {WebGPUView,Text,MathText}=await import('/build/index.js');
    document.body.innerHTML='<canvas style="width:400px;height:240px"></canvas>';
    const canvas=document.querySelector('canvas');
    const view=await WebGPUView.create(canvas,{interactive:false,maxDpr:1,samples:1});
    view.camera.yaw=0;view.camera.pitch=0;view.camera.height=2.4;
    const errors=[];view.device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
    const text=new Text('MMMM',{height:.5,color:[1,0,0,1]});text.element.style.fontFamily='monospace';
    view.world.add(text);
    let uploads=0,textures=0,binds=0;
    const copy=view.device.queue.copyExternalImageToTexture.bind(view.device.queue);
    const createTexture=view.device.createTexture.bind(view.device),createBind=view.device.createBindGroup.bind(view.device);
    view.device.queue.copyExternalImageToTexture=(...args)=>{uploads++;return copy(...args);};
    view.device.createTexture=(...args)=>{textures++;return createTexture(...args);};
    view.device.createBindGroup=(...args)=>{binds++;return createBind(...args);};
    const settle=async()=>{for(let i=0;i<8;i++){view.render();await new Promise(requestAnimationFrame);}};
    const capture=async()=>{
      view.render(true);await view.device.queue.onSubmittedWorkDone();
      const image=new Image();image.src=canvas.toDataURL();await image.decode();
      const read=document.createElement('canvas');read.width=400;read.height=240;
      const ctx=read.getContext('2d');ctx.drawImage(image,0,0);
      const data=ctx.getImageData(0,0,400,240).data;let count=0;
      for(let i=0;i<data.length;i+=4)if(data[i]>80&&data[i+1]<40)count++;
      return count;
    };
    await settle();const wide=await capture();textures=binds=uploads=0;
    const times=[];
    for(let i=0;i<10;i++){
      const before=uploads,start=performance.now();text.text=i%2?'MMMM':'IIII';
      for(let frame=0;frame<60&&uploads===before;frame++){view.render();await new Promise(requestAnimationFrame);}
      times.push(performance.now()-start);
    }
    text.text='IIII';await settle();const narrow=await capture();
    const updates={textures,binds,uploads,medianMs:times.sort((a,b)=>a-b)[5]};
    const idleBefore=uploads;text.text='IIII';await settle();const idleUploads=uploads-idleBefore;
    text.text='IIIIIIIIIIII';await settle();const grown=await capture();
    const growTextures=textures-updates.textures;
    text.text='';await settle();const empty=await capture();
    text.text='MMMM';await settle();const restored=await capture();
    view.world.remove(text);view.render();const remaining=document.querySelectorAll('[style*="inset(50%)"]').length;
    const math=new MathText('x_i^2',{fontFamily:'serif'});view.world.add(math);await settle();
    const mathBefore=uploads;
    for(let i=0;i<10;i++)math.setMath('x_i^2');
    await settle();const repeatedMathUploads=uploads-mathBefore;
    math.element.textContent='stale';math.setMath('x_i^2');await settle();
    const restoredMath=!!math.element.querySelector('msubsup');view.world.remove(math);view.render();
    let sharedPipelines=0;
    const pipeline=view.device.createRenderPipeline.bind(view.device);
    view.device.createRenderPipeline=(...args)=>{sharedPipelines++;return pipeline(...args);};
    const otherCanvas=document.createElement('canvas');otherCanvas.style.cssText='width:400px;height:240px';document.body.append(otherCanvas);
    const other=await WebGPUView.create(otherCanvas,{device:view.device,interactive:false,maxDpr:1,samples:1});
    other.world.add(new Text('Shared pipeline'));other.render();await view.device.queue.onSubmittedWorkDone();
    other.dispose();view.dispose();return {repeatedMathUploads,restoredMath,sharedPipelines,wide,narrow,grown,empty,restored,updates,idleUploads,growTextures,remaining,errors};
  })()`);
  console.log(JSON.stringify(result,null,2));
  assert.deepEqual(result.errors,[]);
  assert.ok(result.wide>result.narrow*1.2,'new glyph pixels replace old ink without ghosting');
  assert.ok(result.grown>result.narrow*2,'wider content resizes the glyph texture');
  assert.equal(result.empty,0,'empty text removes old glyphs');
  assert.ok(result.restored>100,'text can return after being emptied');
  assert.equal(result.idleUploads,0);
  assert.equal(result.repeatedMathUploads,0,'unchanged formatted content retains its glyph texture');
  assert.ok(result.restoredMath,'setMath repairs externally changed content');
  assert.equal(result.remaining,0,'removing scene text releases its measurement element');
  assert.equal(result.sharedPipelines,0,'views sharing a device reuse immutable pipelines');
  if(!process.env.MEASURE_ONLY){
    assert.equal(result.updates.textures,0,'equal-size content changes reuse the GPU texture');
    assert.equal(result.updates.binds,0,'equal-size content changes reuse the binding');
  }
} finally {await page.close();}
