import { type Point2, type KPoint, type TightBindingModel } from './tight-binding.js';
export type BandSample = {
    n: number;
    x: [number, number];
    y: [number, number];
    zone: Point2[];
    bands: Float64Array[];
    min: number;
    max: number;
    path: {
        distance: number[];
        energies: number[][];
        ticks: {
            label: string;
            at: number;
        }[];
    };
};
export declare function sampleTightBinding(model: TightBindingModel, path: KPoint[], n?: number): BandSample;
export type Contour2D = [Point2, Point2];
/** Marching triangles, clipped to the first Brillouin zone. No eigenvalue solves while sweeping μ. */
export declare function fermiContours(sample: BandSample, energy: number, band: number): Contour2D[];
export type BandVertex = [number, number, number];
/** Piecewise-linear band triangles clipped to the BZ, shared by surfaces and occupied slices. */
export declare function bandTriangles(sample: BandSample, band: number): BandVertex[][];
/** Triangulated occupied area E(k) ≤ μ. Energy clipping interpolates edges without new solves. */
export declare function fermiArea(sample: BandSample, energy: number, band: number): Float32Array;
/** Approximate integrated occupation, spinless states per primitive cell. */
export declare function bandFilling(sample: BandSample, energy: number): number;
