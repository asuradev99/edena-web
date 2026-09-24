import { mat4LookAt, mat4Perspective, mat4Multiply } from "./math.js";
/**
 * Orbit camera.
 * - Left-drag:   orbit (rotate around target)
 * - Right-drag:  pan (translate target)
 * - Scroll:      zoom (dolly)
 */
export class Camera {
    radius = 6;
    theta = Math.PI / 4; // azimuth around Y
    phi = Math.PI / 3; // polar from +Y pole
    target = [0, 0, 0];
    width = 1;
    height = 1;
    activeButton = -1;
    lastX = 0;
    lastY = 0;
    leftDragEnabled = true;
    constructor(canvas) {
        canvas.addEventListener("mousedown", this.onDown);
        window.addEventListener("mousemove", this.onMove);
        window.addEventListener("mouseup", this.onUp);
        canvas.addEventListener("wheel", this.onWheel, { passive: false });
        canvas.addEventListener("contextmenu", e => e.preventDefault());
    }
    resize(width, height) {
        this.width = width;
        this.height = height;
    }
    getViewProjectionMatrix() {
        const eye = this.eye();
        const view = mat4LookAt(eye, this.target, [0, 1, 0]);
        const proj = mat4Perspective(Math.PI / 4, this.width / this.height, 0.01, 1000);
        return mat4Multiply(proj, view);
    }
    getEyePosition() { return this.eye(); }
    /** Editor tools reserve left-drag; right/middle pan and wheel zoom remain available. */
    setLeftDragEnabled(enabled) { this.leftDragEnabled = enabled; }
    getRay(clientX, clientY, canvas) {
        const rect = canvas.getBoundingClientRect();
        const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
        const ny = 1 - ((clientY - rect.top) / rect.height) * 2;
        const origin = this.eye();
        const forward = normalize([
            this.target[0] - origin[0], this.target[1] - origin[1], this.target[2] - origin[2],
        ]);
        const right = normalize(cross(forward, [0, 1, 0]));
        const up = normalize(cross(right, forward));
        const scale = Math.tan(Math.PI / 8);
        const aspect = rect.width / rect.height;
        const direction = normalize([
            forward[0] + right[0] * nx * scale * aspect + up[0] * ny * scale,
            forward[1] + right[1] * nx * scale * aspect + up[1] * ny * scale,
            forward[2] + right[2] * nx * scale * aspect + up[2] * ny * scale,
        ]);
        return { origin, direction };
    }
    eye() {
        const sp = Math.sin(this.phi), cp = Math.cos(this.phi);
        const st = Math.sin(this.theta), ct = Math.cos(this.theta);
        return [
            this.target[0] + this.radius * sp * st,
            this.target[1] + this.radius * cp,
            this.target[2] + this.radius * sp * ct,
        ];
    }
    onDown = (e) => {
        if (e.button === 0 && !this.leftDragEnabled)
            return;
        this.activeButton = e.button;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        e.preventDefault();
    };
    onMove = (e) => {
        if (this.activeButton === -1)
            return;
        const dx = e.clientX - this.lastX;
        const dy = e.clientY - this.lastY;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        if (this.activeButton === 0) {
            // Orbit
            this.theta -= dx * 0.006;
            this.phi = Math.max(0.02, Math.min(Math.PI - 0.02, this.phi - dy * 0.006));
        }
        else {
            // Pan (right or middle mouse)
            this.pan(dx, dy);
        }
    };
    onUp = () => { this.activeButton = -1; };
    onWheel = (e) => {
        e.preventDefault();
        this.radius *= e.deltaY > 0 ? 1.1 : 0.9;
        this.radius = Math.max(0.1, Math.min(500, this.radius));
    };
    pan(dx, dy) {
        const e = this.eye();
        // Forward vector (unnormalized — we'll normalise right/up below)
        const fx = this.target[0] - e[0];
        const fy = this.target[1] - e[1];
        const fz = this.target[2] - e[2];
        // right = forward × worldUp ([0,1,0])
        let rx = -fz, ry = 0, rz = fx;
        const rl = Math.sqrt(rx * rx + rz * rz) || 1;
        rx /= rl;
        rz /= rl;
        // up = right × forward (normalised)
        const fl = Math.sqrt(fx * fx + fy * fy + fz * fz) || 1;
        const ux = ry * (fz / fl) - rz * (fy / fl);
        const uy = rz * (fx / fl) - rx * (fz / fl);
        const uz = rx * (fy / fl) - ry * (fx / fl);
        const scale = this.radius * 0.0012;
        this.target[0] += (-rx * dx + ux * dy) * scale;
        this.target[1] += (-ry * dx + uy * dy) * scale;
        this.target[2] += (-rz * dx + uz * dy) * scale;
    }
}
function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function normalize(v) {
    const length = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / length, v[1] / length, v[2] / length];
}
//# sourceMappingURL=camera.js.map