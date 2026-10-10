import { Geometry } from './geometry.js';
export type Rgb = [number, number, number];
/** Piecewise-linear color ramp from ordered stops; values outside the stop domain clamp. */
export declare function ramp(...stops: [number, Rgb][]): (t: number) => Rgb;
/** Perceptually uniform sequential ramps, approximated with nine measured stops each. */
export declare const viridis: (t: number) => Rgb;
export declare const plasma: (t: number) => Rgb;
/**
 * Sample z = f(x, y) over a rectangular domain and color every vertex by its own value,
 * normalised across the sampled range (or an explicit one). Quads touching a non-finite
 * sample are dropped, matching `functionSurface`. Positions follow `[x, f(x, y), y]`.
 */
export declare function colorMappedSurface(f: (x: number, y: number) => number, x: [number, number], y: [number, number], colorOf?: (t: number) => Rgb, resolution?: [number, number], range?: [number, number]): Geometry;
