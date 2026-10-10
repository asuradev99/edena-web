import type { Geometry } from './geometry.js';
/** Shared path for mesh contours and explicit grid/tick lines. Each segment expands to two triangles. */
export declare class LineRenderer {
    private device;
    private pipelines;
    private strokes;
    private used;
    private spare;
    constructor(device: GPUDevice, materialLayout: GPUBindGroupLayout, format: GPUTextureFormat, samples: number);
    begin(geometries: ReadonlySet<Geometry>): void;
    draw(pass: GPURenderPassEncoder, geometry: Geometry, outline: boolean, material: GPUBindGroup, instances: GPUBuffer, count: number, transparent: boolean, width: number, height: number, dpr: number): void;
    finish(): void;
    dispose(): void;
}
