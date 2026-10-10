import type { SceneEntry } from './render-list.js';
/** Snapshot only the draw-affecting state; public scene properties can still be mutated directly. */
export declare class FrameState {
    private camera;
    private matrices;
    private materials;
    private opacity;
    private count;
    changed(camera: Float32Array, entries: readonly SceneEntry[], materials: readonly string[]): boolean;
}
