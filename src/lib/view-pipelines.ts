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

type Pipelines = {
  bindGroupLayout: GPUBindGroupLayout;
  pipeline: GPURenderPipeline;
  pipelineColored: GPURenderPipeline;
  translucent: GPURenderPipeline;
  translucentColored: GPURenderPipeline;
  pipelineWire: GPURenderPipeline;
};

const cache = new WeakMap<GPUDevice, Map<string, Pipelines>>();

/** Views on the same device share immutable pipeline state. */
export function viewPipelines(device: GPUDevice, format: GPUTextureFormat, samples: number): Pipelines {
  let variants = cache.get(device);
  if (!variants) { variants = new Map(); cache.set(device, variants); }
  const key = `${format}:${samples}`;
  const existing = variants.get(key);
  if (existing) return existing;
    const module=device.createShaderModule({code:shader});
    // One explicit layout for both pipelines, so a single bind group works with either.
    const bindGroupLayout=device.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:'uniform'}}]});
    const layout=device.createPipelineLayout({bindGroupLayouts:[bindGroupLayout]});
    const blend:GPUBlendState={color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha'}};
    const depthStencil:GPUDepthStencilState={format:'depth24plus',depthWriteEnabled:true,depthCompare:'less-equal'};
    const plain:GPURenderPipelineDescriptor={layout,vertex:{module,entryPoint:'vertex',buffers:[
      {arrayStride:12,attributes:[{shaderLocation:0,offset:0,format:'float32x3'}]},
      {arrayStride:68,stepMode:'instance',attributes:[
        {shaderLocation:1,offset:0,format:'float32x4'}, {shaderLocation:2,offset:16,format:'float32x4'},
        {shaderLocation:3,offset:32,format:'float32x4'}, {shaderLocation:4,offset:48,format:'float32x4'},
        {shaderLocation:5,offset:64,format:'float32'},
      ]},
    ]},fragment:{module,entryPoint:'fragment',targets:[{format:format,blend}]},primitive:{topology:'triangle-list'},multisample:{count:samples},depthStencil};
    const colored:GPURenderPipelineDescriptor={layout,vertex:{module,entryPoint:'vertexColored',buffers:[
      {arrayStride:12,attributes:[{shaderLocation:0,offset:0,format:'float32x3'}]},
      {arrayStride:12,attributes:[{shaderLocation:1,offset:0,format:'float32x3'}]},
      {arrayStride:68,stepMode:'instance',attributes:[
        {shaderLocation:2,offset:0,format:'float32x4'}, {shaderLocation:3,offset:16,format:'float32x4'},
        {shaderLocation:4,offset:32,format:'float32x4'}, {shaderLocation:5,offset:48,format:'float32x4'},
        {shaderLocation:6,offset:64,format:'float32'},
      ]},
    ]},fragment:{module,entryPoint:'fragment',targets:[{format:format,blend}]},primitive:{topology:'triangle-list'},multisample:{count:samples},depthStencil};
    const pipeline=device.createRenderPipeline(plain);
    const pipelineColored=device.createRenderPipeline(colored);
    const transparentDepth={...depthStencil,depthWriteEnabled:false};
    const translucent=device.createRenderPipeline({...plain,depthStencil:transparentDepth});
    const translucentColored=device.createRenderPipeline({...colored,depthStencil:transparentDepth});
    // The wireframe draws after the solid it belongs to: it must not write depth (the faces already
    // did), and `less-equal` lets an edge sitting exactly on a face survive the test.
    const pipelineWire=device.createRenderPipeline({...plain,primitive:{topology:'line-list'},depthStencil:transparentDepth});
  const pipelines = { bindGroupLayout, pipeline, pipelineColored, translucent, translucentColored, pipelineWire };
  variants.set(key, pipelines);
  return pipelines;
}
