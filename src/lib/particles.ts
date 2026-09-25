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

const DEFAULT_COUNT = 50_000;
const MAX_COUNT = 2_000_000;
/** All-pairs is O(N²) per step, so cap it well below `MAX_COUNT` to keep a frame affordable. */
const MAX_NBODY_COUNT = 32_768;
const WORKGROUP_SIZE = 64;
const QUAD_VERTICES = 6;
const PARAMS_BYTES = 32;
const CAMERA_BYTES = 96;

const COMPUTE_SHADER = /* wgsl */ `
struct Params {
  dt: f32,
  stiffness: f32,
  damping: f32,
  mode: u32,
  count: u32,
  softening: f32,
  pad0: u32,
  pad1: u32,
};

@group(0) @binding(0) var<storage, read> inPositions: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read> inVelocities: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> outPositions: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> outVelocities: array<vec4<f32>>;
@group(0) @binding(4) var<uniform> params: Params;

@compute @workgroup_size(${WORKGROUP_SIZE})
fn integrate(@builtin(global_invocation_id) gid: vec3<u32>) {
  let index = gid.x;
  if (index >= params.count) { return; }
  var position = inPositions[index].xyz;
  var velocity = inVelocities[index].xyz;
  var acceleration = vec3<f32>(0.0, 0.0, 0.0);
  if (params.mode == 0u) {
    // Harmonic oscillator: a = -k p, so the cloud breathes around the origin.
    acceleration = -params.stiffness * position;
  } else if (params.mode == 1u) {
    // Central attractor: a = -k p / |p|^3, softened so the core stays finite.
    let distance = max(length(position), 0.12);
    acceleration = -params.stiffness * position / (distance * distance * distance);
  } else {
    // Direct all-pairs gravity, one thread per body, no tree and no shared-memory tile:
    //   a = G * sum_j (p_j - p_i) / (|p_j - p_i|^2 + eps^2)^(3/2)
    // The j == index term is exactly zero, so the self-force needs no branch.
    let epsilonSquared = params.softening * params.softening;
    var total = vec3<f32>(0.0, 0.0, 0.0);
    for (var j: u32 = 0u; j < params.count; j = j + 1u) {
      let delta = inPositions[j].xyz - position;
      let inverse = inverseSqrt(dot(delta, delta) + epsilonSquared);
      total = total + delta * (inverse * inverse * inverse);
    }
    acceleration = params.stiffness * total;
  }
  // Semi-implicit Euler: update velocity first, then step position with the new velocity.
  velocity = (velocity + acceleration * params.dt) * params.damping;
  position = position + velocity * params.dt;
  outVelocities[index] = vec4<f32>(velocity, 0.0);
  outPositions[index] = vec4<f32>(position, 0.0);
}
`;

const RENDER_SHADER = /* wgsl */ `
struct Camera {
  viewProjection: mat4x4<f32>,
  pixelToClip: vec2<f32>,
  pointSize: f32,
  pad: f32,
  tint: vec4<f32>,
};

@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<storage, read> positions: array<vec4<f32>>;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) offset: vec2<f32>,
};

@vertex
fn vertex(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> VertexOutput {
  var corners = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
    vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0),
  );
  let corner = corners[vertexIndex];
  let clip = camera.viewProjection * vec4<f32>(positions[instanceIndex].xyz, 1.0);
  // Scaling by clip.w cancels the perspective divide, so the sprite keeps its pixel size.
  let halfSize = camera.pointSize * 0.5 * camera.pixelToClip * clip.w;
  var out: VertexOutput;
  out.position = vec4<f32>(clip.xy + corner * halfSize, clip.z, clip.w);
  out.offset = corner;
  return out;
}

@fragment
fn fragment(input: VertexOutput) -> @location(0) vec4<f32> {
  let distance = length(input.offset);
  if (distance > 1.0) { discard; }
  return vec4<f32>(camera.tint.rgb, camera.tint.a * smoothstep(1.0, 0.2, distance));
}
`;

/** mulberry32: small, fast, and reproducible across runs so the baseline is deterministic. */
function seedRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * `writeTimestamp` belongs to the optional GPU timestamp-query feature but is missing from the
 * current `@webgpu/types` release, so declare just the one call used here. Timestamp values are
 * nanoseconds; `getTimestampPeriod()` (also untyped, and unimplemented in Chrome) is used only
 * when a browser actually provides it.
 */
type TimestampEncoder = GPUCommandEncoder & { writeTimestamp(querySet: GPUQuerySet, queryIndex: number): void };
type TimestampQueue = GPUQueue & { getTimestampPeriod?(): number };

export class GpuParticleSimulation {
  static async create(options: GpuParticleSimulationOptions = {}): Promise<GpuParticleSimulation> {
    const count = options.count ?? DEFAULT_COUNT;
    if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
      throw new Error(`Particle count must be an integer between 1 and ${MAX_COUNT}`);
    }
    const radius = options.radius ?? 1;
    const timeStep = options.timeStep ?? 1 / 120;
    const damping = options.damping ?? 1;
    const swirl = options.swirl ?? 0.5;
    const pointSize = options.pointSize ?? 2.5;
    const softening = options.softening ?? 0.05;
    const layout = options.layout ?? 'ball';
    const orbitPeriod = options.orbitPeriod ?? 6;
    const mode = options.mode ?? 'oscillator';
    if (mode !== 'oscillator' && mode !== 'attractor' && mode !== 'nbody') {
      throw new Error("Particle mode must be 'oscillator', 'attractor', or 'nbody'");
    }
    if (mode === 'nbody' && count > MAX_NBODY_COUNT) {
      throw new Error(`All-pairs n-body is O(N^2); keep the count at or below ${MAX_NBODY_COUNT}`);
    }
    if (!(radius > 0) || !Number.isFinite(radius)) throw new Error('Particle radius must be positive');
    if (!(timeStep > 0) || !Number.isFinite(timeStep)) throw new Error('Particle time step must be positive');
    // A uniform disc needs G = 4π²R³/(T²N) to put a circular orbit of period T at its rim, so a
    // `disc` in `nbody` mode derives G from `orbitPeriod` unless the caller sets stiffness itself.
    const derived = mode === 'nbody' && layout === 'disc' && options.stiffness === undefined;
    const stiffness = derived
      ? 4 * Math.PI ** 2 * radius ** 3 / (orbitPeriod ** 2 * count)
      : options.stiffness ?? 6;
    if (!(stiffness >= 0) || !Number.isFinite(stiffness)) throw new Error('Particle stiffness must be non-negative');
    if (!(damping >= 0 && damping <= 1) || !Number.isFinite(damping)) throw new Error('Particle damping must be between 0 and 1');
    if (!Number.isFinite(swirl)) throw new Error('Particle swirl must be finite');
    if (!(softening > 0) || !Number.isFinite(softening)) throw new Error('Particle softening must be positive');
    if (layout !== 'ball' && layout !== 'disc') throw new Error("Particle layout must be 'ball' or 'disc'");
    if (!(orbitPeriod > 0) || !Number.isFinite(orbitPeriod)) throw new Error('Particle orbit period must be positive');
    if (!(pointSize > 0) || !Number.isFinite(pointSize)) throw new Error('Particle point size must be positive');

    let device = options.device;
    let owned = false;
    if (!device) {
      if (!navigator.gpu) throw new Error('WebGPU is not available in this browser');
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!adapter) throw new Error('No WebGPU adapter available');
      const features: GPUFeatureName[] = adapter.features.has('timestamp-query') ? ['timestamp-query'] : [];
      device = await adapter.requestDevice({ requiredFeatures: features });
      owned = true;
    }
    const format = options.format ?? navigator.gpu.getPreferredCanvasFormat();
    return new GpuParticleSimulation(device, owned, format, {
      count, radius, timeStep, stiffness, damping, swirl, softening, layout, orbitPeriod, pointSize, mode,
      seed: options.seed ?? 1,
      color: options.color ?? [1, 1, 1, 1],
      onError: options.onError,
    });
  }

  readonly device: GPUDevice;
  readonly count: number;
  readonly format: GPUTextureFormat;
  readonly supportsTiming: boolean;
  readonly byteLength: number;
  /** Why the last `measure()` returned `null`, or `null` if it succeeded or never ran. */
  timingError: string | null = null;

  private readonly onError?: (message: string) => void;
  private readonly owned: boolean;
  private readonly computePipeline: GPUComputePipeline;
  private readonly renderPipeline: GPURenderPipeline;
  private readonly positionA: GPUBuffer;
  private readonly positionB: GPUBuffer;
  private readonly velocityA: GPUBuffer;
  private readonly velocityB: GPUBuffer;
  private readonly paramsBuffer: GPUBuffer;
  private readonly cameraBuffer: GPUBuffer;
  private readonly readbackBuffer: GPUBuffer;
  private readonly computeAtoB: GPUBindGroup;
  private readonly computeBtoA: GPUBindGroup;
  private readonly renderFromA: GPUBindGroup;
  private readonly renderFromB: GPUBindGroup;
  private readonly params: Float32Array<ArrayBuffer>;
  private readonly paramsBits: Uint32Array<ArrayBuffer>;
  private readonly camera: Float32Array<ArrayBuffer>;
  private readonly timeStep: number;
  private readonly workgroups: number;
  private readonly initialPositions: Float32Array<ArrayBuffer>;
  private readonly initialVelocities: Float32Array<ArrayBuffer>;
  private current: 'a' | 'b' = 'a';
  private stepCount = 0;
  private destroyed = false;

  private constructor(
    device: GPUDevice,
    owned: boolean,
    format: GPUTextureFormat,
    config: {
      count: number; radius: number; timeStep: number; stiffness: number; damping: number;
      swirl: number; softening: number; layout: ParticleLayout; orbitPeriod: number;
      pointSize: number; mode: ParticleMode; seed: number; color: Color;
      onError?: (message: string) => void;
    },
  ) {
    this.device = device;
    this.owned = owned;
    this.format = format;
    this.count = config.count;
    this.timeStep = config.timeStep;
    this.byteLength = config.count * 16;
    this.workgroups = Math.ceil(config.count / WORKGROUP_SIZE);
    this.supportsTiming = device.features.has('timestamp-query');
    this.onError = config.onError;

    if (config.onError) {
      const report = config.onError;
      device.addEventListener('uncapturederror', event => report((event as GPUUncapturedErrorEvent).error.message));
      void device.lost.then(info => { if (info.reason !== 'destroyed') report(`GPU device lost: ${info.message}`); });
    }

    // Deterministic initial conditions. A `disc` needs circular-orbit velocities or the bodies
    // simply free-fall into the centre; a `ball` is for the oscillator/attractor modes.
    const random = seedRandom(config.seed);
    const positions = new Float32Array(config.count * 4);
    const velocities = new Float32Array(config.count * 4);
    const orbitSpeed = 2 * Math.PI * config.radius / config.orbitPeriod;
    for (let index = 0; index < config.count; index += 1) {
      const offset = index * 4;
      if (config.layout === 'disc') {
        const r = config.radius * Math.sqrt(random());
        const angle = random() * Math.PI * 2;
        const px = r * Math.cos(angle), pz = r * Math.sin(angle);
        // Thin in Y so the disc reads as a disc, with a little noise so it develops structure.
        const py = (random() * 2 - 1) * config.radius * 0.03;
        positions[offset] = px; positions[offset + 1] = py; positions[offset + 2] = pz; positions[offset + 3] = 0;
        // v = v_rim * sqrt(r/R) tangentially, the circular-orbit speed for a uniform disc.
        const speed = orbitSpeed * Math.sqrt(r / config.radius);
        const jitter = speed * 0.04 + 1e-4;
        velocities[offset] = -Math.sin(angle) * speed + (random() * 2 - 1) * jitter;
        velocities[offset + 1] = (random() * 2 - 1) * jitter;
        velocities[offset + 2] = Math.cos(angle) * speed + (random() * 2 - 1) * jitter;
        velocities[offset + 3] = 0;
        continue;
      }
      let x = 0, y = 0, z = 0, length = 0;
      do {
        x = random() * 2 - 1; y = random() * 2 - 1; z = random() * 2 - 1;
        length = Math.hypot(x, y, z);
      } while (length > 1 || length < 1e-6);
      const scale = config.radius * Math.cbrt(random());
      const px = x * scale, py = y * scale, pz = z * scale;
      positions[offset] = px; positions[offset + 1] = py; positions[offset + 2] = pz; positions[offset + 3] = 0;
      // cross([0,1,0], p) = [pz, 0, -px] gives a swirl about Y. That alone leaves the particle's
      // out-of-plane motion with a single shared frequency, so the whole cloud breathes in phase
      // and periodically pancakes; the seeded isotropic jitter gives each particle its own phase.
      const jitter = config.swirl * 0.5;
      velocities[offset] = pz * config.swirl + (random() * 2 - 1) * jitter;
      velocities[offset + 1] = (random() * 2 - 1) * jitter;
      velocities[offset + 2] = -px * config.swirl + (random() * 2 - 1) * jitter;
      velocities[offset + 3] = 0;
    }
    this.initialPositions = positions;
    this.initialVelocities = velocities;

    const storageUsage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
    const makeBuffer = (size: number, usage: GPUBufferUsageFlags) => device.createBuffer({ size, usage });
    this.positionA = makeBuffer(this.byteLength, storageUsage);
    this.positionB = makeBuffer(this.byteLength, storageUsage);
    this.velocityA = makeBuffer(this.byteLength, storageUsage);
    this.velocityB = makeBuffer(this.byteLength, storageUsage);
    this.paramsBuffer = makeBuffer(PARAMS_BYTES, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
    this.cameraBuffer = makeBuffer(CAMERA_BYTES, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
    // Readback is only needed for `checksum()`; keep it small and off the hot path.
    this.readbackBuffer = makeBuffer(this.byteLength, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST);

    this.params = new Float32Array(new ArrayBuffer(PARAMS_BYTES));
    this.paramsBits = new Uint32Array(this.params.buffer);
    this.params[0] = config.timeStep;
    this.params[1] = config.stiffness;
    this.params[2] = config.damping;
    this.paramsBits[3] = config.mode === 'oscillator' ? 0 : config.mode === 'attractor' ? 1 : 2;
    this.paramsBits[4] = config.count;
    this.params[5] = config.softening;
    device.queue.writeBuffer(this.paramsBuffer, 0, this.params);

    this.camera = new Float32Array(new ArrayBuffer(CAMERA_BYTES));
    this.camera[16] = 2; // pixelToClip.x, replaced by setCamera()
    this.camera[17] = 2;
    this.camera[18] = config.pointSize;
    this.camera.set(config.color, 20);
    device.queue.writeBuffer(this.cameraBuffer, 0, this.camera);

    const computeModule = device.createShaderModule({ code: COMPUTE_SHADER, label: 'particle integrate' });
    this.computePipeline = device.createComputePipeline({
      layout: 'auto',
      compute: { module: computeModule, entryPoint: 'integrate' },
    });

    const renderModule = device.createShaderModule({ code: RENDER_SHADER, label: 'particle sprites' });
    const blend: GPUBlendState = {
      color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    };
    this.renderPipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: renderModule, entryPoint: 'vertex' },
      fragment: { module: renderModule, entryPoint: 'fragment', targets: [{ format, blend }] },
      primitive: { topology: 'triangle-list' },
    });

    const computeBindGroup = (readPosition: GPUBuffer, writePosition: GPUBuffer, readVelocity: GPUBuffer, writeVelocity: GPUBuffer) =>
      device.createBindGroup({
        layout: this.computePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: readPosition } },
          { binding: 1, resource: { buffer: readVelocity } },
          { binding: 2, resource: { buffer: writePosition } },
          { binding: 3, resource: { buffer: writeVelocity } },
          { binding: 4, resource: { buffer: this.paramsBuffer } },
        ],
      });
    this.computeAtoB = computeBindGroup(this.positionA, this.positionB, this.velocityA, this.velocityB);
    this.computeBtoA = computeBindGroup(this.positionB, this.positionA, this.velocityB, this.velocityA);

    const renderBindGroup = (positions: GPUBuffer) =>
      device.createBindGroup({
        layout: this.renderPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.cameraBuffer } },
          { binding: 1, resource: { buffer: positions } },
        ],
      });
    this.renderFromA = renderBindGroup(this.positionA);
    this.renderFromB = renderBindGroup(this.positionB);

    this.reset();
  }

  /** Integration steps issued since the last `reset()`. */
  get steps(): number { return this.stepCount; }

  /** Record `substeps` integration dispatches. The caller owns submission. */
  step(encoder: GPUCommandEncoder, substeps = 1): void {
    this.assertLive();
    if (!Number.isInteger(substeps) || substeps < 1 || substeps > 64) {
      throw new Error('Particle substeps must be an integer between 1 and 64');
    }
    for (let index = 0; index < substeps; index += 1) {
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.computePipeline);
      pass.setBindGroup(0, this.current === 'a' ? this.computeAtoB : this.computeBtoA);
      pass.dispatchWorkgroups(this.workgroups);
      pass.end();
      this.current = this.current === 'a' ? 'b' : 'a';
      this.stepCount += 1;
    }
  }

  /**
   * Record the instanced point draw. The render pass must have **no depth attachment**;
   * the pipeline blends alpha over whatever is already there.
   */
  render(pass: GPURenderPassEncoder): void {
    this.assertLive();
    pass.setPipeline(this.renderPipeline);
    pass.setBindGroup(0, this.current === 'a' ? this.renderFromA : this.renderFromB);
    pass.draw(QUAD_VERTICES, this.count);
  }

  /** Update the camera uniform. `viewProjection` is column-major, as elsewhere in the library. */
  setCamera(viewProjection: Float32Array, width: number, height: number): void {
    this.assertLive();
    if (viewProjection.length < 16) throw new Error('Camera matrix must have 16 elements');
    if (!(width > 0) || !(height > 0)) throw new Error('Camera size must be positive');
    this.camera.set(viewProjection.subarray(0, 16), 0);
    this.camera[16] = 2 / width;
    this.camera[17] = 2 / height;
    this.device.queue.writeBuffer(this.cameraBuffer, 0, this.camera);
  }

  /** Restore the initial positions, velocities, and step count. */
  reset(): void {
    this.assertLive();
    this.device.queue.writeBuffer(this.positionA, 0, this.initialPositions);
    this.device.queue.writeBuffer(this.velocityA, 0, this.initialVelocities);
    this.current = 'a';
    this.stepCount = 0;
  }

  /**
   * Average GPU milliseconds per integration step, or `null` when timestamp queries are
   * unavailable. Integrates, so call it between frames.
   */
  async measure(iterations = 32): Promise<number | null> {
    this.assertLive();
    if (!this.supportsTiming) return null;
    if (!Number.isInteger(iterations) || iterations < 1 || iterations > 1024) {
      throw new Error('Measurement iterations must be an integer between 1 and 1024');
    }
    const querySet = this.device.createQuerySet({ type: 'timestamp', count: 2 });
    const resolve = this.device.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
    const readback = this.device.createBuffer({ size: 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    try {
      const encoder = this.device.createCommandEncoder() as TimestampEncoder;
      encoder.writeTimestamp(querySet, 0);
      this.step(encoder, iterations);
      encoder.writeTimestamp(querySet, 1);
      encoder.resolveQuerySet(querySet, 0, 2, resolve, 0);
      encoder.copyBufferToBuffer(resolve, 0, readback, 0, 16);
      this.device.queue.submit([encoder.finish()]);
      await readback.mapAsync(GPUMapMode.READ);
      const stamps = new BigUint64Array(readback.getMappedRange());
      // Timestamps are nanoseconds unless the browser reports a tick period (Chrome does not).
      const queue = this.device.queue as TimestampQueue;
      const period = typeof queue.getTimestampPeriod === 'function' ? queue.getTimestampPeriod() : 1;
      const nanoseconds = Number(stamps[1] - stamps[0]) * period;
      this.timingError = null;
      return nanoseconds / 1e6 / iterations;
    } catch (error) {
      // Returning null hides driver problems, so keep the reason readable and surface it.
      this.timingError = String((error as Error)?.message ?? error);
      this.onError?.(`Particle timing failed: ${this.timingError}`);
      return null;
    } finally {
      readback.destroy();
      resolve.destroy();
      querySet.destroy();
    }
  }

  /**
   * FNV-1a hash of the current position buffer. Same seed + same step count must give the same
   * value, which makes it a cheap determinism check.
   */
  async checksum(): Promise<number> {
    this.assertLive();
    const encoder = this.device.createCommandEncoder();
    encoder.copyBufferToBuffer(this.current === 'a' ? this.positionA : this.positionB, 0, this.readbackBuffer, 0, this.byteLength);
    this.device.queue.submit([encoder.finish()]);
    await this.readbackBuffer.mapAsync(GPUMapMode.READ);
    const bytes = new Uint8Array(this.readbackBuffer.getMappedRange());
    let hash = 2166136261;
    for (let index = 0; index < bytes.length; index += 1) {
      hash ^= bytes[index];
      hash = Math.imul(hash, 16777619);
    }
    this.readbackBuffer.unmap();
    return hash >>> 0;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const buffer of [this.positionA, this.positionB, this.velocityA, this.velocityB, this.paramsBuffer, this.cameraBuffer, this.readbackBuffer]) {
      buffer.destroy();
    }
    if (this.owned) this.device.destroy();
  }

  private assertLive(): void {
    if (this.destroyed) throw new Error('GpuParticleSimulation has been destroyed');
  }
}
