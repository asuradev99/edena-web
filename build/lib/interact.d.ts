/**
 * Picking and dragging on a canvas.
 *
 * A demo that draws handles usually wants the reader to be able to grab one. That needs three
 * things: the ray through the pointer (see `OrbitCamera.ray`), where that ray meets the plane the
 * handle lives in, and a way to stop the camera orbiting at the same time.
 *
 * `attachHandles` is the third part, and it is deliberately small: the demo owns the state and
 * says where each handle is *now* through `at()`, so dragging the same handle through a rotating
 * frame or a rebuilt scene keeps working.
 */
import { type Vec3 } from './math.js';
import type { OrbitCamera } from './camera.js';
export type Ray = {
    origin: Vec3;
    direction: Vec3;
};
/** Where a ray meets a plane, or `undefined` when they are parallel (the plane is edge-on). */
export declare function rayPlane(ray: Ray, point?: Vec3, normal?: Vec3): Vec3 | undefined;
/** How far a world point is from a ray: the length of the perpendicular from the point to the line. */
export declare function rayDistance(ray: Ray, point: Vec3): number;
/** How far a world point lands from a canvas pixel: the picking test for a projected handle. */
export declare function screenDistance(camera: OrbitCamera, point: Vec3, px: number, py: number, width: number, height: number): number;
/** A grabbable point. */
export type DragHandle = {
    /** Where the handle is right now — read every frame, so a moving scene still picks correctly. */
    at: () => Vec3;
    /** Called with the new world position while the pointer is down. */
    to: (point: Vec3) => void;
    /** Pick radius in CSS pixels; the default is 18. */
    radius?: number;
    /**
     * The plane the handle slides in. `'view'` means the plane through the grab point facing the
     * camera, which lets the reader move a handle freely in the picture; an explicit normal pins the
     * motion, e.g. `{ normal: [0, 1, 0] }` to drag along a floor.
     */
    plane?: {
        point?: Vec3;
        normal: Vec3;
    } | 'view';
    /** Scrolls with the pointer when the reader hovers this handle. */
    cursor?: string;
    /** Named in `onGrab`, useful for a readout. */
    id?: string;
};
export type HandleOptions = {
    /** Called with the handle that was grabbed, then with `undefined` when it is released. */
    onGrab?: (handle: DragHandle | undefined) => void;
    /** Called when the pointer moves over a different handle (or none). */
    onHover?: (handle: DragHandle | undefined) => void;
};
/**
 * Make the handles on a canvas draggable. The camera is locked for the duration of a grab, so
 * orbiting and dragging never fight over the same gesture. Returns a function that detaches.
 */
export declare function attachHandles(canvas: HTMLCanvasElement, camera: OrbitCamera, handles: () => DragHandle[], options?: HandleOptions): () => void;
