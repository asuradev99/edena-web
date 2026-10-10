export type Vec3 = [number, number, number];
export type Color = [number, number, number, number];
export declare const clamp: (x: number, lo?: number, hi?: number) => number;
export declare const lerp: (a: number, b: number, t: number) => number;
export declare const smooth: (t: number) => number;
export declare const length: (v: Vec3) => number;
export declare const sub: (a: Vec3, b: Vec3) => Vec3;
export declare const add: (a: Vec3, b: Vec3) => Vec3;
export declare const dot: (a: Vec3, b: Vec3) => number;
export declare const cross: (a: Vec3, b: Vec3) => Vec3;
export declare const normalize: (v: Vec3) => Vec3;
export declare const identity: () => Float32Array<ArrayBuffer>;
export declare function multiply(a: Float32Array, b: Float32Array): Float32Array;
/**
 * An Euler rotation, applied x then y then z. `rotation` on a `Visual` or `Group` turns about +y only;
 * this is for everything else — tumbling a shape, tilting a plane — and composes on top of it.
 */
export declare function orientationMatrix(orientation: Vec3): Float32Array;
/** Apply a 4×4 to a point, including its translation. Handy for placing a label on a transformed node. */
export declare function applyMatrix(matrix: Float32Array, point: Vec3): Vec3;
export declare function transform(position: Vec3, scale: Vec3, rotation: number, orientation?: Vec3): Float32Array;
export declare function rgba(hex: string, alpha?: number): Color;
/** Orient a world-space plane toward the camera, retaining its origin and axis lengths. */
export declare function cameraFacing(matrix: Float32Array, camera: Float32Array): Float32Array;
