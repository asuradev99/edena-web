export class TopBar {
    playing = false;
    panelOpen = false;
    showAxes = true;
    glowOn = true;
    editing = false;
    onEditChange;
    playBtn;
    objectsBtn;
    axesBtn;
    glowBtn;
    editBtn;
    constructor(container) {
        this.build(container);
    }
    isPlaying() { return this.playing; }
    isPanelOpen() { return this.panelOpen; }
    isAxesVisible() { return this.showAxes; }
    isGlowEnabled() { return this.glowOn; }
    isEditing() { return this.editing; }
    build(container) {
        const pill = document.createElement("div");
        pill.className = "tb-pill";
        // ── Play / Pause ─────────────────────────────────────────────────────────
        this.playBtn = this.btn("▶  PLAY");
        this.playBtn.addEventListener("click", () => {
            if (this.editing) {
                this.editing = false;
                this.editBtn.classList.remove("tb-active");
                this.onEditChange?.(false);
            }
            this.playing = !this.playing;
            this.playBtn.textContent = this.playing ? "⏸  PAUSE" : "▶  PLAY";
            this.playBtn.classList.toggle("tb-active", this.playing);
        });
        pill.appendChild(this.playBtn);
        pill.appendChild(this.sep());
        this.editBtn = this.btn("EDIT");
        this.editBtn.title = "Editing is available only while the simulation is paused";
        this.editBtn.addEventListener("click", () => {
            if (this.playing)
                return;
            this.editing = !this.editing;
            this.editBtn.classList.toggle("tb-active", this.editing);
            this.onEditChange?.(this.editing);
        });
        pill.appendChild(this.editBtn);
        pill.appendChild(this.sep());
        // ── Physics panel toggle ──────────────────────────────────────────────────
        this.objectsBtn = this.btn("PHYSICS");
        this.objectsBtn.addEventListener("click", () => {
            this.panelOpen = !this.panelOpen;
            this.objectsBtn.classList.toggle("tb-active", this.panelOpen);
            document.getElementById("gui")?.classList.toggle("panel-visible", this.panelOpen);
        });
        pill.appendChild(this.objectsBtn);
        pill.appendChild(this.sep());
        // ── Axes toggle ───────────────────────────────────────────────────────────
        this.axesBtn = this.dotBtn("AXES", true);
        this.axesBtn.addEventListener("click", () => {
            this.showAxes = !this.showAxes;
            this.axesBtn.classList.toggle("tb-active", this.showAxes);
        });
        pill.appendChild(this.axesBtn);
        // ── Glow toggle ───────────────────────────────────────────────────────────
        this.glowBtn = this.dotBtn("GLOW", true);
        this.glowBtn.addEventListener("click", () => {
            this.glowOn = !this.glowOn;
            this.glowBtn.classList.toggle("tb-active", this.glowOn);
        });
        pill.appendChild(this.glowBtn);
        container.appendChild(pill);
    }
    btn(label) {
        const b = document.createElement("button");
        b.className = "tb-btn";
        b.textContent = label;
        return b;
    }
    dotBtn(label, on) {
        const b = document.createElement("button");
        b.className = "tb-btn" + (on ? " tb-active" : "");
        const dot = document.createElement("span");
        dot.className = "tb-dot";
        b.appendChild(dot);
        b.appendChild(document.createTextNode(label));
        return b;
    }
    sep() {
        const d = document.createElement("div");
        d.className = "tb-sep";
        return d;
    }
}
//# sourceMappingURL=topbar.js.map