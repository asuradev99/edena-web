import { World } from './world.js';
import { OrbitCamera } from './camera.js';
import { RenderList } from './render-list.js';
import { FrameState } from './frame-state.js';
import { viewPipelines } from './view-pipelines.js';
import { Text } from './text.js';
import { TextRenderer } from './text-renderer.js';
import { LineRenderer } from './line-renderer.js';
import { VIEW_OF_CAMERA } from './view-registry.js';
export { viewFor } from './view-registry.js';
export { LabelLayer } from './labels.js';
function destroyBatch(batch) {
    batch.instances.destroy();
    batch.uniform.destroy();
    batch.wireUniform.destroy();
}
const clampDpr = (value) => Number.isFinite(value) ? Math.min(3, Math.max(.5, value)) : 2;
/** Default colour of a mesh's contour lines: white, the one value that reads on every hue here. */
const WHITE_WIRE = [1, 1, 1, 1];
export class WebGPUView {
    canvas;
    device;
    ownsDevice;
    maxDpr;
    samples;
    alphaMode;
    resolutionScale;
    world = new World();
    gpuLayers = new Map();
    addGpuLayer(create) {
        const layer = create(this.device, this.format, this.samples);
        this.gpuLayers.set(layer, -1);
        this.frameValid = false;
        return layer;
    }
    camera = new OrbitCamera();
    /** The drawables of the most recent frame, for overlays that need to know what is on screen. */
    lastScene = [];
    /** Everything drawn in the last frame: node, world matrix and inherited opacity. */
    get scene() { return this.lastScene; }
    /** Adapter the view was created on; undefined when a caller supplied its own device. */
    adapterInfo;
    /** True when the browser handed us a software/fallback adapter (expect poor frame rates). */
    isFallbackAdapter = false;
    context;
    pipeline;
    pipelineColored;
    translucent;
    translucentColored;
    lineRenderer;
    get lines() {
        return this.lineRenderer ??= new LineRenderer(this.device, this.bindGroupLayout, this.format, this.samples);
    }
    bindGroupLayout;
    format;
    depth;
    msaa;
    geometry = new Map();
    batches = new Map();
    geometryIds = new WeakMap();
    nextGeometryId = 1;
    materialKeys = new WeakMap();
    materialKey(node, geometryId) {
        const color = node.color, wire = node.wireframe ?? node.geometry.wireframe;
        const wireColor = node.wireframeColor ?? WHITE_WIRE;
        const cached = this.materialKeys.get(node);
        if (cached && cached.values[0] === geometryId && cached.values[1] === wire
            && cached.values[2] === color[0] && cached.values[3] === color[1]
            && cached.values[4] === color[2] && cached.values[5] === color[3]
            && cached.values[6] === wireColor[0] && cached.values[7] === wireColor[1]
            && cached.values[8] === wireColor[2] && cached.values[9] === wireColor[3])
            return cached.key;
        const values = [geometryId, wire, ...color, ...wireColor];
        const key = values.join(':');
        this.materialKeys.set(node, { values, key });
        return key;
    }
    stopped = false;
    pendingResize = true;
    dpr = 0;
    cleanup;
    observer;
    visibility;
    /**
     * Called when the canvas changes size, with the new size in CSS pixels, so a demo can re-fit its
     * camera. A plot that frames its domain at one aspect ratio clips at another, and the panels here
     * are responsive.
     */
    onResize;
    uniforms = new Float32Array(20);
    renderList = new RenderList();
    frameState = new FrameState();
    frameMaterials = [];
    translucentEntries = [];
    translucentPool = [];
    frameValid = false;
    textRenderer;
    /** Internal text registration shared by label layers using this camera. */
    get text() {
        return this.textRenderer ??= new TextRenderer(this.device, this.format, this.samples);
    }
    constructor(canvas, device, ownsDevice, onError, interactive, maxDpr, samples, alphaMode, resolutionScale) {
        this.canvas = canvas;
        this.device = device;
        this.ownsDevice = ownsDevice;
        this.maxDpr = maxDpr;
        this.samples = samples;
        this.alphaMode = alphaMode;
        this.resolutionScale = resolutionScale;
        const context = canvas.getContext('webgpu');
        if (!context)
            throw new Error('Could not create WebGPU canvas');
        this.context = context;
        this.format = navigator.gpu.getPreferredCanvasFormat();
        context.configure({ device, format: this.format, alphaMode: this.alphaMode });
        const pipelines = viewPipelines(device, this.format, this.samples);
        this.bindGroupLayout = pipelines.bindGroupLayout;
        this.pipeline = pipelines.pipeline;
        this.pipelineColored = pipelines.pipelineColored;
        this.translucent = pipelines.translucent;
        this.translucentColored = pipelines.translucentColored;
        this.cleanup = interactive ? this.camera.attach(canvas) : () => { };
        // ResizeObserver marks the view dirty; render() only reads canvas size when it actually changed.
        this.observer = new ResizeObserver(() => { this.pendingResize = true; this.onResize?.(canvas.clientWidth, canvas.clientHeight); });
        this.observer.observe(canvas);
        this.visibility = new IntersectionObserver(entries => { if (!entries[0].isIntersecting)
            this.releaseRenderTargets(); });
        this.visibility.observe(canvas);
        this.resize();
        void device.lost.then(info => { if (!this.stopped) {
            this.stopped = true;
            onError(`GPU device lost: ${info.message || info.reason}. Reload to reconnect.`);
        } });
    }
    static async create(canvas, options = {}) {
        if (!navigator.gpu)
            throw new Error('WebGPU is unavailable. Open this page on localhost or HTTPS in a WebGPU-capable browser.');
        const samples = options.samples ?? (options.antialias === false ? 1 : 4);
        if (samples !== 1 && samples !== 4)
            throw new Error('samples must be 1 or 4');
        // Prefer the discrete GPU; fall back to whatever adapter exists.
        const adapter = options.device ? undefined : (await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })) ?? await navigator.gpu.requestAdapter();
        if (!options.device && !adapter)
            throw new Error('No WebGPU adapter is available. Enable hardware acceleration or try another browser.');
        // Ask for timestamp queries when the adapter has them, so callers can measure GPU work on
        // this device (for example GpuParticleSimulation.measure). Purely optional: without the
        // feature the request is unchanged and timing helpers report "unsupported".
        const features = adapter?.features.has('timestamp-query') ? ['timestamp-query'] : [];
        const device = options.device ?? await adapter.requestDevice({ requiredFeatures: features });
        const view = new WebGPUView(canvas, device, !options.device, options.onError ?? console.error, options.interactive ?? true, clampDpr(options.maxDpr ?? 2), samples, options.alphaMode ?? 'premultiplied', options.antialias === 'high' ? 2 : 1);
        VIEW_OF_CAMERA.set(view.camera, view);
        if (adapter) {
            view.adapterInfo = adapter.info;
            view.isFallbackAdapter = !!adapter.isFallbackAdapter;
        }
        return view;
    }
    resize() {
        if (this.stopped)
            return;
        this.pendingResize = false;
        this.dpr = Math.min(devicePixelRatio || 1, this.maxDpr) * this.resolutionScale;
        const limit = this.device.limits.maxTextureDimension2D;
        const width = Math.min(limit, Math.max(1, Math.round(this.canvas.clientWidth * this.dpr))), height = Math.min(limit, Math.max(1, Math.round(this.canvas.clientHeight * this.dpr)));
        if (width === this.canvas.width && height === this.canvas.height)
            return;
        this.frameValid = false;
        this.canvas.width = width;
        this.canvas.height = height;
        this.releaseRenderTargets();
    }
    /** Release viewport-sized targets while retaining reusable scene buffers and glyphs. */
    releaseRenderTargets() {
        this.depth?.destroy();
        this.msaa?.destroy();
        this.depth = undefined;
        this.msaa = undefined;
        this.frameValid = false;
    }
    ensureRenderTargets() {
        if (this.depth)
            return;
        const size = [this.canvas.width, this.canvas.height];
        this.depth = this.device.createTexture({ size, format: 'depth24plus', sampleCount: this.samples, usage: GPUTextureUsage.RENDER_ATTACHMENT });
        this.msaa = this.samples > 1 ? this.device.createTexture({ size, format: this.format, sampleCount: this.samples, usage: GPUTextureUsage.RENDER_ATTACHMENT }) : undefined;
    }
    /** Draw changed scene state. Force a submission when capturing a fresh canvas texture. */
    render(force = false) {
        if (this.stopped)
            return;
        if (this.canvas.dataset.mode !== this.camera.mode)
            this.canvas.dataset.mode = this.camera.mode;
        // Reading devicePixelRatio is layout-free; canvas.clientWidth is only read when the observer fired.
        if (this.pendingResize || Math.min(devicePixelRatio || 1, this.maxDpr) * this.resolutionScale !== this.dpr)
            this.resize();
        const camera = this.camera.matrix(this.canvas.width / this.canvas.height);
        const entries = this.renderList.collect(this.world, camera);
        this.lastScene = entries;
        if (this.textRenderer || entries.some(entry => entry.node instanceof Text))
            this.text.sync(entries);
        for (let i = 0; i < entries.length; i++) {
            const node = entries[i].node;
            let id = this.geometryIds.get(node.geometry);
            if (id === undefined) {
                id = this.nextGeometryId++;
                this.geometryIds.set(node.geometry, id);
            }
            this.frameMaterials[i] = this.materialKey(node, id);
        }
        this.frameMaterials.length = entries.length;
        const sceneChanged = this.frameState.changed(camera, entries, this.frameMaterials);
        const textChanged = this.textRenderer?.prepare(this.dpr, camera, this.canvas.width / this.dpr, this.canvas.height / this.dpr);
        const layersChanged = [...this.gpuLayers].some(([layer, revision]) => layer.revision !== revision);
        if (!force && this.frameValid && !sceneChanged && !textChanged && !layersChanged)
            return;
        this.ensureRenderTargets();
        const encoder = this.device.createCommandEncoder();
        this.textRenderer?.prepareMipmaps(encoder);
        for (const layer of this.gpuLayers.keys()) {
            layer.prepare(encoder, camera, this.canvas.width, this.canvas.height);
            this.gpuLayers.set(layer, layer.revision);
        }
        const target = this.context.getCurrentTexture().createView();
        const clearValue = { r: 0, g: 0, b: 0, a: this.alphaMode === 'opaque' ? 1 : 0 };
        const colorAttachment = this.samples > 1
            ? { view: this.msaa.createView(), resolveTarget: target, clearValue, loadOp: 'clear', storeOp: 'discard' }
            : { view: target, clearValue, loadOp: 'clear', storeOp: 'store' };
        const pass = encoder.beginRenderPass({ colorAttachments: [colorAttachment], depthStencilAttachment: { view: this.depth.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard' } });
        for (const layer of this.gpuLayers.keys())
            layer.drawOpaque(pass);
        const usedGeometry = new Set(), usedBatches = new Set();
        const groups = new Map();
        const translucent = this.translucentEntries;
        let translucentCount = 0;
        const append = (entry, key, transparent) => {
            let group = groups.get(key);
            if (!group) {
                const node = entry.node;
                group = { geometry: node.geometry, color: node.color, wireColor: node.wireframeColor ?? WHITE_WIRE,
                    instances: [], transparent, wire: node.wireframe ?? node.geometry.wireframe };
                groups.set(key, group);
            }
            group.instances.push(entry);
        };
        for (let index = 0; index < entries.length; index++) {
            const entry = entries[index];
            const { node, matrix, opacity } = entry;
            const geometry = node.geometry;
            const alpha = node.color[3] * opacity * node.reveal;
            if (alpha <= .001 || (!geometry.vertices.length && !geometry.segments?.length))
                continue;
            usedGeometry.add(geometry);
            const material = this.frameMaterials[index];
            if (alpha >= 1)
                append(entry, material, false);
            else {
                const z = camera[2] * matrix[12] + camera[6] * matrix[13] + camera[10] * matrix[14] + camera[14];
                const w = camera[3] * matrix[12] + camera[7] * matrix[13] + camera[11] * matrix[14] + camera[15];
                let order = this.translucentPool[translucentCount];
                if (!order)
                    this.translucentPool[translucentCount] = order = { entry, material, depth: 0 };
                order.entry = entry;
                order.material = material;
                order.depth = z / (w || 1);
                translucent[translucentCount++] = order;
            }
        }
        translucent.length = translucentCount;
        this.translucentPool.length = translucentCount;
        this.lineRenderer?.begin(usedGeometry);
        // Sort individual translucent objects before batching adjacent matching materials. Instances
        // retain this order, so one draw can blend thousands of identical meshes correctly.
        translucent.sort((a, b) => b.depth - a.depth);
        let previous = '', run = 0;
        for (const order of translucent) {
            const { entry, material } = order;
            if (material !== previous) {
                run++;
                previous = material;
            }
            append(entry, `${material}:t${run}`, true);
        }
        // Geometry rebuilt by an animation can reuse the previous frame's retired buffers.
        // Queue ordering keeps earlier draws ahead of these writes, without a CPU/GPU wait.
        const spareGeometry = [];
        for (const [geometry, buffers] of this.geometry)
            if (!usedGeometry.has(geometry)) {
                spareGeometry.push(buffers.positions);
                if (buffers.colors)
                    spareGeometry.push(buffers.colors);
                this.geometry.delete(geometry);
            }
        // A tint animation changes the material key every frame. Reassign retired batches before
        // allocating new ones: their uniform/instance buffers do not depend on geometry or material.
        const spareBatches = [];
        for (const [key, batch] of this.batches)
            if (!groups.has(key)) {
                this.batches.delete(key);
                spareBatches.push(batch);
            }
        let textDrawn = false;
        const drawText = () => {
            this.textRenderer?.draw(pass);
            for (const layer of this.gpuLayers.keys())
                layer.drawTransparent(pass);
            textDrawn = true;
        };
        for (const [key, group] of groups) {
            if (group.transparent && !textDrawn)
                drawText();
            const g = group.geometry;
            let buffers = this.geometry.get(g);
            if (!buffers) {
                const positions = this.uploadGeometry(g.vertices, spareGeometry);
                const colors = g.colors ? this.uploadGeometry(g.colors, spareGeometry) : undefined;
                buffers = { positions, colors };
                this.geometry.set(g, buffers);
            }
            let batch = this.batches.get(key);
            const count = group.instances.length, needed = count * 17;
            if (!batch && spareBatches.length) {
                batch = spareBatches.pop();
                this.batches.set(key, batch);
            }
            if (!batch) {
                const uniform = this.device.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
                const wireUniform = this.device.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
                const capacity = Math.max(1, count);
                batch = { matrices: [], instances: this.device.createBuffer({ size: capacity * 68, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST }), uniform, wireUniform, capacity, data: new Float32Array(capacity * 17), uniformData: new Float32Array(20).fill(NaN), wireData: new Float32Array(20).fill(NaN), uploadedCount: 0, bind: this.device.createBindGroup({ layout: this.bindGroupLayout, entries: [{ binding: 0, resource: { buffer: uniform } }] }), wireBind: this.device.createBindGroup({ layout: this.bindGroupLayout, entries: [{ binding: 0, resource: { buffer: wireUniform } }] }) };
                this.batches.set(key, batch);
            }
            else if (batch.capacity < count) {
                batch.instances.destroy();
                batch.capacity = Math.max(count, batch.capacity * 2);
                batch.instances = this.device.createBuffer({ size: batch.capacity * 68, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
                batch.data = new Float32Array(batch.capacity * 17);
                batch.matrices = [];
                batch.uploadedCount = 0;
            }
            this.uniforms.set(camera, 0);
            this.uniforms.set(group.color, 16);
            if (this.uniforms.some((value, index) => value !== batch.uniformData[index])) {
                batch.uniformData.set(this.uniforms);
                this.device.queue.writeBuffer(batch.uniform, 0, batch.uniformData);
            }
            // Public transforms are freely mutable, so compare their packed Float32 values rather than
            // requiring callers to set a dirty flag. Static batches and camera-only motion need no
            // instance upload. Upload only the changed interval for sparse particle/node movement.
            let first = needed, last = -1;
            for (let instance = 0; instance < count; instance++) {
                const entry = group.instances[instance];
                const alpha = Math.fround(entry.opacity * entry.node.reveal);
                const base = instance * 17;
                if (base < batch.uploadedCount && batch.matrices[instance] === entry.matrix && batch.data[base + 16] === alpha)
                    continue;
                batch.matrices[instance] = entry.matrix;
                for (let component = 0; component < 17; component++) {
                    const i = instance * 17 + component;
                    const value = component < 16 ? entry.matrix[component] : alpha;
                    if (i >= batch.uploadedCount || value !== batch.data[i]) {
                        batch.data[i] = value;
                        first = Math.min(first, i);
                        last = i;
                    }
                }
            }
            if (last >= first)
                this.device.queue.writeBuffer(batch.instances, first * 4, batch.data, first, last - first + 1);
            batch.uploadedCount = needed;
            batch.matrices.length = count;
            if (buffers.colors) {
                pass.setPipeline(group.transparent ? this.translucentColored : this.pipelineColored);
                pass.setBindGroup(0, batch.bind);
                pass.setVertexBuffer(0, buffers.positions);
                pass.setVertexBuffer(1, buffers.colors);
                pass.setVertexBuffer(2, batch.instances);
            }
            else {
                pass.setPipeline(group.transparent ? this.translucent : this.pipeline);
                pass.setBindGroup(0, batch.bind);
                pass.setVertexBuffer(0, buffers.positions);
                pass.setVertexBuffer(1, batch.instances);
            }
            if (g.vertices.length)
                pass.draw(Math.floor(g.vertices.length / 3), count);
            if (g.segments?.length)
                this.lines.draw(pass, g, false, batch.bind, batch.instances, count, group.transparent, this.canvas.width, this.canvas.height, this.dpr);
            usedBatches.add(key);
            // Contours for a mesh drawn in one flat colour: the faces are the same shade everywhere, so
            // without a line a box and a ball are both flat silhouettes. Only opaque flat meshes get it — a
            // translucent solid is deliberately see-through (and usually carries its own outline), and
            // per-vertex-coloured geometry already varies across its surface. White by default, because the
            // meshes here are mid-tone and a white grid reads on all of them.
            if (!group.transparent && group.wire && !buffers.colors && g.outline) {
                const [wr, wg, wb, wa] = group.wireColor;
                this.uniforms.set(camera, 0);
                this.uniforms.set([wr, wg, wb, wa], 16);
                if (this.uniforms.some((value, index) => value !== batch.wireData[index])) {
                    batch.wireData.set(this.uniforms);
                    this.device.queue.writeBuffer(batch.wireUniform, 0, batch.wireData);
                }
                this.lines.draw(pass, g, true, batch.wireBind, batch.instances, count, false, this.canvas.width, this.canvas.height, this.dpr);
            }
        }
        if (!textDrawn)
            drawText();
        pass.end();
        this.device.queue.submit([encoder.finish()]);
        this.frameValid = true;
        this.lineRenderer?.finish();
        for (const batch of spareBatches) {
            destroyBatch(batch);
        }
        for (const [key, batch] of this.batches)
            if (!usedBatches.has(key)) {
                destroyBatch(batch);
                this.batches.delete(key);
            }
        for (const buffer of spareGeometry)
            buffer.destroy();
    }
    uploadGeometry(data, spare) {
        const size = Math.max(4, data.byteLength);
        if (size > this.device.limits.maxBufferSize)
            throw new Error('Geometry exceeds GPU buffer limit');
        let buffer;
        for (let i = spare.length - 1; i >= 0; i--) {
            if (spare[i].size >= size && spare[i].size <= size * 2) {
                buffer = spare[i];
                spare[i] = spare[spare.length - 1];
                spare.pop();
                break;
            }
        }
        buffer ??= this.device.createBuffer({ size, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
        this.device.queue.writeBuffer(buffer, 0, data);
        return buffer;
    }
    dispose() {
        for (const layer of this.gpuLayers.keys())
            layer.dispose();
        this.gpuLayers.clear();
        VIEW_OF_CAMERA.delete(this.camera);
        this.textRenderer?.dispose();
        this.lineRenderer?.dispose();
        this.stopped = true;
        this.cleanup();
        this.observer.disconnect();
        this.visibility.disconnect();
        this.releaseRenderTargets();
        for (const b of this.geometry.values()) {
            b.positions.destroy();
            b.colors?.destroy();
        }
        for (const batch of this.batches.values()) {
            destroyBatch(batch);
        }
        this.geometry.clear();
        this.batches.clear();
        this.context.unconfigure();
        if (this.ownsDevice)
            this.device.destroy();
    }
}
//# sourceMappingURL=view.js.map