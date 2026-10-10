import { WebGPUView, Text, MathText, Visual, box, rgba } from '../index.js';
const input = (id) => document.getElementById(id);
const status = document.getElementById('status');
const formulas = [String.raw `x_i^2 + x_{i+1}^{n-1} = f'(x) + f''(x)`, String.raw `\alpha + \beta \leq \sum_{i=1}^{n} i^2 \quad \nabla \psi`, String.raw `\frac{\sqrt{x^2+1}}{1+\frac{1}{n}} = \int_0^1 t^2\,dt`, String.raw `𝔸_i + Ω^2 + ℏ \omega \quad \text{café — naïve}`];
async function main() {
    const view = await WebGPUView.create(document.getElementById('text-canvas'), { samples: 4, maxDpr: 2, onError: message => { status.textContent = message; } });
    const reset = () => { view.camera.target = [0, 0, 0]; view.camera.height = Math.max(6, 7 * view.canvas.clientHeight / Math.max(1, view.canvas.clientWidth)); view.camera.distance = 10; view.camera.yaw = .12; view.camera.pitch = .08; };
    reset();
    view.onResize = reset;
    const title = new Text('Text moves through space', { height: .42 });
    title.position = [0, 1.5, 0];
    const formula = new MathText(formulas[0], { height: .65 });
    const unicode = new Text('Å · é · λ · Ω · ∞ · → · café', { height: .32 });
    unicode.position = [0, -1.5, 0];
    const wall = new Visual(box([-.11, -1.25, -.11], [.11, 1.25, .11]), rgba('#80d4df'));
    wall.position = [0, 0, .5];
    view.world.add(title, formula, unicode, wall);
    input('notation').addEventListener('change', () => formula.setMath(formulas[Number(input('notation').value)]));
    input('reset').addEventListener('click', reset);
    let frame = 0, last = 0, time = 0, disposed = false;
    const tick = (now) => {
        if (disposed)
            return;
        const dt = last ? Math.min(.05, (now - last) / 1000) : 0;
        last = now;
        if (input('playing').checked)
            time += dt;
        const scale = Number(input('size').value);
        formula.scale = [scale, scale, scale];
        formula.rotation = .6 * Math.sin(time * .7);
        formula.position = [.65 * Math.sin(time * .5), 0, Number(input('depth').value)];
        for (const text of [title, formula, unicode])
            text.faceCamera = input('facing').checked;
        view.camera.mode = input('flat').checked ? '2d' : '3d';
        view.render();
        frame = requestAnimationFrame(tick);
    };
    status.textContent = '4× MSAA · mipmapped text';
    frame = requestAnimationFrame(tick);
    addEventListener('pagehide', () => { disposed = true; cancelAnimationFrame(frame); view.dispose(); }, { once: true });
}
main().catch(error => { status.textContent = String(error); });
//# sourceMappingURL=text.js.map