const shader = /* wgsl */ `
struct Uniforms { camera: mat4x4<f32>, color: vec4<f32> };
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(1) @binding(0) var<storage, read> points: array<f32>;
// Canvas size in physical pixels, stroke width in physical pixels.
@group(1) @binding(1) var<uniform> viewport: vec4<f32>;
struct Vertex {
  @builtin(position) position: vec4<f32>,
  @location(0) @interpolate(linear) edge: f32,
  @location(1) opacity: f32,
};
@vertex fn vertex(@builtin(vertex_index) index: u32,
  @location(1) m0: vec4<f32>, @location(2) m1: vec4<f32>,
  @location(3) m2: vec4<f32>, @location(4) m3: vec4<f32>,
  @location(5) opacity: f32) -> Vertex {
  let base = (index / 6u) * 6u;
  let matrix = u.camera * mat4x4<f32>(m0, m1, m2, m3);
  var a = matrix * vec4(points[base], points[base+1u], points[base+2u], 1.);
  var b = matrix * vec4(points[base+3u], points[base+4u], points[base+5u], 1.);
  var out: Vertex;
  out.opacity = opacity;
  out.edge = 0.;
  // Clip before dividing by w: a segment crossing the near plane must not explode across the screen.
  if (a.z < 0. && b.z < 0.) { out.position = vec4(0.,0.,-1.,1.); return out; }
  if (a.z < 0.) { a = mix(a, b, -a.z / (b.z-a.z)); }
  if (b.z < 0.) { b = mix(b, a, -b.z / (a.z-b.z)); }
  let delta = (b.xy / max(b.w, 1e-7) - a.xy / max(a.w, 1e-7)) * viewport.xy;
  let normal = vec2(-delta.y, delta.x) / max(length(delta), 1e-7);
  let corners = array<vec2<f32>,6>(vec2(0.,-1.),vec2(1.,-1.),vec2(0.,1.),vec2(0.,1.),vec2(1.,-1.),vec2(1.,1.));
  let corner = corners[index % 6u];
  var clip = mix(a, b, corner.x);
  let radius = viewport.z * .5 + .5;
  clip = vec4(clip.xy + normal * corner.y * radius * 2. / viewport.xy * clip.w, clip.zw);
  out.position = clip;
  out.edge = corner.y * radius;
  return out;
}
@fragment fn fragment(input: Vertex) -> @location(0) vec4<f32> {
  let coverage = clamp(viewport.z * .5 + .5 - abs(input.edge), 0., 1.);
  let alpha = u.color.a * input.opacity * coverage;
  if (alpha < .001) { discard; }
  return vec4(u.color.rgb, alpha);
}`;
const cache = new WeakMap();
function pipelines(device, materialLayout, format, samples) {
    let materials = cache.get(device);
    if (!materials)
        cache.set(device, materials = new Map());
    let variants = materials.get(materialLayout);
    if (!variants)
        materials.set(materialLayout, variants = new Map());
    const key = `${format}:${samples}`;
    const existing = variants.get(key);
    if (existing)
        return existing;
    const layout = device.createBindGroupLayout({ entries: [
            { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
            { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        ] });
    const module = device.createShaderModule({ code: shader, label: 'antialiased screen lines' });
    const descriptor = {
        layout: device.createPipelineLayout({ bindGroupLayouts: [materialLayout, layout] }),
        vertex: { module, entryPoint: 'vertex', buffers: [{ arrayStride: 68, stepMode: 'instance', attributes: [
                        { shaderLocation: 1, offset: 0, format: 'float32x4' }, { shaderLocation: 2, offset: 16, format: 'float32x4' },
                        { shaderLocation: 3, offset: 32, format: 'float32x4' }, { shaderLocation: 4, offset: 48, format: 'float32x4' },
                        { shaderLocation: 5, offset: 64, format: 'float32' },
                    ] }] },
        fragment: { module, entryPoint: 'fragment', targets: [{ format, blend: {
                        color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
                        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
                    } }] },
        primitive: { topology: 'triangle-list' }, multisample: { count: samples },
        depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less-equal' },
    };
    const result = { layout, solid: device.createRenderPipeline(descriptor), blended: device.createRenderPipeline({
            ...descriptor, depthStencil: { ...descriptor.depthStencil, depthWriteEnabled: false },
        }) };
    variants.set(key, result);
    return result;
}
/** Shared path for mesh contours and explicit grid/tick lines. Each segment expands to two triangles. */
export class LineRenderer {
    device;
    pipelines;
    strokes = new Map();
    used = new Set();
    spare = [];
    constructor(device, materialLayout, format, samples) {
        this.device = device;
        this.pipelines = pipelines(device, materialLayout, format, samples);
    }
    begin(geometries) {
        const retained = new Set();
        for (const geometry of geometries) {
            if (geometry.segments)
                retained.add(geometry.segments);
            if (geometry.outline)
                retained.add(geometry.outline);
        }
        for (const [points, stroke] of this.strokes)
            if (!retained.has(points)) {
                this.strokes.delete(points);
                this.spare.push(stroke);
            }
    }
    draw(pass, geometry, outline, material, instances, count, transparent, width, height, dpr) {
        const points = outline ? geometry.outline : geometry.segments;
        if (!points?.length)
            return;
        this.used.add(points);
        let stroke = this.strokes.get(points);
        if (!stroke) {
            const index = this.spare.findIndex(item => item.points.size >= points.byteLength && item.points.size <= points.byteLength * 2);
            if (index >= 0) {
                stroke = this.spare.splice(index, 1)[0];
                this.device.queue.writeBuffer(stroke.points, 0, points);
                this.strokes.set(points, stroke);
            }
        }
        if (!stroke) {
            const buffer = this.device.createBuffer({ size: points.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
            this.device.queue.writeBuffer(buffer, 0, points);
            const uniform = this.device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
            stroke = { points: buffer, uniform, data: new Float32Array(4).fill(NaN), bind: this.device.createBindGroup({
                    layout: this.pipelines.layout, entries: [{ binding: 0, resource: { buffer } }, { binding: 1, resource: { buffer: uniform } }],
                }) };
            this.strokes.set(points, stroke);
        }
        const size = Math.fround(geometry.lineWidth * dpr);
        if (stroke.data[0] !== width || stroke.data[1] !== height || stroke.data[2] !== size) {
            stroke.data.set([width, height, size, 0]);
            this.device.queue.writeBuffer(stroke.uniform, 0, stroke.data);
        }
        pass.setPipeline(transparent || outline ? this.pipelines.blended : this.pipelines.solid);
        pass.setBindGroup(0, material);
        pass.setBindGroup(1, stroke.bind);
        pass.setVertexBuffer(0, instances);
        pass.draw(points.length, count);
    }
    finish() {
        for (const [points, stroke] of this.strokes)
            if (!this.used.has(points)) {
                stroke.points.destroy();
                stroke.uniform.destroy();
                this.strokes.delete(points);
            }
        this.used.clear();
        for (const stroke of this.spare) {
            stroke.points.destroy();
            stroke.uniform.destroy();
        }
        this.spare.length = 0;
    }
    dispose() { this.used.clear(); this.finish(); }
}
//# sourceMappingURL=line-renderer.js.map