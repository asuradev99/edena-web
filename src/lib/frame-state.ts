import type { SceneEntry } from './render-list.js';

/** Snapshot only the draw-affecting state; public scene properties can still be mutated directly. */
export class FrameState {
  private camera = new Float32Array(16).fill(NaN);
  private matrices: Float32Array[] = [];
  private materials: string[] = [];
  private opacity: number[] = [];
  private count = -1;

  changed(camera: Float32Array, entries: readonly SceneEntry[], materials: readonly string[]): boolean {
    let changed = this.count !== entries.length;
    for (let i = 0; i < 16; i++) {
      if (this.camera[i] !== camera[i]) { changed = true; this.camera[i] = camera[i]; }
    }
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i], opacity = entry.opacity * entry.node.reveal;
      if (this.matrices[i] !== entry.matrix || this.materials[i] !== materials[i] || this.opacity[i] !== opacity) {
        changed = true;
        this.matrices[i] = entry.matrix;
        this.materials[i] = materials[i];
        this.opacity[i] = opacity;
      }
    }
    this.count = entries.length;
    this.matrices.length = this.materials.length = this.opacity.length = entries.length;
    return changed;
  }
}
