import type { OrbitCamera } from './camera.js';
import type { WebGPUView } from './view.js';

/** Associates world-anchored label layers with the view that renders their camera. */
export const VIEW_OF_CAMERA = new WeakMap<OrbitCamera, WebGPUView>();
export const viewFor = (camera: OrbitCamera): WebGPUView | undefined => VIEW_OF_CAMERA.get(camera);
