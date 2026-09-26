import type { Vec3 } from './math.js';

const shader = /* wgsl */ `
struct Label { camera: mat4x4<f32>, point: vec4<f32>, size: vec4<f32> };
@group(0) @binding(0) var<uniform> label: Label;
@group(0) @binding(1) var glyphs: texture_2d<f32>;
@group(0) @binding(2) var filtering: sampler;
struct Vertex { @builtin(position) position: vec4<f32>, @location(0) uv: vec2<f32> };
@vertex fn vertex(@builtin(vertex_index) index: u32) -> Vertex {
  let corners = array<vec2<f32>, 6>(vec2(0.,0.),vec2(1.,0.),vec2(0.,1.),vec2(0.,1.),vec2(1.,0.),vec2(1.,1.));
  let uv = corners[index];
  var clip = label.camera * vec4(label.point.xyz, 1.);
  clip.x += (uv.x - label.size.z) * label.size.x * clip.w;
  clip.y -= (uv.y - .5) * label.size.y * clip.w;
  var out: Vertex; out.position = clip; out.uv = uv; return out;
}
@fragment fn fragment(input: Vertex) -> @location(0) vec4<f32> {
  let color = textureSample(glyphs, filtering, input.uv);
  if (color.a * label.point.w < .01) { discard; }
  return vec4(color.rgb, color.a * label.point.w);
}`;

export type DepthLabel = {
  element: HTMLSpanElement;
  point: () => Vec3;
  anchor: number;
  ready: boolean;
  drawable: boolean;
  dirty: boolean;
  pending: boolean;
  disposed: boolean;
  width: number;
  height: number;
  texture?: GPUTexture;
  uniform: GPUBuffer;
  bind?: GPUBindGroup;
  data: Float32Array<ArrayBuffer>;
  observer: MutationObserver;
  resize: ResizeObserver;
  styleKey: string;
};

/** Rasterize only when text changes; project and depth-test the cached glyph texture on the GPU. */
export class TextRenderer {
  private labels = new Set<DepthLabel>();
  private pipeline: GPURenderPipeline;
  private sampler: GPUSampler;
  private pixelRatio = 0;
  private changed = true;

  constructor(private device: GPUDevice, format: GPUTextureFormat, samples: number) {
    const module = device.createShaderModule({ code: shader, label: 'depth-tested text' });
    this.pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vertex' },
      fragment: { module, entryPoint: 'fragment', targets: [{ format, blend: {
        color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
      } }] },
      primitive: { topology: 'triangle-list' },
      multisample: { count: samples },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less-equal' },
    });
    this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
  }

  add(element: HTMLSpanElement, point: () => Vec3, anchor: number): DepthLabel {
    const label: DepthLabel = {
      element, point, anchor, ready: false, drawable: false, dirty: true, pending: false, disposed: false,
      width: 0, height: 0, styleKey: '', data: new Float32Array(24).fill(NaN),
      uniform: this.device.createBuffer({ size: 96, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }),
      observer: new MutationObserver(records => {
        // Position/visibility are updated by LabelLayer. Only actual content/style edits need pixels.
        const key = appearance(element);
        if (key !== label.styleKey || records.some(record => record.type !== 'attributes' || record.target !== element || record.attributeName !== 'style')) label.dirty = true;
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

  remove(label: DepthLabel): void {
    label.disposed = true;
    label.observer.disconnect();
    label.resize.disconnect();
    label.texture?.destroy();
    label.uniform.destroy();
    this.labels.delete(label);
    this.changed = true;
  }

  prepare(pixelRatio: number, camera: Float32Array, width: number, height: number): boolean {
    if (pixelRatio !== this.pixelRatio) {
      this.pixelRatio = pixelRatio;
      for (const label of this.labels) label.dirty = true;
    }
    for (const label of this.labels) {
      if (label.dirty && !label.pending) void this.rasterize(label, pixelRatio);
      const opacity = Number(label.element.style.opacity || 1);
      const point = label.point();
      const drawable = label.ready && !label.disposed && opacity > 0 && point.every(Number.isFinite)
        && label.element.style.display !== 'none' && label.element.style.visibility !== 'hidden';
      if (label.drawable !== drawable) { label.drawable = drawable; this.changed = true; }
      if (!drawable) continue;
      const data = label.data;
      let changed = false;
      const put = (index: number, value: number) => {
        value = Math.fround(value);
        if (data[index] !== value) { data[index] = value; changed = true; }
      };
      for (let i = 0; i < 16; i++) put(i, camera[i]);
      for (let i = 0; i < 3; i++) put(16 + i, point[i]);
      put(19, Math.min(1, opacity)); put(20, 2 * label.width / width); put(21, 2 * label.height / height);
      put(22, label.anchor); put(23, 0);
      if (changed) { this.device.queue.writeBuffer(label.uniform, 0, data); this.changed = true; }
    }
    return this.changed;
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
      const bounds = source.getBoundingClientRect();
      if (!bounds.width || !bounds.height) { label.dirty = true; return; }
      const clone = source.cloneNode(true) as HTMLElement;
      const originals = [source, ...source.querySelectorAll('*')];
      const copies = [clone, ...clone.querySelectorAll('*')];
      // SVG foreignObject preserves browser MathML layout. Inline computed styles so page
      // selectors and inherited fonts survive in the isolated image document.
      for (let i = 0; i < originals.length; i++) {
        const style = getComputedStyle(originals[i]);
        const target = copies[i] as HTMLElement;
        for (const property of ['color','font-family','font-size','font-style','font-weight','line-height','letter-spacing','white-space','padding','background-color','border-radius','text-shadow','display','math-style','math-depth']) {
          target.style.setProperty(property, style.getPropertyValue(property));
        }
      }
      Object.assign(clone.style, { position: 'static', transform: 'none', translate: 'none', visibility: 'visible', opacity: '1', margin: '0', clipPath: 'none' });
      const width = Math.ceil(bounds.width), height = Math.ceil(bounds.height);
      const markup = new XMLSerializer().serializeToString(clone);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${markup}</foreignObject></svg>`;
      // A data URL keeps foreignObject canvases origin-clean in Chromium.
      const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      const image = new Image(); image.src = url; await image.decode();
      if (label.disposed) return;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(width * ratio)); canvas.height = Math.max(1, Math.ceil(height * ratio));
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const texture = this.device.createTexture({ size: [canvas.width, canvas.height], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
      this.device.queue.copyExternalImageToTexture({ source: canvas }, { texture }, [canvas.width, canvas.height]);
      label.texture?.destroy(); label.texture = texture;
      label.bind = this.device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [
        { binding: 0, resource: { buffer: label.uniform } }, { binding: 1, resource: texture.createView() }, { binding: 2, resource: this.sampler },
      ] });
      label.width = width; label.height = height; label.ready = true; this.changed = true;
    } catch (error) {
      // Retain the DOM fallback if a browser cannot rasterize this label's content.
      console.warn('Could not rasterize scene text:', error);
    } finally { label.pending = false; }
  }

  dispose(): void { for (const label of this.labels) this.remove(label); }
}

// Exclude placement, visibility and opacity: these change without changing glyph pixels.
function appearance(element: HTMLElement): string {
  const style = element.style;
  return [style.color, style.font, style.letterSpacing, style.lineHeight, style.padding,
    style.background, style.border, style.textShadow, style.whiteSpace].join('|');
}
