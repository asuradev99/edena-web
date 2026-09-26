import { type Vec3, length, sub } from './math.js';
import { OrbitCamera } from './camera.js';
import { viewFor } from './view-registry.js';
import { type DepthLabel } from './text-renderer.js';
import { latex } from './latex.js';

/**
 * Which way a label grows from its anchor: `center` (the default) is right for a marker, while
 * `left`/`right` suit a block of text that would otherwise spill past the edge of the picture.
 */
export type LabelAnchor = 'center' | 'left' | 'right';

/** Options for {@link LabelLayer}. */
export type LabelOptions = {
  /** Draw text with scene depth testing. Default true; false creates a DOM overlay. */
  occlude?: boolean;
  /** @deprecated GPU depth testing fully hides covered glyphs. */
  hiddenOpacity?: number;
  /** @deprecated GPU depth testing covers every label each frame. */
  probeBudget?: number;
  /** @deprecated Depth uses the same comparison as scene geometry. */
  bias?: number;
  /** @deprecated GPU occlusion has no fade delay. */
  fadeRate?: number;
  /** @deprecated GPU occlusion has no dwell delay. */
  dwell?: number;
};

/** Per-label overrides. */
export type LabelFlags = {
  /**
   * Draw this label with scene depth testing. Default true. A caption — a status line describing
   * the whole stage rather than tagging a point in it — should set this to false, because it is the
   * page's own text and not a thing in the scene.
   */
  occlude?: boolean;
};

type Label = {
  element: HTMLSpanElement;
  depth?: DepthLabel;
  point: () => Vec3;
  distance: number;
};

/** World-anchored text. Scene labels use cached GPU glyphs and the scene depth buffer;
 * captions with occlude:false and cameras without a view use ordinary DOM projection. */
export class LabelLayer {
  private labels: Label[] = [];
  private observer: ResizeObserver;
  private dirty = true;
  private width = 0;
  private height = 0;
  private readonly occlude: boolean;

  constructor(private host: HTMLElement, private camera: OrbitCamera, options: LabelOptions = {}) {
    this.occlude = options.occlude ?? true;
    this.observer = new ResizeObserver(() => { this.dirty = true; });
    this.observer.observe(host);
  }

  add(text: string, point: () => Vec3, color = '#ffffff', anchor: LabelAnchor = 'center', flags: LabelFlags = {}): HTMLSpanElement {
    const element = this.create(point, color, anchor, flags);
    element.textContent = text;
    return element;
  }

  /**
   * Label whose content is HTML, so it can carry MathML — from the `mathtext` builders or from
   * {@link ./latex}. The page styles the host and can target the optional class.
   */
  addHTML(html: string, point: () => Vec3, color = '#ffffff', className = '', anchor: LabelAnchor = 'center', flags: LabelFlags = {}): HTMLSpanElement {
    const element = this.create(point, color, anchor, flags);
    element.innerHTML = html;
    if (className) element.className = className;
    return element;
  }

  /**
   * Label written in LaTeX: `addMath('\frac{d f}{d x}', () => point)`. A stacked fraction or a
   * radical is asked for rather than approximated — `\frac{a}{b}` prints a fraction, not `a/b`.
   */
  addMath(source: string, point: () => Vec3, color = '#ffffff', className = 'math-label', anchor: LabelAnchor = 'center', flags: LabelFlags = {}): HTMLSpanElement {
    return this.addHTML(latex(source), point, color, className, anchor, flags);
  }

  private create(point: () => Vec3, color: string, anchor: LabelAnchor = 'center', flags: LabelFlags = {}): HTMLSpanElement {
    const element = document.createElement('span');
    const shift = anchor === 'left' ? 'translate(0, -50%)' : anchor === 'right' ? 'translate(-100%, -50%)' : 'translate(-50%, -50%)';
    Object.assign(element.style, { position: 'absolute', left: '0', top: '0', color, pointerEvents: 'none', transform: shift, whiteSpace: 'nowrap', visibility: 'hidden' });
    this.host.append(element);
    this.labels.push({
      element, point,
      depth: this.occlude && (flags.occlude ?? true)
        ? viewFor(this.camera)?.text.add(element, point, anchor === 'left' ? 0 : anchor === 'right' ? 1 : .5)
        : undefined,
      distance: 0,
    });
    return element;
  }

  // Read layout only after a resize. CSS translate moves text without changing its layout or
  // overriding the anchor transform. Preserve subpixel placement (no camera-motion snapping).
  update(): void {
    if (this.dirty) { this.width = this.host.clientWidth; this.height = this.host.clientHeight; this.dirty = false; }
    const width = this.width, height = this.height;

    if (width <= 0 || height <= 0) {
      for (const { element } of this.labels) element.style.visibility = 'hidden';
      return;
    }

    const matrix = this.camera.matrix(width / height);
    const eye = this.camera.ray(width / 2, height / 2, width, height).origin;
    const onScreen: Label[] = [];
    for (const label of this.labels) {
      const p = label.point();
      const z = matrix[2] * p[0] + matrix[6] * p[1] + matrix[10] * p[2] + matrix[14];
      const w = matrix[3] * p[0] + matrix[7] * p[1] + matrix[11] * p[2] + matrix[15];
      const [x, y] = this.camera.projectWith(matrix, p, width, height);
      // Match WebGPU's clip volume: never mirror behind the eye or linger when the anchor has left
      // the view.
      const visible = Number.isFinite(x) && Number.isFinite(y) && w > 0 && z >= 0 && z <= w && x >= 0 && x <= width && y >= 0 && y <= height;
      const visibility = visible ? 'visible' : 'hidden';
      if (label.depth) {
        const clip = label.depth.ready ? 'inset(50%)' : '';
        if (label.element.style.clipPath !== clip) label.element.style.clipPath = clip;
      }
      if (label.element.style.visibility !== visibility) label.element.style.visibility = visibility;
      if (!visible) continue;
      label.distance = length(sub(p, eye));
      const translation = `${x}px ${y}px`;
      if (label.element.style.translate !== translation) label.element.style.translate = translation;
      onScreen.push(label);
    }

    // Near labels over far ones. Sorting a handful of labels a frame is cheaper than the browser
    // re-resolving a DOM order by hand.
    onScreen.sort((a, b) => b.distance - a.distance);
    onScreen.forEach((label, index) => {
      const zIndex = String(index);
      if (label.element.style.zIndex !== zIndex) label.element.style.zIndex = zIndex;
    });
  }

  dispose(): void {
    this.observer.disconnect();
    for (const { element, depth } of this.labels) {
      if (depth) viewFor(this.camera)?.text.remove(depth);
      element.remove();
    }
    this.labels = [];
  }
}

