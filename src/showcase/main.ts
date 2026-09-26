import { WebGPUView, LabelLayer, Group, Visual, plotFrame, axes3d, boundsBox, functionCurve, colorMappedSurface, viridis, plasma, isosurface, rgba, smooth, mathml, mi, mn, mo, msub, msup, frac, row, mtext, hat, summation, type Vec3 } from '../index.js';
import { sphere, wireSphere, circle, arrow, polyline, merge, Timeline, parametricSurface } from '../index.js';

const get = <T extends HTMLElement>(id: string) => { const node = document.getElementById(id); if (!node) throw new Error(`Missing ${id}`); return node as T; };
const status = get('status'), stats = get('stats'), pauseButton = get<HTMLButtonElement>('pause');
const views: WebGPUView[] = [], labels: LabelLayer[] = [], samples: number[] = [];
let curve: Visual | undefined, surface: Visual | undefined, surfaceSpin: Group | undefined, fieldSpin: Group | undefined;
/** A bright point that rides the curve, so the plot always reads as motion. */
let curveMarker: Visual | undefined;
let curveFn: (x: number) => number = x => Math.sin(x);
let triangles = 0, frame = 0, disposed = false, last = 0, timer = 0, elapsed = 0, paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
const visibleCanvases=new Set<HTMLCanvasElement>();
const visibility=new IntersectionObserver(entries=>{
  for(const entry of entries){const canvas=entry.target as HTMLCanvasElement;
    if(entry.isIntersecting)visibleCanvases.add(canvas);else visibleCanvases.delete(canvas);}
},{rootMargin:'100px'});
// Diagnostics: ?samples=1 drops MSAA, ?dpr=1 caps resolution — useful when a slow GPU backend is suspected.
const params = new URLSearchParams(location.search);
const msaa = params.get('samples') === '1' ? 1 : 4;
const maxDpr = params.has('dpr') ? Number(params.get('dpr')) : 2;
let renderer = '';

function report(message: string) {
  console.error(message);
  status.textContent = message; status.hidden = false; stats.hidden = true; pauseButton.disabled = true;
}

async function initialize() {
  // One device, three views: the later two borrow and are disposed before their owner.
  const curveView = await WebGPUView.create(get<HTMLCanvasElement>('curve'), { interactive: false, samples: msaa, maxDpr, onError: report });
  const surfaceView = await WebGPUView.create(get<HTMLCanvasElement>('surface'), { device: curveView.device, samples:msaa,maxDpr,onError: report });
  const fieldView = await WebGPUView.create(get<HTMLCanvasElement>('field'), { device: curveView.device, samples:msaa,maxDpr,onError: report });
  if (disposed) { fieldView.dispose(); surfaceView.dispose(); curveView.dispose(); return; }
  views.push(curveView, surfaceView, fieldView);
  const info = curveView.adapterInfo, name = info?.description || info?.device || info?.architecture || info?.vendor || '';
  renderer = `${curveView.isFallbackAdapter ? 'software GPU' : 'GPU'}${name ? ` (${name})` : ''} · msaa×${msaa} · dpr≤${maxDpr}`;

  // 1D — axes, ticks, grid, and DOM labels come straight from plotFrame.
  curveView.camera.yaw = 0; curveView.camera.pitch = 0; curveView.camera.height = 5.4;
  const fitCurve=(width:number,height:number)=>{
    if(width>0&&height>0)curveView.camera.height=Math.max(4.6,9.4*height/width);
  };
  curveView.onResize=fitCurve;fitCurve(curveView.canvas.clientWidth,curveView.canvas.clientHeight);
  const chart = plotFrame([-4, 4], [-1.6, 1.6], { xTicks: 8, yTicks: 4 });
  curve = new Visual(functionCurve(x => Math.sin(x), [-4, 4], 640, .018), rgba('#ffff00'));
  curve.reveal = 0;
  triangles += (chart.grid.vertices.length + chart.ticks.vertices.length + chart.axes.vertices.length + curve.geometry.vertices.length) / 9;
  curveView.world.add(new Visual(chart.grid, rgba('#eeeeee', .14)), new Visual(chart.ticks, rgba('#eeeeee', .45)), new Visual(chart.axes, rgba('#eeeeee', .8)), curve);
  curveMarker = new Visual(circle(.055, 24, 'xy', .03), rgba('#ffffff'));
  curveMarker.reveal = 0;
  curveView.world.add(curveMarker);
  get('curve-equation').innerHTML = mathml(row(mi('f'), mo('('), mi('x'), mo(')'), mo('='), mi('sin'), mo('('), mi('x'), mo(')')), 'block');
  const curveLabels = new LabelLayer(get('curve-labels'), curveView.camera);
  for (const anchor of chart.labels){
    const yTick=anchor.position[1]!==chart.labels[0].position[1];
    const label=curveLabels.addHTML(mathml(anchor.math??mtext(anchor.text)),()=>anchor.position,'#9db0c2','math-label',yTick?'right':'center');
    // Plot coordinates scale with the viewport; text does not. Keep a CSS-pixel gap from
    // the spine so long/negative tick labels remain legible on a narrow screen.
    if(yTick)label.style.marginLeft='-6px';else label.style.marginTop='8px';
  }
  labels.push(curveLabels);

  // 2D — a height surface colored by its own value: one draw call, per-vertex colors.
  surfaceView.camera.yaw = .45; surfaceView.camera.pitch = .32; surfaceView.camera.height = 5;
  surface = new Visual(colorMappedSurface((x, y) => Math.sin(x * 1.5) * Math.cos(y * 1.5) * .55, [-2.2, 2.2], [-2.2, 2.2], viridis, [40, 40]), rgba('#ffffff'));
  surface.reveal = 0;
  triangles += surface.geometry.vertices.length / 9;
  surfaceSpin = new Group().add(surface);
  surfaceView.world.add(new Visual(axes3d(1.7, .008), rgba('#eeeeee', .4)), surfaceSpin);
  const surfaceLabels = new LabelLayer(get('surface-labels'), surfaceView.camera);
  surfaceLabels.addHTML(mathml(mi('x')), () => [1.95, 0, 0], '#c9c9d2', 'math-label');
  surfaceLabels.addHTML(mathml(row(mi('f'), mo('('), mi('x'), mo(','), mi('y'), mo(')'))), () => [0, 1.95, 0], '#c9c9d2', 'math-label');
  surfaceLabels.addHTML(mathml(mi('y')), () => [0, 0, 1.95], '#c9c9d2', 'math-label');
  labels.push(surfaceLabels);

  // 3D — one level set of w = f(x, y, z), framed by the domain box and drawn with the
  // opt-in perspective camera Astra added (distance/fovY replace `height` in that mode).
  fieldView.camera.projection = 'perspective'; fieldView.camera.yaw = .62; fieldView.camera.pitch = .3; fieldView.camera.distance = 4.6;
  const min: Vec3 = [-1.15, -1.15, -1.15], max: Vec3 = [1.15, 1.15, 1.15], centers: Vec3[] = [[-.34, .22, .06], [.4, -.16, -.08]], radius = .66;
  const field = (x: number, y: number, z: number) => Math.max(...centers.map(c => radius - Math.hypot(x - c[0], y - c[1], z - c[2])));
  const level = new Visual(isosurface(field, { min, max }, 0, 48), rgba('#83c167'));
  triangles += level.geometry.vertices.length / 9;
  fieldSpin = new Group().add(level, new Visual(boundsBox(min, max, .004), rgba('#eeeeee', .16)));
  fieldView.world.add(fieldSpin, new Visual(axes3d(1.1, .007), rgba('#eeeeee', .5)));
  const fieldLabels = new LabelLayer(get('field-labels'), fieldView.camera);
  fieldLabels.addHTML(mathml(mi('x')), () => [1.26, -.05, 0], '#c9c9d2', 'math-label');
  fieldLabels.addHTML(mathml(mi('y')), () => [-.05, 1.26, 0], '#c9c9d2', 'math-label');
  fieldLabels.addHTML(mathml(mi('z')), () => [-.05, -.05, 1.26], '#c9c9d2', 'math-label');
  labels.push(fieldLabels);

  get<HTMLInputElement>('harmonics').addEventListener('input', event => {
    const n = Number((event.target as HTMLInputElement).value);
    get('harmonics-value').textContent = String(n);
    get('curve-equation').innerHTML = mathml(row(mi('f'), mo('('), mi('x'), mo(')'), mo('='), summation(mn(0), mn(n - 1)), frac(row(mi('sin'), mo('('), mn(2), mi('j'), mo('+'), mn(1), mo(')'), mi('x')), row(mn(2), mi('j'), mo('+'), mn(1)))), 'block');
    const previous = curve!;
    const fn = (x: number) => { let sum = 0; for (let j = 0; j < n; j++) sum += Math.sin((2 * j + 1) * x) / (2 * j + 1); return sum; };
    curveFn = fn;
    curve = new Visual(functionCurve(fn, [-4, 4], 1200, .018), rgba('#ffff00'));
    triangles += (curve.geometry.vertices.length - previous.geometry.vertices.length) / 9;
    curveView.world.remove(previous); curveView.world.add(curve);
  });
  const updateSurface = () => {
    const k = Number(get<HTMLInputElement>('frequency').value);
    const previous = surface!;
    const mobius=get<HTMLSelectElement>('surface-kind').value==='mobius';
    get<HTMLInputElement>('frequency').disabled=mobius;get<HTMLSelectElement>('palette').disabled=mobius;
    get('surface-caption').textContent=mobius?'A single half-twist joins the two ends into a one-sided surface. This parametric surface cannot be expressed as a single-valued height function.':'A standing-wave shape: f(x,y) = 0.55 sin(kx) cos(ky). Height is encoded in both geometry and color.';
    surface = mobius?new Visual(parametricSurface((u,v)=>[(1.2+v*Math.cos(u/2))*Math.cos(u),v*Math.sin(u/2),(1.2+v*Math.cos(u/2))*Math.sin(u)],[0,2*Math.PI],[-.4,.4],[96,12]),rgba('#58c4dd')):new Visual(colorMappedSurface((x,y)=>Math.sin(k*x)*Math.cos(k*y)*.55, [-2.2,2.2],[-2.2,2.2],get<HTMLSelectElement>('palette').value==='plasma'?plasma:viridis,[40,40]),rgba('#ffffff'));
    triangles+=(surface.geometry.vertices.length-previous.geometry.vertices.length)/9;
    surfaceSpin!.remove(previous); surfaceSpin!.add(surface);
  };
  get('frequency').addEventListener('change',updateSurface);
  get('palette').addEventListener('change',updateSurface);
  get('surface-kind').addEventListener('change',updateSurface);
  let currentLevel = level;
  get('level-shape').addEventListener('change',event=>{
    const shape=(event.target as HTMLSelectElement).value;
    const fn=shape==='torus'?(x:number,y:number,z:number)=>(Math.hypot(x,z)-.65)**2+y*y-.24**2
      :shape==='gyroid'?(x:number,y:number,z:number)=>Math.sin(3*x)*Math.cos(3*y)+Math.sin(3*y)*Math.cos(3*z)+Math.sin(3*z)*Math.cos(3*x):field;
    const next = new Visual(isosurface(fn,{min,max},0,40),rgba(shape==='gyroid'?'#58c4dd':'#83c167',1));
    triangles += (next.geometry.vertices.length-currentLevel.geometry.vertices.length)/9;
    fieldSpin!.remove(currentLevel);fieldSpin!.add(next);currentLevel=next;
  });
  get('projection').addEventListener('change',event=>{
    fieldView.camera.projection=(event.target as HTMLSelectElement).value as 'orthographic'|'perspective';
    fieldView.camera.height=3.5;
  });

  const latticeView = await WebGPUView.create(get<HTMLCanvasElement>('lattice'),{device:curveView.device,samples:msaa,maxDpr,onError:report});
  views.push(latticeView);
  latticeView.camera.height=5.8;
  const atomMesh=sphere(.095), atoms=new Group(), bonds=new Group();
  const positions:Vec3[]=[];
  for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++) {
    const point:Vec3=[x,y,z];positions.push(point);
    const atom=new Visual(atomMesh,rgba((x+y+z)%2===0?'#58c4dd':'#ffff00'));atom.position=point;atoms.add(atom);
  }
  const lines=[];
  for(const p of positions)for(let axis=0;axis<3;axis++)if(p[axis]<1){const q=[...p] as Vec3;q[axis]++;lines.push(polyline([p,q],.014));}
  bonds.add(new Visual(merge(...lines),rgba('#eeeeee',.55)));
  const reference=new Group().add(new Visual(wireSphere(1.9,12,7,.006),rgba('#58c4dd',.15)),new Visual(circle(1.9,96,'xz',.009),rgba('#83c167',.65)),new Visual(arrow([0,0,0],[0,2.3,0],.023),rgba('#ffff00')));
  latticeView.world.add(atoms,bonds,reference);
  const construction=new Timeline(6).add({start:0,duration:2,update:p=>{atoms.scale=[p,p,p];atoms.opacity=p;}}).add({start:2,duration:2,update:p=>{bonds.opacity=p;}}).add({start:4,duration:2,update:p=>{reference.opacity=p;}});
  construction.seek(6);
  get('build-lattice').addEventListener('input',event=>construction.seek(Number((event.target as HTMLInputElement).value)));
  const latticeLabels=new LabelLayer(get('lattice-labels'),latticeView.camera);
  latticeLabels.addHTML(mathml(row(mi('a'),msub(mn('1'),mn('1')))),()=>[.5,-1.15,1],'#c9c9d2','math-label');
  latticeLabels.addHTML(mathml(hat(mi('y'))),()=>[0,2.5,0],'#ffff00','math-label');
  labels.push(latticeLabels);
  for(const {node} of latticeView.world.flatten())triangles+=node.geometry.vertices.length/9;

  if (paused) { curve.reveal = 1; surface.reveal = 1; }
  for(const view of views){visibleCanvases.add(view.canvas);visibility.observe(view.canvas);}
  animate(performance.now());
}

function animate(now: number) {
  if (disposed) return;
  const delta = last ? Math.max(0,Math.min((now - last) / 1000, .1)) : 0; last = now;
  if (!paused) {
    // Reveal each plot once and keep it: a looping redraw would blank the curve mid-cycle.
    elapsed+=delta;
    if (curve) curve.reveal = smooth(elapsed / 2.2);
    if (curveMarker) { const markerX = -4 + ((elapsed * .8) % 8); curveMarker.position = [markerX, curveFn(markerX), .02]; curveMarker.reveal = curve ? curve.reveal : 1; }
    if (surface) surface.reveal = smooth(elapsed / .9);
    if (surfaceSpin) surfaceSpin.rotation += delta * .3;
    if (fieldSpin) fieldSpin.rotation += delta * .22;
  }
  for(let i=0;i<views.length;i++)if(visibleCanvases.has(views[i].canvas)){labels[i]?.update();views[i].render();}
  samples.push(delta * 1000); if (samples.length > 120) samples.shift();
  timer += delta;
  if (timer >= .25) {
    timer = 0;
    const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    stats.textContent = `${average.toFixed(1)} ms/frame · ${(1000 / average).toFixed(0)} fps · ${views.length} views · ${Math.round(triangles).toLocaleString()} triangles · ${renderer}`;
  }
  frame = requestAnimationFrame(animate);
}

function toggle() {
  paused = !paused;
  pauseButton.textContent = paused ? 'Resume motion' : 'Pause motion';
  pauseButton.setAttribute('aria-pressed', String(paused));
}
pauseButton.addEventListener('click', toggle);
pauseButton.textContent = paused ? 'Resume motion' : 'Pause motion';
pauseButton.setAttribute('aria-pressed', String(paused));
document.addEventListener('visibilitychange', () => { last = 0; });

function shutdown() {
  disposed = true; cancelAnimationFrame(frame);
  visibility.disconnect();
  for (const layer of labels) layer.dispose();
  for (const view of [...views].reverse()) view.dispose();
}
window.addEventListener('pagehide', shutdown, { once: true });
void initialize().catch(e => { shutdown(); report(e instanceof Error ? e.message : String(e)); });
