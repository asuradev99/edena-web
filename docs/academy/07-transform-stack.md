# 07 · The transform stack

**Code:** `src/lib/math.ts` (`transform`, `multiply`, `orientationMatrix`, `applyMatrix`),
`src/lib/world.ts` (`Visual.matrix`, `Group.flatten`).

## What a node stores

A `Visual` does not know where it is in the world. It stores three local things:

```
position : Vec3        // translation
scale    : Vec3        // per-axis scale in the node's own frame
rotation : number      // a single turn about +y
orientation? : Vec3    // optional Euler x→y→z, applied before rotation
```

`Visual.matrix` turns those into one column-major 4×4:

```ts
transform(position, scale, rotation, orientation)
  = T(position) · Ry(rotation) · Rz·Ry·Rx(orientation) · S(scale)
```

Read the product from the right: scale first, then the Euler turn, then the y-rotation, then the
translation. Passing no `orientation` is byte-identical to the original y-only matrix, which a test
pins.

## How the world matrix appears

`Group.flatten()` walks the tree once and multiplies as it descends:

```ts
const matrix = multiply(parent, transform(this.position, this.scale, this.rotation, this.orientation));
for (const child of this.children) … yield { node, matrix: multiply(matrix, node.matrix), opacity }
```

So a node's world matrix is `M_root · M_parent · … · M_leaf`. Move the root and everything below it
moves, with no per-node world position to keep in sync — the "read back out of the graph" habit the
lab uses to print the wrist's position is exactly this product, evaluated by the renderer.

## Why it is built this way

Column-major, right-handed, +Y up, matching what WGSL's `mat4x4<f32>` expects when constructed from
four `vec4` columns. `multiply(a, b)` is `a·b`, so `multiply(parent, child)` is the classic scene-graph
composition and needs no transpose anywhere in the renderer.

## Limits

- `rotation` is one y-angle only. A full pose needs `orientation`, which is Euler, not a quaternion:
  it has gimbal order (x→y→z) and cannot be slerped.
- There is no inverse, no constraint solver, no skeleton/skinning, and no parenting by world position.
- Geometry is treated as immutable; a node's `geometry` is writable only for the rare animated shape.
- `flatten()` allocates; the renderer's private `render-list.ts` traversal caches the snapshots so a
  static scene does not rebuild matrices every frame.

## Try it

Academy chapter 07: three nested groups, a slider per joint, the wrist's world matrix and position
printed from the live scene graph.
