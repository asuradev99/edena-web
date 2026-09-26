# 17 · Depth, transparency and draw order

**Code:** `src/lib/view.ts` — the pipeline table, the opaque/translucent split in `render()`, and the
`depthWriteEnabled: false` variants.

## The four pipelines

| geometry   | opaque            | translucent                    |
|------------|-------------------|--------------------------------|
| flat       | `pipeline`        | `translucent`                  |
| coloured   | `pipelineColored` | `translucentColored`           |
| contour    | `pipelineWire`    | —                              |

The opaque variants write depth (`depthWriteEnabled: true`, `depthCompare: 'less-equal'`). The
translucent variants are the same pipelines with `depthWriteEnabled: false`, so a translucent surface
tests against the depth already in the buffer but does not add to it.

## The order

1. **Opaque first**, in scene order — depth resolves them, so no sorting is needed.
2. **Translucent after**, sorted **back to front** by the depth of the object's origin (the `w` row of
   the camera matrix applied to the translation column), so blending accumulates in the right order.

Groups are keyed by `geometry id : colour : opaque|translucent`. A translucent batch gets a unique key
per object (`t0`, `t1`, …) because its sort position is per object, not per group.

## The trap this creates

A translucent surface **cannot hide itself**: it writes no depth, so two translucent parts that
intersect are both drawn and the seam is visible. This is not a bug in the renderer — it is what
alpha-blending without depth writes means — but it looks like one:

- a surface at `alpha .95` takes the translucent path, and its own folds intersect, producing a comb of
  fins along the surface;
- making it opaque (`rgba('#ffffff')`) removes the artifact entirely, because now the nearest facet
  wins the depth test and occludes the rest.

The contrast demo in the basics tour hit exactly this, and the academy chapter lets you remove the
opaque core so the shells have nothing to test against — they then read as flat panes.

## The wireframe pass

Contour lines draw after their own solid, with `depthCompare: 'less-equal'` and no depth write, so an
edge lying exactly on a face survives the test. They are never drawn for translucent geometry, which is
why a translucent solid keeps its own explicit outline (`boxEdges`, `wireSphere`, …) instead.

## Limits

- Sorting is per object by origin depth. A large translucent surface can still be ordered wrongly
  against another that intersects it. There is no depth peeling and no order-independent transparency.
- Opaque geometry is drawn in scene order; correctness comes from depth, not from the order.
- `reveal` and `opacity` fold into the same alpha, so a fading object crosses the opaque/translucent
  boundary at exactly `alpha = 1` — a batch key that changes mid-animation, which the renderer handles
  by retiring spare batches rather than reallocating.
