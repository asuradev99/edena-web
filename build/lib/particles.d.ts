import type { Color } from './math.js';
/**
 * A raw GPU-resident particle simulation: integration runs in a compute pass over ping-pong
 * storage buffers and the render pass instances straight out of those buffers, so no per-frame
 * particle data crosses the PCIe bus. Deliberately minimal — deterministic force laws, no spatial
 * acceleration structure, no atomics — so the all-pairs mode can serve as a raw throughput
 * reference. `mode: 'nbody'` is genuinely O(N²): see `MAX_NBODY_COUNT`.
 */
export type ParticleMode = 'oscillator' | 'attractor' | 'nbody';
export type ParticleLayout = 'ball' | 'disc';
export type GpuParticleSimulationOptions = {
    /** Borrow a device from a view instead of creating one. */
    device?: GPUDevice;
    /** Target format for the render pipeline; defaults to the preferred canvas format. */
    format?: GPUTextureFormat;
    count?: number;
    seed?: number;
    radius?: number;
    timeStep?: number;
    mode?: ParticleMode;
    /** Coupling strength: spring constant for `oscillator`, G for `attractor`/`nbody`. */
    stiffness?: number;
    damping?: number;
    /** Initial tangential velocity `swirl * cross(axis, p)`, so the cloud moves instead of collapsing. */
    swirl?: number;
    /** Plummer softening length for `nbody`, so a close pair cannot explode the integration. */
    softening?: number;
    /** `disc` spreads particles in the XZ plane and gives them circular-orbit velocities. */
    layout?: ParticleLayout;
    /** Period (seconds) of a circular orbit at the rim of a `disc`; sets the derived G for `nbody`. */
    orbitPeriod?: number;
    pointSize?: number;
    color?: Color;
    onError?: (message: string) => void;
};
export declare class GpuParticleSimulation {
    static create(options?: GpuParticleSimulationOptions): Promise<GpuParticleSimulation>;
    readonly device: GPUDevice;
    readonly count: number;
    readonly format: GPUTextureFormat;
    readonly supportsTiming: boolean;
    readonly byteLength: number;
    /** Why the last `measure()` returned `null`, or `null` if it succeeded or never ran. */
    timingError: string | null;
    private readonly onError?;
    private readonly owned;
    private readonly computePipeline;
    private readonly renderPipeline;
    private readonly positionA;
    private readonly positionB;
    private readonly velocityA;
    private readonly velocityB;
    private readonly paramsBuffer;
    private readonly cameraBuffer;
    private readbackBuffer?;
    private errorListener?;
    private reading;
    private readonly computeAtoB;
    private readonly computeBtoA;
    private readonly renderFromA;
    private readonly renderFromB;
    private readonly params;
    private readonly paramsBits;
    private readonly camera;
    private readonly timeStep;
    private readonly workgroups;
    private readonly initialPositions;
    private readonly initialVelocities;
    private current;
    private stepCount;
    private destroyed;
    private constructor();
    /** Integration steps issued since the last `reset()`. */
    get steps(): number;
    /** Record `substeps` integration dispatches. The caller owns submission. */
    step(encoder: GPUCommandEncoder, substeps?: number): void;
    private encodeSteps;
    /**
     * Record the instanced point draw. The render pass must have **no depth attachment**;
     * the pipeline blends alpha over whatever is already there.
     */
    render(pass: GPURenderPassEncoder): void;
    /** Update the camera uniform. `viewProjection` is column-major, as elsewhere in the library. */
    setCamera(viewProjection: Float32Array, width: number, height: number): void;
    /** Restore the initial positions, velocities, and step count. */
    reset(): void;
    /**
     * Average GPU milliseconds per integration step, or `null` when timestamp queries are
     * unavailable. Integrates, so call it between frames.
     */
    measure(iterations?: number): Promise<number | null>;
    /**
     * FNV-1a hash of the current position buffer. Same seed + same step count must give the same
     * value, which makes it a cheap determinism check.
     */
    checksum(): Promise<number>;
    destroy(): void;
    private assertLive;
}
