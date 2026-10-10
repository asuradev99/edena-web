import { type Vec3 } from './math.js';
/** A vector field sampled in world space. `time` is optional so animated fields can be used. */
export type VectorField = (point: Vec3, time: number) => Vec3;
export type StreamlineOptions = {
    /** Arc length advanced per integration step (field direction is normalised). */
    step?: number;
    /** Maximum number of steps per direction. */
    steps?: number;
    /** Maximum arc length per direction. */
    maxLength?: number;
    /** Integrate backward from the seed as well as forward. */
    both?: boolean;
    /** Stop when the field magnitude drops below this value (a stagnation point). */
    minStrength?: number;
    /** Stop when the point leaves this box. */
    bounds?: {
        min: Vec3;
        max: Vec3;
    };
    /** Extra stop predicate, evaluated with the wrapped point and field strength. */
    stop?: (point: Vec3, strength: number) => boolean;
};
/**
 * Trace one field line with classic RK4, normalising at each evaluation so `step` is an arc
 * length and the line does not bunch up where the field is strong. Non-finite samples end the
 * line instead of poisoning it.
 */
export declare function streamline(field: VectorField, start: Vec3, time?: number, options?: StreamlineOptions): Vec3[];
/**
 * Trace many field lines and drop the ones that are too short to read (for example a seed
 * that landed on a stagnation point).
 */
export declare function streamlines(field: VectorField, seeds: Vec3[], time?: number, options?: StreamlineOptions & {
    minPoints?: number;
}): Vec3[][];
/** A sphere of unit seeds, rotated so no two lines start on top of each other. */
export declare function sphereSeeds(count: number, radius?: number): Vec3[];
