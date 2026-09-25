import { GpuParticleSimulation as ParticleSimulation } from '../index.js';

const get = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Particle benchmark markup is missing ${selector}`);
  return element;
};
const canvas = get<HTMLCanvasElement>('#particles');
const stats = get<HTMLElement>('#stats');
const status = get<HTMLElement>('#status');
const pause = get<HTMLButtonElement>('#pause');
const countSelect = get<HTMLSelectElement>('#count');
const modeSelect = get<HTMLSelectElement>('#mode');

let simulation: ParticleSimulation | undefined;
let sharedDevice: GPUDevice | undefined;
let animation = 0;
let stopped = false;
let paused = false;
let last = 0;
let frames = 0;
let elapsed = 0;
let frameTimes: number[] = [];

function projection(width: number, height: number): Float32Array {
  const aspect = width / Math.max(1, height);
  const sx = aspect >= 1 ? 1 / aspect : 1;
  const sy = aspect >= 1 ? 1 : aspect;
  return new Float32Array([sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, .25, 0, 0, 0, .5, 1]);
}

function resize(): void {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  simulation?.setCamera(projection(width, height), width, height);
}

/** `nbody` is O(N²), so it needs a different body count and a disc of orbiting bodies. */
const MAX_NBODY = 32768;
function optionsFor(count: number, mode: string) {
  const common = { device: sharedDevice, count, pointSize: 2.5, color: [0.35, 0.77, 1, 0.9] as [number, number, number, number] };
  return mode === 'nbody'
    ? { ...common, mode: 'nbody' as const, layout: 'disc' as const, orbitPeriod: 9, pointSize: 2.1 }
    : { ...common, mode: 'oscillator' as const, swirl: 0.5 };
}

async function start(count: number, mode: string): Promise<void> {
  countSelect.disabled = true;
  modeSelect.disabled = true;
  let next: ParticleSimulation;
  try {
    next = await ParticleSimulation.create(optionsFor(count, mode));
  } finally { countSelect.disabled = false; modeSelect.disabled = false; }
  if (stopped) { next.destroy(); return; }
  simulation?.destroy();
  simulation = next;
  delete stats.dataset.gpu;
  resize();
  status.hidden = true;
  last = performance.now();
  frames = 0;
  elapsed = 0;
  frameTimes = [];
  void reportGpuTiming();
}

async function reportGpuTiming(): Promise<void> {
  const current = simulation;
  if (!current) return;
  try {
    const ms = await current.measure(30);
    if (current !== simulation) return;
    if (ms == null) return;
    stats.dataset.gpu = ` · GPU step ${ms.toFixed(2)} ms`;
  } catch (error) {
    console.warn('GPU timing unavailable', error);
  }
}

function frame(now: number): void {
  if (stopped || !simulation) return;
  const dt = last ? now - last : 0;
  last = now;
  const encoder = simulation.device.createCommandEncoder();
  if (!paused) simulation.step(encoder);
  const context = canvas.getContext('webgpu');
  if (!context) throw new Error('WebGPU canvas context unavailable');
  const view = context.getCurrentTexture().createView();
  const pass = encoder.beginRenderPass({ colorAttachments: [{ view, clearValue: { r: 0.015, g: 0.018, b: 0.03, a: 1 }, loadOp: 'clear', storeOp: 'store' }] });
  simulation.render(pass);
  pass.end();
  simulation.device.queue.submit([encoder.finish()]);
  frameTimes.push(dt);
  if (frameTimes.length > 120) frameTimes.shift();
  elapsed += dt;
  frames += 1;
  if (elapsed >= 500) {
    const average = frameTimes.reduce((sum, value) => sum + value, 0) / Math.max(1, frameTimes.length);
    const gpu = stats.dataset.gpu ?? '';
    stats.textContent = `${simulation.count.toLocaleString()} particles · ${average.toFixed(1)} ms/frame · ${(1000 / Math.max(average, .001)).toFixed(0)} FPS${gpu}`;
    elapsed = 0;
  }
  animation = requestAnimationFrame(frame);
}

async function boot(): Promise<void> {
  const context = canvas.getContext('webgpu');
  if (!context) throw new Error('WebGPU is unavailable in this browser');
  const adapter = await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('No high-performance WebGPU adapter found');
  const device = await adapter.requestDevice({ requiredFeatures: adapter.features.has('timestamp-query') ? ['timestamp-query'] : [] });
  sharedDevice = device;
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'opaque' });
  // Rendering and simulation share one device throughout count changes.
  if (simulation) simulation.destroy();
  simulation = await ParticleSimulation.create(optionsFor(Number(countSelect.value), modeSelect.value));
  resize();
  void reportGpuTiming();
  animation = requestAnimationFrame(frame);
}

pause.addEventListener('click', () => {
  paused = !paused;
  pause.textContent = paused ? 'Resume simulation' : 'Pause simulation';
  pause.setAttribute('aria-pressed', String(paused));
});
function restart(): void {
  const mode = modeSelect.value;
  let count = Number(countSelect.value);
  if (mode === 'nbody' && count > MAX_NBODY) {
    count = MAX_NBODY;
    countSelect.value = String(count);
  }
  void start(count, mode).catch((error) => { status.textContent = String(error); status.hidden = false; });
}
countSelect.addEventListener('change', restart);
modeSelect.addEventListener('change', restart);
window.addEventListener('resize', resize);
window.addEventListener('pagehide', () => { stopped = true; cancelAnimationFrame(animation); simulation?.destroy(); }, { once: true });
void boot().catch((error) => { status.textContent = error instanceof Error ? error.message : String(error); status.hidden = false; });
