import { World } from './world.js';
import { OrbitCamera } from './camera.js';
import { type SceneEntry } from './render-list.js';
import { TextRenderer } from './text-renderer.js';
export { viewFor } from './view-registry.js';
export { LabelLayer, type LabelAnchor, type LabelOptions, type LabelFlags } from './labels.js';
/** Subset of `GPUAdapterInfo` reported by the browser; fields are often empty strings. */
export type AdapterInfo = {
    vendor?: string;
    architecture?: string;
    device?: string;
    description?: string;
};
export type WebGPUViewOptions = {
    device?: GPUDevice;
    interactive?: boolean;
    maxDpr?: number;
    /** 4× MSAA by default; 'high' also renders at twice the pixel density for finer distant geometry. */
    antialias?: boolean | 'high';
    /** Multisample count: 4 (default) or 1. Overrides the MSAA count, not 'high' supersampling. */
    samples?: number;
    /** `premultiplied` (default) lets the page show through; `opaque` skips canvas compositing and is faster. */
    alphaMode?: GPUCanvasAlphaMode;
    onError?: (message: string) => void;
};
/** A GPU-resident scene component sharing this view's camera, depth buffer and render pass. */
export interface GpuSceneLayer {
    readonly revision: number;
    prepare(encoder: GPUCommandEncoder, camera: Float32Array, width: number, height: number): void;
    drawOpaque(pass: GPURenderPassEncoder): void;
    drawTransparent(pass: GPURenderPassEncoder): void;
    dispose(): void;
}
export declare class WebGPUView {
    readonly canvas: HTMLCanvasElement;
    readonly device: GPUDevice;
    private ownsDevice;
    private maxDpr;
    private samples;
    private alphaMode;
    private resolutionScale;
    readonly world: World;
    private gpuLayers;
    addGpuLayer<T extends GpuSceneLayer>(create: (device: GPUDevice, format: GPUTextureFormat, samples: number) => T): T;
    readonly camera: OrbitCamera;
    /** The drawables of the most recent frame, for overlays that need to know what is on screen. */
    private lastScene;
    /** Everything drawn in the last frame: node, world matrix and inherited opacity. */
    get scene(): readonly SceneEntry[];
    /** Adapter the view was created on; undefined when a caller supplied its own device. */
    adapterInfo?: AdapterInfo;
    /** True when the browser handed us a software/fallback adapter (expect poor frame rates). */
    isFallbackAdapter: boolean;
    private context;
    private pipeline;
    private pipelineColored;
    private translucent;
    private translucentColored;
    private lineRenderer?;
    private get lines();
    private bindGroupLayout;
    private format;
    private depth?;
    private msaa?;
    private geometry;
    private batches;
    private geometryIds;
    private nextGeometryId;
    private materialKeys;
    private materialKey;
    private stopped;
    private pendingResize;
    private dpr;
    private cleanup;
    private observer;
    private visibility;
    /**
     * Called when the canvas changes size, with the new size in CSS pixels, so a demo can re-fit its
     * camera. A plot that frames its domain at one aspect ratio clips at another, and the panels here
     * are responsive.
     */
    onResize?: (width: number, height: number) => void;
    private uniforms;
    private renderList;
    private frameState;
    private frameMaterials;
    private translucentEntries;
    private translucentPool;
    private frameValid;
    private textRenderer?;
    /** Internal text registration shared by label layers using this camera. */
    get text(): TextRenderer;
    private constructor();
    static create(canvas: HTMLCanvasElement, options?: WebGPUViewOptions): Promise<WebGPUView>;
    resize(): void;
    /** Release viewport-sized targets while retaining reusable scene buffers and glyphs. */
    releaseRenderTargets(): void;
    private ensureRenderTargets;
    /** Draw changed scene state. Force a submission when capturing a fresh canvas texture. */
    render(force?: boolean): void;
    private uploadGeometry;
    dispose(): void;
}
