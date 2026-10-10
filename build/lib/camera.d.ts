import { type Vec3 } from './math.js';
export type ProjectionMode = 'orthographic' | 'perspective';
/** Orbit camera with an orthographic default for plots and an opt-in perspective mode for 3D scenes. */
export declare class OrbitCamera {
    /** 2D locks the front orthographic view; pointer drag pans and wheel zooms. */
    mode: '2d' | '3d';
    yaw: number;
    pitch: number;
    height: number;
    projection: ProjectionMode;
    /** Vertical field of view used by perspective projection. */
    fovY: number;
    near: number;
    far: number;
    distance: number;
    target: Vec3;
    matrix(aspect: number): Float32Array;
    project(point: Vec3, width: number, height: number): [number, number];
    /** Project with a matrix computed once, so many labels share one camera evaluation per frame. */
    projectWith(m: Float32Array, point: Vec3, width: number, height: number): [number, number];
    /**
     * Set while something else owns the gesture — a demo dragging a handle on the canvas — so the
     * orbit control leaves the pointer alone. `attachHandles` in `interact.ts` maintains it.
     */
    locked: boolean;
    /**
     * A world-space ray through a canvas pixel, with its origin on the camera plane. Orthographic
     * cameras get parallel rays; perspective cameras get a pinhole. Used for picking.
     */
    ray(px: number, py: number, width: number, height: number): {
        origin: Vec3;
        direction: Vec3;
    };
    attach(canvas: HTMLCanvasElement): () => void;
}
