# 05 · The simulation seam and GPU compute

Live lab: [`academy.html#ch-simulation`](../../academy.html#ch-simulation) ·
model: [`harmonicEnergy`](../../src/examples/academy-model.ts) ·
library: [`src/lib/simulation.ts`](../../src/lib/simulation.ts), [`src/lib/particles.ts`](../../src/lib/particles.ts)

## What the code does

`src/lib/simulation.ts` is renderer-agnostic by design. It holds plain typed arrays and one stepping
function:

```ts
createParticleState(positions, dimensions, velocities?, masses?) → ParticleState
stepParticles(state, dt, acceleration, time?)                   → void
```

`stepParticles` walks every particle once, calls `acceleration(index, position, velocity, time)` and
updates **semi-implicitly**:

```
v ← v + a(x, t) · dt
x ← x + v · dt
```

The arrays handed to the callback are reused between particles, so stepping allocates nothing per
particle; hook authors must copy anything they keep. The callback returns an **acceleration**, not a
force, and `masses` is carried but never read by the stepper.

`src/lib/particles.ts` is the GPU-resident counterpart: ping-pong storage buffers, one compute
dispatch per step, and a render pipeline that instances straight from the storage buffer. It uses
the same semi-implicit Euler update, so moving to the GPU changes throughput, not accuracy. The
caller still owns submission and the render pass.

## What is exact

For the harmonic well `a = −k x`, the total energy `E = ½m|v|² + ½k|x|²` is constant in the exact
solution. The lab computes it with `harmonicEnergy` over the real `ParticleState` arrays. Symplectic
Euler does not conserve `E` exactly; it conserves a nearby modified energy, so the drift **oscillates
and stays bounded** instead of growing without limit — which is why it is a defensible choice for a
game loop and a poor choice for a long climate integration.

## What is approximate

- The measured step rate is CPU-side, single-threaded, and includes the per-substep call overhead of
  `stepParticles`. It is a throughput reading under the current frame load, not a peak benchmark.
- Energy drift is quoted as a percentage of the initial energy. Because the drift oscillates, the
  number on screen depends on where in the oscillation you look; the substep selector shows the
  trend, not a converged value.

## Why the GPU

The project has measured, on a Chrome/Vulkan path, roughly:

| Workload | GPU step time |
|----------|---------------|
| 50 000 particles, oscillator | ≈ 0.022 ms / step |
| 8 192 bodies, all-pairs gravity | ≈ 0.5 ms / step |
| 32 768 bodies, all-pairs gravity | ≈ 3.7 ms / step |

Those are the reasons to move the seam onto the GPU: tens of thousands of independent updates per
frame. The CPU path in this lab is deliberately small so the readout stays legible; it is the same
code shape, one device and one dispatch away from the big counts.

## Limits

- `GpuParticleSimulation` renders **without a depth attachment**: tens of thousands of unsorted
  translucent sprites that wrote depth would occlude each other with hard edges.
- There are no collisions, spatial acceleration structures, or long-range forces in the baseline.
  All-pairs is `O(N²)` and the library rejects counts above 32 768 for `nbody` up front.
- `stepParticles` reuses its scratch arrays, so a callback that stores the `position`/`velocity`
  arrays sees them change under it. Copy if you keep them.
- The CPU and GPU implementations will not agree bit-for-bit: different order of operations, and the
  GPU accumulates in its shader's precision.

## Where to look

- [`src/lib/simulation.ts`](../../src/lib/simulation.ts) — the seam.
- [`src/lib/particles.ts`](../../src/lib/particles.ts) — `GpuParticleSimulation`, `measure()`.
- [`src/examples/physics-lab.ts`](../../src/examples/physics-lab.ts) — six experiments using both.
