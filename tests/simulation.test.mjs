import test from 'node:test';
import assert from 'node:assert/strict';
import { createParticleState, ParticleSimulation, stepParticles } from '../build/index.js';

test('particle simulation advances state with a deterministic acceleration hook', () => {
  const state = createParticleState([0], 1);
  const simulation = new ParticleSimulation(state);
  simulation.step(0.5, (_index, _position, _velocity, time) => [time === 0 ? 2 : 1]);
  assert.deepEqual(Array.from(state.velocities), [1]);
  assert.deepEqual(Array.from(state.positions), [0.5]);
  assert.equal(simulation.time, 0.5);
});

test('particle simulation reset restores the initial state and time', () => {
  const state = createParticleState([1], 1, [2]);
  const simulation = new ParticleSimulation(state);
  simulation.step(0.25, () => [4]);
  simulation.reset();
  assert.deepEqual(Array.from(state.positions), [1]);
  assert.deepEqual(Array.from(state.velocities), [2]);
  assert.equal(simulation.time, 0);
});

test('particle state validates dimensions and parallel buffers', () => {
  assert.throws(() => createParticleState([0, 1], 3), /multiple of dimensions/);
  assert.throws(() => createParticleState([0, 1], 1, [0]), /match positions/);
  assert.throws(() => createParticleState([0], 1, undefined, [0]), /positive/);
});

test('stepParticles hands the hook private copies, honours an explicit time, and rejects bad vectors', () => {
  const state = createParticleState([0, 0], 2, [0, 0]);
  const seen = [];
  // The hook scribbles on the arrays it is given; the live buffers must be untouched by that.
  stepParticles(state, 1, (index, position, velocity, time) => {
    position[0] = 999; velocity[1] = 999; seen.push([index, time]);
    return [1, 0];
  }, 3.5);
  assert.deepEqual(seen, [[0, 3.5]]);
  assert.deepEqual(Array.from(state.velocities), [1, 0]);
  assert.deepEqual(Array.from(state.positions), [1, 0]); // semi-implicit: v = 1, then x = 1 * dt
  assert.throws(() => stepParticles(state, 1, () => [1]), /finite values/);
  assert.throws(() => stepParticles(state, 1, () => [NaN, 0]), /finite values/);
  assert.throws(() => stepParticles(state, -1, () => [0, 0]), /finite and non-negative/);
});
