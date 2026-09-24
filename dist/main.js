import { Camera } from "./camera.js";
import { Renderer } from "./renderer.js";
import { Compute } from "./compute.js";
import { GUI } from "./gui.js";
import { TopBar } from "./topbar.js";
import { EnergyPlot } from "./energyplot.js";
import { Editor } from "./editor.js";
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
            type: 1,
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
    let spheres = [];
    let bonds = [];
    let selectedIndex = -1;
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
    const uploadEditedState = () => {
        compute.upload(spheres, selectedIndex);
        bonds = compute.buildAndUploadSprings(spheres, bonds);
        compute.updatePhysicsParams(physParams);
    };
    const editor = new Editor(canvas, camera, {
        getSpheres: () => spheres,
        onSelectionChange: index => {
            selectedIndex = index;
            compute.upload(spheres, selectedIndex);
        },
        onMove: (index, delta) => {
            const sphere = spheres[index];
            if (!sphere)
                return;
            const bound = physParams.boxHalf - sphere.radius;
            sphere.position = [
                Math.max(-bound, Math.min(bound, sphere.position[0] + delta[0])),
                Math.max(-bound, Math.min(bound, sphere.position[1] + delta[1])),
                Math.max(-bound, Math.min(bound, sphere.position[2] + delta[2])),
            ];
            sphere.velocity = [0, 0, 0];
            uploadEditedState();
        },
        onAdd: (position, type) => {
            if (spheres.length >= 512)
                return -1;
            const radius = physParams.radius;
            const bound = physParams.boxHalf - radius;
            const id = spheres.reduce((max, sphere) => Math.max(max, sphere.id), 0) + 1;
            const color = hslToRgb((id * 137.508) % 360, 0.75, 0.62);
            spheres.push({
                id,
                position: [Math.max(-bound, Math.min(bound, position[0])), 0, Math.max(-bound, Math.min(bound, position[2]))],
                velocity: [0, 0, 0], radius, mass: radius ** 3 * 50, color, type,
            });
            gui.rebuild(spheres.length);
            uploadEditedState();
            return spheres.length - 1;
        },
        onSetType: (index, type) => {
            const sphere = spheres[index];
            if (!sphere)
                return;
            sphere.type = type;
            if (type === 2)
                sphere.velocity = [0, 0, 0];
            uploadEditedState();
        },
        onDelete: index => {
            if (!spheres[index])
                return;
            spheres.splice(index, 1);
            bonds = bonds
                .filter(bond => bond.a !== index && bond.b !== index)
                .map(bond => ({
                ...bond,
                a: bond.a > index ? bond.a - 1 : bond.a,
                b: bond.b > index ? bond.b - 1 : bond.b,
            }));
            selectedIndex = -1;
            gui.rebuild(spheres.length);
            uploadEditedState();
        },
        onBond: (a, b) => {
            const lo = Math.min(a, b), hi = Math.max(a, b);
            if (bonds.some(bond => bond.a === lo && bond.b === hi))
                return;
            const degree = (index) => bonds.filter(bond => bond.a === index || bond.b === index).length;
            if (degree(lo) >= 12 || degree(hi) >= 12)
                return;
            const pa = spheres[lo].position, pb = spheres[hi].position;
            bonds.push({ a: lo, b: hi, restLength: Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]) });
            uploadEditedState();
        },
        onPreview: (position, cellSize) => {
            renderer.updateEditorPreview(position, physParams.radius, cellSize);
        },
        onGridCreate: (spec) => {
            const available = 512 - spheres.length;
            const count = Math.min(available, spec.x * spec.y * spec.z);
            if (count <= 0)
                return 0;
            const cell = Math.max(spec.cellSize, physParams.radius * 2);
            let created = 0;
            const nextId = spheres.reduce((max, sphere) => Math.max(max, sphere.id), 0) + 1;
            const halfGridY = (spec.y - 1) * cell / 2;
            const bound = physParams.boxHalf - physParams.radius;
            const top = spheres.reduce((max, sphere) => Math.max(max, sphere.position[1] + sphere.radius), -Infinity);
            const bottom = spheres.reduce((min, sphere) => Math.min(min, sphere.position[1] - sphere.radius), Infinity);
            const above = top + physParams.radius + halfGridY;
            const below = bottom - physParams.radius - halfGridY;
            const centerY = spheres.length === 0 ? 0 : above + halfGridY <= bound ? above : below - halfGridY >= -bound ? below : 0;
            for (let z = 0; z < spec.z && created < count; z++) {
                for (let y = 0; y < spec.y && created < count; y++) {
                    for (let x = 0; x < spec.x && created < count; x++) {
                        const color = hslToRgb(((nextId + created) * 137.508) % 360, 0.75, 0.62);
                        spheres.push({
                            id: nextId + created,
                            position: [(x - (spec.x - 1) / 2) * cell, centerY + (y - (spec.y - 1) / 2) * cell, (z - (spec.z - 1) / 2) * cell],
                            velocity: [0, 0, 0], radius: physParams.radius,
                            mass: physParams.radius ** 3 * 50, color, type: spec.atomType,
                        });
                        created++;
                    }
                }
            }
            gui.rebuild(spheres.length);
            uploadEditedState();
            return created;
        },
    });
    topbar.onEditChange = editing => {
        selectedIndex = -1;
        editor.setActive(editing);
        compute.upload(spheres, selectedIndex);
    };
    // ── GUI callbacks ─────────────────────────────────────────────────────────
    gui.onParamsChange = () => {
        compute.updatePhysicsParams(physParams);
        renderer.updateBoundingBox(physParams.boxHalf);
    };
    gui.onParticleCountChange = (n) => {
        editor.clearSelection();
        spheres = generateSpheres(n, physParams.radius, physParams.boxHalf);
        compute.upload(spheres, selectedIndex);
        bonds = compute.buildAndUploadSprings(spheres);
        compute.updatePhysicsParams(physParams);
    };
    gui.onRadiusChange = (r) => {
        for (const s of spheres) {
            s.radius = r;
            s.mass = r * r * r * 50;
        }
        compute.upload(spheres, selectedIndex);
        // Spring rest lengths are position-based, no rebuild needed for radius-only change
    };
    // ── Config save / load ────────────────────────────────────────────────────
    const applyConfig = (cfg) => {
        if (!cfg)
            return;
        editor.clearSelection();
        spheres = configToSpheres(cfg);
        Object.assign(physParams, cfg.physics);
        compute.upload(spheres);
        bonds = compute.buildAndUploadSprings(spheres, cfg.bonds);
        compute.updatePhysicsParams(physParams);
        renderer.updateBoundingBox(physParams.boxHalf);
        gui.rebuild(spheres.length);
        energyPlot.reset();
    };
    gui.onSave = () => {
        saveConfig(spheresToConfig(spheres, physParams, bonds));
    };
    gui.onLoad = () => {
        loadConfigFromFile().then(cfg => applyConfig(cfg));
    };
    gui.onLoadCube = () => {
        fetch("cube-config.json")
            .then(response => response.ok ? response.text() : Promise.reject(new Error("Cube preset unavailable")))
            .then(json => applyConfig(parseConfig(json)))
            .catch(console.error);
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
    bonds = compute.buildAndUploadSprings(spheres);
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