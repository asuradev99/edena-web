import type { OrbitCamera } from './camera.js';
import type { WebGPUView } from './view.js';
/** Associates world-anchored label layers with the view that renders their camera. */
export declare const VIEW_OF_CAMERA: WeakMap<OrbitCamera, WebGPUView>;
export declare const viewFor: (camera: OrbitCamera) => WebGPUView | undefined;
