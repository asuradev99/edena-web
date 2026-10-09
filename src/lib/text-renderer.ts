import { multiply, type Vec3 } from './math.js';
import { embeddedFonts } from './text-fonts.js';
import { Text } from './text.js';
import { mipmaps } from './mipmaps.js';
import type { SceneEntry } from './render-list.js';

const shader = /* wgsl */ `
struct Label { camera: mat4x4<f32>, point: vec4<f32>, size: vec4<f32>, offset: vec4<f32>, tint: vec4<f32> };
@group(0) @binding(0) var<uniform> label: Label;
@group(0) @binding(1) var glyphs: texture_2d<f32>;
@group(0) @binding(2) var filtering: sampler;
struct Vertex { @builtin(position) position: vec4<f32>, @location(0) uv: vec2<f32> };
@vertex fn vertex(@builtin(vertex_index) index: u32) -> Vertex {
  let corners = array<vec2<f32>, 6>(vec2(0.,0.),vec2(1.,0.),vec2(0.,1.),vec2(0.,1.),vec2(1.,0.),vec2(1.,1.));
  let uv = corners[index];
  if (label.offset.z > .5) {
    let local = vec3((uv.x - label.size.z) * label.size.x, (label.size.w - uv.y) * label.size.y, 0.);
    var out: Vertex; out.position = label.camera * vec4(local, 1.); out.uv = uv; return out;
  }
  var clip = label.camera * vec4(label.point.xyz, 1.);
  clip.x += (uv.x - label.size.z) * label.size.x * clip.w;
  clip.y -= (uv.y - label.size.w) * label.size.y * clip.w;
  clip.x += label.offset.x * clip.w;
  clip.y -= label.offset.y * clip.w;
  var out: Vertex; out.position = clip; out.uv = uv; return out;
}
@fragment fn fragment(input: Vertex) -> @location(0) vec4<f32> {
  let color = textureSample(glyphs, filtering, input.uv);
  if (color.a * label.point.w < .01) { discard; }
  return vec4(color.rgb * label.tint.rgb, color.a) * label.point.w;
}`;

type TextResources = { pipeline: GPURenderPipeline; sampler: GPUSampler };
const resources = new WeakMap<GPUDevice, Map<string, TextResources>>();
function textResources(device: GPUDevice, format: GPUTextureFormat, samples: number): TextResources {
  let cache = resources.get(device);
  if (!cache) resources.set(device, cache = new Map());
  const key = `${format}:${samples}`;
  const existing = cache.get(key);
  if (existing) return existing;
  const module = device.createShaderModule({ code: shader, label: 'depth-tested text' });
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vertex' },
    fragment: { module, entryPoint: 'fragment', targets: [{ format, blend: {
      color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
    } }] },
    primitive: { topology: 'triangle-list' },
    multisample: { count: samples },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less-equal' },
  });
  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', maxAnisotropy: 16 });
  const value = { pipeline, sampler };
  cache.set(key, value);
  return value;
}

export type DepthLabel = {
  element: HTMLSpanElement;
  node?: Text;
  matrix?: Float32Array;
  projectedWorld?: Float32Array;
  projectedMatrix?: Float32Array;
  sceneOpacity: number;
  inScene: boolean;
  persistent: boolean;
  point: () => Vec3;
  anchor: number;
  vertical: number;
  padding: number;
  offset: [number, number];
  ready: boolean;
  drawable: boolean;
  dirty: boolean;
  pending: boolean;
  disposed: boolean;
  width: number;
  height: number;
  rasterRatio: number;
  rasterTarget: number;
  uniformSlot: number;
  texture?: GPUTexture;
  bind?: GPUBindGroup;
  data: Float32Array<ArrayBuffer>;
  observer: MutationObserver;
  resize: ResizeObserver;
  styleKey: string;
  fallback: boolean;
};

/** Rasterize only when text changes; project and depth-test the cached glyph texture on the GPU. */
export class TextRenderer {
  private labels = new Set<DepthLabel>();
  private objects = new Map<Text, DepthLabel>();
  private measurementHost?: HTMLDivElement;
  private rasterCanvas?: HTMLCanvasElement;
  private pipeline: GPURenderPipeline;
  private sampler: GPUSampler;
  private uniforms: GPUBuffer;
  private uniformData: Float32Array<ArrayBuffer>;
  private uniformCapacity = 16;
  private nextUniformSlot = 0;
  private freeUniformSlots: number[] = [];
  private uniformDirty = false;
  private pixelRatio = 0;
  private camera = new Float32Array(16).fill(NaN);
  private changed = true;
  private pendingMips = new Set<DepthLabel>();

  constructor(private device: GPUDevice, format: GPUTextureFormat, samples: number) {
    const shared = textResources(device, format, samples);
    this.pipeline = shared.pipeline; this.sampler = shared.sampler;
    this.uniforms = device.createBuffer({ size: this.uniformCapacity * 256, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.uniformData = new Float32Array(this.uniformCapacity * 64);
  }

  add(element: HTMLSpanElement, point: () => Vec3, anchor: number, vertical = .5): DepthLabel {
    const uniformSlot = this.freeUniformSlots.pop() ?? this.nextUniformSlot++;
    this.ensureUniformCapacity(uniformSlot);
    const label: DepthLabel = {
      element, point, anchor, vertical, sceneOpacity: 1, inScene: true, persistent: false, padding: 0, offset: [0, 0], ready: false, drawable: false, dirty: true, pending: false, disposed: false,
      width: 0, height: 0, rasterRatio: 0, rasterTarget: NaN, uniformSlot, styleKey: '', fallback: false, data: new Float32Array(32).fill(NaN),
      observer: new MutationObserver(records => {
        // Position/visibility are updated by LabelLayer. Only actual content/style edits need pixels.
        const key = appearance(element);
        if (key !== label.styleKey || records.some(record => record.type !== 'attributes'
          ? true
          : record.attributeName !== 'aria-hidden' && !(record.target === element && record.attributeName === 'style'))) label.dirty = true;
        label.styleKey = key;
      }),
      resize: new ResizeObserver(() => { label.dirty = true; }),
    };
    label.observer.observe(element, { childList: true, characterData: true, subtree: true, attributes: true });
    label.resize.observe(element);
    this.labels.add(label);
    this.changed = true;
    void document.fonts.ready.then(() => { if (!label.disposed) label.dirty = true; });
    return label;
  }

  addObject(node: Text, persistent = false): DepthLabel {
    const existing = this.objects.get(node);
    if (existing) return existing;
    if (!node.element.isConnected) {
      if (!this.measurementHost) {
        this.measurementHost = document.createElement('div');
        this.measurementHost.className = 'edena-text-measurement';
        Object.assign(this.measurementHost.style, { position: 'fixed', left: '-100000px', top: '0', width: 'max-content', pointerEvents: 'none' });
        this.measurementHost.setAttribute('aria-hidden', 'true');
        document.body.append(this.measurementHost);
      }
      node.element.style.display = 'inline-block';
      this.measurementHost.append(node.element);
    }
    const label = this.add(node.element, () => node.position, node.anchor, node.vertical);
    label.node = node; label.persistent = persistent;
    node.element.style.clipPath = 'inset(50%)';
    this.objects.set(node, label);
    return label;
  }

  sync(entries: readonly SceneEntry[]): void {
    for (const label of this.objects.values()) label.inScene = false;
    for (const entry of entries) if (entry.node instanceof Text) {
      const label = this.addObject(entry.node);
      label.inScene = true; label.matrix = entry.matrix;
      label.sceneOpacity = entry.opacity * entry.node.reveal * entry.node.color[3];
    }
    for (const label of this.objects.values()) if (!label.inScene && !label.persistent) this.remove(label);
  }

  remove(label: DepthLabel): void {
    if (label.disposed) return;
    label.disposed = true;
    label.observer.disconnect();
    label.resize.disconnect();
    label.texture?.destroy();
    this.freeUniformSlots.push(label.uniformSlot);
    this.labels.delete(label);
    this.pendingMips.delete(label);
    if (label.node) {
      this.objects.delete(label.node);
      if (label.element.parentElement === this.measurementHost) label.element.remove();
    }
    this.changed = true;
  }

  prepare(pixelRatio: number, camera: Float32Array, width: number, height: number): boolean {
    const cameraChanged = camera.some((value, index) => value !== this.camera[index]);
    if (cameraChanged) this.camera.set(camera);
    if (pixelRatio !== this.pixelRatio) {
      this.pixelRatio = pixelRatio;
      for (const label of this.labels) label.dirty = true;
    }
    for (const label of this.labels) {
      if (label.dirty && !label.pending && (!label.node || label.inScene)
        && label.element.style.display !== 'none') void this.rasterize(label, label.rasterRatio || pixelRatio);
      const opacity = Number(label.element.style.opacity || 1) * label.sceneOpacity;
      const point = label.point();
      const drawable = label.ready && !label.disposed && opacity > 0 && point.every(Number.isFinite)
        && label.element.style.display !== 'none' && (label.node ? label.inScene : label.element.style.visibility !== 'hidden');
      if (label.drawable !== drawable) { label.drawable = drawable; this.changed = true; }
      if (!drawable) {
        if (label.node && label.element.parentElement !== this.measurementHost) {
          if (label.element.style.visibility !== 'hidden') label.element.style.visibility = 'hidden';
          if (label.element.getAttribute('aria-hidden') !== 'true') label.element.setAttribute('aria-hidden', 'true');
        }
        continue;
      }
      const data = label.data;
      let changed = false;
      const put = (index: number, value: number) => {
        value = Math.fround(value);
        if (data[index] !== value) { data[index] = value; changed = true; }
      };
      if (label.node && label.matrix && (cameraChanged || label.projectedWorld !== label.matrix)) {
        label.projectedMatrix = multiply(camera, label.matrix);
        label.projectedWorld = label.matrix;
      }
      const matrix = label.projectedMatrix ?? camera;
      if (label.node && label.element.parentElement !== this.measurementHost) {
        const w = matrix[15], x = (matrix[12] / w + 1) * width / 2, y = (1 - matrix[13] / w) * height / 2;
        const visible = w > 0 && matrix[14] >= 0 && matrix[14] <= w && x >= 0 && x <= width && y >= 0 && y <= height;
        const element = label.element, visibility = visible ? 'visible' : 'hidden', hidden = visible ? 'false' : 'true';
        if (element.style.visibility !== visibility) element.style.visibility = visibility;
        if (element.getAttribute('aria-hidden') !== hidden) element.setAttribute('aria-hidden', hidden);
        if (visible) {
          const translation = `${x - (parseFloat(element.style.marginLeft) || 0)}px ${y - (parseFloat(element.style.marginTop) || 0)}px`;
          if (element.style.translate !== translation) element.style.translate = translation;
        }
      }
      for (let i = 0; i < 16; i++) put(i, matrix[i]);
      for (let i = 0; i < 3; i++) put(16 + i, point[i]);
      put(19, Math.min(1, opacity));
      const unit = label.node ? label.node.height / (label.height - 2 * label.padding) : 0;
      // Keep the glyph texture within about a fifth of one texel per screen pixel, so text is
      // crisp both zoomed in and zoomed out. Re-rasterize only when the on-screen density crosses a
      // half-step bucket; comparing against the requested target (not the clamped result) means a
      // texture capped by the device limit cannot retrigger every frame, and the deadband stops a
      // density sitting on a bucket edge from thrashing.
      if (label.node && label.ready && label.width > 0 && !label.pending && matrix[15] > 0) {
        const w = matrix[15], w2 = w * w;
        let density = 0;
        for (let i = 0; i <= 4; i += 4) density = Math.max(density, Math.hypot(
          (matrix[i] * w - matrix[12] * matrix[i + 3]) * width / (2 * w2),
          (matrix[i + 1] * w - matrix[13] * matrix[i + 3]) * height / (2 * w2)));
        density *= unit * pixelRatio;
        if (Number.isFinite(density) && density > 0) {
          const exponent = Math.log2(density);
          if (!Number.isFinite(label.rasterTarget) || Math.abs(exponent - label.rasterTarget) > .3) {
            const required = Math.max(.125, Math.min(16, 2 ** (Math.round(exponent * 2) / 2)));
            const limit = this.device.limits.maxTextureDimension2D / Math.max(label.width, label.height);
            label.rasterTarget = exponent;
            void this.rasterize(label, Math.min(required, limit));
          }
        }
      }
      put(20, label.node ? label.width * unit : 2 * label.width / width);
      put(21, label.node ? label.height * unit : 2 * label.height / height);
      if (label.node) { label.anchor = label.node.anchor; label.vertical = label.node.vertical; }
      put(22, (label.padding + (label.width - 2 * label.padding) * label.anchor) / label.width);
      put(23, (label.padding + (label.height - 2 * label.padding) * label.vertical) / label.height);
      put(24, 2 * label.offset[0] / width);
      put(25, 2 * label.offset[1] / height);
      put(26, label.node ? 1 : 0); put(27, 0);
      for (let i = 0; i < 3; i++) put(28 + i, label.node?.color[i] ?? 1);
      put(31, 1);
      if (changed) {
        this.uniformData.set(data, label.uniformSlot * 64);
        this.uniformDirty = true;
        this.changed = true;
      }
    }
    if (this.uniformDirty) {
      this.device.queue.writeBuffer(this.uniforms, 0, this.uniformData);
      this.uniformDirty = false;
    }
    return this.changed;
  }

  prepareMipmaps(encoder: GPUCommandEncoder): void {
    if (!this.pendingMips.size) return;
    const generator = mipmaps(this.device);
    for (const label of this.pendingMips) if (label.texture) generator.generate(encoder, label.texture);
    this.pendingMips.clear();
  }

  draw(pass: GPURenderPassEncoder): void {
    this.changed = false;
    if (!this.labels.size) return;
    pass.setPipeline(this.pipeline);
    for (const label of this.labels) {
      if (!label.drawable || !label.bind) continue;
      pass.setBindGroup(0, label.bind);
      pass.draw(6);
    }
  }

  private async rasterize(label: DepthLabel, ratio: number): Promise<void> {
    label.pending = true;
    label.dirty = false;
    try {
      const source = label.element;
      source.getBoundingClientRect(); // Start any font loads required by newly inserted content.
      await document.fonts.ready;
      if (label.disposed) return;
      const bounds = source.getBoundingClientRect();
      // ResizeObserver or a content mutation retries once hidden/empty text has a layout.
      if (!bounds.width || !bounds.height) {
        if (label.ready) { label.ready = false; label.drawable = false; this.changed = true; }
        return;
      }
      const clone = source.cloneNode(true) as HTMLElement;
      const originals = [source, ...source.querySelectorAll('*')];
      const copies = [clone, ...clone.querySelectorAll('*')];
      const fontCSS = await embeddedFonts(originals);
      if (label.disposed) return;
      // SVG foreignObject preserves browser MathML layout. Inline computed styles so page
      // selectors and inherited fonts survive in the isolated image document.
      for (let i = 0; i < originals.length; i++) {
        const style = getComputedStyle(originals[i]);
        const target = copies[i] as HTMLElement;
        target.style.textShadow = 'none';
        for (const property of ['color','font-family','font-size','font-style','font-weight','font-kerning','font-feature-settings','font-variant-numeric','text-transform','font-synthesis','line-height','letter-spacing','white-space','padding','background-color','border-radius','display','math-style','math-depth']) {
          target.style.setProperty(property, style.getPropertyValue(property));
        }
      }
      Object.assign(clone.style, { position: 'static', transform: 'none', translate: 'none', visibility: 'visible', opacity: '1', margin: '0', clipPath: 'none' });
      // Font advance boxes omit italic overhang and some MathML ink. A transparent gutter keeps
      // the last glyph and superscripts intact without changing the label's alignment.
      const padding = Math.ceil(parseFloat(getComputedStyle(source).fontSize) * .35) + 2;
      const width = Math.ceil(bounds.width) + 2 * padding, height = Math.ceil(bounds.height) + 2 * padding;
      clone.style.width = `${bounds.width}px`;
      clone.style.boxSizing = 'border-box';
      const markup = new XMLSerializer().serializeToString(clone);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><style>${fontCSS.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</style><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="padding:${padding}px">${markup}</div></foreignObject></svg>`;
      // A data URL keeps foreignObject canvases origin-clean in Chromium.
      const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      const image = new Image(); image.src = url; await image.decode();
      if (label.disposed) return;
      const canvas = this.rasterCanvas ??= document.createElement('canvas');
      const rasterRatio = Math.min(Math.max(.125, ratio), this.device.limits.maxTextureDimension2D / Math.max(width, height));
      const pixelWidth = Math.max(1, Math.ceil(width * rasterRatio)), pixelHeight = Math.max(1, Math.ceil(height * rasterRatio));
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      const context = canvas.getContext('2d')!;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const resized = !label.texture || label.texture.width !== pixelWidth || label.texture.height !== pixelHeight;
      const texture = resized ? this.device.createTexture({ size: [pixelWidth, pixelHeight], format: 'rgba8unorm',
        mipLevelCount: 1 + Math.floor(Math.log2(Math.max(pixelWidth, pixelHeight))),
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT }) : label.texture!;
      this.device.queue.copyExternalImageToTexture({ source: canvas }, { texture, premultipliedAlpha: true }, [pixelWidth, pixelHeight]);
      if (resized) { label.texture?.destroy(); label.texture = texture; this.bind(label); }
      this.pendingMips.add(label);
      label.width = width; label.height = height; label.padding = padding; label.rasterRatio = rasterRatio;
      label.element.style.clipPath = 'inset(50%)';
      label.fallback = false; label.ready = true; this.changed = true;
    } catch (error) {
      if (label.disposed) return;
      // Keep the last good texture after a failed update. World text must never turn into
      // an untransformed DOM overlay when a font or image cannot be loaded.
      label.fallback = !label.node && !label.ready;
      label.element.style.clipPath = label.fallback ? '' : 'inset(50%)';
      this.changed = true;
      console.warn('Could not rasterize scene text:', error);
    } finally { label.pending = false; }
  }

  dispose(): void {
    for (const label of this.labels) this.remove(label);
    this.uniforms.destroy();
    this.measurementHost?.remove();
    this.rasterCanvas = undefined;
  }

  private ensureUniformCapacity(slot: number): void {
    if (slot < this.uniformCapacity) return;
    const old = this.uniforms;
    while (slot >= this.uniformCapacity) this.uniformCapacity *= 2;
    const data = new Float32Array(this.uniformCapacity * 64);
    data.set(this.uniformData);
    this.uniformData = data;
    this.uniforms = this.device.createBuffer({ size: this.uniformCapacity * 256, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(this.uniforms, 0, data);
    old.destroy();
    for (const label of this.labels) if (label.texture) this.bind(label);
  }

  private bind(label: DepthLabel): void {
    if (!label.texture) return;
    label.bind = this.device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: this.uniforms, offset: label.uniformSlot * 256, size: 128 } },
      { binding: 1, resource: label.texture.createView() }, { binding: 2, resource: this.sampler },
    ] });
  }
}

// Exclude placement, visibility and opacity: these change without changing glyph pixels.
function appearance(element: HTMLElement): string {
  const style = element.style;
  return [style.color, style.font, style.letterSpacing, style.lineHeight, style.padding,
    style.background, style.border, style.textShadow, style.whiteSpace].join('|');
}
