/** Renderer-agnostic particle data and a small deterministic stepping seam. */
export type ParticleAcceleration = (index: number, position: readonly number[], velocity: readonly number[], time: number) => readonly number[];
export interface ParticleState {
    readonly dimensions: 1 | 2 | 3;
    readonly count: number;
    /** Mutated in place by `stepParticles`, so `readonly` here is shallow. */
    readonly positions: Float32Array;
    readonly velocities: Float32Array;
    /** Carried for consumers (for example a future force-based hook); `stepParticles` never reads it. */
    readonly masses: Float32Array;
}
export declare function createParticleState(positions: ArrayLike<number>, dimensions?: 1 | 2 | 3, velocities?: ArrayLike<number>, masses?: ArrayLike<number>): ParticleState;
/**
 * Advance every particle once with semi-implicit Euler (`time` is the callback's time before
 * this step). The hook returns an **acceleration** per axis, not a force — `masses` is not
 * consulted. The arrays handed to the hook are reused between particles so stepping is
 * allocation-free; copy them if you need to retain them.
 */
export declare function stepParticles(state: ParticleState, dt: number, acceleration: ParticleAcceleration, time?: number): void;
export declare class ParticleSimulation {
    readonly state: ParticleState;
    time: number;
    private readonly initialPositions;
    private readonly initialVelocities;
    constructor(state: ParticleState);
    step(dt: number, acceleration: ParticleAcceleration): ParticleState;
    /** Restore the initial buffers and rewind simulation time. */
    reset(): ParticleState;
}
