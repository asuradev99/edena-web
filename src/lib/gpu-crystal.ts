import type { Vec3, Color } from './math.js';
import type { GpuSceneLayer } from './view.js';

// Atom data and all 25 trail samples stay on the GPU. Only one affine transform and a handful
// of animation scalars change per frame. No readback or per-atom matrix uploads are needed.
const shader = /* wgsl */ `
struct Atom { position: vec4f, color: vec4f };
struct Frame { transform: mat4x4f, timing: vec4f, visibility: vec4f };
struct Camera { matrix: mat4x4f, right: vec4f, up: vec4f, back: vec4f, viewport: vec4f };
struct Sample { transform: mat4x4f, wrap: vec4f };
@group(0) @binding(0) var<storage, read> rest: array<Atom>;
@group(0) @binding(1) var<storage, read> drift: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> moving: array<Atom>;
@group(0) @binding(3) var<uniform> frame: Frame;
@compute @workgroup_size(64) fn animate(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= arrayLength(&rest)) { return; }
  let p = (frame.transform * vec4f(rest[i].position.xyz, 1)).xyz + drift[i].xyz * frame.timing.x;
  moving[i].position = vec4f(p, rest[i].position.w * (1 + frame.timing.y * drift[i].w));
  moving[i].color = rest[i].color;
}
`;
const renderShader = /* wgsl */ `
struct Atom { position: vec4f, color: vec4f };
struct Frame { transform: mat4x4f, timing: vec4f, visibility: vec4f };
struct Camera { matrix: mat4x4f, right: vec4f, up: vec4f, back: vec4f, viewport: vec4f };
struct Sample { transform: mat4x4f, wrap: vec4f };
@group(0) @binding(0) var<storage, read> rest: array<Atom>;
@group(0) @binding(1) var<storage, read> drift: array<vec4f>;
@group(0) @binding(2) var<storage, read> moving: array<Atom>;
@group(0) @binding(3) var<uniform> frame: Frame;
@group(0) @binding(4) var<uniform> camera: Camera;
@group(0) @binding(5) var<storage, read> samples: array<Sample>;
struct Bond { ends: vec4u, far: vec4f, color: vec4f };
@group(0) @binding(6) var<storage, read> bonds: array<Bond>;
struct Vertex {
  @builtin(position) clip: vec4f,
  @location(0) uv: vec2f,
  @location(1) centre: vec4f,
  @location(2) color: vec4f,
};
fn corner(i: u32) -> vec2f {
  let corners = array<vec2f,6>(vec2f(-1,-1), vec2f(1,-1), vec2f(-1,1), vec2f(-1,1), vec2f(1,-1), vec2f(1,1));
  return corners[i];
}
fn ball(atom: Atom, v: u32) -> Vertex {
  var out: Vertex;
  out.uv = corner(v); out.centre = atom.position; out.color = atom.color;
  let p = atom.position.xyz + atom.position.w * (camera.right.xyz * out.uv.x + camera.up.xyz * out.uv.y);
  out.clip = camera.matrix * vec4f(p,1);
  return out;
}
@vertex fn sphere(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Vertex { return ball(moving[i],v); }
@vertex fn marker(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Vertex {
  var out = ball(rest[i],v); out.color.a *= frame.visibility.y * drift[i].w; return out;
}
struct Fragment { @location(0) color: vec4f, @builtin(frag_depth) depth: f32 };
@fragment fn shade(in: Vertex) -> Fragment {
  let r2 = dot(in.uv,in.uv);
  if (r2 > 1 || in.color.a < .001) { discard; }
  let z = sqrt(max(0,1-r2));
  let normal = camera.right.xyz*in.uv.x + camera.up.xyz*in.uv.y + camera.back.xyz*z;
  let world = in.centre.xyz + normal*in.centre.w;
  let clip = camera.matrix*vec4f(world,1);
  let light = normalize(vec3f(-.45,.72,.52));
  let diffuse = max(0,dot(normal,light));
  let specular = pow(max(0,dot(normal,normalize(light+camera.back.xyz))),30)*.85;
  var out: Fragment;
  out.color = vec4f(in.color.rgb * clamp(.32 + .78*diffuse + specular,.22,1.75),1);
  out.depth = clip.z/clip.w; return out;
}
@fragment fn ring(in: Vertex) -> @location(0) vec4f {
  let r = length(in.uv); let w = max(fwidth(r),.01);
  let alpha = (1-smoothstep(w,2*w,abs(r-.92)))*in.color.a;
  if (alpha < .001) { discard; } return vec4f(in.color.rgb,alpha);
}
@vertex fn trail(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Vertex {
  let segment = v/6u; let c = corner(v%6u); let site = rest[i].position.xyz;
  let a = camera.matrix*vec4f((samples[segment].transform*vec4f(site,1)).xyz+drift[i].xyz*samples[segment].wrap.x,1);
  let b = camera.matrix*vec4f((samples[segment+1u].transform*vec4f(site,1)).xyz+drift[i].xyz*samples[segment+1u].wrap.x,1);
  let delta = (b.xy/b.w-a.xy/a.w)*camera.viewport.xy;
  let normal = vec2f(-delta.y,delta.x)/max(length(delta),.0001);
  var p = mix(a,b,(c.x+1)*.5);
  p = vec4f(p.xy+normal*c.y*1.4*camera.viewport.z/camera.viewport.xy*p.w,p.zw);
  var out: Vertex; out.clip=p; out.uv=c;
  out.centre=vec4f(0); out.color=rest[i].color;
  out.color.a *= frame.visibility.x*drift[i].w;
  return out;
}
@fragment fn stroke(in: Vertex) -> @location(0) vec4f {
  if (in.color.a < .001) { discard; }
  return vec4f(in.color.rgb,in.color.a*(1-smoothstep(.5,1,abs(in.uv.y))));
}
// A ball's animated position (the position part of the compute pass).
fn movedPos(i: u32) -> vec3f {
  return (frame.transform * vec4f(rest[i].position.xyz, 1)).xyz + drift[i].xyz * frame.timing.x;
}
// A bond half, drawn as a screen-space stroke like the trails. Each half is anchored on the atom that
// stays in the box (ends.x) and reaches either a bonded atom that is also in the box, or a periodic
// partner. The image end is the *same rigid offset from the anchor* the pair had at rest, rotated by
// the frame — the partner is deliberately *not* resolved through its own drift, because the box wrap
// can re-image the two atoms of a bond by different lattice vectors, which would draw the bond a
// whole cell long. So both halves share one midpoint and a bond always keeps its resting length.
@vertex fn bond(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Vertex {
  let c = corner(v % 6u);
  let entry = bonds[i];
  let anchor = movedPos(entry.ends.x);
  let far = anchor + (frame.transform * vec4f(entry.far.xyz, 0)).xyz;
  let mid = (anchor + far) * .5;
  let head = select(far, anchor, entry.ends.y == 1u);
  let a = camera.matrix * vec4f(head, 1);
  let b = camera.matrix * vec4f(mid, 1);
  let delta = (b.xy / b.w - a.xy / a.w) * camera.viewport.xy;
  let normal = vec2f(-delta.y, delta.x) / max(length(delta), .0001);
  var p = mix(a, b, (c.x + 1) * .5);
  p = vec4f(p.xy + normal * c.y * 1.8 * camera.viewport.z / camera.viewport.xy * p.w, p.zw);
  var out: Vertex;
  out.clip = p; out.uv = c; out.centre = vec4f(anchor, 1); out.color = entry.color;
  out.color.a *= frame.visibility.z;
  return out;
}
@fragment fn bondStroke(in: Vertex) -> @location(0) vec4f {
  if (in.color.a < .001) { discard; }
  return vec4f(in.color.rgb, in.color.a * (1 - smoothstep(.45, 1, abs(in.uv.y))));
}
`;

/** Orthographic crystal spheres, starting outlines and trajectories, animated entirely on the GPU. */
export class GpuCrystalLayer implements GpuSceneLayer {
  revision = 0;
  private count = 0;
  private rest?: GPUBuffer;
  private drift?: GPUBuffer;
  private moving?: GPUBuffer;
  private samples: GPUBuffer;
  private frame: GPUBuffer;
  private camera: GPUBuffer;
  private bonds?: GPUBuffer;
  private compute: GPUComputePipeline;
  private spheres: GPURenderPipeline;
  private markers: GPURenderPipeline;
  private trails: GPURenderPipeline;
  private bondPipeline: GPURenderPipeline;
  private computeBind?: GPUBindGroup;
  private renderBind?: GPUBindGroup;
  private frameData = new Float32Array(24);
  private cameraData = new Float32Array(32);
  private source = new Float32Array(0);
  private bondData = new Float32Array(16);
  private bondCapacity = -1;
  private bondCount = 0;
  private computedRevision = -1;
  private pendingFrame = true;
  private disposed = false;
  constructor(private device: GPUDevice, format: GPUTextureFormat, samples: number) {
    const buffer = (size: number, usage: number) => device.createBuffer({ size, usage: usage | GPUBufferUsage.COPY_DST });
    this.samples = buffer(25*80, GPUBufferUsage.STORAGE);
    this.frame = buffer(96, GPUBufferUsage.UNIFORM);
    this.camera = buffer(128, GPUBufferUsage.UNIFORM);
    this.bonds = buffer(64, GPUBufferUsage.STORAGE);
    this.compute = device.createComputePipeline({layout:'auto',compute:{module:device.createShaderModule({code:shader}),entryPoint:'animate'}});
    const module = device.createShaderModule({code:renderShader});
    const bindings: GPUBindGroupLayoutEntry[] = [0,1,2,5,6].map(binding => ({binding, visibility:GPUShaderStage.VERTEX, buffer:{type:'read-only-storage'}}));
    bindings.push(...[3,4].map(binding => ({binding,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:'uniform' as const}})));
    const layout = device.createPipelineLayout({bindGroupLayouts:[device.createBindGroupLayout({entries:bindings})]});
    const pipeline = (vertex: string, fragment: string, transparent: boolean) => device.createRenderPipeline({layout,
      vertex:{module,entryPoint:vertex},fragment:{module,entryPoint:fragment,targets:[{format,blend:transparent?{color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha'}}:undefined}]},
      primitive:{topology:'triangle-list'}, multisample:{count:samples}, depthStencil:{format:'depth24plus',depthWriteEnabled:!transparent,depthCompare:'less-equal'}});
    this.spheres = pipeline('sphere','shade',false); this.markers = pipeline('marker','ring',true); this.trails = pipeline('trail','stroke',true);
    this.bondPipeline = pipeline('bond','bondStroke',true);
  }
  setSites(positions: Vec3[], radii: number[], colors: Color[]): void {
    if (positions.length !== this.count) {
      this.rest?.destroy(); this.drift?.destroy(); this.moving?.destroy();
      this.count = positions.length;
      const buffer = (size: number) => this.device.createBuffer({size:Math.max(32,size),usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC});
      this.rest=buffer(this.count*32);this.moving=buffer(this.count*32);this.drift=buffer(this.count*16);
      this.source=new Float32Array(this.count*8);
      const entries = [this.rest,this.drift,this.moving,this.frame].map((buffer,binding)=>({binding,resource:{buffer:buffer!}}));
      this.computeBind=this.device.createBindGroup({layout:this.compute.getBindGroupLayout(0),entries});
      this.buildRenderBind();
    }
    positions.forEach((p,i)=>{this.source.set([...p,radii[i],...colors[i]],i*8)});
    this.device.queue.writeBuffer(this.rest!,0,this.source);this.revision++;
  }
  setColors(colors: Color[]): void {
    colors.forEach((color,i)=>this.source.set(color,i*8+4));
    this.device.queue.writeBuffer(this.rest!,0,this.source);this.revision++;
  }
  /**
   * Bond halves. Each half is anchored on its atom (`anchor`) and reaches the partner as the resting
   * bond vector (`rel`) rotated by the frame — never through the partner's own position, so a bond
   * keeps its length even when the box wrap re-images the two atoms differently. Both halves of a bond
   * share an anchor, so they share one midpoint.
   */
  setBonds(list: { anchor: number; tip: 0 | 1; rel: Vec3; color: Color }[]): void {
    this.bondCount = list.length;
    this.bondData = new Float32Array(Math.max(12, list.length * 12));
    const words = new Uint32Array(this.bondData.buffer);
    list.forEach((bond, i) => {
      words[i * 12] = bond.anchor; words[i * 12 + 1] = bond.tip;
      this.bondData.set(bond.rel, i * 12 + 4);
      this.bondData.set(bond.color, i * 12 + 8);
    });
    if (list.length !== this.bondCapacity) {
      this.bonds?.destroy();
      this.bondCapacity = list.length;
      const size = Math.max(48, list.length * 48);
      this.bonds = this.device.createBuffer({ size, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
      // Bonds can arrive before the first setSites(); setSites builds the bind group in that case.
      this.buildRenderBind();
    }
    this.device.queue.writeBuffer(this.bonds!, 0, this.bondData);
    this.revision++;
  }
  /** Folding an element away changes only the tint, so the bond topology stays on the GPU. */
  setBondColors(colors: Color[]): void {
    const count = Math.min(colors.length, this.bondCount);
    for (let i = 0; i < count; i++) this.bondData.set(colors[i], i * 12 + 8);
    if (count) this.device.queue.writeBuffer(this.bonds!, 0, this.bondData);
    this.revision++;
  }
  private buildRenderBind(): void {
    if (!this.rest || !this.drift || !this.moving) return;
    const entries = [this.rest,this.drift,this.moving,this.frame].map((buffer,binding)=>({binding,resource:{buffer:buffer!}}));
    this.renderBind=this.device.createBindGroup({layout:this.spheres.getBindGroupLayout(0),entries:[...entries,
      {binding:4,resource:{buffer:this.camera}},{binding:5,resource:{buffer:this.samples}},{binding:6,resource:{buffer:this.bonds!}}]});
  }
  setOperation(drift: Vec3[], movers: Set<number>, samples: Float32Array): void {
    const data=new Float32Array(this.count*4);
    drift.forEach((p,i)=>data.set([...p,movers.has(i)?1:0],i*4));
    this.device.queue.writeBuffer(this.drift!,0,data);this.device.queue.writeBuffer(this.samples,0,samples as Float32Array<ArrayBuffer>);this.revision++;
  }
  setFrame(matrix: Float32Array, wrap: number, lift: number, trails: number, starts: number, bonds = 1): void {
    const values = [...matrix,wrap,lift,0,0,trails,starts,bonds,0];
    if (values.every((v,i)=>Math.fround(v)===this.frameData[i])) return;
    this.frameData.set(values);this.pendingFrame=true;this.revision++;
  }
  prepare(encoder: GPUCommandEncoder, camera: Float32Array, width: number, height: number): void {
    this.cameraData.set(camera);
    for (let row=0;row<3;row++) {
      const n=Math.hypot(camera[row],camera[4+row],camera[8+row]);
      // Orthographic projection reverses camera z in the depth row.
      const sign=row===2?-1:1;
      this.cameraData.set([sign*camera[row]/n,sign*camera[4+row]/n,sign*camera[8+row]/n,0],16+row*4);
    }
    this.cameraData.set([width,height,Math.min(devicePixelRatio||1,2),0],28);
    this.device.queue.writeBuffer(this.camera,0,this.cameraData);
    if (this.pendingFrame) {this.device.queue.writeBuffer(this.frame,0,this.frameData);this.pendingFrame=false;}
    if (this.count && this.computedRevision!==this.revision) {
      const pass=encoder.beginComputePass();pass.setPipeline(this.compute);pass.setBindGroup(0,this.computeBind!);pass.dispatchWorkgroups(Math.ceil(this.count/64));pass.end();
      this.computedRevision=this.revision;
    }
  }
  drawOpaque(pass: GPURenderPassEncoder): void {
    if (!this.count) return;pass.setPipeline(this.spheres);pass.setBindGroup(0,this.renderBind!);pass.draw(6,this.count);
  }
  drawTransparent(pass: GPURenderPassEncoder): void {
    if (!this.count) return;pass.setBindGroup(0,this.renderBind!);
    if (this.frameData[20]>.001) {pass.setPipeline(this.trails);pass.draw(24*6,this.count);}
    if (this.frameData[21]>.001) {pass.setPipeline(this.markers);pass.draw(6,this.count);}
    if (this.bondCount && this.frameData[22]>.001) {pass.setPipeline(this.bondPipeline);pass.draw(6,this.bondCount);}
  }
  dispose(): void {
    if(this.disposed)return;this.disposed=true;
    for(const buffer of [this.rest,this.drift,this.moving,this.frame,this.camera,this.samples,this.bonds])buffer?.destroy();
  }
}
