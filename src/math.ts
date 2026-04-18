export type Mat4 = Float32Array;

export function mat4Perspective(fovY: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1.0 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  const m = new Float32Array(16);
  m[0]  = f / aspect;
  m[5]  = f;
  m[10] = far * nf;
  m[11] = -1;
  m[14] = near * far * nf;
  return m;
}

/** Column-major lookAt (right-handed, camera looks down -Z). */
export function mat4LookAt(
  eye: [number, number, number],
  center: [number, number, number],
  up: [number, number, number],
): Mat4 {
  const [ex, ey, ez] = eye;
  let fx = center[0] - ex, fy = center[1] - ey, fz = center[2] - ez;
  const fl = Math.sqrt(fx*fx + fy*fy + fz*fz);
  fx /= fl; fy /= fl; fz /= fl;

  // right = forward × up
  let sx = fy*up[2] - fz*up[1];
  let sy = fz*up[0] - fx*up[2];
  let sz = fx*up[1] - fy*up[0];
  const sl = Math.sqrt(sx*sx + sy*sy + sz*sz);
  sx /= sl; sy /= sl; sz /= sl;

  // true up = right × forward
  const ux = sy*fz - sz*fy;
  const uy = sz*fx - sx*fz;
  const uz = sx*fy - sy*fx;

  const m = new Float32Array(16);
  // Column 0
  m[0] = sx;  m[1] = ux;  m[2] = -fx; m[3] = 0;
  // Column 1
  m[4] = sy;  m[5] = uy;  m[6] = -fy; m[7] = 0;
  // Column 2
  m[8] = sz;  m[9] = uz;  m[10] = -fz; m[11] = 0;
  // Column 3 (translation)
  m[12] = -(sx*ex + sy*ey + sz*ez);
  m[13] = -(ux*ex + uy*ey + uz*ez);
  m[14] =   fx*ex + fy*ey + fz*ez;
  m[15] = 1;
  return m;
}

/** Column-major matrix multiply: returns a*b. */
export function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
  const m = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k*4 + r] * b[c*4 + k];
      m[c*4 + r] = s;
    }
  }
  return m;
}
