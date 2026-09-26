# 16 · Picking and dragging

**Code:** `src/lib/interact.ts` (`Ray`, `rayPlane`, `rayDistance`, `screenDistance`, `DragHandle`,
`attachHandles`), `src/lib/camera.ts` (`OrbitCamera.ray`).

## Pixel → ray

`camera.ray(px, py, width, height)` turns a canvas pixel into a world ray:

```
ndcX = 2·px/width − 1            ndcY = 1 − 2·py/height

orthographic:  origin = eye + right·ndcX·h/2·aspect + up·ndcY·h/2
               direction = −back

perspective:   origin = eye
               direction = normalize(right·ndcX·(w/h)/f + up·ndcY/f − back),   f = 1/tan(fovY/2)
```

An orthographic camera gets parallel rays that slide across the camera plane; a perspective camera gets
a pinhole. Both are the inverse of the projection the renderer uses, so a click always lands where the
picture says.

## Ray → plane

```ts
const denominator = dot(ray.direction, normal);
if (|denominator| < 1e-6) return undefined;            // parallel: no hit
const t = dot(sub(point, ray.origin), normal) / denominator;
return t < 0 ? undefined : add(ray.origin, scale(ray.direction, t));
```

`rayPlane(ray, point = [0,0,0], normal = [0,1,0])` is the whole of it. The `t < 0` case is a plane
behind the camera, which must not produce a hit.

## Handle → grab

`screenDistance(camera, point, px, py, width, height)` projects the point and compares *pixels*, so a
small object far away is hard to grab and a large one near is easy — the behaviour a pointer expects.
`attachHandles(canvas, camera, () => handles, options)` then:

1. on pointer down, measures every handle and takes the nearest within its `radius` (default 18 px);
2. computes the grab plane — `'view'` means the plane through the grab point facing the camera, an
   explicit `normal` pins the motion (a floor, an axis);
3. sets `camera.locked` for the duration of the gesture, so orbiting and dragging never fight;
4. calls `handle.to(worldPoint)` for every pointer move;
5. releases on `pointerup`, `pointercancel` or `lostpointercapture`.

`at()` is read every frame, so a handle follows a moving scene without being re-registered.

## Why the camera lock matters

Without it, a drag would also orbit: the same pointer movement would be interpreted twice. The lock is
a single boolean on the camera that `OrbitCamera.attach` checks, which is why it is enforced in one
place rather than in every page's event handler.

## Limits

- Nearest-handle-wins with **no occlusion**: a handle hidden behind geometry can still be grabbed.
- Ray–plane is the only intersection; there is no ray–triangle or ray–box test, so surface picking is
  the page's job.
- The plane is fixed when the grab starts, so a handle cannot switch planes mid-drag.
- Touch has no hover, so `onHover` simply never fires there.
