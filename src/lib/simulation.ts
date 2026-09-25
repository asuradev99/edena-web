/** Renderer-agnostic particle data and a small deterministic stepping seam. */

export type ParticleAcceleration = (
  index: number,
  position: readonly number[],
  velocity: readonly number[],
  time: number,
) => readonly number[];

export interface ParticleState {
  readonly dimensions: 1 | 2 | 3;
  readonly count: number;
  /** Mutated in place by `stepParticles`, so `readonly` here is shallow. */
  readonly positions: Float32Array;
  readonly velocities: Float32Array;
  /** Carried for consumers (for example a future force-based hook); `stepParticles` never reads it. */
  readonly masses: Float32Array;
}

function assertFiniteArray(values: Float32Array, name: string): void {
  for (const value of values) {
    if (!Number.isFinite(value)) throw new Error(`${name} must contain finite values`);
  }
}

export function createParticleState(
  positions: ArrayLike<number>,
  dimensions: 1 | 2 | 3 = 3,
  velocities?: ArrayLike<number>,
  masses?: ArrayLike<number>,
): ParticleState {
  if (!Number.isInteger(dimensions) || dimensions < 1 || dimensions > 3) {
    throw new Error('Particle dimensions must be 1, 2, or 3');
  }
  if (positions.length === 0 || positions.length % dimensions !== 0) {
    throw new Error('Particle positions must be a non-empty multiple of dimensions');
  }
  const count = positions.length / dimensions;
  const positionData = Float32Array.from(positions);
  const velocityData = velocities ? Float32Array.from(velocities) : new Float32Array(positions.length);
  const massData = masses ? Float32Array.from(masses) : new Float32Array(count).fill(1);
  if (velocityData.length !== positions.length) throw new Error('Particle velocities must match positions');
  if (massData.length !== count) throw new Error('Particle masses must match particle count');
  assertFiniteArray(positionData, 'Particle positions');
  assertFiniteArray(velocityData, 'Particle velocities');
  assertFiniteArray(massData, 'Particle masses');
  if (massData.some((mass) => mass <= 0)) throw new Error('Particle masses must be positive');
  return { dimensions, count, positions: positionData, velocities: velocityData, masses: massData };
}

/**
 * Advance every particle once with semi-implicit Euler (`time` is the callback's time before
 * this step). The hook returns an **acceleration** per axis, not a force — `masses` is not
 * consulted. The arrays handed to the hook are reused between particles so stepping is
 * allocation-free; copy them if you need to retain them.
 */
export function stepParticles(
  state: ParticleState,
  dt: number,
  acceleration: ParticleAcceleration,
  time = 0,
): void {
  if (!Number.isFinite(dt) || dt < 0) throw new Error('Simulation timestep must be finite and non-negative');
  const { dimensions, count, positions, velocities } = state;
  const position: number[] = new Array(dimensions), velocity: number[] = new Array(dimensions);
  for (let index = 0; index < count; index += 1) {
    const offset = index * dimensions;
    for (let axis = 0; axis < dimensions; axis += 1) {
      position[axis] = positions[offset + axis];
      velocity[axis] = velocities[offset + axis];
    }
    const vector = acceleration(index, position, velocity, time);
    if (vector.length !== dimensions || vector.some((value) => !Number.isFinite(value))) {
      throw new Error('Particle acceleration must return finite values for each dimension');
    }
    for (let axis = 0; axis < dimensions; axis += 1) {
      velocities[offset + axis] += vector[axis] * dt;
      positions[offset + axis] += velocities[offset + axis] * dt;
    }
  }
}

export class ParticleSimulation {
  public time = 0;
  private readonly initialPositions: Float32Array;
  private readonly initialVelocities: Float32Array;

  constructor(public readonly state: ParticleState) {
    this.initialPositions = state.positions.slice();
    this.initialVelocities = state.velocities.slice();
  }

  step(dt: number, acceleration: ParticleAcceleration): ParticleState {
    if (!Number.isFinite(dt) || dt < 0) throw new Error('Simulation timestep must be finite and non-negative');
    // `stepParticles` now takes the time directly, so no per-step wrapper closure is needed.
    stepParticles(this.state, dt, acceleration, this.time);
    this.time += dt;
    return this.state;
  }

  /** Restore the initial buffers and rewind simulation time. */
  reset(): ParticleState {
    this.state.positions.set(this.initialPositions);
    this.state.velocities.set(this.initialVelocities);
    this.time = 0;
    return this.state;
  }
}
