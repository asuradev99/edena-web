import { Group, Visual } from './world.js';
/** One drawable Visual with the world matrix it is drawn with, and its inherited opacity. */
export type SceneEntry = {
    node: Visual;
    matrix: Float32Array;
    opacity: number;
};
type Entry = SceneEntry;
/** Renderer-private traversal. Public flatten() still returns independent matrix snapshots.
 * Matrices in this cache are immutable; a changed ancestor invalidates descendants by identity.
 * Compare scalar values to notice in-place edits to the public position/scale/orientation arrays.
 */
export declare class RenderList {
    private transforms;
    private root;
    private entries;
    private count;
    private camera?;
    private cameraVersion;
    private facing;
    collect(world: Group, camera?: Float32Array): readonly Entry[];
    private matrix;
    private visit;
}
export {};
