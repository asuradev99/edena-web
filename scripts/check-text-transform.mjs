import assert from 'node:assert/strict';
import { openPage } from './cdp.mjs';
const page=await openPage(Number(process.argv[2]??9444));
try {
  await page.call('Page.navigate',{url:`${process.env.EDENA_ORIGIN??'http://127.0.0.1:5173'}/legacy.html`});
  await new Promise(resolve=>setTimeout(resolve,300));
  const result=await page.evaluate(`(async()=>{
    const {WebGPUView,Text,Group}=await import('/build/index.js');
    document.body.innerHTML='<canvas style="width:400px;height:400px"></canvas>';
    const canvas=document.querySelector('canvas');
    const view=await WebGPUView.create(canvas,{interactive:false,maxDpr:1});
    view.camera.yaw=0;view.camera.pitch=0;view.camera.height=4;
    const errors=[];view.device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
    const parent=new Group(),text=new Text('MMMM',{height:.4,color:[1,0,0,1]});
    const outer=new Group().add(parent);parent.add(text);view.world.add(outer);
    const textureHeights=[];
    const createTexture=view.device.createTexture.bind(view.device);
    view.device.createTexture=(descriptor)=>{if(descriptor.format==='rgba8unorm'&&descriptor.mipLevelCount>1)textureHeights.push(descriptor.size[1]);return createTexture(descriptor);};
    const capture=async()=>{
      for(let i=0;i<12;i++){view.render();await new Promise(requestAnimationFrame);}
      await view.device.queue.onSubmittedWorkDone();
      const img=new Image();img.src=canvas.toDataURL();await img.decode();
      const read=document.createElement('canvas');read.width=400;read.height=400;
      const ctx=read.getContext('2d');ctx.drawImage(img,0,0);
      const pixels=ctx.getImageData(0,0,400,400).data;
      let x0=400,y0=400,x1=-1,y1=-1,count=0;
      for(let y=0;y<400;y++)for(let x=0;x<400;x++){const i=4*(y*400+x);if(pixels[i]>80&&pixels[i+1]<40){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);count++;}}
      return {width:x1-x0+1,height:y1-y0+1,x:(x0+x1)/2,y:(y0+y1)/2,count};
    };
    const base=await capture();parent.scale=[2,2,2];const scaled=await capture();
    parent.scale=[1,1,1];parent.orientation=[0,0,Math.PI/2];const rotated=await capture();
    parent.orientation=[0,Math.PI/3,0];const tilted=await capture();
    parent.orientation=[0,0,0];parent.position=[1,0,0];const moved=await capture();
    outer.position=[-.5,0,0];const nested=await capture();outer.position=[0,0,0];
    parent.position=[0,0,0];view.camera.projection='perspective';view.camera.distance=5;
    const near=await capture();view.camera.distance=10;const far=await capture();
    parent.visible=false;const hidden=await capture();parent.visible=true;
    let uploads=0;const copy=view.device.queue.copyExternalImageToTexture.bind(view.device.queue);
    await capture();view.device.queue.copyExternalImageToTexture=(...args)=>{uploads++;return copy(...args);};await capture();
    const idleUploads=uploads;parent.scale=[8,8,8];await capture();const magnifiedUploads=uploads;await capture();const repeatedUploads=uploads-magnifiedUploads;
    parent.scale=[.25,.25,.25];await capture();const shrunkTexture=textureHeights.at(-1);parent.scale=[1,1,1];await capture();
    view.dispose();return {base,scaled,rotated,tilted,moved,nested,near,far,hidden,idleUploads,magnifiedUploads,repeatedUploads,baseTexture:textureHeights[0],shrunkTexture,errors};
  })()`);
  console.log(JSON.stringify(result,null,2));
  assert.deepEqual(result.errors,[]);
  assert.ok(result.base.count>100);
  assert.ok(Math.abs(result.scaled.width/result.base.width-2)<.1,'parent scale changes glyph size');
  assert.ok(Math.abs(result.rotated.height-result.base.width)<3,'parent rotation rotates glyphs');
  assert.ok(Math.abs(result.tilted.width/result.base.width-.5)<.1,'3D rotation foreshortens glyphs');
  assert.ok(Math.abs(result.moved.x-result.base.x-100)<2,'parent translation moves text');
  assert.ok(Math.abs(result.near.width/result.far.width-2)<.15,'perspective distance scales text');
  assert.ok(Math.abs(result.nested.x-result.moved.x+50)<2,'nested parent transforms compose');
  assert.equal(result.hidden.count,0);assert.equal(result.idleUploads,0,'idle text reuses glyph texture');
  assert.ok(result.magnifiedUploads>0,'large magnification upgrades glyph resolution');
  assert.equal(result.repeatedUploads,0,'magnified text reuses its upgraded texture');
  assert.ok(result.shrunkTexture < result.baseTexture,'zooming out retargets a smaller glyph texture instead of minifying an oversized one');
} finally {await page.close();}
