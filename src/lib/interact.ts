/**
 * Picking and dragging on a canvas.
 *
 * A demo that draws handles usually wants the reader to be able to grab one. That needs three
 * things: the ray through the pointer (see `OrbitCamera.ray`), where that ray meets the plane the
 * handle lives in, and a way to stop the camera orbiting at the same time.
 *
 * `attachHandles` is the third part, and it is deliberately small: the demo owns the state and
 * says where each handle is *now* through `at()`, so dragging the same handle through a rotating
 * frame or a rebuilt scene keeps working.
 */
import { dot, normalize, sub, type Vec3 } from './math.js';
import type { OrbitCamera } from './camera.js';

export type Ray = { origin: Vec3; direction: Vec3 };

/** Where a ray meets a plane, or `undefined` when they are parallel (the plane is edge-on). */
export function rayPlane(ray: Ray, point: Vec3 = [0, 0, 0], normal: Vec3 = [0, 1, 0]): Vec3 | undefined {
  const denominator = dot(ray.direction, normal);
  if (Math.abs(denominator) < 1e-9) return undefined;
  const t = dot(sub(point, ray.origin), normal) / denominator;
  return [ray.origin[0] + ray.direction[0] * t, ray.origin[1] + ray.direction[1] * t, ray.origin[2] + ray.direction[2] * t];
}

/** How far a world point is from a ray: the length of the perpendicular from the point to the line. */
export function rayDistance(ray: Ray, point: Vec3): number {
  const offset = sub(point, ray.origin);
  const along = dot(offset, ray.direction);
  const perp = sub(offset, [ray.direction[0] * along, ray.direction[1] * along, ray.direction[2] * along]);
  return Math.hypot(perp[0], perp[1], perp[2]);
}

/** How far a world point lands from a canvas pixel: the picking test for a projected handle. */
export function screenDistance(camera: OrbitCamera, point: Vec3, px: number, py: number, width: number, height: number): number {
  const [x, y] = camera.project(point, width, height);
  return Math.hypot(x - px, y - py);
}

/** A grabbable point. */
export type DragHandle = {
  /** Where the handle is right now — read every frame, so a moving scene still picks correctly. */
  at: () => Vec3;
  /** Called with the new world position while the pointer is down. */
  to: (point: Vec3) => void;
  /** Pick radius in CSS pixels; the default is 18. */
  radius?: number;
  /**
   * The plane the handle slides in. `'view'` means the plane through the grab point facing the
   * camera, which lets the reader move a handle freely in the picture; an explicit normal pins the
   * motion, e.g. `{ normal: [0, 1, 0] }` to drag along a floor.
   */
  plane?: { point?: Vec3; normal: Vec3 } | 'view';
  /** Scrolls with the pointer when the reader hovers this handle. */
  cursor?: string;
  /** Named in `onGrab`, useful for a readout. */
  id?: string;
};

export type HandleOptions = {
  /** Called with the handle that was grabbed, then with `undefined` when it is released. */
  onGrab?: (handle: DragHandle | undefined) => void;
  /** Called when the pointer moves over a different handle (or none). */
  onHover?: (handle: DragHandle | undefined) => void;
};

/**
 * Make the handles on a canvas draggable. The camera is locked for the duration of a grab, so
 * orbiting and dragging never fight over the same gesture. Returns a function that detaches.
 */
export function attachHandles(
  canvas: HTMLCanvasElement,
  camera: OrbitCamera,
  handles: () => DragHandle[],
  options: HandleOptions = {},
): () => void {
  const abort = new AbortController();
  const signal = abort.signal;
  const local = (event: PointerEvent): [number, number] => {
    const rect = canvas.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  };
  const nearest = (px: number, py: number): DragHandle | undefined => {
    const width = canvas.clientWidth, height = canvas.clientHeight;
    let best: DragHandle | undefined, bestDistance = Infinity;
    for (const handle of handles()) {
      const distance = screenDistance(camera, handle.at(), px, py, width, height);
      if (distance <= (handle.radius ?? 18) && distance < bestDistance) { best = handle; bestDistance = distance; }
    }
    return best;
  };

  let grabbed: DragHandle | undefined;
  let plane = { point: [0, 0, 0] as Vec3, normal: [0, 0, 1] as Vec3 };
  let offset: Vec3 = [0, 0, 0];
  let hovered: DragHandle | undefined;

  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 || grabbed) return;
    const [px, py] = local(event);
    const handle = nearest(px, py);
    if (!handle) return;
    const width = canvas.clientWidth, height = canvas.clientHeight;
    const ray = camera.ray(px, py, width, height);
    const anchor = handle.at();
    const normal: Vec3 = handle.plane === 'view' || handle.plane === undefined
      ? [-ray.direction[0], -ray.direction[1], -ray.direction[2]]
      : normalize(handle.plane.normal);
    const point = handle.plane === 'view' || handle.plane === undefined ? anchor : resolvePoint(handle.plane, anchor);
    const hit = rayPlane(ray, point, normal);
    // Keep the grab offset: the handle should not jump to the cursor.
    offset = hit ? sub(anchor, hit) : [0, 0, 0];
    plane = { point, normal };
    grabbed = handle;
    camera.locked = true;
    canvas.style.cursor = 'grabbing';
    try { canvas.setPointerCapture(event.pointerId); } catch { /* synthetic pointers have no capture target */ }
    options.onGrab?.(handle);
  }, { signal });

  canvas.addEventListener('pointermove', event => {
    const [px, py] = local(event);
    if (!grabbed) {
      const found = nearest(px, py);
      if (found !== hovered) {
        hovered = found;
        canvas.style.cursor = found ? (found.cursor ?? 'grab') : '';
        options.onHover?.(found);
      }
      return;
    }
    const ray = camera.ray(px, py, canvas.clientWidth, canvas.clientHeight);
    const hit = rayPlane(ray, plane.point, plane.normal);
    if (!hit) return;
    grabbed.to([hit[0] + offset[0], hit[1] + offset[1], hit[2] + offset[2]]);
  }, { signal });

  const release = (): void => {
    if (!grabbed) return;
    const wasGrabbed = grabbed;
    grabbed = undefined;
    camera.locked = false;
    canvas.style.cursor = hovered ? (hovered.cursor ?? 'grab') : '';
    options.onGrab?.(undefined);
    void wasGrabbed;
  };
  canvas.addEventListener('pointerup', release, { signal });
  canvas.addEventListener('pointercancel', release, { signal });
  canvas.addEventListener('lostpointercapture', release, { signal });

  return () => {
    release();
    abort.abort();
  };
}

function resolvePoint(plane: { point?: Vec3; normal: Vec3 }, fallback: Vec3): Vec3 {
  return plane.point ?? fallback;
}
