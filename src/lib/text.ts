import { Geometry } from './geometry.js';
import { Visual } from './world.js';
import type { Color } from './math.js';
import { MATH_FONT_STACK } from './mathtext.js';
import { latex } from './latex.js';

const plane = new Geometry([]);
export type TextOptions = {
  /** Height of the untransformed text box in world units. Default .3. */
  height?: number;
  color?: Color;
  fontFamily?: string;
  /** Keep the plane facing the camera while retaining world size, position and depth. */
  faceCamera?: boolean;
  /** Horizontal and vertical origin within the text box. */
  anchor?: 'left' | 'center' | 'right';
  vertical?: 'top' | 'center' | 'bottom';
};

/** A text plane in the XY plane, with the same position, scale, orientation and parent transforms
 * as any Visual. Camera motion changes its apparent size and angle; camera-facing orientation is an explicit option. */
export class Text extends Visual {
  readonly element: HTMLSpanElement;
  height: number;
  private markup?: { source: string; normalized: string };
  get faceCamera(): boolean { return this.mode === '2d'; }
  set faceCamera(value: boolean) { this.mode = value ? '2d' : '3d'; }
  anchor: number;
  vertical: number;
  constructor(content: string | HTMLSpanElement, options: TextOptions = {}) {
    super(plane, options.color);
    this.height = options.height ?? .3;
    this.faceCamera = options.faceCamera ?? false;
    if (!Number.isFinite(this.height) || this.height <= 0) throw new Error('Text height must be positive and finite');
    this.anchor = options.anchor === 'left' ? 0 : options.anchor === 'right' ? 1 : .5;
    this.vertical = options.vertical === 'top' ? 0 : options.vertical === 'bottom' ? 1 : .5;
    this.element = typeof content === 'string' ? document.createElement('span') : content;
    if (typeof content === 'string') {
      this.element.textContent = content;
      Object.assign(this.element.style, { font: '48px serif', lineHeight: '1.2', whiteSpace: 'nowrap', color: '#fff' });
      if (options.fontFamily) this.element.style.fontFamily = options.fontFamily;
    }
    this.element.style.textShadow = 'none';
    this.wireframe = false;
  }
  get text(): string { return this.element.textContent ?? ''; }
  set text(value: string) {
    if (!this.element.children.length && this.element.textContent === value) return;
    this.element.textContent = value;
  }
  /** Replace formatted content only when it changes, retaining glyphs for repeated values. */
  setHTML(source: string): this {
    if (this.markup?.source === source && this.element.innerHTML === this.markup.normalized) return this;
    this.element.innerHTML = source;
    this.markup = { source, normalized: this.element.innerHTML };
    return this;
  }
}

/** LaTeX laid out as MathML on an ordinary, transformable scene text plane. */
export class MathText extends Text {
  constructor(source: string, options: TextOptions = {}) {
    super('', { fontFamily: MATH_FONT_STACK, ...options });
    this.setMath(source);
  }
  setMath(source: string): this {
    // <math> has its own UA font family; explicitly inherit our selected MATH font.
    return this.setHTML(latex(source).replace('<math ', '<math style="font-family:inherit" '));
  }
}
