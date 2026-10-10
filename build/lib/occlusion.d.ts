/**
 * What is standing in front of a point.
 *
 * Labels are DOM overlays, so the browser draws them over the canvas whatever the depth buffer says.
 * This module answers the missing question — *is anything between the camera and this anchor?* — on
 * the CPU, from the same world matrices the renderer uses. That keeps it independent of the render
 * pipeline: it works with MSAA on (the multisampled depth buffer cannot be read back), it needs no
 * extra pass, and it is a pure function of the scene, so it is testable without a GPU.
 *
 * The test is a ray from the camera through the label's own pixel. Each object contributes a cheap
 * volume first (a sphere when the geometry really is one, otherwise its local box) and, if that is
 * hit, a bounded sample of its triangles. Sampling matters for curved meshes: a box drawn around a
 * *sphere* would hide a label sitting on the sphere's near surface, while a sample of the actual
 * triangles does not. A small relative bias absorbs the floating-point difference between a label
 * anchored exactly on a surface and the surface itself.
 *
 * Cost is bounded by the caller: several ray tests per object pair, and the label layer probes a
 * slice of its labels each frame rather than all of them.
 */
import { type Vec3 } from './math.js';
import type { Geometry } from './geometry.js';
import type { OrbitCamera } from './camera.js';
export type Occluder = {
    geometry: Geometry;
    matrix: Float32Array;
};
/** A ray from the camera through a pixel, with the distance along it to the thing being tested. */
export type Probe = {
    origin: Vec3;
    direction: Vec3;
    distance: number;
};
export type OcclusionOptions = {
    /** How much closer than the anchor a hit must be to count, as a fraction of its distance. */
    bias?: number;
    /** Triangles tested per object before giving up; the mesh is strided down to this many. */
    triangles?: number;
};
type Info = {
    /** Local box, the quick reject for every probe. */
    min: Vec3;
    max: Vec3;
    /** Set when every vertex sits on one sphere: then the sphere is exact and the box is not used. */
    sphere?: {
        centre: Vec3;
        radius: number;
    };
    /** Decimated triangle corners, three vertices per triangle. */
    samples?: Float32Array;
    triangles: number;
};
/** Build (once per geometry) the volumes and the decimated triangle sample used by every probe. */
export declare function occluderInfo(geometry: Geometry): Info;
/** Invert an affine matrix (the library never builds a projective one). */
export declare function invertAffine(m: Float32Array): Float32Array;
/** Nearest positive intersection with a sphere, or `undefined`. */
export declare function raySphere(origin: Vec3, direction: Vec3, centre: Vec3, radius: number): number | undefined;
/** Nearest intersection with an axis-aligned box, or `undefined`. A probe inside it counts as zero. */
export declare function rayBox(origin: Vec3, direction: Vec3, min: Vec3, max: Vec3): number | undefined;
/** Möller–Trumbore, double sided: a mesh wound either way still hides what is behind it. */
export declare function rayTriangle(origin: Vec3, direction: Vec3, a: Vec3, b: Vec3, c: Vec3): number | undefined;
/**
 * Nearest distance along `probe` at which `occluder` is hit, in world units, or `Infinity`.
 *
 * The probe is moved into the object's own frame, which is why the direction is *not* renormalised:
 * an affine map sends `o + t d` to `M⁻¹o + t M⁻¹d`, so `t` means the same distance on both sides.
 */
export declare function occluderDistance(occluder: Occluder, probe: Probe, limit: number, triangles?: number): number;
/** A probe from `point` to the camera, given the pixel it projects to. */
export declare function probeFor(camera: OrbitCamera, px: number, py: number, width: number, height: number, point: Vec3): Probe;
/**
 * Is anything in `occluders` closer to the camera than the probe's own anchor?
 *
 * The bias is relative to the anchor's distance, so a label sitting exactly on a surface — the usual
 * case in these demos — is not hidden by the surface it is written on.
 */
export declare function occluded(probe: Probe, occluders: readonly Occluder[], options?: OcclusionOptions): boolean;
export {};
