import assert from 'node:assert/strict';
import {openPage} from './cdp.mjs';
const page=await openPage(Number(process.argv[2]??9444));
try{
 await page.call('Page.navigate',{url:'http://127.0.0.1:5173/legacy.html'});await new Promise(r=>setTimeout(r,300));
 const result=await page.evaluate(`(async()=>{
  const {WebGPUView,Text,Group,Visual,Geometry}=await import('/build/index.js');
  document.body.innerHTML='<canvas style="width:400px;height:240px"></canvas>';
  const canvas=document.querySelector('canvas'),view=await WebGPUView.create(canvas,{interactive:false,maxDpr:1,samples:1});
  const errors=[];view.device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
  view.camera.height=2.4;view.camera.yaw=0;view.camera.pitch=0;
  let mipLevels=0;const create=view.device.createTexture.bind(view.device);
  view.device.createTexture=d=>{mipLevels=Math.max(mipLevels,d.mipLevelCount??1);return create(d);};
  const text=new Text('MMMM',{height:.5,faceCamera:true});view.world.add(text);
  const capture=async()=>{
   for(let i=0;i<10;i++){view.render();await new Promise(requestAnimationFrame);}
   view.render(true);await view.device.queue.onSubmittedWorkDone();
   const image=new Image();image.src=canvas.toDataURL();await image.decode();
   const read=document.createElement('canvas');read.width=400;read.height=240;const ctx=read.getContext('2d');ctx.drawImage(image,0,0,400,240);
   const data=ctx.getImageData(0,0,400,240).data;let x0=400,x1=0,y0=240,y1=0,sum=0,partial=0;
   for(let y=0;y<240;y++)for(let x=0;x<400;x++){const a=data[(y*400+x)*4+3];sum+=a/255;if(a>0&&a<255)partial++;if(a>30){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}}
   return {width:x1-x0+1,height:y1-y0+1,sum,partial};
  };
  const front=await capture();view.camera.yaw=1.2;view.camera.pitch=.4;const facing=await capture();
  text.faceCamera=false;const tilted=await capture();
  const group=new Group();group.mode='2d';view.world.remove(text);group.add(text);view.world.add(group);const grouped=await capture();
  view.camera.projection='perspective';view.camera.distance=60;const distant=await capture();
  view.camera.mode='2d';const flat=await capture();const ray=view.camera.ray(200,120,400,240);
  view.camera.yaw=-2;view.camera.pitch=1;const locked=await capture();
  const detach=view.camera.attach(canvas);
  canvas.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:1,clientX:100,clientY:100}));
  canvas.dispatchEvent(new PointerEvent('pointermove',{pointerId:1,clientX:120,clientY:110}));
  canvas.dispatchEvent(new PointerEvent('pointerup',{pointerId:1}));
  const pan=[...view.camera.target],height=view.camera.height;
  canvas.dispatchEvent(new WheelEvent('wheel',{deltaY:100,cancelable:true}));
  const zoom=view.camera.height;detach();view.dispose();
  const high=await WebGPUView.create(canvas,{interactive:false,maxDpr:1,antialias:'high'});
  high.device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
  high.world.add(new Visual(new Geometry([-.7,-.7,0,.7,-.65,0,-.65,.7,0])));high.render();await high.device.queue.onSubmittedWorkDone();
  const highSize=[canvas.width,canvas.height];
  let restoredTargets=0;const allocate=high.device.createTexture.bind(high.device);
  high.device.createTexture=d=>{restoredTargets++;return allocate(d);};
  high.releaseRenderTargets();high.render();await high.device.queue.onSubmittedWorkDone();high.dispose();
  return {front,facing,tilted,grouped,distant,flat,locked,ray,pan,height,zoom,mipLevels,highSize,restoredTargets,errors};
 })()`);
 console.log(JSON.stringify(result,null,2));
 assert.deepEqual(result.errors,[]);
 assert.ok(result.mipLevels>4,'glyphs include a minification pyramid');
 assert.ok(Math.abs(result.front.width-result.facing.width)<3,'camera-facing text stays front-facing');
 assert.ok(result.tilted.width<result.front.width*.6,'world text still rotates with the scene');
 assert.ok(Math.abs(result.grouped.width-result.front.width)<3,'2D groups keep their children flat');
 assert.ok(result.distant.sum>1&&result.distant.partial>10,'distant mipmapped text remains smoothly covered');
 assert.deepEqual(result.flat,result.locked,'2D camera ignores orbit angles');
 assert.deepEqual(result.ray.direction,[0,0,-1]);
 assert.ok(Math.abs(result.pan[0]+.2)<1e-6&&Math.abs(result.pan[1]-.1)<1e-6,'2D drag pans in the plot plane');
 assert.ok(result.zoom>result.height,'2D wheel zooms');
 assert.equal(result.restoredTargets,2,'released high-quality targets are restored on demand');
 assert.deepEqual(result.highSize,[800,480],'high AA supersamples the whole canvas');
}finally{await page.close();}
