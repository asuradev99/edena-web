import { Geometry } from './geometry.js';
import { Visual } from './world.js';
import { MATH_FONT_STACK } from './mathtext.js';
import { latex } from './latex.js';
const plane = new Geometry([]);
/** A text plane in the XY plane, with the same position, scale, orientation and parent transforms
 * as any Visual. Camera motion changes its apparent size and angle; camera-facing orientation is an explicit option. */
export class Text extends Visual {
    element;
    height;
    markup;
    get faceCamera() { return this.mode === '2d'; }
    set faceCamera(value) { this.mode = value ? '2d' : '3d'; }
    anchor;
    vertical;
    constructor(content, options = {}) {
        super(plane, options.color);
        this.height = options.height ?? .36;
        this.faceCamera = options.faceCamera ?? false;
        if (!Number.isFinite(this.height) || this.height <= 0)
            throw new Error('Text height must be positive and finite');
        this.anchor = options.anchor === 'left' ? 0 : options.anchor === 'right' ? 1 : .5;
        this.vertical = options.vertical === 'top' ? 0 : options.vertical === 'bottom' ? 1 : .5;
        this.element = typeof content === 'string' ? document.createElement('span') : content;
        if (typeof content === 'string') {
            this.element.textContent = content;
            Object.assign(this.element.style, { font: '48px serif', lineHeight: '1.2', whiteSpace: 'nowrap', color: '#fff' });
            if (options.fontFamily)
                this.element.style.fontFamily = options.fontFamily;
        }
        this.element.style.textShadow = 'none';
        this.wireframe = false;
    }
    get text() { return this.element.textContent ?? ''; }
    set text(value) {
        if (!this.element.children.length && this.element.textContent === value)
            return;
        this.element.textContent = value;
    }
    /** Replace formatted content only when it changes, retaining glyphs for repeated values. */
    setHTML(source) {
        if (this.markup?.source === source && this.element.innerHTML === this.markup.normalized)
            return this;
        this.element.innerHTML = source;
        this.markup = { source, normalized: this.element.innerHTML };
        return this;
    }
}
/** LaTeX laid out as MathML on an ordinary, transformable scene text plane. */
export class MathText extends Text {
    constructor(source, options = {}) {
        super('', { fontFamily: MATH_FONT_STACK, ...options });
        this.setMath(source);
    }
    setMath(source) {
        // <math> has its own UA font family; explicitly inherit our selected MATH font.
        return this.setHTML(latex(source).replace('<math ', '<math style="font-family:inherit" '));
    }
}
//# sourceMappingURL=text.js.map