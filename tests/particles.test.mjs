import test from 'node:test';
import assert from 'node:assert/strict';
import { GpuParticleSimulation } from '../build/index.js';

// These run without a GPU: every option is validated before the device is requested, so the
// rejection paths are testable in Node even though the integration/render path is not.

test('GPU particle options are validated before any device is requested', async () => {
  await assert.rejects(() => GpuParticleSimulation.create({ count: 0 }), /count must be an integer/);
  await assert.rejects(() => GpuParticleSimulation.create({ count: 4_000_000 }), /count must be an integer/);
  await assert.rejects(() => GpuParticleSimulation.create({ count: 1.5 }), /count must be an integer/);
  await assert.rejects(() => GpuParticleSimulation.create({ radius: 0 }), /radius must be positive/);
  await assert.rejects(() => GpuParticleSimulation.create({ timeStep: -1 }), /time step must be positive/);
  await assert.rejects(() => GpuParticleSimulation.create({ stiffness: -1 }), /stiffness must be non-negative/);
  await assert.rejects(() => GpuParticleSimulation.create({ damping: 2 }), /damping must be between 0 and 1/);
  await assert.rejects(() => GpuParticleSimulation.create({ swirl: Number.NaN }), /swirl must be finite/);
  await assert.rejects(() => GpuParticleSimulation.create({ pointSize: 0 }), /point size must be positive/);
  await assert.rejects(() => GpuParticleSimulation.create({ mode: 'nope' }), /mode must be/);
  await assert.rejects(() => GpuParticleSimulation.create({ softening: 0 }), /softening must be positive/);
  await assert.rejects(() => GpuParticleSimulation.create({ layout: 'spiral' }), /layout must be/);
  await assert.rejects(() => GpuParticleSimulation.create({ orbitPeriod: 0 }), /orbit period must be positive/);
  // All-pairs is O(N^2), so a count that would stall a frame is rejected up front.
  await assert.rejects(
    () => GpuParticleSimulation.create({ mode: 'nbody', count: 65_536 }),
    /O\(N\^2\)/,
  );
});
