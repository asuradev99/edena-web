import { Geometry } from './geometry.js';
import { type Vec3 } from './math.js';
import { type M } from './mathtext.js';
/**
 * A world-space point paired with the text a caller renders there.
 *
 * `text` is the plain form, for a caller with no typesetter; `math` is the same label as MathML,
 * which is what a maths-aware caller should prefer — a real minus sign and proper exponents instead
 * of an ASCII approximation.
 */
export type Anchor = {
    text: string;
    position: Vec3;
    math?: M;
    anchor?: 'left' | 'center' | 'right';
    vertical?: 'top' | 'center' | 'bottom';
    offset?: [number, number];
};
/** Smallest round step (1, 2 or 5 times a power of ten) fitting `count` intervals into `span`. */
export declare function niceStep(span: number, count: number): number;
/** Round tick values inside a finite increasing range; endpoints appear when the step divides them. */
export declare function tickValues(min: number, max: number, count?: number): number[];
/** Decimals needed to print a tick of this step size without floating-point noise. */
export declare function tickDecimals(step: number): number;
/** The same tick as MathML: a real minus, grouped digits, and an exponent when the value needs one. */
export declare function tickMath(value: number, step: number): M;
/** Fixed-decimal rendering that hides binary floating-point noise for a given tick step. */
export declare function formatTick(value: number, step: number): string;
export type PlotFrameOptions = {
    xTicks?: number;
    yTicks?: number;
    width?: number;
    tickSize?: number;
    grid?: boolean;
    /** Grid/tick stroke width in CSS pixels, independent of camera zoom and DPR. Default 1.8. */
    gridWidth?: number;
    /** Divisions between major ticks; `false` turns them off. Five reads well on decimal steps. */
    minor?: number | false;
    /**
     * Labels set past the end of each axis. A plain string is set upright; a MathML fragment (anything
     * starting with `<`) is used as-is, so `mi('x')` gives the italic axis name a reader expects.
     */
    xTitle?: string;
    yTitle?: string;
};
export type PlotFrame = {
    axes: Geometry;
    ticks: Geometry;
    minor: Geometry;
    grid: Geometry;
    minorGrid: Geometry;
    labels: Anchor[];
    titles: Anchor[];
};
/** Cartesian axes, ticks, an optional grid, and text anchors for a y = f(x) plot. */
export declare function plotFrame(x: [number, number], y: [number, number], options?: PlotFrameOptions): PlotFrame;
export type AreaOptions = {
    /** The value the strip closes down to: a number, or a function of x for a curved baseline. */
    baseline?: number | ((x: number) => number);
    /** Samples across the range; more gives a smoother edge. */
    samples?: number;
};
/**
 * The region between a curve and a baseline, as a triangle strip. Shading the area under a curve is
 * the quickest way to make an integral mean something, and it stays one geometry rather than a mesh.
 * Where the function is not finite the strip simply skips that column instead of filling nonsense.
 */
export declare function areaUnder(fn: (x: number) => number, x: [number, number], options?: AreaOptions): Geometry;
/** A straight line through `point` with the given slope, drawn across an x range. */
export declare function lineThrough(point: Vec3, slope: number, x: [number, number], width?: number): Geometry;
/** The slope of the chord from `a` to `b`: the quantity that becomes the derivative as b → a. */
export declare function secantSlope(fn: (x: number) => number, a: number, b: number): number;
/** Three positive-axis arrows, for orienting a 3D plot. */
export declare function axes3d(size?: number, width?: number): Geometry;
/** Wireframe box outlining a finite 3D domain. */
export declare function boundsBox(min: Vec3, max: Vec3, width?: number): Geometry;
/** Sample a function throughout its domain, including interior extrema missed by endpoint checks. */
export declare function functionRange(fn: (x: number) => number, domain: [number, number], samples?: number): [number, number];
/** A planar grid made of antialiased screen-space strokes. */
export declare function gridPlane(x: [number, number], y: [number, number], options?: {
    plane?: 'xy' | 'xz' | 'yz';
    offset?: number;
    ticks?: number;
    width?: number;
}): Geometry;
