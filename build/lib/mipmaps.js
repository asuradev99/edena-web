/** GPU-generated, premultiplied-alpha mipmaps. Bindings are retained with each texture. */
const shader = /* wgsl */ `
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var filtering: sampler;
struct Vertex { @builtin(position) position: vec4<f32>, @location(0) uv: vec2<f32> };
@vertex fn vertex(@builtin(vertex_index) i: u32) -> Vertex {
  let p = array<vec2<f32>,3>(vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.))[i];
  var out: Vertex; out.position = vec4(p,0.,1.); out.uv = p * vec2(.5,-.5) + .5; return out;
}
@fragment fn fragment(v: Vertex) -> @location(0) vec4<f32> { return textureSample(source,filtering,v.uv); }
`;
export class Mipmaps {
    device;
    pipeline;
    sampler;
    levels = new WeakMap();
    constructor(device) {
        this.device = device;
        const module = device.createShaderModule({ code: shader });
        this.pipeline = device.createRenderPipeline({ layout: 'auto', vertex: { module, entryPoint: 'vertex' },
            fragment: { module, entryPoint: 'fragment', targets: [{ format: 'rgba8unorm' }] } });
        this.sampler = device.createSampler({ minFilter: 'linear', magFilter: 'linear' });
    }
    generate(encoder, texture) {
        let levels = this.levels.get(texture);
        if (!levels) {
            levels = [];
            for (let i = 1; i < texture.mipLevelCount; i++)
                levels.push({
                    target: texture.createView({ baseMipLevel: i, mipLevelCount: 1 }),
                    bind: this.device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [
                            { binding: 0, resource: texture.createView({ baseMipLevel: i - 1, mipLevelCount: 1 }) },
                            { binding: 1, resource: this.sampler },
                        ] }),
                });
            this.levels.set(texture, levels);
        }
        for (const level of levels) {
            const pass = encoder.beginRenderPass({ colorAttachments: [{ view: level.target, loadOp: 'clear', storeOp: 'store' }] });
            pass.setPipeline(this.pipeline);
            pass.setBindGroup(0, level.bind);
            pass.draw(3);
            pass.end();
        }
    }
}
const caches = new WeakMap();
export function mipmaps(device) {
    let value = caches.get(device);
    if (!value)
        caches.set(device, value = new Mipmaps(device));
    return value;
}
//# sourceMappingURL=mipmaps.js.map