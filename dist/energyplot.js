// Rolling energy-vs-time plot drawn on a 2D canvas overlay.
// Tracks kinetic energy (KE) and total mechanical energy (KE + LJ_PE + grav_PE).
export class EnergyPlot {
    canvas;
    ctx;
    ke = [];
    tot = [];
    MAX = 300;
    // Logical drawing dimensions (CSS pixels, before DPR scale)
    CW;
    CH;
    constructor(canvas) {
        this.canvas = canvas;
        // Use the HTML attributes as the authoritative CSS dimensions.
        // This works even when the parent panel is hidden (transform: translateX)
        // because layout is still computed; clientWidth would also be valid, but
        // attribute-based sizing is simpler and avoids any display-state dependency.
        const cssW = canvas.width;
        const cssH = canvas.height;
        this.CW = cssW;
        this.CH = cssH;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = cssW * dpr;
        canvas.height = cssH * dpr;
        canvas.style.width = cssW + "px";
        canvas.style.height = cssH + "px";
        this.ctx = canvas.getContext("2d");
        this.ctx.scale(dpr, dpr);
    }
    reset() {
        this.ke = [];
        this.tot = [];
        const { ctx } = this;
        ctx.clearRect(0, 0, this.CW, this.CH);
    }
    push(ke, total) {
        this.ke.push(ke);
        this.tot.push(total);
        if (this.ke.length > this.MAX) {
            this.ke.shift();
            this.tot.shift();
        }
        this.draw();
    }
    draw() {
        const { ctx } = this;
        const W = this.CW, H = this.CH;
        const PT = 20, PB = 8, PL = 6, PR = 48;
        const PW = W - PL - PR, PH = H - PT - PB;
        ctx.clearRect(0, 0, W, H);
        const n = this.ke.length;
        if (n < 2)
            return;
        // Y range: include both series and zero
        let lo = 0, hi = 0;
        for (let i = 0; i < n; i++) {
            lo = Math.min(lo, this.ke[i], this.tot[i]);
            hi = Math.max(hi, this.ke[i], this.tot[i]);
        }
        const span = hi - lo || 1;
        lo -= span * 0.06;
        hi += span * 0.14; // extra headroom at top for legend
        const xOf = (i) => PL + (i / (n - 1)) * PW;
        const yOf = (v) => PT + PH - ((v - lo) / (hi - lo)) * PH;
        const yClamp = (v) => Math.max(PT - 1, Math.min(PT + PH + 1, yOf(v)));
        // Grid lines
        ctx.strokeStyle = "rgba(255,255,255,0.04)";
        ctx.lineWidth = 1;
        for (let k = 1; k <= 3; k++) {
            const y = PT + (k / 4) * PH;
            ctx.beginPath();
            ctx.moveTo(PL, y);
            ctx.lineTo(PL + PW, y);
            ctx.stroke();
        }
        // Zero reference line (only when zero is in the visible range)
        const zy = yOf(0);
        if (zy >= PT && zy <= PT + PH) {
            ctx.save();
            ctx.setLineDash([3, 5]);
            ctx.strokeStyle = "rgba(255,255,255,0.10)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(PL, zy);
            ctx.lineTo(PL + PW, zy);
            ctx.stroke();
            ctx.restore();
        }
        // Draw a series as a polyline
        const drawLine = (vals, color, width = 1.5) => {
            ctx.strokeStyle = color;
            ctx.lineWidth = width;
            ctx.beginPath();
            for (let i = 0; i < n; i++) {
                const x = xOf(i), y = yClamp(vals[i]);
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.stroke();
        };
        drawLine(this.tot, "rgba(110, 175, 255, 0.70)"); // total — cool blue
        drawLine(this.ke, "rgba(255, 158,  45, 0.90)"); // KE    — warm amber
        // Legend (top-left of plot area, inside PT padding)
        ctx.font = "bold 8px 'JetBrains Mono', monospace";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "rgba(255,158,45,0.80)";
        ctx.fillText("KE", PL, PT - 9);
        ctx.fillStyle = "rgba(110,175,255,0.70)";
        ctx.fillText("E", PL + 28, PT - 9);
        // Y-axis labels: max and min on the right
        ctx.font = "bold 10px 'JetBrains Mono', monospace";
        ctx.textBaseline = "top";
        ctx.textAlign = "left";
        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.fillText(hi.toFixed(1), PL + PW + 4, PT);
        ctx.textBaseline = "bottom";
        ctx.fillText(lo.toFixed(1), PL + PW + 4, PT + PH);
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
    }
}
//# sourceMappingURL=energyplot.js.map