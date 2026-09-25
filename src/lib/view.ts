import { Geometry } from './geometry.js';
import type { Color, Vec3 } from './math.js';
import { World } from './world.js';
import { OrbitCamera } from './camera.js';

const shader = `
struct Uniforms { camera: mat4x4<f32>, color: vec4<f32> };
@group(0) @binding(0) var<uniform> u: Uniforms;
struct VertexOutput { @builtin(position) position: vec4<f32>, @location(0) opacity: f32, @location(1) tint: vec3<f32> };
@vertex fn vertex(
  @location(0) p: vec3<f32>,
  @location(1) m0: vec4<f32>, @location(2) m1: vec4<f32>,
  @location(3) m2: vec4<f32>, @location(4) m3: vec4<f32>,
  @location(5) opacity: f32,
) -> VertexOutput {
  let model = mat4x4<f32>(m0, m1, m2, m3);
  var result: VertexOutput;
  result.position = u.camera * model * vec4<f32>(p, 1.0);
  result.opacity = opacity;
  result.tint = vec3<f32>(1.0, 1.0, 1.0);
  return result;
}
// Colored geometry supplies a per-vertex tint, so instance attributes shift up by one slot.
@vertex fn vertexColored(
  @location(0) p: vec3<f32>,
  @location(1) color: vec3<f32>,
  @location(2) m0: vec4<f32>, @location(3) m1: vec4<f32>,
  @location(4) m2: vec4<f32>, @location(5) m3: vec4<f32>,
  @location(6) opacity: f32,
) -> VertexOutput {
  let model = mat4x4<f32>(m0, m1, m2, m3);
  var result: VertexOutput;
  result.position = u.camera * model * vec4<f32>(p, 1.0);
  result.opacity = opacity;
  result.tint = color;
  return result;
}
@fragment fn fragment(input: VertexOutput) -> @location(0) vec4<f32> { return vec4<f32>(u.color.rgb * input.tint, u.color.a * input.opacity); }
`;

type Buffers = { positions: GPUBuffer; colors?: GPUBuffer };
type Batch = { instances: GPUBuffer; uniform: GPUBuffer; bind: GPUBindGroup; capacity: number; data: Float32Array<ArrayBuffer>; colored: boolean };

/** Subset of `GPUAdapterInfo` reported by the browser; fields are often empty strings. */
export type AdapterInfo = { vendor?: string; architecture?: string; device?: string; description?: string };

export type WebGPUViewOptions = {
  device?: GPUDevice;
  interactive?: boolean;
  maxDpr?: number;
  /** Multisample count: 4 (default, antialiased) or 1 (no MSAA, roughly 4x less fill work). */
  samples?: number;
  /** `premultiplied` (default) lets the page show through; `opaque` skips canvas compositing and is faster. */
  alphaMode?: GPUCanvasAlphaMode;
  onError?: (message: string) => void;
};

const clampDpr = (value: number) => Number.isFinite(value) ? Math.min(3, Math.max(.5, value)) : 2;

export class WebGPUView {
  readonly world=new World();
  readonly camera=new OrbitCamera();
  /** Adapter the view was created on; undefined when a caller supplied its own device. */
  adapterInfo?: AdapterInfo;
  /** True when the browser handed us a software/fallback adapter (expect poor frame rates). */
  isFallbackAdapter=false;
  private context:GPUCanvasContext;
  private pipeline:GPURenderPipeline;
  private pipelineColored:GPURenderPipeline;
  private translucent:GPURenderPipeline;
  private translucentColored:GPURenderPipeline;
  private bindGroupLayout:GPUBindGroupLayout;
  private format:GPUTextureFormat;
  private depth?:GPUTexture;
  private msaa?:GPUTexture;
  private geometry=new Map<Geometry,Buffers>();
  private batches=new Map<string,Batch>();
  private geometryIds=new WeakMap<Geometry,number>();
  private nextGeometryId=1;
  private stopped=false;
  private pendingResize=true;
  private dpr=0;
  private cleanup:()=>void;
  private observer:ResizeObserver;
  private uniforms=new Float32Array(20);
  private constructor(readonly canvas:HTMLCanvasElement,readonly device:GPUDevice,private ownsDevice:boolean,onError:(message:string)=>void,interactive:boolean,private maxDpr:number,private samples:number,private alphaMode:GPUCanvasAlphaMode) {
    const context=canvas.getContext('webgpu'); if(!context)throw new Error('Could not create WebGPU canvas');
    this.context=context;
    this.format=navigator.gpu.getPreferredCanvasFormat();
    context.configure({device,format:this.format,alphaMode:this.alphaMode});
    const module=device.createShaderModule({code:shader});
    // One explicit layout for both pipelines, so a single bind group works with either.
    this.bindGroupLayout=device.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:'uniform'}}]});
    const layout=device.createPipelineLayout({bindGroupLayouts:[this.bindGroupLayout]});
    const blend:GPUBlendState={color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha'}};
    const depthStencil:GPUDepthStencilState={format:'depth24plus',depthWriteEnabled:true,depthCompare:'less-equal'};
    const plain:GPURenderPipelineDescriptor={layout,vertex:{module,entryPoint:'vertex',buffers:[
      {arrayStride:12,attributes:[{shaderLocation:0,offset:0,format:'float32x3'}]},
      {arrayStride:68,stepMode:'instance',attributes:[
        {shaderLocation:1,offset:0,format:'float32x4'}, {shaderLocation:2,offset:16,format:'float32x4'},
        {shaderLocation:3,offset:32,format:'float32x4'}, {shaderLocation:4,offset:48,format:'float32x4'},
        {shaderLocation:5,offset:64,format:'float32'},
      ]},
    ]},fragment:{module,entryPoint:'fragment',targets:[{format:this.format,blend}]},primitive:{topology:'triangle-list'},multisample:{count:this.samples},depthStencil};
    const colored:GPURenderPipelineDescriptor={layout,vertex:{module,entryPoint:'vertexColored',buffers:[
      {arrayStride:12,attributes:[{shaderLocation:0,offset:0,format:'float32x3'}]},
      {arrayStride:12,attributes:[{shaderLocation:1,offset:0,format:'float32x3'}]},
      {arrayStride:68,stepMode:'instance',attributes:[
        {shaderLocation:2,offset:0,format:'float32x4'}, {shaderLocation:3,offset:16,format:'float32x4'},
        {shaderLocation:4,offset:32,format:'float32x4'}, {shaderLocation:5,offset:48,format:'float32x4'},
        {shaderLocation:6,offset:64,format:'float32'},
      ]},
    ]},fragment:{module,entryPoint:'fragment',targets:[{format:this.format,blend}]},primitive:{topology:'triangle-list'},multisample:{count:this.samples},depthStencil};
    this.pipeline=device.createRenderPipeline(plain);
    this.pipelineColored=device.createRenderPipeline(colored);
    const transparentDepth={...depthStencil,depthWriteEnabled:false};
    this.translucent=device.createRenderPipeline({...plain,depthStencil:transparentDepth});
    this.translucentColored=device.createRenderPipeline({...colored,depthStencil:transparentDepth});
    this.cleanup=interactive?this.camera.attach(canvas):()=>{};
    // ResizeObserver marks the view dirty; render() only reads canvas size when it actually changed.
    this.observer=new ResizeObserver(()=>{this.pendingResize=true;});this.observer.observe(canvas);
    this.resize();
    void device.lost.then(info=>{if(!this.stopped){this.stopped=true;onError(`GPU device lost: ${info.message || info.reason}. Reload to reconnect.`);}});
  }
  static async create(canvas:HTMLCanvasElement,options:WebGPUViewOptions={}):Promise<WebGPUView> {
    if(!navigator.gpu)throw new Error('WebGPU is unavailable. Open this page on localhost or HTTPS in a WebGPU-capable browser.');
    const samples=options.samples??4;
    if(samples!==1&&samples!==4)throw new Error('samples must be 1 or 4');
    // Prefer the discrete GPU; fall back to whatever adapter exists.
    const adapter=options.device?undefined:(await navigator.gpu.requestAdapter({powerPreference:'high-performance'}))??await navigator.gpu.requestAdapter();
    if(!options.device&&!adapter)throw new Error('No WebGPU adapter is available. Enable hardware acceleration or try another browser.');
    // Ask for timestamp queries when the adapter has them, so callers can measure GPU work on
    // this device (for example GpuParticleSimulation.measure). Purely optional: without the
    // feature the request is unchanged and timing helpers report "unsupported".
    const features: GPUFeatureName[] = adapter?.features.has('timestamp-query') ? ['timestamp-query'] : [];
    const device=options.device??await adapter!.requestDevice({requiredFeatures:features});
    const view=new WebGPUView(canvas,device,!options.device,options.onError??console.error,options.interactive??true,clampDpr(options.maxDpr??2),samples,options.alphaMode??'premultiplied');
    if(adapter){view.adapterInfo=adapter.info;view.isFallbackAdapter=!!(adapter as GPUAdapter & {isFallbackAdapter?:boolean}).isFallbackAdapter;}
    return view;
  }
  resize():void {
    if(this.stopped)return;
    this.pendingResize=false;this.dpr=Math.min(devicePixelRatio||1,this.maxDpr);
    const limit=this.device.limits.maxTextureDimension2D;
    const width=Math.min(limit,Math.max(1,Math.round(this.canvas.clientWidth*this.dpr))),height=Math.min(limit,Math.max(1,Math.round(this.canvas.clientHeight*this.dpr)));
    if(this.depth&&width===this.canvas.width&&height===this.canvas.height)return;
    this.canvas.width=width;this.canvas.height=height;this.depth?.destroy();this.msaa?.destroy();
    this.depth=this.device.createTexture({size:[width,height],format:'depth24plus',sampleCount:this.samples,usage:GPUTextureUsage.RENDER_ATTACHMENT});
    // Without MSAA we render straight into the canvas texture, skipping the resolve pass entirely.
    this.msaa=this.samples>1?this.device.createTexture({size:[width,height],format:this.format,sampleCount:this.samples,usage:GPUTextureUsage.RENDER_ATTACHMENT}):undefined;
  }
  render():void {
    if(this.stopped)return;
    // Reading devicePixelRatio is layout-free; canvas.clientWidth is only read when the observer fired.
    if(this.pendingResize||Math.min(devicePixelRatio||1,this.maxDpr)!==this.dpr)this.resize();
    const encoder=this.device.createCommandEncoder();
    const target=this.context.getCurrentTexture().createView();
    const clearValue={r:0,g:0,b:0,a:this.alphaMode==='opaque'?1:0};
    const colorAttachment:GPURenderPassColorAttachment=this.samples>1
      ?{view:this.msaa!.createView(),resolveTarget:target,clearValue,loadOp:'clear',storeOp:'store'}
      :{view:target,clearValue,loadOp:'clear',storeOp:'store'};
    const pass=encoder.beginRenderPass({colorAttachments:[colorAttachment],depthStencilAttachment:{view:this.depth!.createView(),depthClearValue:1,depthLoadOp:'clear',depthStoreOp:'discard'}});
    const camera=this.camera.matrix(this.canvas.width/this.canvas.height),usedGeometry=new Set<Geometry>(),usedBatches=new Set<string>();
    const groups=new Map<string,{geometry:Geometry;color:Color;instances:number[];transparent:boolean;depth:number}>();
    let transparentIndex=0;
    for(const {node,matrix,opacity} of this.world.flatten()) {
      const g=node.geometry;
      if(opacity<=.001||!g.vertices.length||node.reveal<=0)continue;
      usedGeometry.add(g);
      let id=this.geometryIds.get(g);if(id===undefined){id=this.nextGeometryId++;this.geometryIds.set(g,id);}
      const transparent=node.color[3]*opacity*node.reveal<1;
      const key=`${id}:${node.color.join(',')}:${transparent?`t${transparentIndex++}`:'opaque'}`;
      const z=camera[2]*matrix[12]+camera[6]*matrix[13]+camera[10]*matrix[14]+camera[14];
      const w=camera[3]*matrix[12]+camera[7]*matrix[13]+camera[11]*matrix[14]+camera[15];
      let group=groups.get(key);if(!group){group={geometry:g,color:node.color,instances:[],transparent,depth:z/(w||1)};groups.set(key,group);}
      group.instances.push(...matrix,opacity*node.reveal);
    }
    // Solids establish depth first. Translucent objects test against it, then
    // blend back-to-front by object origin without overwriting solid depth.
    const ordered=[...groups].sort((a,b)=>Number(a[1].transparent)-Number(b[1].transparent)||(a[1].transparent?b[1].depth-a[1].depth:0));
    for(const [key,group] of ordered){
      const g=group.geometry; let buffers=this.geometry.get(g);
      if(!buffers){
        if(g.vertices.byteLength>this.device.limits.maxBufferSize)throw new Error('Geometry exceeds GPU buffer limit');
        const positions=this.device.createBuffer({size:Math.max(4,g.vertices.byteLength),usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});
        this.device.queue.writeBuffer(positions,0,g.vertices as Float32Array<ArrayBuffer>);
        let colors:GPUBuffer|undefined;
        if(g.colors){
          if(g.colors.byteLength>this.device.limits.maxBufferSize)throw new Error('Geometry exceeds GPU buffer limit');
          colors=this.device.createBuffer({size:Math.max(4,g.colors.byteLength),usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});
          this.device.queue.writeBuffer(colors,0,g.colors as Float32Array<ArrayBuffer>);
        }
        buffers={positions,colors};this.geometry.set(g,buffers);
      }
      let batch=this.batches.get(key);
      const needed=group.instances.length,count=needed/17;
      if(!batch){
        const uniform=this.device.createBuffer({size:80,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
        const capacity=Math.max(1,count);
        batch={instances:this.device.createBuffer({size:capacity*68,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),uniform,capacity,data:new Float32Array(capacity*17),colored:!!buffers.colors,bind:this.device.createBindGroup({layout:this.bindGroupLayout,entries:[{binding:0,resource:{buffer:uniform}}]})};this.batches.set(key,batch);
      } else if(batch.capacity<count){
        batch.instances.destroy();batch.capacity=Math.max(count,batch.capacity*2);batch.instances=this.device.createBuffer({size:batch.capacity*68,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});batch.data=new Float32Array(batch.capacity*17);
      }
      this.uniforms.set(camera,0);this.uniforms.set(group.color,16);this.device.queue.writeBuffer(batch.uniform,0,this.uniforms);
      // Reuse the batch's Float32Array instead of allocating one per batch per frame.
      batch.data.set(group.instances);this.device.queue.writeBuffer(batch.instances,0,batch.data,0,needed);
      if(buffers.colors&&batch.colored){
        pass.setPipeline(group.transparent?this.translucentColored:this.pipelineColored);
        pass.setBindGroup(0,batch.bind);
        pass.setVertexBuffer(0,buffers.positions);pass.setVertexBuffer(1,buffers.colors);pass.setVertexBuffer(2,batch.instances);
      } else {
        pass.setPipeline(group.transparent?this.translucent:this.pipeline);
        pass.setBindGroup(0,batch.bind);
        pass.setVertexBuffer(0,buffers.positions);pass.setVertexBuffer(1,batch.instances);
      }
      pass.draw(Math.floor(g.vertices.length/3),count);usedBatches.add(key);
    }
    pass.end();this.device.queue.submit([encoder.finish()]);
    for(const [key,batch] of this.batches)if(!usedBatches.has(key)){batch.instances.destroy();batch.uniform.destroy();this.batches.delete(key);}
    for(const [g,b] of this.geometry)if(!usedGeometry.has(g)){b.positions.destroy();b.colors?.destroy();this.geometry.delete(g);}
  }
  dispose():void {
    this.stopped=true;this.cleanup();this.observer.disconnect();this.depth?.destroy();this.msaa?.destroy();
    for(const b of this.geometry.values()){b.positions.destroy();b.colors?.destroy();}
    for(const batch of this.batches.values()){batch.instances.destroy();batch.uniform.destroy();}
    this.geometry.clear();this.batches.clear();this.context.unconfigure();if(this.ownsDevice)this.device.destroy();
  }
}

/** Accessible plain-text labels anchored to camera-projected world positions. */
export class LabelLayer {
  private labels:{element:HTMLSpanElement;point:()=>Vec3}[]=[];
  constructor(private host:HTMLElement,private camera:OrbitCamera) {}
  add(text:string,point:()=>Vec3,color='#ffffff'):HTMLSpanElement {
    const element=document.createElement('span');element.textContent=text;
    Object.assign(element.style,{position:'absolute',color,pointerEvents:'none',transform:'translate(-50%, -50%)',whiteSpace:'nowrap'});
    this.host.append(element);this.labels.push({element,point});return element;
  }
  // Read layout once and evaluate the camera once, then only write styles: no per-label reflow.
  update():void {
    const width=this.host.clientWidth,height=this.host.clientHeight,matrix=this.camera.matrix(width/height);
    for(const {element,point} of this.labels){const [x,y]=this.camera.projectWith(matrix,point(),width,height);element.style.left=`${x}px`;element.style.top=`${y}px`;}
  }
  dispose():void {for(const {element} of this.labels)element.remove();this.labels=[];}
}
