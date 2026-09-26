import assert from 'node:assert/strict';
import { openPage } from './cdp.mjs';
const page = await openPage(Number(process.argv[2] ?? 9444));
try {
  await page.call('Page.enable');
  await page.call('Page.navigate', {url:`${process.env.EDENA_ORIGIN ?? 'http://127.0.0.1:5173'}/legacy.html`});
  await new Promise(resolve=>setTimeout(resolve,300));
  const result=await page.evaluate(`(async()=>{
    const {WebGPUView,LabelLayer,Visual,Geometry}=await import('/build/index.js');
    document.body.innerHTML='<div id="host" style="position:relative;width:400px;height:200px"><canvas style="width:400px;height:200px"></canvas></div>';
    const host=document.querySelector('#host'),canvas=host.querySelector('canvas');
    const view=await WebGPUView.create(canvas,{interactive:false,samples:4,maxDpr:1});
    const errors=[];view.device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
    view.camera.yaw=0;view.camera.pitch=0;view.camera.height=2;
    const layer=new LabelLayer(host,view.camera);
    let point=[0,0,0];const element=layer.add('████████',()=>point,'#ff0000');element.style.font='32px monospace';
    const wall=new Visual(new Geometry(new Float32Array([0,-1,.5,2,-1,.5,0,1,.5,0,1,.5,2,-1,.5,2,1,.5])));wall.color=[0,0,1,1];wall.wireframe=false;
    const capture=async()=>{
      layer.update();view.render();await view.device.queue.onSubmittedWorkDone();
      const image=new Image();image.src=canvas.toDataURL();await image.decode();
      const read=document.createElement('canvas');read.width=400;read.height=200;const ctx=read.getContext('2d');ctx.drawImage(image,0,0);
      const data=ctx.getImageData(0,0,400,200).data;let left=0,right=0;
      for(let y=50;y<150;y++)for(let x=0;x<400;x++){const i=(y*400+x)*4;if(data[i]>100&&data[i+2]<100){if(x<200)left++;else right++;}}
      let green=0;for(let i=0;i<data.length;i+=4)if(data[i+1]>100&&data[i]<100)green++;
      return {left,right,green};
    };
    for(let frame=0;frame<12;frame++){layer.update();view.render();await new Promise(resolve=>requestAnimationFrame(resolve));}
    const unobscured=await capture();
    view.world.add(wall);const partial=await capture();
    point=[0,0,1];const front=await capture();
    point=[1,0,0];const behind=await capture();
    const clip=element.style.clipPath;
    view.world.clear();point=[0,0,0];
    element.style.opacity='0';const faded=await capture();
    element.style.opacity='1';element.style.display='none';const hidden=await capture();
    element.style.display='';element.style.color='#00ff00';
    const settle=async()=>{for(let frame=0;frame<8;frame++){layer.update();view.render();await new Promise(resolve=>requestAnimationFrame(resolve));}};
    await settle();const recolored=await capture();
    element.style.display='none';
    const math=layer.addMath('\\\\frac{x^2}{1+y}',()=>[0,0,0],'#ff0000');math.style.fontSize='32px';
    await settle();const fraction=await capture();
    let uploads=0;const copy=view.device.queue.copyExternalImageToTexture.bind(view.device.queue);
    view.device.queue.copyExternalImageToTexture=(...args)=>{uploads++;return copy(...args);};
    await settle();const idleUploads=uploads;
    view.device.queue.copyExternalImageToTexture=copy;
    layer.dispose();view.dispose();return {unobscured,partial,front,behind,clip,faded,hidden,recolored,fraction,idleUploads,errors};
  })()`);
  console.log(JSON.stringify(result,null,2));
  assert.deepEqual(result.errors,[]);
  assert.ok(result.unobscured.left>100&&result.unobscured.right>100,'glyphs render on the GPU');
  assert.ok(result.partial.left>100&&result.partial.right<10,'only the part behind geometry disappears');
  assert.ok(result.front.right>100,'text in front remains visible');
  assert.equal(result.behind.right,0,'text behind opaque geometry disappears');
  assert.equal(result.faded.left+result.faded.right,0,'opacity zero hides GPU text');
  assert.equal(result.hidden.left+result.hidden.right,0,'display none hides GPU text');
  assert.ok(result.recolored.green>100,'inline color updates rebuild glyphs');
  assert.ok(result.fraction.left+result.fraction.right>50,'MathML fractions rasterize');
  assert.equal(result.idleUploads,0,'static text never rerasterizes');
  assert.equal(result.clip,'inset(50%)','accessible DOM copy does not overlay depth-tested text');
} finally {await page.close();}
