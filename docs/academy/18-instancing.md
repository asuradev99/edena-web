# 18 · Instancing and the upload contract

**Code:** `src/lib/view.ts` — `geometryIds`, `batches`, the instance buffer and the change interval.

## One upload per geometry

`this.geometry` is a `Map<Geometry, Buffers>` and `this.geometryIds` a `WeakMap<Geometry, number>`. The
first time a `Geometry` is drawn it is uploaded once; every later `Visual` that shares it reuses the
same buffer. `check-renderer.mjs` asserts this directly: adding a second copy of a mesh **grows the
instance buffer and the draw count, not the byte total of the mesh**.

## What travels per object

An instance record is 17 `f32` — 68 bytes:

```
[ m00 m01 m02 m03 | m10 m11 m12 m13 | m20 m21 m22 m23 | m30 m31 m32 m33 | opacity ]
  col 0             col 1             col 2             col 3 (translation)
```

so the vertex shader builds `world = instance.matrix * vec4(position, 1)` and the fragment multiplies
the batch colour by the instance opacity. A batch is `{ geometry, colour, transparency }`, so a thousand
copies of one mesh in one colour is **one bind group and one `draw(count = 1000)`**.

## The per-frame contract

The renderer keeps a CPU copy of the instance data and compares each packed float against what it last
uploaded:

```ts
if (index >= batch.uploadedCount || value !== batch.data[index]) { …track first/last… }
if (last >= first) queue.writeBuffer(batch.instances, first * 4, batch.data, first, last - first + 1);
```

Consequences, all of them measured by `check-renderer.mjs`:

| situation                    | bytes written per frame |
|------------------------------|------------------------:|
| nothing moving, camera still | 0 |
| camera moving only           | 0 (the matrix is a uniform) |
| one object's x changed       | 4 |
| one object added             | its 68-byte record |
| every object's scale changed | the whole instance buffer |

Sparse updates are why a particle demo with a few hundred moving bodies does not re-upload thousands.

## Uniforms are dirty-checked the same way

A batch's uniform (camera matrix + colour, 80 bytes) is written only when the packed values change, and
a retired batch is kept in a spare list so an animation that changes its colour every frame reassigns a
batch instead of allocating one.

## Limits

- Colour is per batch, not per instance: a thousand copies in a thousand colours is a thousand batches
  and the instancing win is lost. Use `Geometry.colors` for per-vertex variation instead.
- Removing one instance is a `draw` count change; it is not a buffer edit.
- The comparison is a full pass over the instance data every frame — fine for thousands, not millions.
- The pipeline has no index buffer: geometry is an unindexed triangle soup, so the vertex budget is
  three vertices per triangle.

## Try it

Academy chapter 18: a lattice of identical spheres, a count slider up to 2 000, and the byte arithmetic
printed beside a travelling wave that changes only the scale of the instances it reaches.
