import { Visual } from './world.js';
import type { Color } from './math.js';
export type TextOptions = {
    /** Height of the untransformed text box in world units. Default .36. */
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
export declare class Text extends Visual {
    readonly element: HTMLSpanElement;
    height: number;
    private markup?;
    get faceCamera(): boolean;
    set faceCamera(value: boolean);
    anchor: number;
    vertical: number;
    constructor(content: string | HTMLSpanElement, options?: TextOptions);
    get text(): string;
    set text(value: string);
    /** Replace formatted content only when it changes, retaining glyphs for repeated values. */
    setHTML(source: string): this;
}
/** LaTeX laid out as MathML on an ordinary, transformable scene text plane. */
export declare class MathText extends Text {
    constructor(source: string, options?: TextOptions);
    setMath(source: string): this;
}
