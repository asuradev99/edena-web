/** Associates world-anchored label layers with the view that renders their camera. */
export const VIEW_OF_CAMERA = new WeakMap();
export const viewFor = (camera) => VIEW_OF_CAMERA.get(camera);
//# sourceMappingURL=view-registry.js.map