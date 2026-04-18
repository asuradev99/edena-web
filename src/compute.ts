import { Sphere, PhysicsParams } from "./types.js";

// ── WGSL — two entry points share one module ──────────────────────────────────
//
//  PhysElem layout (64 B / particle):
//    pos_r   vec4f  offset  0   xyz=position, w=radius
//    vel_m   vec4f  offset 16   xyz=velocity, w=mass
//    color   vec4f  offset 32   xyz=base_color, w=pad
//    acc_pad vec4f  offset 48   xyz=acceleration from previous substep, w=pad
//
//  Velocity Verlet over one substep:
//    Pass 1 — updatePos:
//      pos_new = pos + vel*dt + ½*acc_old*dt²
//
//    Pass 2 — updateVel:
//      acc_new = LJ_forces(pos_new) + spring_forces(pos_new) + gravity
//      vel_new = vel + ½*(acc_old + acc_new)*dt
//      apply speed cap, wall bounce, global damping
//      write pos_new (corrected), vel_new, acc_new back to phys
//      update render buffer and (optionally) force-line buffer
//
const COMPUTE_SHADER = /* wgsl */`
struct PhysElem   { pos_r: vec4f, vel_m: vec4f, color: vec4f, acc_pad: vec4f }
struct RenderElem { pos_r: vec4f, color_pad: vec4f }
struct SpringEntry { j: u32, rest: f32 }   // 8 bytes, stride 8
struct Params {
  n:           u32,   // offset  0
  dt:          f32,   // offset  4
  gravity:     f32,   // offset  8
  lj_eps:      f32,   // offset 12
  lj_min:      f32,   // offset 16
  lj_cutoff:   f32,   // offset 20
  damping:     f32,   // offset 24
  max_speed:   f32,   // offset 28
  color_by_ke: u32,   // offset 32
  ke_scale:    f32,   // offset 36
  show_forces: u32,   // offset 40
  spring_k:    f32,   // offset 44
  box_half:    f32,   // offset 48
  _pad0:       u32,   // offset 52
  _pad1:       u32,   // offset 56
  _pad2:       u32,   // offset 60
}                     // total   64 B

const MAX_SPRINGS: u32 = 12u;  // FCC: 12 nearest neighbours

@group(0) @binding(0) var<storage, read_write> phys:          array<PhysElem>;
@group(0) @binding(1) var<storage, read_write> rend:          array<RenderElem>;
@group(0) @binding(2) var<uniform>             params:        Params;
@group(0) @binding(3) var<storage, read_write> forceLines:    array<f32>;
@group(0) @binding(4) var<storage, read>       spring_counts: array<u32>;
@group(0) @binding(5) var<storage, read>       spring_data:   array<SpringEntry>;

// ── Helpers ───────────────────────────────────────────────────────────────────

fn ke_color(t: f32) -> vec3f {
  let r = clamp(2.0*t - 0.5, 0.0, 1.0);
  let g = clamp(min(4.0*t, 3.0 - 4.0*t), 0.0, 1.0);
  let b = clamp(1.5 - 4.0*t, 0.0, 1.0);
  return vec3f(r, g, b);
}

// Compute LJ + gravity + spring acceleration for particle i at position pos_i.
// Reads current phys[j].pos_r for all j (positions written by updatePos).
fn totalAcc(i: u32, pos_i: vec3f, r_i: f32, m_i: f32) -> vec3f {
  var acc = vec3f(0.0, -params.gravity, 0.0);

  // ── Lennard-Jones (collision / short-range repulsion) ─────────────────────
  for (var j = 0u; j < params.n; j++) {
    if j == i { continue; }
    let pj    = phys[j];
    let pos_j = pj.pos_r.xyz;
    let r_j   = pj.pos_r.w;
    let d     = pos_i - pos_j;
    let r2    = dot(d, d);
    if r2 < 1e-8 { continue; }
    let sigma  = r_i + r_j;
    let cut2   = params.lj_cutoff * sigma * (params.lj_cutoff * sigma);
    if r2 > cut2 { continue; }
    let r2c  = max(r2, params.lj_min * sigma * (params.lj_min * sigma));
    let sr2  = (sigma * sigma) / r2c;
    let sr6  = sr2 * sr2 * sr2;
    let sr12 = sr6 * sr6;
    let f    = (24.0 * params.lj_eps / r2c) * (2.0 * sr12 - sr6);
    acc += (f / m_i) * d;
  }

  // ── Hooke's law springs ───────────────────────────────────────────────────
  let n_sp = spring_counts[i];
  for (var k = 0u; k < n_sp; k++) {
    let entry = spring_data[i * MAX_SPRINGS + k];
    let d     = pos_i - phys[entry.j].pos_r.xyz;
    let dist  = length(d);
    if dist < 1e-6 { continue; }
    let ext   = dist - entry.rest;
    // F = -k * ext * d_hat  →  a = F/m
    acc += (-params.spring_k * ext / (dist * m_i)) * d;
  }

  return acc;
}

// ── Pass 1 — position update ──────────────────────────────────────────────────
@compute @workgroup_size(64)
fn updatePos(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if i >= params.n { return; }

  let e   = phys[i];
  let pos = e.pos_r.xyz;
  let r   = e.pos_r.w;
  let vel = e.vel_m.xyz;
  let a0  = e.acc_pad.xyz;
  let dt  = params.dt;

  let new_pos = pos + vel * dt + 0.5 * a0 * (dt * dt);
  phys[i].pos_r = vec4f(new_pos, r);
}

// ── Pass 2 — force recompute + velocity update ────────────────────────────────
@compute @workgroup_size(64)
fn updateVel(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if i >= params.n { return; }

  let e   = phys[i];
  var pos = e.pos_r.xyz;
  let r   = e.pos_r.w;
  let vel = e.vel_m.xyz;
  let m   = e.vel_m.w;
  let a0  = e.acc_pad.xyz;
  let dt  = params.dt;

  let a1 = totalAcc(i, pos, r, m);

  // Velocity Verlet: v(t+dt) = v(t) + ½·(a(t) + a(t+dt))·dt
  var vel_new = vel + 0.5 * (a0 + a1) * dt;

  // Speed cap
  let spd2 = dot(vel_new, vel_new);
  if spd2 > params.max_speed * params.max_speed {
    vel_new = vel_new * (params.max_speed / sqrt(spd2));
  }

  // Elastic wall bounce + position correction
  let bound = params.box_half - r;
  if pos.x >  bound { pos.x =  bound; vel_new.x = -abs(vel_new.x); }
  if pos.x < -bound { pos.x = -bound; vel_new.x =  abs(vel_new.x); }
  if pos.y >  bound { pos.y =  bound; vel_new.y = -abs(vel_new.y); }
  if pos.y < -bound { pos.y = -bound; vel_new.y =  abs(vel_new.y); }
  if pos.z >  bound { pos.z =  bound; vel_new.z = -abs(vel_new.z); }
  if pos.z < -bound { pos.z = -bound; vel_new.z =  abs(vel_new.z); }

  // Global damping
  vel_new = vel_new * params.damping;

  // Write back physics state
  phys[i].pos_r   = vec4f(pos, r);
  phys[i].vel_m   = vec4f(vel_new, m);
  phys[i].acc_pad = vec4f(a1, 0.0);

  // Update render buffer
  rend[i].pos_r = vec4f(pos, r);
  if params.color_by_ke != 0u {
    let ke = 0.5 * m * dot(vel_new, vel_new);
    rend[i].color_pad = vec4f(ke_color(clamp(ke / params.ke_scale, 0.0, 1.0)), 0.0);
  } else {
    rend[i].color_pad = vec4f(e.color.xyz, 0.0);
  }

  // Force-vector line vertices (2 verts × 6 f32 = 12 f32/sphere)
  if params.show_forces != 0u {
    let fi      = i * 12u;
    let acc_len = length(a1);
    var arrow_end = pos;
    var fc = vec3f(0.2, 0.5, 1.0);
    if acc_len > 0.001 {
      let arrow_len = clamp(acc_len * 0.12, 0.08, 2.0);
      arrow_end = pos + (a1 / acc_len) * arrow_len;
      let t = clamp(acc_len / 8.0, 0.0, 1.0);
      fc = mix(vec3f(0.15, 0.4, 1.0), vec3f(1.0, 0.6, 0.1), t);
    }
    forceLines[fi+0u] = pos.x;       forceLines[fi+1u] = pos.y;       forceLines[fi+2u] = pos.z;
    forceLines[fi+3u] = fc.x;        forceLines[fi+4u] = fc.y;        forceLines[fi+5u] = fc.z;
    forceLines[fi+6u] = arrow_end.x; forceLines[fi+7u] = arrow_end.y; forceLines[fi+8u] = arrow_end.z;
    forceLines[fi+9u] = fc.x;        forceLines[fi+10u] = fc.y;       forceLines[fi+11u] = fc.z;
  }
}
`;

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_SPHERES          = 512;
const MAX_SPRINGS_PER_ATOM = 12;  // FCC has exactly 12 nearest neighbours
const MAX_UNIQUE_SPRINGS   = MAX_SPHERES * MAX_SPRINGS_PER_ATOM / 2;   // i<j pairs
const PHYS_STRIDE          = 64;  // 4 × vec4f
const REND_STRIDE          = 32;
const FORCE_BUF_BYTES      = MAX_SPHERES * 12 * 4;
const SPRING_COUNT_BYTES   = MAX_SPHERES * 4;                           // u32 per atom
const SPRING_DATA_BYTES    = MAX_SPHERES * MAX_SPRINGS_PER_ATOM * 8;   // SpringEntry (8 B) per slot
const SPRING_PAIRS_BYTES   = MAX_UNIQUE_SPRINGS * 8;                    // vec2u per unique pair
const N_SUBSTEPS          = 6;
const DT_BASE             = 1 / (60 * N_SUBSTEPS);

// ── Compute class ─────────────────────────────────────────────────────────────

export class Compute {
  private device!: GPUDevice;
  private physBuf!: GPUBuffer;
  private stagingBuf!: GPUBuffer;
  private paramsBuf!: GPUBuffer;
  private springCountBuf!: GPUBuffer;
  private springDataBuf!: GPUBuffer;
  springPairsBuf!: GPUBuffer;    // unique (i,j) pairs for cylinder rendering
  springRenderCount = 0;
  private posUpdatePipeline!: GPUComputePipeline;
  private velUpdatePipeline!: GPUComputePipeline;
  private bindGroup!: GPUBindGroup;
  private readbackPending = false;
  private stagingMapping  = false;

  renderBuf!: GPUBuffer;
  forceLineBuf!: GPUBuffer;
  sphereCount = 0;

  init(device: GPUDevice): void {
    this.device = device;

    this.physBuf = device.createBuffer({
      size:  MAX_SPHERES * PHYS_STRIDE,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });
    this.renderBuf = device.createBuffer({
      size:  MAX_SPHERES * REND_STRIDE,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.forceLineBuf = device.createBuffer({
      size:  FORCE_BUF_BYTES,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX,
    });
    this.stagingBuf = device.createBuffer({
      size:  MAX_SPHERES * PHYS_STRIDE,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    this.paramsBuf = device.createBuffer({
      size:  64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.springCountBuf = device.createBuffer({
      size:  SPRING_COUNT_BYTES,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.springDataBuf = device.createBuffer({
      size:  SPRING_DATA_BYTES,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.springPairsBuf = device.createBuffer({
      size:  SPRING_PAIRS_BYTES,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    const bgl = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
      ],
    });
    this.bindGroup = device.createBindGroup({
      layout: bgl,
      entries: [
        { binding: 0, resource: { buffer: this.physBuf        } },
        { binding: 1, resource: { buffer: this.renderBuf      } },
        { binding: 2, resource: { buffer: this.paramsBuf      } },
        { binding: 3, resource: { buffer: this.forceLineBuf   } },
        { binding: 4, resource: { buffer: this.springCountBuf } },
        { binding: 5, resource: { buffer: this.springDataBuf  } },
      ],
    });

    const layout = device.createPipelineLayout({ bindGroupLayouts: [bgl] });
    const mod    = device.createShaderModule({ code: COMPUTE_SHADER });

    this.posUpdatePipeline = device.createComputePipeline({
      layout, compute: { module: mod, entryPoint: "updatePos" },
    });
    this.velUpdatePipeline = device.createComputePipeline({
      layout, compute: { module: mod, entryPoint: "updateVel" },
    });
  }

  upload(spheres: Sphere[]): void {
    this.sphereCount = spheres.length;
    if (spheres.length === 0) return;

    const physData = new Float32Array(new ArrayBuffer(spheres.length * PHYS_STRIDE));
    const rendData = new Float32Array(new ArrayBuffer(spheres.length * REND_STRIDE));

    for (let i = 0; i < spheres.length; i++) {
      const s  = spheres[i];
      const po = i * 16;
      physData[po]    = s.position[0]; physData[po+1]  = s.position[1]; physData[po+2]  = s.position[2];
      physData[po+3]  = s.radius;
      physData[po+4]  = s.velocity[0]; physData[po+5]  = s.velocity[1]; physData[po+6]  = s.velocity[2];
      physData[po+7]  = s.mass;
      physData[po+8]  = s.color[0];    physData[po+9]  = s.color[1];    physData[po+10] = s.color[2];
      // po+11..15 = 0 (color pad, acc_pad — zero-initialised)

      const ro = i * 8;
      rendData[ro]   = s.position[0]; rendData[ro+1] = s.position[1]; rendData[ro+2] = s.position[2];
      rendData[ro+3] = s.radius;
      rendData[ro+4] = s.color[0];    rendData[ro+5] = s.color[1];    rendData[ro+6] = s.color[2];
    }

    this.device.queue.writeBuffer(this.physBuf,   0, physData.buffer as ArrayBuffer);
    this.device.queue.writeBuffer(this.renderBuf, 0, rendData.buffer as ArrayBuffer);
  }

  /** Build nearest-neighbour springs from current sphere positions and upload to GPU.
   *  Threshold = 1.2 × minimum pairwise distance in the system.
   *  Must be called after upload() whenever positions are reset. */
  buildAndUploadSprings(spheres: Sphere[]): void {
    // Always write a zeroed count buffer so stale data from a previous larger
    // config doesn't affect atoms beyond the current count.
    const counts  = new Uint32Array(MAX_SPHERES);
    const entryAB = new ArrayBuffer(spheres.length * MAX_SPRINGS_PER_ATOM * 8);
    const entryU  = new Uint32Array(entryAB);
    const entryF  = new Float32Array(entryAB);

    const n = spheres.length;
    if (n >= 2) {
      // Find minimum pairwise distance
      let minDist = Infinity;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const dx = spheres[i].position[0] - spheres[j].position[0];
          const dy = spheres[i].position[1] - spheres[j].position[1];
          const dz = spheres[i].position[2] - spheres[j].position[2];
          const d  = Math.sqrt(dx*dx + dy*dy + dz*dz);
          if (d < minDist) minDist = d;
        }
      }
      const threshold = minDist * 1.2;

      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          const dx = spheres[i].position[0] - spheres[j].position[0];
          const dy = spheres[i].position[1] - spheres[j].position[1];
          const dz = spheres[i].position[2] - spheres[j].position[2];
          const d  = Math.sqrt(dx*dx + dy*dy + dz*dz);
          if (d <= threshold && counts[i] < MAX_SPRINGS_PER_ATOM) {
            const slot = i * MAX_SPRINGS_PER_ATOM + counts[i];
            entryU[slot * 2]     = j;  // j index as u32
            entryF[slot * 2 + 1] = d;  // rest length as f32
            counts[i]++;
          }
        }
      }
    }

    // Collect unique (i < j) pairs for cylinder rendering
    const pairsAB = new ArrayBuffer(MAX_UNIQUE_SPRINGS * 8);
    const pairsU  = new Uint32Array(pairsAB);
    let pairCount = 0;
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < counts[i]; k++) {
        const slot = i * MAX_SPRINGS_PER_ATOM + k;
        const j    = entryU[slot * 2];
        if (i < j && pairCount < MAX_UNIQUE_SPRINGS) {
          pairsU[pairCount * 2]     = i;
          pairsU[pairCount * 2 + 1] = j;
          pairCount++;
        }
      }
    }
    this.springRenderCount = pairCount;

    this.device.queue.writeBuffer(this.springCountBuf, 0, counts.buffer as ArrayBuffer);
    if (n > 0) {
      this.device.queue.writeBuffer(this.springDataBuf, 0, entryAB);
    }
    if (pairCount > 0) {
      this.device.queue.writeBuffer(this.springPairsBuf, 0, pairsAB, 0, pairCount * 8);
    }
  }

  updatePhysicsParams(p: PhysicsParams): void {
    const buf = new ArrayBuffer(64);
    const u32 = new Uint32Array(buf);
    const f32 = new Float32Array(buf);
    u32[0]  = this.sphereCount;
    f32[1]  = DT_BASE * p.timeScale;
    f32[2]  = p.gravity;
    f32[3]  = p.ljEps;
    f32[4]  = p.ljMin;
    f32[5]  = p.ljCutoff;
    f32[6]  = p.damping;
    f32[7]  = 10.0;
    u32[8]  = p.colorByKE  ? 1 : 0;
    f32[9]  = p.keScale;
    u32[10] = p.showForces ? 1 : 0;
    f32[11] = p.springK;
    f32[12] = p.boxHalf;
    // f32[13..15] = 0 (padding)
    this.device.queue.writeBuffer(this.paramsBuf, 0, buf);
  }

  private _writeParams(): void {
    const buf = new Uint32Array(1);
    buf[0] = this.sphereCount;
    this.device.queue.writeBuffer(this.paramsBuf, 0, buf.buffer as ArrayBuffer);
  }

  step(encoder: GPUCommandEncoder): void {
    if (this.sphereCount === 0) return;
    const groups = Math.ceil(this.sphereCount / 64);
    for (let s = 0; s < N_SUBSTEPS; s++) {
      const p1 = encoder.beginComputePass();
      p1.setPipeline(this.posUpdatePipeline);
      p1.setBindGroup(0, this.bindGroup);
      p1.dispatchWorkgroups(groups);
      p1.end();

      const p2 = encoder.beginComputePass();
      p2.setPipeline(this.velUpdatePipeline);
      p2.setBindGroup(0, this.bindGroup);
      p2.dispatchWorkgroups(groups);
      p2.end();
    }
  }

  scheduleReadback(encoder: GPUCommandEncoder): void {
    if (this.sphereCount === 0 || this.readbackPending || this.stagingMapping) return;
    encoder.copyBufferToBuffer(
      this.physBuf, 0, this.stagingBuf, 0, this.sphereCount * PHYS_STRIDE
    );
    this.readbackPending = true;
  }

  async doReadback(spheres: Sphere[]): Promise<void> {
    if (!this.readbackPending || this.stagingMapping || this.sphereCount === 0) return;
    this.readbackPending = false;
    this.stagingMapping  = true;

    const byteLen = this.sphereCount * PHYS_STRIDE;
    await this.stagingBuf.mapAsync(GPUMapMode.READ, 0, byteLen);
    const data = new Float32Array(this.stagingBuf.getMappedRange(0, byteLen));
    const n = Math.min(spheres.length, this.sphereCount);
    for (let i = 0; i < n; i++) {
      const o = i * 16;
      spheres[i].position[0] = data[o];   spheres[i].position[1] = data[o+1]; spheres[i].position[2] = data[o+2];
      spheres[i].velocity[0] = data[o+4]; spheres[i].velocity[1] = data[o+5]; spheres[i].velocity[2] = data[o+6];
    }
    this.stagingBuf.unmap();
    this.stagingMapping = false;
  }
}
