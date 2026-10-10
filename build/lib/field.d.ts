import { Geometry } from './geometry.js';
import type { Vec3 } from './math.js';
/** Axis-aligned sampling domain for a scalar field. */
export type FieldBounds = {
    min: Vec3;
    max: Vec3;
};
export type IsosurfaceOptions = {
    maxSamples?: number;
};
/**
 * Extract the level surface w = isovalue from a scalar callback by marching tetrahedra.
 * A non-finite sample suppresses the cells that touch it; triangle order is deterministic.
 * Extraction is separate from rendering: this returns plain geometry and never touches the GPU.
 */
export declare function isosurface(field: (x: number, y: number, z: number) => number, bounds: FieldBounds, isovalue?: number, resolution?: number | [number, number, number], options?: IsosurfaceOptions): Geometry;
