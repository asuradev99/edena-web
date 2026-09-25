import { WebGPUView, Visual, sphere, Geometry, LabelLayer, rgba, smooth, polyline, merge, parsePOSCAR, parsePhonopySymmetry, type Vec3, type CrystalStructure, type CrystalOperation } from '../index.js';

const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const operationSelect = get<HTMLSelectElement>('operation'), slider = get<HTMLInputElement>('progress'), play = get<HTMLButtonElement>('play');
const poscarInput = get<HTMLInputElement>('poscar-file'), symmetryInput = get<HTMLInputElement>('symmetry-file'), filesInput = get<HTMLInputElement>('files-input'), drop = get<HTMLElement>('drop-zone'), info = get<HTMLElement>('structure-info');
const fileList = get<HTMLElement>('file-list');
const legend = get<HTMLElement>('legend');
let view: WebGPUView | undefined, labels: LabelLayer | undefined, atoms: Visual[] = [], initial: Vec3[] = [], structure: CrystalStructure;
let operations: CrystalOperation[] = [], progress = 0, playing = false, disposed = false, frame = 0, last = 0;
const identity = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const defaults: CrystalOperation[] = [
  { rotation: identity, translation: [0, 0, 0], label: 'C₁ — identity' },
  { rotation: [[0, -1, 0], [1, 0, 0], [0, 0, 1]], translation: [0, 0, 0], label: 'C₄ — 90° about z' },
  { rotation: [[0, 0, 1], [1, 0, 0], [0, 1, 0]], translation: [0, 0, 0], label: 'C₃ — 120° about [111]' },
  { rotation: [[-1, 0, 0], [0, 1, 0], [0, 0, 1]], translation: [0, 0, 0], label: 'Mirror — x = 0' },
  { rotation: [[-1, 0, 0], [0, -1, 0], [0, 0, -1]], translation: [0, 0, 0], label: 'Inversion — origin' },
];
operations = defaults;
const fractionalToCartesian = (p: Vec3, l: CrystalStructure['lattice']): Vec3 => [p[0] * l[0][0] + p[1] * l[1][0] + p[2] * l[2][0], p[0] * l[0][1] + p[1] * l[1][1] + p[2] * l[2][1], p[0] * l[0][2] + p[1] * l[1][2] + p[2] * l[2][2]];
const apply = (m: number[][], p: Vec3, t: Vec3): Vec3 => [m[0][0] * p[0] + m[0][1] * p[1] + m[0][2] * p[2] + t[0], m[1][0] * p[0] + m[1][1] * p[1] + m[1][2] * p[2] + t[1], m[2][0] * p[0] + m[2][1] * p[1] + m[2][2] * p[2] + t[2]];
const wrap = (p: Vec3): Vec3 => p.map(x => ((x % 1) + 1) % 1) as Vec3;
function defaultStructure(): CrystalStructure { return { comment: 'Simple cubic demonstration', lattice: [[2, 0, 0], [0, 2, 0], [0, 0, 2]], species: Array(8).fill('X'), positions: [-1, 1].flatMap(x => [-1, 1].flatMap(y => [-1, 1].map(z => [(x + 1) / 2, (y + 1) / 2, (z + 1) / 2] as Vec3))) }; }
function populateOperations(next: CrystalOperation[]) { operations = next; operationSelect.replaceChildren(...operations.map((op, i) => new Option(`${i + 1}. ${op.label}`, String(i)))); operationSelect.value = '0'; resetOperation(); }
function rebuild() {
  if (!view) return; view.world.clear(); initial = structure.positions.map(p => [...p] as Vec3);
  const cart = structure.positions.map(p => fractionalToCartesian(p, structure.lattice)); const baseRadius = Math.max(.035, Math.min(...structure.lattice.map(v => Math.hypot(...v))) * .045);
  const colors: Record<string, string> = { H: '#f4f4f4', C: '#444444', N: '#6b8cff', O: '#ff5b63', F: '#8ff58f', S: '#f7d24b', Se: '#e08a3e', Mo: '#8aa4b8', Si: '#d49b65', P: '#f09b43' };
  const radii: Record<string, number> = { H: .55, C: .85, N: .8, O: .75, F: .72, S: 1.05, Se: 1.15, Mo: 1.35, Si: 1.1, P: 1.1 };
  const unique = structure.species.filter((s, i, a) => a.indexOf(s) === i);
  const mesh = sphere(baseRadius); atoms = cart.map((p, i) => { const species = structure.species[i] ?? 'X'; const atom = new Visual(mesh, rgba(colors[species] ?? ['#62d6e8', '#f7d681', '#ef9273', '#b5a1ff', '#9ae6b4'][i % 5])); const scale = radii[species] ?? 1; atom.scale = [scale, scale, scale]; atom.position = p; return atom; });
  const corners = [0, 1].flatMap(i => [0, 1].flatMap(j => [0, 1].map(k => fractionalToCartesian([i, j, k], structure.lattice)))); const edges: Geometry[] = [];
  for (const p of corners) for (let axis = 0; axis < 3; axis++) { const q = [...p] as Vec3; q[axis] += structure.lattice[axis][0] + structure.lattice[axis][1] + structure.lattice[axis][2]; const near = corners.find(c => Math.hypot(c[0] - q[0], c[1] - q[1], c[2] - q[2]) < 1e-5); if (near) edges.push(polyline([p, near], .012)); }
  if (edges.length) view.world.add(new Visual(merge(...edges), rgba('#a4b3c6'))); view.world.add(...atoms); const extent = Math.max(...cart.flatMap(p => p.map(Math.abs)), 1); view.camera.height = extent * 3.1;
  labels?.dispose(); labels = new LabelLayer(get('labels'), view.camera); labels.add(`${structure.species.length} sites`, () => atoms[0]?.position ?? [0, 0, 0], '#b9e8ed'); info.textContent = `${structure.comment} · ${structure.positions.length} atoms · ${unique.join(', ')} · lattice ${structure.lattice.map(v => Math.hypot(...v).toFixed(3)).join(' × ')}`; legend.replaceChildren(...unique.map(species => { const item = document.createElement('div'); item.className = 'file-item'; item.textContent = `${species} · radius ${((radii[species] ?? 1) * baseRadius).toFixed(3)}`; item.style.borderLeft = `5px solid ${colors[species] ?? '#62d6e8'}`; return item; })); resetOperation();
}
function resetOperation() { progress = 0; playing = false; play.textContent = 'Animate operation'; update(); }
function update() { const operation = operations[Number(operationSelect.value)] ?? operations[0]; if (!operation) return; const t = smooth(progress); atoms.forEach((atom, i) => { const target = wrap(apply(operation.rotation, initial[i], operation.translation)); const from = initial[i]; const f: Vec3 = [from[0] + (target[0] - from[0]) * t, from[1] + (target[1] - from[1]) * t, from[2] + (target[2] - from[2]) * t]; atom.position = fractionalToCartesian(f, structure.lattice); }); slider.value = String(progress); get('mapping').textContent = `${Math.round(progress * 100)}% · ${operation.label}`; get('description').textContent = `Fractional operation matrix: [${operation.rotation.map(row => row.join(' ')).join('; ')}]${operation.translation.some(Boolean) ? ` + (${operation.translation.join(', ')})` : ''}`; }
function showFile(file: File, kind: string, error?: string) { const existing = fileList.querySelector<HTMLElement>(`[data-name="${CSS.escape(file.name)}"]`); const item = existing ?? document.createElement('div'); item.className = `file-item${error ? ' error' : ''}`; item.dataset.name = file.name; item.textContent = `${kind} · ${file.name}${error ? ` · ${error}` : ' · loaded'}`; if (!existing) fileList.append(item); }
async function loadText(file: File, kind: 'poscar' | 'symmetry') { try { const text = await file.text(); if (kind === 'poscar') { structure = parsePOSCAR(text); rebuild(); } else populateOperations(parsePhonopySymmetry(text)); showFile(file, kind === 'poscar' ? 'POSCAR' : 'PHONOPY'); get('status').textContent = `${file.name} loaded`; } catch (error) { const message = error instanceof Error ? error.message : String(error); showFile(file, kind === 'poscar' ? 'POSCAR' : 'PHONOPY', message); get('status').textContent = `${file.name}: ${message}`; } }
async function loadUnknown(file: File) { const text = await file.text(); const kind = /(?:^|\n)\s*(?:rotations|space_group|pointgroup|translations)\s*:/i.test(text) || /symmetry|phonopy/i.test(file.name) ? 'symmetry' : 'poscar'; await loadText(file, kind); }
async function init() {
  structure = defaultStructure(); view = await WebGPUView.create(get<HTMLCanvasElement>('scene'), { onError: message => get('status').textContent = message }); view.camera.height = 4.8; view.camera.yaw = .6; view.camera.pitch = .35; populateOperations(defaults); rebuild();
  poscarInput.addEventListener('change', () => { const file = poscarInput.files?.[0]; if (file) void loadText(file, 'poscar'); }); symmetryInput.addEventListener('change', () => { const file = symmetryInput.files?.[0]; if (file) void loadText(file, 'symmetry'); }); filesInput.addEventListener('change', () => { for (const file of filesInput.files ?? []) void loadUnknown(file); });
  for (const event of ['dragover', 'dragenter']) drop.addEventListener(event, e => { e.preventDefault(); drop.classList.add('active'); }); for (const event of ['dragleave', 'drop']) drop.addEventListener(event, e => { e.preventDefault(); drop.classList.remove('active'); }); drop.addEventListener('drop', e => { const files = [...(e as DragEvent).dataTransfer!.files]; for (const file of files) void loadUnknown(file); });
  operationSelect.addEventListener('change', resetOperation); slider.addEventListener('input', () => { playing = false; progress = Number(slider.value); update(); }); play.addEventListener('click', () => { if (progress >= 1) progress = 0; playing = !playing; play.textContent = playing ? 'Pause' : 'Animate operation'; }); get('reset').addEventListener('click', resetOperation);
  const tick = (now: number) => { if (disposed) return; const dt = last ? Math.min((now - last) / 1000, .05) : 0; last = now; if (playing) { progress = Math.min(1, progress + dt / 3); update(); if (progress >= 1) { playing = false; play.textContent = 'Replay operation'; } } labels?.update(); view?.render(); frame = requestAnimationFrame(tick); }; frame = requestAnimationFrame(tick);
}
window.addEventListener('pagehide', () => { disposed = true; cancelAnimationFrame(frame); labels?.dispose(); view?.dispose(); }, { once: true }); void init().catch(error => { get('status').textContent = String(error); });
