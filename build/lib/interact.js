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
import { dot, normalize, sub } from './math.js';
/** Where a ray meets a plane, or `undefined` when they are parallel (the plane is edge-on). */
export function rayPlane(ray, point = [0, 0, 0], normal = [0, 1, 0]) {
    const denominator = dot(ray.direction, normal);
    if (Math.abs(denominator) < 1e-9)
        return undefined;
    const t = dot(sub(point, ray.origin), normal) / denominator;
    return [ray.origin[0] + ray.direction[0] * t, ray.origin[1] + ray.direction[1] * t, ray.origin[2] + ray.direction[2] * t];
}
/** How far a world point is from a ray: the length of the perpendicular from the point to the line. */
export function rayDistance(ray, point) {
    const offset = sub(point, ray.origin);
    const along = dot(offset, ray.direction);
    const perp = sub(offset, [ray.direction[0] * along, ray.direction[1] * along, ray.direction[2] * along]);
    return Math.hypot(perp[0], perp[1], perp[2]);
}
/** How far a world point lands from a canvas pixel: the picking test for a projected handle. */
export function screenDistance(camera, point, px, py, width, height) {
    const [x, y] = camera.project(point, width, height);
    return Math.hypot(x - px, y - py);
}
/**
 * Make the handles on a canvas draggable. The camera is locked for the duration of a grab, so
 * orbiting and dragging never fight over the same gesture. Returns a function that detaches.
 */
export function attachHandles(canvas, camera, handles, options = {}) {
    const abort = new AbortController();
    const signal = abort.signal;
    const local = (event) => {
        const rect = canvas.getBoundingClientRect();
        return [event.clientX - rect.left, event.clientY - rect.top];
    };
    const nearest = (px, py) => {
        const width = canvas.clientWidth, height = canvas.clientHeight;
        let best, bestDistance = Infinity;
        for (const handle of handles()) {
            const distance = screenDistance(camera, handle.at(), px, py, width, height);
            if (distance <= (handle.radius ?? 18) && distance < bestDistance) {
                best = handle;
                bestDistance = distance;
            }
        }
        return best;
    };
    let grabbed;
    let plane = { point: [0, 0, 0], normal: [0, 0, 1] };
    let offset = [0, 0, 0];
    let hovered;
    canvas.addEventListener('pointerdown', event => {
        if (event.button !== 0 || grabbed)
            return;
        const [px, py] = local(event);
        const handle = nearest(px, py);
        if (!handle)
            return;
        const width = canvas.clientWidth, height = canvas.clientHeight;
        const ray = camera.ray(px, py, width, height);
        const anchor = handle.at();
        const normal = handle.plane === 'view' || handle.plane === undefined
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
        try {
            canvas.setPointerCapture(event.pointerId);
        }
        catch { /* synthetic pointers have no capture target */ }
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
        if (!hit)
            return;
        grabbed.to([hit[0] + offset[0], hit[1] + offset[1], hit[2] + offset[2]]);
    }, { signal });
    const release = () => {
        if (!grabbed)
            return;
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
function resolvePoint(plane, fallback) {
    return plane.point ?? fallback;
}
//# sourceMappingURL=interact.js.map