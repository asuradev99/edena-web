import { WebGPUView, LabelLayer, Group, Visual, isosurface, axes3d, boundsBox, rgba, type Vec3 } from '../index.js';

const get = <T extends HTMLElement>(id: string) => { const node = document.getElementById(id); if (!node) throw new Error(`Missing ${id}`); return node as T; };
const canvas = get<HTMLCanvasElement>('scene'), host = get<HTMLElement>('labels'), status = get<HTMLElement>('status'), hint = get<HTMLElement>('hint'), stats = get<HTMLElement>('stats');

const MIN: Vec3 = [-1.15, -1.15, -1.15], MAX: Vec3 = [1.15, 1.15, 1.15], RESOLUTION = 48;
const CENTERS: Vec3[] = [[-.34, .22, .06], [.4, -.16, -.08]], RADIUS = .66;
// Union of two balls as the max of signed radial fields, so the level set stays a single closed surface.
const field = (x: number, y: number, z: number) => Math.max(...CENTERS.map(c => RADIUS - Math.hypot(x - c[0], y - c[1], z - c[2])));

let view: WebGPUView | undefined, labels: LabelLayer | undefined, spin: Group | undefined, frame = 0, disposed = false, last = 0;

function report(message: string) {
  console.error(message);
  status.textContent = message; status.hidden = false; hint.hidden = true; stats.hidden = true;
}

async function initialize() {
  view = await WebGPUView.create(canvas, { onError: report });
  if (disposed) { view.dispose(); return; }
  view.camera.height = 4.3; view.camera.yaw = .62; view.camera.pitch = .3;
  const geometry = isosurface(field, { min: MIN, max: MAX }, 0, RESOLUTION);
  stats.textContent = `${(geometry.vertices.length / 9).toLocaleString()} triangles · ${RESOLUTION}³ samples`;
  const surface = new Visual(geometry, rgba('#58c4dd'));
  const box = new Visual(boundsBox(MIN, MAX, .003), rgba('#eeeeee', .16));
  spin = new Group(); spin.add(surface, box);
  view.world.add(new Visual(axes3d(1.05, .006), rgba('#eeeeee', .55)), spin);
  labels = new LabelLayer(host, view.camera);
  labels.add('x', () => [1.18, -.06, 0]); labels.add('y', () => [-.04, 1.18, 0]); labels.add('z', () => [-.06, -.04, 1.18]);
  const animate = (now: number) => {
    if (disposed) return;
    const delta = last ? Math.min((now - last) / 1000, .1) : 0; last = now;
    if (spin) spin.rotation += delta * .3;
    labels?.update(); view?.render();
    frame = requestAnimationFrame(animate);
  };
  frame = requestAnimationFrame(animate);
}

window.addEventListener('pagehide', () => {
  disposed = true; cancelAnimationFrame(frame); labels?.dispose(); view?.dispose();
}, { once: true });
void initialize().catch(e => { view?.dispose(); report(e instanceof Error ? e.message : String(e)); });
