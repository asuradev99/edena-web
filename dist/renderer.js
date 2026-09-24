import { BOX_HALF } from "./types.js";
// ── Line shader (axes + bounding box) ────────────────────────────────────────
const LINE_SHADER = /* wgsl */ `
struct Uniforms { viewProj: mat4x4f }
@group(0) @binding(0) var<uniform> uni: Uniforms;

struct VIn {
  @location(0) pos:   vec3f,
  @location(1) color: vec3f,
}
struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) color:     vec3f,
}

@vertex fn vs(v: VIn) -> VOut {
  var o: VOut;
  o.pos   = uni.viewProj * vec4f(v.pos, 1.0);
  o.color = v.color;
  return o;
}

@fragment fn fs(v: VOut) -> @location(0) vec4f {
  return vec4f(v.color, 1.0);
}
`;
// ── Sphere shader: instanced UV sphere ───────────────────────────────────────
//   Uniform layout (80 bytes):
//     offset  0: viewProj    mat4x4f  (64 bytes)
//     offset 64: cameraPos   vec3f    (12 bytes, AlignOf=16)
//     offset 76: glowEnabled u32      (4 bytes,  AlignOf=4)
//
//   Buffer 0 (vertex):   loc 0 = pos(3),     loc 1 = normal(3)    — stride 24
//   Buffer 1 (instance): loc 2 = instPos(3), loc 3 = instRadius(1),
//                        loc 4 = instColor(3) + pad(1)             — stride 32
const SPHERE_SHADER = /* wgsl */ `
struct Uniforms {
  viewProj:    mat4x4f,
  cameraPos:   vec3f,
  glowEnabled: u32,
}
@group(0) @binding(0) var<uniform> uni: Uniforms;

struct VIn {
  @location(0) pos:        vec3f,
  @location(1) normal:     vec3f,
  @location(2) instPos:    vec3f,
  @location(3) instRadius: f32,
  @location(4) instColor:  vec3f,
}
struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) normal:    vec3f,
  @location(1) color:     vec3f,
  @location(2) worldPos:  vec3f,
}

@vertex fn vs(v: VIn) -> VOut {
  let world = v.pos * v.instRadius + v.instPos;
  var o: VOut;
  o.pos      = uni.viewProj * vec4f(world, 1.0);
  o.normal   = v.normal;
  o.color    = v.instColor;
  o.worldPos = world;
  return o;
}

@fragment fn fs(v: VOut) -> @location(0) vec4f {
  let lightDir = normalize(vec3f(1.0, 2.0, 1.5));
  let n        = normalize(v.normal);
  let diffuse  = max(dot(n, lightDir), 0.0);
  var lit      = v.color * (0.2 + 0.8 * diffuse);

  if uni.glowEnabled != 0u {
    let viewDir = normalize(uni.cameraPos - v.worldPos);
    let rim     = 1.0 - clamp(dot(n, viewDir), 0.0, 1.0);
    lit += v.color * pow(rim, 2.5) * 1.6;
    lit += vec3f(0.3, 0.6, 1.0) * pow(rim, 6.0) * 3.5;
  }

  return vec4f(clamp(lit, vec3f(0.0), vec3f(1.0)), 1.0);
}`;
// ── Spring cylinder shader ────────────────────────────────────────────────────
//   No vertex buffer — all geometry is computed procedurally in the VS from
//   two storage buffers: per-sphere render data (positions) and spring pairs.
//
//   Each instance = one spring (i, j).
//   Each draw call issues N_SEGS * 6 vertices per instance (triangle list quads).
//
//   Uniform layout: same 80-byte buffer as sphere shader; only viewProj is used.
//   Binding 1: sphere render buffer (pos_r at offset 0 of each 32-byte RenderElem)
//   Binding 2: spring pairs buffer  (vec2u per pair)
const SPRING_SHADER = /* wgsl */ `
struct Uniforms  { viewProj: mat4x4f }          // first 64 B of the 80-B shared UBO
struct RenderElem { pos_r: vec4f, color_pad: vec4f }

@group(0) @binding(0) var<uniform>       uni:     Uniforms;
@group(0) @binding(1) var<storage, read> spheres: array<RenderElem>;
@group(0) @binding(2) var<storage, read> pairs:   array<vec2u>;

const N_SEGS: u32 = 8u;
const CYL_R:  f32 = 0.035;
const TAU:    f32 = 6.28318530718;

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) nrm: vec3f,
}

@vertex
fn vs_spring(
  @builtin(instance_index) inst: u32,
  @builtin(vertex_index)   vi:   u32,
) -> VSOut {
  let pair = pairs[inst];
  let posA = spheres[pair.x].pos_r.xyz;
  let posB = spheres[pair.y].pos_r.xyz;

  // Which circumference segment (0..N_SEGS-1) and which of 6 verts in the quad
  let seg = vi / 6u;
  let qi  = vi % 6u;

  // Two triangles forming the quad: indices map to (s_offset, t_value)
  // tri0: (0,0)(1,0)(1,1)   tri1: (0,0)(1,1)(0,1)
  var s_off: u32; var t_val: f32;
  if      qi == 0u { s_off = 0u; t_val = 0.0; }
  else if qi == 1u { s_off = 1u; t_val = 0.0; }
  else if qi == 2u { s_off = 1u; t_val = 1.0; }
  else if qi == 3u { s_off = 0u; t_val = 0.0; }
  else if qi == 4u { s_off = 1u; t_val = 1.0; }
  else             { s_off = 0u; t_val = 1.0; }

  let theta = f32((seg + s_off) % N_SEGS) * TAU / f32(N_SEGS);
  let ct = cos(theta); let st = sin(theta);

  // Local frame: z_axis along spring direction
  let dir    = posB - posA;
  let len    = length(dir);
  let z_axis = select(vec3f(0.0, 0.0, 1.0), dir / len, len > 1e-6);
  let up     = select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(z_axis.y) > 0.9);
  let x_axis = normalize(cross(up, z_axis));
  let y_axis = cross(z_axis, x_axis);

  let world = posA + x_axis * (ct * CYL_R) + y_axis * (st * CYL_R) + z_axis * (t_val * len);

  var o: VSOut;
  o.pos = uni.viewProj * vec4f(world, 1.0);
  o.nrm = x_axis * ct + y_axis * st;
  return o;
}

@fragment
fn fs_spring(in: VSOut) -> @location(0) vec4f {
  let d   = max(dot(normalize(in.nrm), normalize(vec3f(1.0, 2.0, 1.5))), 0.0);
  let col = vec3f(0.30 + 0.50 * d);  // neutral gray, lit
  return vec4f(col, 1.0);
}
`;
// ── Geometry builders ─────────────────────────────────────────────────────────
function buildAxes() {
    const segs = [
        { p0: [-2.5, 0, 0], p1: [0, 0, 0], c: [0.35, 0.05, 0.05] },
        { p0: [0, 0, 0], p1: [2.5, 0, 0], c: [1.00, 0.20, 0.20] },
        { p0: [0, -2.5, 0], p1: [0, 0, 0], c: [0.05, 0.35, 0.05] },
        { p0: [0, 0, 0], p1: [0, 2.5, 0], c: [0.20, 1.00, 0.20] },
        { p0: [0, 0, -2.5], p1: [0, 0, 0], c: [0.05, 0.10, 0.40] },
        { p0: [0, 0, 0], p1: [0, 0, 2.5], c: [0.35, 0.60, 1.00] },
    ];
    const data = new Float32Array(new ArrayBuffer(segs.length * 2 * 6 * 4));
    let o = 0;
    for (const { p0, p1, c } of segs) {
        for (const p of [p0, p1]) {
            data[o++] = p[0];
            data[o++] = p[1];
            data[o++] = p[2];
            data[o++] = c[0];
            data[o++] = c[1];
            data[o++] = c[2];
        }
    }
    return data;
}
function buildBoundingBox(h) {
    const corners = [
        [-h, -h, -h], [+h, -h, -h], [+h, +h, -h], [-h, +h, -h],
        [-h, -h, +h], [+h, -h, +h], [+h, +h, +h], [-h, +h, +h],
    ];
    const edges = [
        [0, 1], [1, 2], [2, 3], [3, 0],
        [4, 5], [5, 6], [6, 7], [7, 4],
        [0, 4], [1, 5], [2, 6], [3, 7],
    ];
    const c = [0.60, 0.62, 0.70];
    const data = new Float32Array(new ArrayBuffer(edges.length * 2 * 6 * 4));
    let o = 0;
    for (const [a, b] of edges) {
        for (const p of [corners[a], corners[b]]) {
            data[o++] = p[0];
            data[o++] = p[1];
            data[o++] = p[2];
            data[o++] = c[0];
            data[o++] = c[1];
            data[o++] = c[2];
        }
    }
    return data;
}
function buildSphereMesh(stacks, slices) {
    const vertCount = (stacks + 1) * (slices + 1);
    const verts = new Float32Array(new ArrayBuffer(vertCount * 6 * 4));
    let vi = 0;
    for (let s = 0; s <= stacks; s++) {
        const phi = Math.PI * s / stacks;
        const sinP = Math.sin(phi), cosP = Math.cos(phi);
        for (let sl = 0; sl <= slices; sl++) {
            const theta = 2 * Math.PI * sl / slices;
            const x = sinP * Math.cos(theta), y = cosP, z = sinP * Math.sin(theta);
            verts[vi++] = x;
            verts[vi++] = y;
            verts[vi++] = z;
            verts[vi++] = x;
            verts[vi++] = y;
            verts[vi++] = z;
        }
    }
    const idxCount = stacks * slices * 6;
    const indices = new Uint16Array(new ArrayBuffer(idxCount * 2));
    let ii = 0;
    for (let s = 0; s < stacks; s++) {
        for (let sl = 0; sl < slices; sl++) {
            const a = s * (slices + 1) + sl, b = a + slices + 1;
            indices[ii++] = a;
            indices[ii++] = b;
            indices[ii++] = a + 1;
            indices[ii++] = a + 1;
            indices[ii++] = b;
            indices[ii++] = b + 1;
        }
    }
    return { verts, indices, indexCount: idxCount };
}
// ── Renderer ──────────────────────────────────────────────────────────────────
const SPHERE_INST_STRIDE = 32; // instPos(3)+instRadius(1)+instColor(3)+pad(1)
const MSAA_COUNT = 4;
export class Renderer {
    device;
    context;
    format;
    uniformBuffer;
    bindGroup;
    linePipeline;
    axisBuffer;
    axisVertexCount = 0;
    boxBuffer;
    boxVertexCount = 0;
    spherePipeline;
    sphereVertexBuffer;
    sphereIndexBuffer;
    sphereIndexCount = 0;
    editorPreviewBuffer;
    editorGridBuffer;
    editorGridVertexCount = 0;
    editorPreviewVisible = false;
    springPipeline;
    springBGL;
    springBindGroup = null;
    depthTexture;
    depthView;
    msaaTexture;
    msaaView;
    getDevice() { return this.device; }
    async init(canvas) {
        const adapter = await navigator.gpu?.requestAdapter();
        if (!adapter)
            throw new Error("WebGPU not supported");
        this.device = await adapter.requestDevice();
        this.context = canvas.getContext("webgpu");
        this.format = navigator.gpu.getPreferredCanvasFormat();
        this.context.configure({ device: this.device, format: this.format, alphaMode: "premultiplied" });
        // Shared uniform buffer — 80 bytes
        this.uniformBuffer = this.device.createBuffer({
            size: 80,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        const bgl = this.device.createBindGroupLayout({
            entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }],
        });
        this.bindGroup = this.device.createBindGroup({
            layout: bgl,
            entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
        });
        const pipelineLayout = this.device.createPipelineLayout({ bindGroupLayouts: [bgl] });
        const depthStencil = {
            format: "depth24plus", depthWriteEnabled: true, depthCompare: "less",
        };
        const multisample = { count: MSAA_COUNT };
        // ── Line pipeline ─────────────────────────────────────────────────────────
        const lineMod = this.device.createShaderModule({ code: LINE_SHADER });
        this.linePipeline = this.device.createRenderPipeline({
            layout: pipelineLayout,
            vertex: {
                module: lineMod, entryPoint: "vs",
                buffers: [{ arrayStride: 24, attributes: [
                            { shaderLocation: 0, offset: 0, format: "float32x3" },
                            { shaderLocation: 1, offset: 12, format: "float32x3" },
                        ] }],
            },
            fragment: { module: lineMod, entryPoint: "fs", targets: [{ format: this.format }] },
            primitive: { topology: "line-list" },
            depthStencil, multisample,
        });
        // ── Sphere pipeline (instanced UV sphere) ─────────────────────────────────
        const sphereMod = this.device.createShaderModule({ code: SPHERE_SHADER });
        this.spherePipeline = this.device.createRenderPipeline({
            layout: pipelineLayout,
            vertex: {
                module: sphereMod, entryPoint: "vs",
                buffers: [
                    { arrayStride: 24, stepMode: "vertex", attributes: [
                            { shaderLocation: 0, offset: 0, format: "float32x3" },
                            { shaderLocation: 1, offset: 12, format: "float32x3" },
                        ] },
                    { arrayStride: SPHERE_INST_STRIDE, stepMode: "instance", attributes: [
                            { shaderLocation: 2, offset: 0, format: "float32x3" },
                            { shaderLocation: 3, offset: 12, format: "float32" },
                            { shaderLocation: 4, offset: 16, format: "float32x3" },
                        ] },
                ],
            },
            fragment: { module: sphereMod, entryPoint: "fs", targets: [{ format: this.format }] },
            primitive: { topology: "triangle-list" },
            depthStencil, multisample,
        });
        // ── Spring cylinder pipeline ──────────────────────────────────────────────
        //    Uses its own BGL (needs 2 extra storage-buffer bindings).
        this.springBGL = this.device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } },
                { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
                { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
            ],
        });
        const springMod = this.device.createShaderModule({ code: SPRING_SHADER });
        this.springPipeline = this.device.createRenderPipeline({
            layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.springBGL] }),
            vertex: { module: springMod, entryPoint: "vs_spring", buffers: [] },
            fragment: { module: springMod, entryPoint: "fs_spring", targets: [{ format: this.format }] },
            primitive: { topology: "triangle-list", cullMode: "none" },
            depthStencil, multisample,
        });
        // ── Static geometry ───────────────────────────────────────────────────────
        const axisData = buildAxes();
        this.axisVertexCount = axisData.length / 6;
        this.axisBuffer = this.device.createBuffer({
            size: axisData.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(this.axisBuffer, 0, axisData.buffer);
        const boxData = buildBoundingBox(BOX_HALF);
        this.boxVertexCount = boxData.length / 6;
        this.boxBuffer = this.device.createBuffer({
            // Allocate for maximum possible box size — content updated via updateBoundingBox
            size: boxData.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(this.boxBuffer, 0, boxData.buffer);
        const { verts, indices, indexCount } = buildSphereMesh(24, 24);
        this.sphereIndexCount = indexCount;
        this.sphereVertexBuffer = this.device.createBuffer({
            size: verts.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(this.sphereVertexBuffer, 0, verts.buffer);
        this.sphereIndexBuffer = this.device.createBuffer({
            size: indices.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(this.sphereIndexBuffer, 0, indices.buffer);
        this.editorPreviewBuffer = this.device.createBuffer({
            size: SPHERE_INST_STRIDE, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        // 22 grid lines (11 per axis), 2 vertices per line, 6 floats per vertex.
        this.editorGridBuffer = this.device.createBuffer({
            size: 22 * 2 * 6 * 4, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
    }
    resize(width, height) {
        if (this.depthTexture)
            this.depthTexture.destroy();
        if (this.msaaTexture)
            this.msaaTexture.destroy();
        this.msaaTexture = this.device.createTexture({
            size: [width, height], format: this.format,
            sampleCount: MSAA_COUNT, usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
        this.msaaView = this.msaaTexture.createView();
        this.depthTexture = this.device.createTexture({
            size: [width, height], format: "depth24plus",
            sampleCount: MSAA_COUNT, usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
        this.depthView = this.depthTexture.createView();
    }
    /** Rebuild the bounding-box wire frame for a new half-width. */
    updateBoundingBox(half) {
        const data = buildBoundingBox(half);
        this.boxVertexCount = data.length / 6;
        this.device.queue.writeBuffer(this.boxBuffer, 0, data.buffer);
    }
    /** Update or hide the atom-placement preview and its temporary local XZ grid. */
    updateEditorPreview(position, radius = 0.25, cellSize = 0.6) {
        this.editorPreviewVisible = position !== null;
        if (!position) {
            this.editorGridVertexCount = 0;
            return;
        }
        const sphere = new Float32Array(8);
        sphere[0] = position[0];
        sphere[1] = position[1];
        sphere[2] = position[2];
        sphere[3] = radius;
        sphere[4] = 0.08;
        sphere[5] = 0.62;
        sphere[6] = 0.72;
        this.device.queue.writeBuffer(this.editorPreviewBuffer, 0, sphere.buffer);
        const extent = 5;
        const data = new Float32Array(22 * 2 * 6);
        let offset = 0;
        const vertex = (x, y, z) => {
            data[offset++] = x;
            data[offset++] = y;
            data[offset++] = z;
            data[offset++] = 0.16;
            data[offset++] = 0.34;
            data[offset++] = 0.38;
        };
        const y = position[1] - radius;
        for (let i = -extent; i <= extent; i++) {
            vertex(position[0] + i * cellSize, y, position[2] - extent * cellSize);
            vertex(position[0] + i * cellSize, y, position[2] + extent * cellSize);
            vertex(position[0] - extent * cellSize, y, position[2] + i * cellSize);
            vertex(position[0] + extent * cellSize, y, position[2] + i * cellSize);
        }
        this.editorGridVertexCount = offset / 6;
        this.device.queue.writeBuffer(this.editorGridBuffer, 0, data.buffer);
    }
    /** Call once after compute.init(), and again whenever spring topology changes. */
    setCylinderData(renderBuf, springPairsBuf) {
        this.springBindGroup = this.device.createBindGroup({
            layout: this.springBGL,
            entries: [
                { binding: 0, resource: { buffer: this.uniformBuffer } },
                { binding: 1, resource: { buffer: renderBuf } },
                { binding: 2, resource: { buffer: springPairsBuf } },
            ],
        });
    }
    /**
     * Encode all render commands into the provided encoder.
     * The caller is responsible for submitting (allows sharing encoder with compute).
     *
     * @param sphereBuf     GPU buffer produced by Compute.renderBuf
     * @param forceLineBuf  GPU buffer produced by Compute.forceLineBuf (2 verts/sphere)
     * @param sphereCount   number of active spheres
     * @param showForces    whether to draw the force-vector overlay
     */
    render(encoder, viewProj, eye, glowEnabled, showAxes, sphereBuf, forceLineBuf, sphereCount, showForces, springRenderCount) {
        // Pack uniform buffer (80 bytes)
        const ubuf = new ArrayBuffer(80);
        const f32 = new Float32Array(ubuf);
        const u32 = new Uint32Array(ubuf);
        f32.set(viewProj, 0);
        f32[16] = eye[0];
        f32[17] = eye[1];
        f32[18] = eye[2];
        u32[19] = glowEnabled ? 1 : 0;
        this.device.queue.writeBuffer(this.uniformBuffer, 0, ubuf);
        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                    view: this.msaaView,
                    resolveTarget: this.context.getCurrentTexture().createView(),
                    loadOp: "clear",
                    storeOp: "discard",
                    clearValue: { r: 0.05, g: 0.055, b: 0.08, a: 1 },
                }],
            depthStencilAttachment: {
                view: this.depthView, depthLoadOp: "clear", depthStoreOp: "store", depthClearValue: 1.0,
            },
        });
        pass.setBindGroup(0, this.bindGroup);
        // Bounding box (always)
        pass.setPipeline(this.linePipeline);
        pass.setVertexBuffer(0, this.boxBuffer);
        pass.draw(this.boxVertexCount);
        // Axes (conditional)
        if (showAxes) {
            pass.setVertexBuffer(0, this.axisBuffer);
            pass.draw(this.axisVertexCount);
        }
        if (this.editorPreviewVisible && this.editorGridVertexCount > 0) {
            pass.setVertexBuffer(0, this.editorGridBuffer);
            pass.draw(this.editorGridVertexCount);
        }
        // Spring cylinders — drawn before spheres so spheres occlude them via depth
        if (springRenderCount > 0 && this.springBindGroup) {
            pass.setPipeline(this.springPipeline);
            pass.setBindGroup(0, this.springBindGroup);
            pass.draw(8 * 6, springRenderCount); // 8 segs × 6 verts, springRenderCount instances
            // Restore the line/sphere bind group for subsequent draws
            pass.setBindGroup(0, this.bindGroup);
        }
        // Spheres
        if (sphereCount > 0) {
            pass.setPipeline(this.spherePipeline);
            pass.setVertexBuffer(0, this.sphereVertexBuffer);
            pass.setVertexBuffer(1, sphereBuf);
            pass.setIndexBuffer(this.sphereIndexBuffer, "uint16");
            pass.drawIndexed(this.sphereIndexCount, sphereCount);
        }
        if (this.editorPreviewVisible) {
            pass.setPipeline(this.spherePipeline);
            pass.setVertexBuffer(0, this.sphereVertexBuffer);
            pass.setVertexBuffer(1, this.editorPreviewBuffer);
            pass.setIndexBuffer(this.sphereIndexBuffer, "uint16");
            pass.drawIndexed(this.sphereIndexCount, 1);
        }
        // Force-vector lines — 2 pre-formatted line vertices per sphere written by compute
        if (showForces && sphereCount > 0) {
            pass.setPipeline(this.linePipeline);
            pass.setVertexBuffer(0, forceLineBuf);
            pass.draw(sphereCount * 2);
        }
        pass.end();
    }
}
//# sourceMappingURL=renderer.js.map