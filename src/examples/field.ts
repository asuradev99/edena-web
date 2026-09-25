import { WebGPUView, LabelLayer, Group, Visual, isosurface, axes3d, boundsBox, rgba, mathml, mi, type Vec3 } from '../index.js';

const get = <T extends HTMLElement>(id: string) => { const node = document.getElementById(id); if (!node) throw new Error(`Missing ${id}`); return node as T; };
const canvas = get<HTMLCanvasElement>('scene'), host = get<HTMLElement>('labels'), status = get<HTMLElement>('status'), hint = get<HTMLElement>('hint'), stats = get<HTMLElement>('stats');
const shapeSelect = get<HTMLSelectElement>('shape'), isoInput = get<HTMLInputElement>('iso'), isoValue = get('iso-value'), resolutionSelect = get<HTMLSelectElement>('resolution');
const spinToggle = get<HTMLInputElement>('spin'), meltToggle = get<HTMLInputElement>('melt');

const MIN: Vec3 = [-1.15, -1.15, -1.15], MAX: Vec3 = [1.15, 1.15, 1.15];
type ShapeName = 'metaballs' | 'blobs' | 'gyroid' | 'torus';
type Shape = { label: string; color: string; opacity: number; iso: [number, number]; defaultIso: number; field: (x: number, y: number, z: number) => number };
const SHAPES: Record<ShapeName, Shape> = {
  // Union of two balls as the max of signed radial fields, so the level set stays closed.
  metaballs: { label: 'two balls', color: '#58c4dd', opacity: .95, iso: [-0.45, 0.5], defaultIso: 0, field: (x, y, z) => Math.max(0.66 - Math.hypot(x + 0.34, y - 0.22, z - 0.06), 0.66 - Math.hypot(x - 0.4, y + 0.16, z + 0.08)) },
  // Sum of three soft Gaussians: a classic metaball blend that merges as the level drops.
  blobs: { label: 'metaball blend', color: '#e892c7', opacity: .9, iso: [0.35, 0.95], defaultIso: 0.62, field: (x, y, z) => [[-.4, .25, 0, .9], [.45, -.2, .1, 1], [0, -.45, -.35, .85]].reduce((sum, [cx, cy, cz, weight]) => sum + weight * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2) / .28), 0) },
  // Translucent so the interpenetrating channel structure stays visible.
  gyroid: { label: 'gyroid', color: '#83c167', opacity: .5, iso: [-0.6, 0.6], defaultIso: 0, field: (x, y, z) => Math.sin(3 * x) * Math.cos(3 * y) + Math.sin(3 * y) * Math.cos(3 * z) + Math.sin(3 * z) * Math.cos(3 * x) },
  torus: { label: 'torus', color: '#f7d681', opacity: .95, iso: [-0.05, 0.05], defaultIso: 0, field: (x, y, z) => (Math.hypot(x, z) - 0.65) ** 2 + y * y - 0.24 * 0.24 },
};

let view: WebGPUView | undefined, labels: LabelLayer | undefined, spin: Group | undefined, current: Visual | undefined;
let shapeName: ShapeName = 'metaballs', iso = 0, resolution = 48, spinning = true, melting = false;
let frame = 0, disposed = false, last = 0, meltTimer = 0, rebuilds = 0;

function report(message: string) {
  console.error(message);
  status.textContent = message; status.hidden = false; hint.hidden = true; stats.hidden = true;
}

/** Rebuild just the level surface; the box, axes and labels stay put. */
function build() {
  if (!spin) return;
  const shape = SHAPES[shapeName];
  const geometry = isosurface(shape.field, { min: MIN, max: MAX }, iso, resolution);
  if (current) spin.remove(current);
  current = new Visual(geometry, rgba(shape.color, shape.opacity));
  spin.add(current);
  rebuilds += 1;
  stats.textContent = `${(geometry.vertices.length / 9).toLocaleString()} triangles · ${resolution}³ samples · iso ${iso.toFixed(3)} · ${rebuilds} build${rebuilds === 1 ? '' : 's'}`;
}

function applyShape() {
  hint.hidden = false;
  const shape = SHAPES[shapeName];
  isoInput.min = String(shape.iso[0]); isoInput.max = String(shape.iso[1]);
  iso = shape.defaultIso; isoInput.value = String(iso);
  isoValue.textContent = iso.toFixed(3);
  build();
}

async function initialize() {
  view = await WebGPUView.create(canvas, { onError: report });
  if (disposed) { view.dispose(); return; }
  view.camera.height = 4.3; view.camera.yaw = .62; view.camera.pitch = .3;
  spin = new Group();
  spin.add(new Visual(boundsBox(MIN, MAX, .003), rgba('#eeeeee', .16)));
  view.world.add(new Visual(axes3d(1.05, .006), rgba('#eeeeee', .55)), spin);
  labels = new LabelLayer(host, view.camera);
  for (const [name, point] of [['x', [1.2, -.06, 0]], ['y', [-.04, 1.2, 0]], ['z', [-.06, -.04, 1.2]]] as [string, Vec3][]) {
    labels.addHTML(mathml(mi(name)), () => point, '#c9c9d2', 'math-label');
  }
  applyShape();

  shapeSelect.addEventListener('change', () => { shapeName = shapeSelect.value as ShapeName; applyShape(); });
  isoInput.addEventListener('input', () => { melting = false; meltToggle.checked = false; iso = Number(isoInput.value); isoValue.textContent = iso.toFixed(3); build(); });
  resolutionSelect.addEventListener('change', () => { resolution = Number(resolutionSelect.value); build(); });
  spinToggle.addEventListener('change', () => { spinning = spinToggle.checked; });
  meltToggle.addEventListener('change', () => { melting = meltToggle.checked; meltTimer = 0; });

  const animate = (now: number) => {
    if (disposed) return;
    const delta = last ? Math.min((now - last) / 1000, .1) : 0; last = now;
    if (spinning && spin) spin.rotation += delta * .3;
    // Rebuilds are ~10 ms, so the "melt" breathing animation is throttled to ~8 Hz.
    if (melting) {
      meltTimer += delta;
      if (meltTimer >= .12) {
        meltTimer = 0;
        const [low, high] = SHAPES[shapeName].iso, middle = (low + high) / 2, amplitude = (high - low) / 2 * .8;
        iso = middle + amplitude * Math.sin(now / 1000 * 1.1);
        isoValue.textContent = iso.toFixed(3);
        build();
      }
    }
    labels?.update(); view?.render();
    frame = requestAnimationFrame(animate);
  };
  frame = requestAnimationFrame(animate);
}

window.addEventListener('pagehide', () => {
  disposed = true; cancelAnimationFrame(frame); labels?.dispose(); view?.dispose();
}, { once: true });
void initialize().catch(e => { view?.dispose(); report(e instanceof Error ? e.message : String(e)); });
