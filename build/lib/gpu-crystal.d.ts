import type { Vec3, Color } from './math.js';
import type { GpuSceneLayer } from './view.js';
/** Orthographic crystal spheres, starting outlines and trajectories, animated entirely on the GPU. */
export declare class GpuCrystalLayer implements GpuSceneLayer {
    private device;
    revision: number;
    private count;
    private rest?;
    private drift?;
    private moving?;
    private samples;
    private frame;
    private camera;
    private bonds?;
    private compute;
    private spheres;
    private markers;
    private trails;
    private bondPipeline;
    private computeBind?;
    private renderBind?;
    private frameData;
    private cameraData;
    private source;
    private bondData;
    private bondCapacity;
    private bondCount;
    private computedRevision;
    private pendingFrame;
    private disposed;
    constructor(device: GPUDevice, format: GPUTextureFormat, samples: number);
    setSites(positions: Vec3[], radii: number[], colors: Color[]): void;
    setColors(colors: Color[]): void;
    /**
     * Bond halves. Each half is anchored on the atom that stays in the box (`anchor`); its far end is
     * either the bonded atom `farAtom` when that is also in the box (`linked`), or the anchor's rest
     * vector to the periodic partner (`rel`) rotated by the frame. Both halves of a bond share an
     * anchor, so they share one midpoint however the two atoms are re-imaged into the cell.
     */
    setBonds(list: {
        anchor: number;
        farAtom: number;
        tip: 0 | 1;
        linked: 0 | 1;
        rel: Vec3;
        color: Color;
    }[]): void;
    /** Folding an element away changes only the tint, so the bond topology stays on the GPU. */
    setBondColors(colors: Color[]): void;
    private buildRenderBind;
    setOperation(drift: Vec3[], movers: Set<number>, samples: Float32Array): void;
    setFrame(matrix: Float32Array, wrap: number, lift: number, trails: number, starts: number, bonds?: number): void;
    prepare(encoder: GPUCommandEncoder, camera: Float32Array, width: number, height: number): void;
    drawOpaque(pass: GPURenderPassEncoder): void;
    drawTransparent(pass: GPURenderPassEncoder): void;
    dispose(): void;
}
