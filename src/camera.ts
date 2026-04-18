import { mat4LookAt, mat4Perspective, mat4Multiply, Mat4 } from "./math.js";

/**
 * Orbit camera.
 * - Left-drag:   orbit (rotate around target)
 * - Right-drag:  pan (translate target)
 * - Scroll:      zoom (dolly)
 */
export class Camera {
  private radius = 6;
  private theta  = Math.PI / 4;        // azimuth around Y
  private phi    = Math.PI / 3;        // polar from +Y pole

  private target: [number, number, number] = [0, 0, 0];
  private width  = 1;
  private height = 1;

  private activeButton = -1;
  private lastX = 0;
  private lastY = 0;

  constructor(canvas: HTMLCanvasElement) {
    canvas.addEventListener("mousedown",   this.onDown);
    window.addEventListener("mousemove",   this.onMove);
    window.addEventListener("mouseup",     this.onUp);
    canvas.addEventListener("wheel",       this.onWheel, { passive: false });
    canvas.addEventListener("contextmenu", e => e.preventDefault());
  }

  resize(width: number, height: number) {
    this.width  = width;
    this.height = height;
  }

  getViewProjectionMatrix(): Mat4 {
    const eye  = this.eye();
    const view = mat4LookAt(eye, this.target, [0, 1, 0]);
    const proj = mat4Perspective(Math.PI / 4, this.width / this.height, 0.01, 1000);
    return mat4Multiply(proj, view);
  }

  getEyePosition(): [number, number, number] { return this.eye(); }

  private eye(): [number, number, number] {
    const sp = Math.sin(this.phi),   cp = Math.cos(this.phi);
    const st = Math.sin(this.theta), ct = Math.cos(this.theta);
    return [
      this.target[0] + this.radius * sp * st,
      this.target[1] + this.radius * cp,
      this.target[2] + this.radius * sp * ct,
    ];
  }

  private onDown = (e: MouseEvent) => {
    this.activeButton = e.button;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    e.preventDefault();
  };

  private onMove = (e: MouseEvent) => {
    if (this.activeButton === -1) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;

    if (this.activeButton === 0) {
      // Orbit
      this.theta -= dx * 0.006;
      this.phi = Math.max(0.02, Math.min(Math.PI - 0.02, this.phi - dy * 0.006));
    } else {
      // Pan (right or middle mouse)
      this.pan(dx, dy);
    }
  };

  private onUp = () => { this.activeButton = -1; };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.radius *= e.deltaY > 0 ? 1.1 : 0.9;
    this.radius = Math.max(0.1, Math.min(500, this.radius));
  };

  private pan(dx: number, dy: number) {
    const e = this.eye();
    // Forward vector (unnormalized — we'll normalise right/up below)
    const fx = this.target[0] - e[0];
    const fy = this.target[1] - e[1];
    const fz = this.target[2] - e[2];

    // right = forward × worldUp ([0,1,0])
    let rx = -fz, ry = 0, rz = fx;
    const rl = Math.sqrt(rx*rx + rz*rz) || 1;
    rx /= rl; rz /= rl;

    // up = right × forward (normalised)
    const fl = Math.sqrt(fx*fx + fy*fy + fz*fz) || 1;
    const ux = ry * (fz/fl) - rz * (fy/fl);
    const uy = rz * (fx/fl) - rx * (fz/fl);
    const uz = rx * (fy/fl) - ry * (fx/fl);

    const scale = this.radius * 0.0012;
    this.target[0] += (-rx * dx + ux * dy) * scale;
    this.target[1] += (-ry * dx + uy * dy) * scale;
    this.target[2] += (-rz * dx + uz * dy) * scale;
  }
}
