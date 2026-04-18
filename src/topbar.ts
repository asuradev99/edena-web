export class TopBar {
  private playing   = false;
  private panelOpen = false;
  private showAxes  = true;
  private glowOn    = true;

  private playBtn!:    HTMLButtonElement;
  private objectsBtn!: HTMLButtonElement;
  private axesBtn!:    HTMLButtonElement;
  private glowBtn!:    HTMLButtonElement;

  constructor(container: HTMLElement) {
    this.build(container);
  }

  isPlaying():     boolean { return this.playing; }
  isPanelOpen():   boolean { return this.panelOpen; }
  isAxesVisible(): boolean { return this.showAxes; }
  isGlowEnabled(): boolean { return this.glowOn; }

  private build(container: HTMLElement) {
    const pill = document.createElement("div");
    pill.className = "tb-pill";

    // ── Play / Pause ─────────────────────────────────────────────────────────
    this.playBtn = this.btn("▶  PLAY");
    this.playBtn.addEventListener("click", () => {
      this.playing = !this.playing;
      this.playBtn.textContent = this.playing ? "⏸  PAUSE" : "▶  PLAY";
      this.playBtn.classList.toggle("tb-active", this.playing);
    });
    pill.appendChild(this.playBtn);
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

  private btn(label: string): HTMLButtonElement {
    const b = document.createElement("button");
    b.className = "tb-btn";
    b.textContent = label;
    return b;
  }

  private dotBtn(label: string, on: boolean): HTMLButtonElement {
    const b = document.createElement("button");
    b.className = "tb-btn" + (on ? " tb-active" : "");
    const dot = document.createElement("span");
    dot.className = "tb-dot";
    b.appendChild(dot);
    b.appendChild(document.createTextNode(label));
    return b;
  }

  private sep(): HTMLElement {
    const d = document.createElement("div");
    d.className = "tb-sep";
    return d;
  }
}
