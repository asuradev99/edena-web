# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Compile TypeScript
npx tsc

# Serve locally (pick any HTTP server)
npx serve .
# or
python3 -m http.server
```

No test or lint tooling is configured.

## Architecture

**edena-web** is a WebGPU 3D viewer running entirely in the browser — a cube and a coordinate-axis system rendered with a perspective camera the user can orbit, pan, and zoom.

### Module responsibilities

| File | Role |
|------|------|
| `src/main.ts` | Entry point — wires camera + renderer, drives `requestAnimationFrame` loop, handles canvas resize |
| `src/camera.ts` | Orbit camera — spherical coords (radius/theta/phi) around a target; left-drag orbits, right/middle-drag pans, scroll zooms; outputs `viewProj` mat4 |
| `src/renderer.ts` | WebGPU renderer — two pipelines (triangle-list for cube with Phong-like diffuse lighting, line-list for axes), shared uniform buffer for viewProj, depth buffer managed here |
| `src/math.ts` | Column-major mat4 utilities: `mat4Perspective`, `mat4LookAt`, `mat4Multiply` |

### Rendering details

- **Vertex formats**: cube uses `pos(vec3) + normal(vec3) + color(vec3)` (36 bytes/vertex); axes use `pos(vec3) + color(vec3)` (24 bytes/vertex)
- **Depth buffer**: `depth24plus` texture, recreated on resize via `renderer.resize()`
- **Lighting**: directional in fragment shader; ambient 0.25 + diffuse 0.75 × dot(n, lightDir)
- **Axes**: 6 line segments (±X/Y/Z), positive halves bright, negative halves dark
- **Projection**: WebGPU NDC z ∈ [0, 1] — perspective matrix uses `m[10] = far/(near−far)`, `m[14] = near·far/(near−far)`, `m[11] = −1`

### Camera math

Spherical → Cartesian: `eye = target + [r·sin(φ)·sin(θ), r·cos(φ), r·sin(φ)·cos(θ)]`
φ is clamped to `[0.02, π−0.02]` to avoid pole singularity in `lookAt`.
