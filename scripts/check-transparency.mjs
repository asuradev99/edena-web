import assert from 'node:assert/strict';
import { openPage } from './cdp.mjs';
const page=await openPage(Number(process.argv[2]??9444));
try {
  await page.call('Page.enable');
  await page.call('Page.navigate',{url:`${process.env.EDENA_ORIGIN??'http://127.0.0.1:5173'}/legacy.html`});
  await new Promise(resolve=>setTimeout(resolve,300));
  const result=await page.evaluate(`(async()=>{
    const {WebGPUView,Visual,Geometry,box}=await import('/build/index.js');
    document.body.innerHTML='<canvas style="width:200px;height:200px"></canvas>';
    const canvas=document.querySelector('canvas');
    const view=await WebGPUView.create(canvas,{interactive:false,samples:1,maxDpr:1,alphaMode:'opaque'});
    const errors=[];view.device.addEventListener('uncapturederror',event=>errors.push(event.error.message));
    view.camera.yaw=0;view.camera.pitch=0;view.camera.height=2;
    const geometry=new Geometry(new Float32Array([-1,-1,0,1,-1,0,0,1,0]));
    const make=(z,color)=>{const node=new Visual(geometry);node.position[2]=z;node.color=color;return node;};
    const far=make(-.5,[1,0,0,.5]),near=make(.5,[1,0,0,.5]),middle=make(0,[0,0,1,.5]);
    view.world.add(near,far,middle);
    let draws=0;
    const create=view.device.createCommandEncoder.bind(view.device);
    view.device.createCommandEncoder=(...args)=>{const encoder=create(...args),begin=encoder.beginRenderPass.bind(encoder);encoder.beginRenderPass=(...args)=>{const pass=begin(...args),draw=pass.draw.bind(pass);pass.draw=(...args)=>{draws++;return draw(...args);};return pass;};return encoder;};
    const pixel=async()=>{
      draws=0;view.render();await view.device.queue.onSubmittedWorkDone();
      const image=new Image();image.src=canvas.toDataURL();await image.decode();
      const read=document.createElement('canvas');read.width=200;read.height=200;const ctx=read.getContext('2d');ctx.drawImage(image,0,0);
      return {draws,pixel:Array.from(ctx.getImageData(100,100,1,1).data)};
    };
    const layered=await pixel();
    view.world.clear();view.world.add(...Array.from({length:1000},(_,i)=>make(i*.0001,[1,0,0,.01])));
    const batch=await pixel();
    view.world.clear();
    const cube=box([-.2,-.2,-.2],[.2,.2,.2]);const a=new Visual(cube),b=new Visual(cube);
    a.position[0]=-.5;b.position[0]=.5;a.wireframe=false;b.wireframe=true;view.world.add(a,b);
    const wires=await pixel();
    view.dispose();return {layered,batch,wires,errors};
  })()`);
  assert.deepEqual(result.errors,[]);
  assert.equal(result.layered.draws,3,'interleaved materials preserve global depth order');
  assert.ok(Math.abs(result.layered.pixel[0]-159)<=2&&Math.abs(result.layered.pixel[2]-64)<=2,'red-blue-red blending matches painter order');
  assert.equal(result.batch.draws,1,'matching translucent instances share one draw');
  assert.ok(result.batch.pixel[0]>200);
  assert.equal(result.wires.draws,3,'different wireframe settings use separate face batches');
  console.log('PASS: ordered alpha blending, translucent instancing and independent wireframes',JSON.stringify(result));
} finally {await page.close();}
