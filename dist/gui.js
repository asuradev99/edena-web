export class GUI {
    params;
    /** Called whenever any physics param changes (throttled to change events). */
    onParamsChange;
    /** Called when particle count is committed — triggers full regeneration. */
    onParticleCountChange;
    /** Called when radius changes — updates all sphere radii in-place. */
    onRadiusChange;
    /** Called when the user clicks Save — should download current config. */
    onSave;
    /** Called when the user clicks Load — should open a file picker. */
    onLoad;
    /** Called when the user loads the built-in FCC cube preset. */
    onLoadCube;
    /** Canvas element for the energy plot — pass to EnergyPlot constructor. */
    energyCanvas;
    particleCount;
    container;
    constructor(container, initialCount, params) {
        this.params = params;
        this.particleCount = initialCount;
        // Create canvas before build() so the property is set when build appends it
        const cv = document.createElement("canvas");
        cv.width = 224; // logical CSS px — EnergyPlot will apply DPR scaling
        cv.height = 112;
        this.energyCanvas = cv;
        this.build(container);
    }
    /** Re-renders the panel DOM after an external state change (e.g. load config). */
    rebuild(particleCount) {
        this.particleCount = particleCount;
        this.build(this.container);
    }
    // ── DOM construction ────────────────────────────────────────────────────────
    build(container) {
        this.container = container;
        container.innerHTML = "";
        const header = el("div", "panel-header");
        const title = el("span", "panel-title");
        title.textContent = "PHYSICS";
        const btnGroup = el("div", "header-btn-group");
        const btnLoad = el("button", "header-btn");
        btnLoad.textContent = "LOAD";
        btnLoad.title = "Load configuration from JSON file";
        btnLoad.addEventListener("click", () => this.onLoad?.());
        const btnCube = el("button", "header-btn");
        btnCube.textContent = "CUBE";
        btnCube.title = "Load the built-in FCC cube configuration";
        btnCube.addEventListener("click", () => this.onLoadCube?.());
        const btnSave = el("button", "header-btn header-btn-accent");
        btnSave.textContent = "SAVE";
        btnSave.title = "Save current configuration to JSON file";
        btnSave.addEventListener("click", () => this.onSave?.());
        btnGroup.appendChild(btnCube);
        btnGroup.appendChild(btnLoad);
        btnGroup.appendChild(btnSave);
        header.appendChild(title);
        header.appendChild(btnGroup);
        container.appendChild(header);
        const body = el("div", "settings-body");
        container.appendChild(body);
        // ── Simulation ────────────────────────────────────────────────────────────
        this.section(body, "SIMULATION", sec => {
            this.dropdownRow(sec, "Integrator", [
                { value: "velocity-verlet", label: "Velocity Verlet" },
            ], this.params.integrator, v => {
                this.params.integrator = v;
                this.onParamsChange?.();
            });
            this.countRow(sec, "Particles", this.particleCount, 1, 500, n => {
                this.particleCount = n;
                this.onParticleCountChange?.(n);
            });
            this.sliderRow(sec, "Radius", this.params.radius, 0.08, 0.70, 0.01, 2, v => {
                this.params.radius = v;
                this.onRadiusChange?.(v);
            });
            this.sliderRow(sec, "Speed", this.params.timeScale, 0.1, 4.0, 0.05, 2, v => {
                this.params.timeScale = v;
                this.onParamsChange?.();
            });
            this.sliderRow(sec, "Box size", this.params.boxHalf, 1.0, 20.0, 0.5, 1, v => {
                this.params.boxHalf = v;
                this.onParamsChange?.();
            });
        });
        // ── Forces ────────────────────────────────────────────────────────────────
        this.section(body, "FORCES", sec => {
            this.sliderRow(sec, "Gravity", this.params.gravity, 0, 12, 0.1, 2, v => {
                this.params.gravity = v;
                this.onParamsChange?.();
            });
            this.sliderRow(sec, "LJ ε", this.params.ljEps, 0, 2, 0.01, 3, v => {
                this.params.ljEps = v;
                this.onParamsChange?.();
            });
            this.sliderRow(sec, "LJ σ·min", this.params.ljMin, 0.3, 1.5, 0.01, 2, v => {
                this.params.ljMin = v;
                this.onParamsChange?.();
            });
            this.sliderRow(sec, "Cutoff", this.params.ljCutoff, 1.0, 6.0, 0.1, 1, v => {
                this.params.ljCutoff = v;
                this.onParamsChange?.();
            });
            this.sliderRow(sec, "Drag", this.params.damping, 0.990, 1.000, 0.001, 3, v => {
                this.params.damping = v;
                this.onParamsChange?.();
            });
            this.sliderRow(sec, "Spring k", this.params.springK, 0, 5000, 10, 0, v => {
                this.params.springK = v;
                this.onParamsChange?.();
            });
        });
        // ── Analytics ─────────────────────────────────────────────────────────────
        this.section(body, "ANALYTICS", sec => {
            const wrap = el("div", "energy-wrap");
            wrap.appendChild(this.energyCanvas);
            sec.appendChild(wrap);
        });
        // ── Display ───────────────────────────────────────────────────────────────
        this.section(body, "DISPLAY", sec => {
            const keRow = this.toggleRow(sec, "Color by KE", this.params.colorByKE, v => {
                this.params.colorByKE = v;
                this.onParamsChange?.();
                keScaleRow.style.display = v ? "flex" : "none";
            });
            void keRow;
            const keScaleRow = this.sliderRow(sec, "KE scale", this.params.keScale, 0.5, 30, 0.5, 1, v => {
                this.params.keScale = v;
                this.onParamsChange?.();
            });
            keScaleRow.style.display = this.params.colorByKE ? "flex" : "none";
            this.toggleRow(sec, "Force vectors", this.params.showForces, v => {
                this.params.showForces = v;
                this.onParamsChange?.();
            });
        });
    }
    // ── Widget helpers ──────────────────────────────────────────────────────────
    dropdownRow(parent, label, options, current, onChange) {
        const row = el("div", "param-row");
        const lbl = el("span", "param-label");
        lbl.textContent = label;
        const sel = document.createElement("select");
        sel.className = "param-select";
        for (const opt of options) {
            const o = document.createElement("option");
            o.value = opt.value;
            o.textContent = opt.label;
            if (opt.value === current)
                o.selected = true;
            sel.appendChild(o);
        }
        sel.addEventListener("change", () => onChange(sel.value));
        row.appendChild(lbl);
        row.appendChild(sel);
        parent.appendChild(row);
        return row;
    }
    section(parent, title, fill) {
        const hdr = el("div", "settings-section-header");
        hdr.textContent = title;
        parent.appendChild(hdr);
        const body = el("div", "settings-section-body");
        fill(body);
        parent.appendChild(body);
    }
    sliderRow(parent, label, value, min, max, step, decimals, onChange) {
        const row = el("div", "param-row");
        const lbl = el("span", "param-label");
        lbl.textContent = label;
        const slider = document.createElement("input");
        slider.type = "range";
        slider.min = String(min);
        slider.max = String(max);
        slider.step = String(step);
        slider.value = String(value);
        const valEl = el("span", "param-value");
        valEl.textContent = value.toFixed(decimals);
        slider.addEventListener("input", () => {
            const v = parseFloat(slider.value);
            valEl.textContent = v.toFixed(decimals);
            onChange(v);
        });
        row.appendChild(lbl);
        row.appendChild(slider);
        row.appendChild(valEl);
        parent.appendChild(row);
        return row;
    }
    countRow(parent, label, value, min, max, onChange) {
        const row = el("div", "param-row");
        const lbl = el("span", "param-label");
        lbl.textContent = label;
        const inp = document.createElement("input");
        inp.type = "number";
        inp.min = String(min);
        inp.max = String(max);
        inp.step = "1";
        inp.value = String(value);
        inp.className = "count-input";
        const commit = () => {
            const v = Math.round(Math.max(min, Math.min(max, parseInt(inp.value) || min)));
            inp.value = String(v);
            onChange(v);
        };
        inp.addEventListener("change", commit);
        inp.addEventListener("keydown", e => { if (e.key === "Enter")
            inp.blur(); });
        row.appendChild(lbl);
        row.appendChild(inp);
        parent.appendChild(row);
        return row;
    }
    toggleRow(parent, label, value, onChange) {
        const row = el("div", "toggle-row");
        row.style.cursor = "pointer";
        const lbl = el("span", "toggle-label");
        lbl.textContent = label;
        const sw = el("div", "toggle-switch" + (value ? " on" : ""));
        let state = value;
        row.addEventListener("click", () => {
            state = !state;
            sw.className = "toggle-switch" + (state ? " on" : "");
            onChange(state);
        });
        row.appendChild(lbl);
        row.appendChild(sw);
        parent.appendChild(row);
        return row;
    }
}
function el(tag, cls) {
    const e = document.createElement(tag);
    e.className = cls;
    return e;
}
//# sourceMappingURL=gui.js.map