import { Camera } from "./camera.js";
import { Renderer } from "./renderer.js";
import { Compute } from "./compute.js";
import { GUI } from "./gui.js";
import { TopBar } from "./topbar.js";
import { EnergyPlot } from "./energyplot.js";
import { DEFAULT_PHYSICS } from "./types.js";
import { spheresToConfig, configToSpheres, saveConfig, loadConfigFromFile, parseConfig, } from "./config.js";
// ── Sphere generation ─────────────────────────────────────────────────────────
function hslToRgb(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) {
        r = c;
        g = x;
    }
    else if (h < 120) {
        r = x;
        g = c;
    }
    else if (h < 180) {
        g = c;
        b = x;
    }
    else if (h < 240) {
        g = x;
        b = c;
    }
    else if (h < 300) {
        r = x;
        b = c;
    }
    else {
        r = c;
        b = x;
    }
    return [r + m, g + m, b + m];
}
function generateSpheres(n, radius, boxHalf) {
    const spread = boxHalf * 0.65;
    const result = [];
    let hue = Math.random() * 360;
    for (let i = 0; i < n; i++) {
        hue = (hue + 137.508) % 360;
        result.push({
            id: i + 1,
            position: [
                (Math.random() * 2 - 1) * spread,
                (Math.random() * 2 - 1) * spread,
                (Math.random() * 2 - 1) * spread,
            ],
            velocity: [0, 0, 0],
            radius,
            mass: radius * radius * radius * 50,
            color: hslToRgb(hue, 0.75, 0.62),
        });
    }
    return result;
}
// ── Energy computation (CPU, runs after GPU readback) ─────────────────────────
function computeEnergy(spheres, p) {
    let ke = 0, pe = 0;
    for (const s of spheres) {
        const [vx, vy, vz] = s.velocity;
        ke += 0.5 * s.mass * (vx * vx + vy * vy + vz * vz);
        pe += s.mass * p.gravity * s.position[1];
    }
    for (let i = 0; i < spheres.length; i++) {
        for (let j = i + 1; j < spheres.length; j++) {
            const a = spheres[i], b = spheres[j];
            const dx = a.position[0] - b.position[0];
            const dy = a.position[1] - b.position[1];
            const dz = a.position[2] - b.position[2];
            const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
            const sigma = a.radius + b.radius;
            if (r < 1e-6 || r > p.ljCutoff * sigma)
                continue;
            const sr = sigma / r;
            const sr6 = sr ** 6;
            pe += 4 * p.ljEps * (sr6 * sr6 - sr6);
        }
    }
    return { ke, pe };
}
// ── Entry point ───────────────────────────────────────────────────────────────
async function main() {
    const canvas = document.getElementById("canvas");
    const guiEl = document.getElementById("gui");
    const topbarEl = document.getElementById("topbar");
    const physParams = { ...DEFAULT_PHYSICS };
    // Will be replaced by default-config.json; this is just a type-safe placeholder
    let spheres = generateSpheres(216, physParams.radius, physParams.boxHalf);
    const camera = new Camera(canvas);
    const renderer = new Renderer();
    const topbar = new TopBar(topbarEl);
    const gui = new GUI(guiEl, spheres.length, physParams);
    const energyPlot = new EnergyPlot(gui.energyCanvas);
    await renderer.init(canvas);
    const device = renderer.getDevice();
    const compute = new Compute();
    compute.init(device);
    renderer.setCylinderData(compute.renderBuf, compute.springPairsBuf);
    // ── GUI callbacks ─────────────────────────────────────────────────────────
    gui.onParamsChange = () => {
        compute.updatePhysicsParams(physParams);
        renderer.updateBoundingBox(physParams.boxHalf);
    };
    gui.onParticleCountChange = (n) => {
        spheres = generateSpheres(n, physParams.radius, physParams.boxHalf);
        compute.upload(spheres);
        compute.buildAndUploadSprings(spheres);
        compute.updatePhysicsParams(physParams);
    };
    gui.onRadiusChange = (r) => {
        for (const s of spheres) {
            s.radius = r;
            s.mass = r * r * r * 50;
        }
        compute.upload(spheres);
        // Spring rest lengths are position-based, no rebuild needed for radius-only change
    };
    // ── Config save / load ────────────────────────────────────────────────────
    const applyConfig = (cfg) => {
        if (!cfg)
            return;
        spheres = configToSpheres(cfg);
        Object.assign(physParams, cfg.physics);
        compute.upload(spheres);
        compute.buildAndUploadSprings(spheres);
        compute.updatePhysicsParams(physParams);
        renderer.updateBoundingBox(physParams.boxHalf);
        gui.rebuild(spheres.length);
        energyPlot.reset();
    };
    gui.onSave = () => {
        saveConfig(spheresToConfig(spheres, physParams));
    };
    gui.onLoad = () => {
        loadConfigFromFile().then(cfg => applyConfig(cfg));
    };
    // ── Load default config on startup ────────────────────────────────────────
    try {
        const resp = await fetch("default-config.json");
        if (resp.ok) {
            const cfg = parseConfig(await resp.text());
            if (cfg) {
                spheres = configToSpheres(cfg);
                Object.assign(physParams, cfg.physics);
            }
        }
    }
    catch { /* fall back to generated spheres */ }
    compute.upload(spheres);
    compute.buildAndUploadSprings(spheres);
    compute.updatePhysicsParams(physParams);
    renderer.updateBoundingBox(physParams.boxHalf);
    gui.rebuild(spheres.length);
    // ── Resize ────────────────────────────────────────────────────────────────
    function resize() {
        canvas.width = window.innerWidth * devicePixelRatio;
        canvas.height = window.innerHeight * devicePixelRatio;
        camera.resize(canvas.width, canvas.height);
        renderer.resize(canvas.width, canvas.height);
    }
    resize();
    window.addEventListener("resize", resize);
    // ── Frame loop ────────────────────────────────────────────────────────────
    function frame() {
        const encoder = device.createCommandEncoder();
        if (topbar.isPlaying())
            compute.step(encoder);
        compute.scheduleReadback(encoder);
        renderer.render(encoder, camera.getViewProjectionMatrix(), camera.getEyePosition(), topbar.isGlowEnabled(), topbar.isAxesVisible(), compute.renderBuf, compute.forceLineBuf, compute.sphereCount, physParams.showForces, compute.springRenderCount);
        device.queue.submit([encoder.finish()]);
        device.queue.onSubmittedWorkDone().then(() => compute.doReadback(spheres)
            .then(() => {
            if (compute.sphereCount > 0) {
                const { ke, pe } = computeEnergy(spheres, physParams);
                energyPlot.push(ke, ke + pe);
            }
        })
            .catch(console.error));
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}
main().catch(console.error);
//# sourceMappingURL=main.js.map