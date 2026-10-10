import { type Vec3 } from './math.js';
import { Text } from './text.js';
import type { Group } from './world.js';
import { OrbitCamera } from './camera.js';
import type { Anchor } from './plot.js';
/**
 * Which way a label grows from its anchor: `center` (the default) is right for a marker, while
 * `left`/`right` suit a block of text that would otherwise spill past the edge of the picture.
 */
export type LabelAnchor = 'center' | 'left' | 'right';
/** Options for {@link LabelLayer}. */
export type LabelOptions = {
    /** Opt in to fixed-facing, fixed-pixel-size labels. Default false: text is part of the 3D world. */
    billboard?: boolean;
    /** Face the camera while keeping world-space size and depth. */
    faceCamera?: boolean;
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
    billboard?: boolean;
    /** Face the camera while keeping world-space size and depth. */
    faceCamera?: boolean;
    /** Parent for a world-space label; its point callback then uses that group's local coordinates. */
    parent?: Group;
    /** Vertical alignment and gap, sized in initial CSS pixels for world text. */
    vertical?: 'top' | 'center' | 'bottom';
    offset?: [number, number];
    /** For billboards/overlays, keep the label inside the viewport while its anchor is visible. Default true. */
    keepInView?: boolean;
    /**
     * Draw this label with scene depth testing. Default true. A caption — a status line describing
     * the whole stage rather than tagging a point in it — should set this to false, because it is the
     * page's own text and not a thing in the scene.
     */
    occlude?: boolean;
};
/** World-anchored text. Scene labels use cached GPU glyphs and the scene depth buffer;
 * captions with occlude:false and cameras without a view use ordinary DOM projection. */
export declare class LabelLayer {
    private host;
    private camera;
    private labels;
    private observer;
    private dirty;
    private width;
    private height;
    private readonly occlude;
    private readonly billboard;
    private readonly faceCamera;
    constructor(host: HTMLElement, camera: OrbitCamera, options?: LabelOptions);
    add(text: string, point: () => Vec3, color?: string, anchor?: LabelAnchor, flags?: LabelFlags): HTMLSpanElement;
    /**
     * Label whose content is HTML, so it can carry MathML — from the `mathtext` builders or from
     * {@link ./latex}. The page styles the host and can target the optional class.
     */
    addHTML(html: string, point: () => Vec3, color?: string, className?: string, anchor?: LabelAnchor, flags?: LabelFlags): HTMLSpanElement;
    /**
     * Label written in LaTeX: `addMath('\frac{d f}{d x}', () => point)`. A stacked fraction or a
     * radical is asked for rather than approximated — `\frac{a}{b}` prints a fraction, not `a/b`.
     */
    addMath(source: string, point: () => Vec3, color?: string, className?: string, anchor?: LabelAnchor, flags?: LabelFlags): HTMLSpanElement;
    /** Plot-generated alignment and pixel gaps work identically for GPU and DOM labels. */
    addAnchors(anchors: readonly Anchor[], color?: string, className?: string, parent?: Group): HTMLSpanElement[];
    /** Access the scene object to rotate or scale a label. Position follows its point callback. */
    object(element: HTMLSpanElement): Text;
    /** Remove labels and release their GPU textures, observers and uniform slots together. */
    remove(...elements: HTMLSpanElement[]): void;
    private create;
    update(): void;
    dispose(): void;
}
