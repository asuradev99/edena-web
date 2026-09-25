# Visualization Library: Research and Build Plan

**Status:** planning document; no implementation changes made  
**Prepared:** 2026-09-24  
**Product direction:** an original, interactive TypeScript visualization and GPU-simulation library with WebGPU as its primary backend. Crystals are a future application that should be expressible using general library capabilities, not a foundational domain module.

**Manim documentation review:** Manim Community stable documentation, currently labeled v0.21.0, reviewed 2026-09-24. This plan maps its documented feature families into an original web-first implementation roadmap; it is not a promise to clone every class or workflow.

## 1. Executive direction

Build a reusable library, not a scene-authoring application and not a port of either Manim or CrystalMaker. The long-term goal is a programmable, interactive visual environment for mathematical ideas and simulations: animated geometry, plots, 3D scenes, particle systems, numerical fields, and visualizations of simulation state. A future crystal visualization should be authored from general geometry, data, interaction, and simulation facilities rather than requiring a crystal-specific subsystem in the core.

Start with a small number of composable, well-defined concepts: a visualization instance, a world of visual nodes, coordinate spaces, a camera, a renderer, time-based transitions, and a data-oriented compute boundary. The first product proof is a sequence of function visualizations—1D, then 2D, then 3D—alongside reusable 3D structure geometry, labels, and animation. Efficient N-body systems and PDE solvers are important future capabilities, but should arrive as distinct, validated simulation modules after the core rendering and data-flow contracts are in place.

The first release should prioritize the visible mathematical building blocks, in roughly this order:

1. **1D functions:** plot scalar functions of one variable with a useful domain, axes, labels, and discontinuity handling.
2. **2D functions:** visualize scalar fields `z = f(x, y)` as height surfaces, with a camera, color mapping, and basic domain/sampling controls.
3. **3D functions:** visualize scalar fields `w = f(x, y, z)` through simple isosurfaces or slices. Treat this as the largest initial plotting milestone; pick one approachable representation first and document its sampling limits.
4. **3D structure shapes:** draw and compose reusable geometry—points, lines, polygons, spheres, cylinders, boxes, and surfaces—so a crystal-like arrangement can be built from generic primitives without crystal-specific core code.
5. **Text and animation:** add readable labels/annotations and smooth, composable transitions for geometry and plots, integrated from the beginning at a basic level and improved alongside the visual features.

All of this should be available through a TypeScript library consumer can attach to a canvas, resize, control, and dispose. The library should report unsupported-device or device-loss conditions intelligibly. Changing function/geometry data should be animatable or updatable without coupling user code to page UI or GPU implementation details.

The first release is successful if those jobs feel coherent and pleasant through the library API. It is not measured by the number of Manim or CrystalMaker features reproduced. In particular, sophisticated text/formula typesetting, specialized scientific file formats, general-purpose numerical solvers, high-performance N-body simulation, and video export are deliberate later concerns. The architecture should leave room for simulation without making the first release a numerical-computing framework.

## 2. Product principles and boundaries

### Original product, informed by examples

Manim is useful research for object lifecycles, coordinate systems, graphing, and composing motion. CrystalMaker and CrystalViewer are useful references for one future application: crystal data can be mapped onto general geometry, styling, camera, and interaction capabilities. Efficient simulation frameworks and numerical methods are a separate area to research when their initial use cases are selected. These products and fields are capability references, not API or implementation specifications.

Choose the library’s own names, data model, architecture, interactions, and visual design. Do not aim for drop-in Manim compatibility; do not copy Manim class names, scene syntax, or assumptions. Do not attempt to recreate CrystalMaker’s desktop workflow. A web-first library should favor direct interaction, composability, simple embedding, and browser-friendly data flow.

### Library before application

The public TypeScript package is the product. Demos and any later web application are consumers of it. Keep the core independent of a specific page layout, toolbar, framework, or editor. A tiny example application is useful as a development/demo harness, but avoid making its UI the architecture of the library.

### WebGPU first, with honest capability handling

Use WebGPU as the primary backend and keep GPU-specific resource management behind an internal renderer boundary. WebGPU availability varies by browser, platform, and device; initialization must handle an unavailable adapter, device loss, limits, and resize rather than assuming that a GPU is present. Decide later, based on real user needs, whether a non-WebGPU fallback is worth maintaining. Do not imply universal support or claim performance wins before benchmarking.

### Keep domain math separate from drawing

Coordinate conversion, function sampling, animation timing, and future simulation stepping should be testable without a GPU where possible. Domain-specific data (such as crystal lattices) belongs in optional modules. The renderer turns render-ready data into pixels; it should not be the owner of scientific meaning or user-facing object behavior.

## 3. Research findings that shape the MVP

### What to take from Manim

Manim Community’s core mental model combines scene/object management, time-based animation, and drawable objects. Its building-block and quickstart material shows a useful progression from simple geometry to adding, transforming, and animating objects ([building blocks](https://docs.manim.community/en/stable/tutorials/building_blocks.html), [quickstart](https://docs.manim.community/en/stable/tutorials/quickstart.html)). Its graphing APIs include axes and function curves, including parametric and implicit varieties ([axes](https://docs.manim.community/en/stable/reference/manim.mobject.graphing.coordinate_systems.Axes.html), [function graph](https://docs.manim.community/en/stable/reference/manim.mobject.graphing.functions.FunctionGraph.html)). Its broad object and animation catalogs show how much scope exists beyond a useful first release ([mobjects](https://docs.manim.community/en/stable/reference_index/mobjects.html), [animations](https://docs.manim.community/en/stable/reference_index/animations.html)).

For this library, take the *problem areas*—objects, geometry, coordinates, timing, and composition—and make an independent design. Prioritize one-variable curves first, then two-variable height surfaces, then a bounded 3D scalar-field visualization, alongside reusable structure geometry and a handful of transitions. Treat Manim’s broader collections of TeX, vector fields, implicit plots beyond the chosen first 3D representation, complex 3D objects, updaters, and video workflows as evidence of possible future demand, not initial requirements.

Manim’s text options also underline an important scope boundary. Plain labels are useful early; polished mathematical typesetting is a substantial, separate feature ([text guide](https://docs.manim.community/en/stable/guides/using_text.html), [MathTex reference](https://docs.manim.community/en/stable/reference/manim.mobject.text.tex_mobject.MathTex.html)). Start with ordinary labels and make their rendering strategy replaceable. Do not let a TeX pipeline block the rendering library’s first usable release.

### Crystal viewing as a future composition

CrystalMaker and CrystalViewer cover much more than drawing atoms: structure construction and editing, symmetry, multiple visual styles, planes, analysis, trajectories, measurement, and export feature families are visible in their [feature descriptions](https://crystalmaker.com/crystalmaker/specs/) and [CrystalViewer specifications](https://crystalmaker.com/crystalviewer/specs/index.html). Their tutorials make a sensible basic crystal-viewing task concrete: import a structure, show it in 3D, display a cell, and change how atoms/bonds are presented ([tutorials](https://crystalmaker.com/crystalmaker/video-tutorials/index.html)). A future crystal demonstration may parse a structure, generate atom positions/bonds/cell geometry, render those primitives, and provide domain-specific picking. This should demonstrate the general library rather than introduce crystal concepts into the foundational runtime. A browser-oriented modular reference such as [Crystal Toolkit](https://docs.crystaltoolkit.org/) is useful context, but it is a Dash/Plotly ecosystem and is not a required dependency or implementation template.

Do not build a crystal-specific data model, CIF parser, element palette, or viewer into the initial library milestones. If a future application warrants it, those belong in an optional higher-level package/example that consumes the general library. CIF correctness and symmetry remain domain-specific responsibilities of that layer.

### Simulation and numerical-computing direction

“GPU accelerated” describes an implementation option, not a guarantee that every algorithm belongs on the GPU. Future simulation modules should be selected around concrete workloads and numerical methods. Particle systems (including N-body) and grid/field solvers (including selected PDEs) have different data layouts, stability constraints, boundary conditions, time-stepping needs, and validation requirements; avoid forcing them into one generic “simulation object.”

The core should eventually permit a simulation to own GPU-resident state, advance it through compute passes, and expose state to rendering without forcing a full GPU-to-CPU readback every frame. It should also permit CPU stepping for small cases, unsupported devices, reproducibility, debugging, and reference comparisons. Establish explicit ownership/synchronization between compute and render, buffer capacity and device-limit handling, fixed or bounded time steps where appropriate, pause/step/reset controls, and a documented way to inspect or export state. Keep renderer internals and numerical algorithms behind separate interfaces.

Begin future numerical scope with one small, well-understood example per family: e.g. gravitational or softened N-body motion, followed later by a simple PDE such as a 2D diffusion/heat equation. Specify units/scaling, boundary and initial conditions, stability limits, precision expectations, and reference cases before optimizing. Compare GPU output with a simple CPU reference on small inputs. More demanding PDEs, adaptive solvers, multiphysics, and arbitrary user shaders should follow only when an actual use case and correctness strategy exist.

### Future crystal import requires deliberate format support

The [IUCr CIF specification](https://www.iucr.org/what-we-do/digital-standards/cif/specification) defines a structured format with data blocks, tag/value pairs, loops, and multiple quoting/text forms. CrystalMaker’s discussion of [CIF parsing pitfalls](https://crystalmaker.com/support/advice/pages/cm-cif-woes.html) illustrates why regex-only parsing is unsafe. If a future crystal package adds an importer, it should state which CIF constructs it accepts, reject or warn on unsupported constructs with useful locations/messages, and preserve enough source metadata to explain what was loaded.

The [IUCr core dictionary](https://www.iucr.org/resources/cif/dictionaries/cif_core) documents structural fields that a later crystal application may need, including cell parameters, fractional atom coordinates, occupancy, and symmetry operations. Such a module should distinguish asymmetric-unit sites from expanded unit-cell sites; blindly applying symmetry to a complete cell can duplicate atoms. Do not claim full CIF or CIF2 support from a limited importer.

### WebGPU implications

The [WebGPU specification](https://www.w3.org/TR/webgpu/) and [WGSL specification](https://www.w3.org/TR/WGSL/) provide the low-level rendering and compute foundation. GPU compute examples such as the [official boids sample](https://webgpu.github.io/webgpu-samples/?sample=computeBoids) demonstrate a direction for future large particle simulations, but compute is not needed to prove the first library slice. The [resize sample](https://webgpu.github.io/webgpu-samples/samples/resizeCanvas/) is a useful reminder that canvas backing dimensions and device-pixel ratio need deliberate handling.

The current project already has a custom WebGPU renderer and compute path, but those alone do not form a reusable package. The simulation code is valuable prior art for the long-term direction, especially the experience with storage buffers, dispatch, force computation, and integration. Reuse or adapt sound low-level pieces after inspection; do not inherit the app’s current coupling or fixed-size assumptions as public API.

## 4. Repository assessment

The directory is a small TypeScript/WebGPU browser application with useful prototype code, not yet a library package.

### Existing assets worth evaluating for reuse

- `src/renderer.ts` has a custom WGSL/WebGPU rendering path, including instanced sphere geometry, lines, axes, bounds, and spring-related drawing.
- `src/compute.ts` has a WebGPU compute implementation of particle forces and velocity-Verlet integration, with Lennard-Jones, gravity, springs, and force visualization.
- `src/camera.ts` provides orbit/pan/zoom behavior and ray casting.
- `src/types.ts` contains the current simulation-oriented data types.
- `src/config.ts`, `src/gui.ts`, `src/topbar.ts`, `src/energyplot.ts`, and `src/main.ts` show how the existing demo/application is wired.
- `scripts/gen-default-config.mjs` and `default-config.json` support the existing application’s configuration flow.

The existing code is a useful source of implementation lessons—especially WebGPU setup, camera math, instancing, and compute—but it is centered on a physics demo. For example, force evaluation is pairwise and quadratic, state is fixed around a 512-particle configuration, and the main loop performs readback and CPU-side energy work. These are not appropriate default abstractions or promises for a general visualization library.

### Gaps to resolve before or during the first vertical slice

- **No clear package entry point:** there is no public `src/index.ts` API boundary or defined consumer-facing exports.
- **App/library are coupled:** UI, physics, renderer, and page lifecycle are wired imperatively through `main.ts` rather than exposed as separable library capabilities.
- **Source consistency issue:** `src/main.ts` imports `./editor.js`, but a corresponding tracked `src/editor.ts` is absent. Make a clean-checkout build/start path an early engineering task; determine whether the import is stale or the source was omitted before choosing how to resolve it.
- **No usable development/build workflow:** `package.json` has TypeScript and WebGPU types but no real dev/build/package scripts; the current test script is only a placeholder that exits with an error. Establish a minimal reproducible workflow rather than treating existing generated `dist/` output as the source of truth.
- **No library examples or user docs:** no focused examples currently demonstrate library consumption, plotting, 3D geometry, or animation.
- **No general public simulation contract:** existing compute code is wired to this app’s particle state and loop rather than exposed as a reusable simulation interface.
- **No general field/PDE infrastructure:** there is no grid/field abstraction, boundary-condition model, numerical solver module, or solver validation workflow.
- **Stale project notes:** `CLAUDE.md` describes an earlier/simpler rendering state and should be reconciled when implementation begins so it does not mislead contributors.

The first code work should preserve the existing demo where practical while establishing a separate library boundary. Avoid a large rewrite before a small consumer-facing slice proves the new architecture.

## 5. Initial library shape

This is an architectural outline, not a commitment to exact names. Keep the public surface small and ergonomic, and make the terminology distinctly the library’s own.

### Core concepts

- **Visualization instance:** owns the canvas connection, renderer/device lifecycle, resize observation, frame loop, and disposal.
- **World:** owns the set of visual nodes and their parent/child relationships. It is not tied to a page or a particular demo.
- **Visual node:** a typed object with a transform, visibility, style, and optional children. Geometry-specific data should be separate from renderer resources.
- **Camera/view:** owns projection and navigation state. Begin with an orthographic 2D view and a perspective orbit view; keep camera controls optional/configurable.
- **Timeline:** advances transitions from an explicit clock and supports deterministic duration, cancellation, pause, and basic sequencing/parallel composition.
- **Renderer interface:** consumes renderable data and owns GPU-specific pipelines, buffers, textures, and device lifecycle.
- **Data/compute modules:** user data and optional simulation modules produce renderable state without owning the page or bypassing lifecycle management.
- **Optional domain modules/examples:** plotting, crystal visualization, and simulation-specific conveniences compose the core rather than expanding its foundational vocabulary for every domain.

Possible organization once implementation starts:

```text
src/
  index.ts                 public exports
  runtime/                 instance, resize, frame loop, lifecycle
  world/                   nodes, transforms, styles, ownership
  animation/                clock, transitions, easing, composition
  render/                   renderer contract and webgpu backend
  geometry/                 reusable 2D/3D primitives
  plotting/                 axes, coordinate mapping, sampled curves
  data/                     buffers and renderable data interfaces
  compute/                  optional WebGPU compute primitives
  simulations/              separate example/domain algorithms, added later
examples/
  function-curve/
  animated-geometry/
  simulation/                added when a solver has a correctness story
```

Do not create every folder just to match this diagram. Introduce boundaries as working code requires them. Keep browser-only parts from accidentally making pure data utilities impossible to use in non-DOM tooling.

### Illustrative API sketch

The following is only a way to communicate intended ergonomics; names and signatures should be refined through a prototype. It intentionally avoids compatibility with another tool’s scene syntax.

```ts
const view = await createVisualization({ canvas });
const curve = new FunctionCurve(x => Math.sin(x), { domain: [-8, 8] });
view.world.add(curve);

view.timeline.run(curve.transitions.fadeIn({ duration: 0.5 }));
```

Prefer explicit lifecycle (`dispose`), explicit coordinate units/conventions, typed options, and useful errors. Do not expose raw WebGPU internals in ordinary plotting/crystal APIs, but allow advanced consumers a deliberate escape hatch later.

## 6. Manim feature map and original implementation roadmap

The Manim documentation describes a compositional system built from displayed objects, animations, and scene orchestration. Its reference manual is much broader than the getting-started path: it catalogs animation families, camera variants, geometry and vector objects, coordinate systems and plots, text/formula types, 3D objects, vector fields, image/point-cloud objects, and utilities. The official examples show these capabilities used together—for example, axes with function curves and labels, geometry with transitions, and 3D surfaces/camera orientation. See the [building-blocks tutorial](https://docs.manim.community/en/stable/tutorials/building_blocks.html), [example gallery](https://docs.manim.community/en/stable/examples.html), and [reference manual](https://docs.manim.community/en/stable/reference.html).

Use the inventory below as a map of the important capability families, not a feature-by-feature compatibility target. Each family should be designed around browser interactivity, WebGPU rendering, and composable TypeScript data. Exact class names, object inheritance, method-chaining conventions, and offline scene/render assumptions are not requirements.

### Feature-family map

| Manim documentation family | Capability to learn from | Proposed original-library direction |
| --- | --- | --- |
| Object and scene basics | Add/remove displayed objects; groups; spatial transforms; layering/order; scene timing | World/node ownership, groups, transforms, visibility, z-order, and a browser-managed lifecycle |
| Vector geometry | Lines, arrows, arcs, polygons, curves, dashed paths, tips, braces, labels, SVG paths, boolean geometry | A small stable 2D path/shape model first; richer path primitives and SVG import later |
| 2D coordinates and graphing | Axes, number/complex/polar planes, coordinate mapping, function/parametric/implicit plots, labels, charts | 1D functions first; then 2D surfaces and 3D scalar fields per the MVP; additional coordinate systems/plots as modules |
| 3D geometry | Axes, solids, surfaces, polyhedra, parametric surfaces, camera/light | General meshes and instanced primitives, perspective camera, lights/materials, surface generation |
| Text and formula objects | Plain/markup text, typeset formulas, numeric values, matrices/tables/code, SVG text | Plain labels first; then robust text layout and Math/Formula module with a deliberate rendering pipeline |
| Animation | Creation/reveal, fade/grow, movement, rotation, transform, indication, number updates, path following | Transition primitives over generic object properties/data; compositors, easing, interruption, and interactive seeking |
| Animation composition | Parallel groups, lagged starts, sequences, speed modifiers | Timeline tracks and composable parallel/sequence/stagger operators with deterministic timing |
| Dynamic updates | Updaters, traced paths, always-redrawn objects, value trackers | Explicit reactive signals/subscriptions and scheduled derived geometry; avoid hidden per-object frame callbacks |
| Vector fields and flows | Vector-field sampling, arrows, streamlines, phase flow | Field data interface, glyph rendering, streamline integration as an optional numerical/visualization module |
| Graphs and structures | Graph, directed graph, layouts | Generic graph data plus layout algorithms and node/edge rendering, later module |
| Raster and point data | Images/arrays, pixel grids, point clouds, 1D/2D/3D point primitives | Texture/image objects, typed-array uploads, instanced point rendering, later modules |
| Camera composition | Moving, zoomed, split, multiple, fixed-in-frame and 3D camera patterns | Viewport/camera objects, overlays, scissor regions, camera-attached and screen-space layers |
| Output/configuration | Quality, dimensions, frame rates, formats, CLI options and project config for video generation | Browser-oriented runtime settings, canvas scale/quality, deterministic capture hooks, no CLI/video workflow in the initial product |
| Extension and ecosystem | Plugins, examples, documentation, versioning, contributor workflows | Stable public extension points and optional packages after core APIs settle; examples/docs are part of each feature |

### Proposed implementation waves

#### Wave 0 — Library/runtime contract

Establish package entry points, canvas/device lifecycle, errors, resize/DPR behavior, frame scheduling, disposal, world ownership, typed transforms, styling, and a renderer boundary. Provide orthographic and perspective cameras, layer/order semantics, basic input hooks, and an example that can be embedded in an arbitrary web page. This is the substrate for all other Manim-inspired feature families.

#### Wave 1 — Essential 2D math and visual language

- Lines, polylines, markers, circles, rectangles, polygons, arrows, and simple arcs.
- Groups and convenient relative placement/alignment helpers, designed independently from Manim’s chaining API.
- 2D coordinate mapping, axes, ticks, grids, ordinary labels, 1D callback plots, clipping, and discontinuity handling.
- Basic text overlay/rendering and value labels.
- Initial animation set: reveal/draw, fade in/out, move, rotate, scale, property interpolation, parallel/sequence, and easing.

Deliver polished examples: a graph with an animated point/tangent-like construction; a geometric proof/construction; numeric value changes; composited transitions. This proves the main authoring loop before adding advanced abstractions.

#### Wave 2 — 3D geometry, functions, and interactive camera

- Instanced sphere/point and line rendering; cylinders, boxes, polygon meshes, and reusable surfaces.
- 3D axes/grid, depth handling, lighting/material basics, orbit/pan/zoom, reset-to-fit, and screen-space annotations.
- 2D scalar function `z=f(x,y)` surfaces with domain/resolution/color controls.
- Animated parametric 3D curves/surfaces; update geometry when parameters change without reconstructing the entire runtime.
- One chosen 3D scalar-field representation (isosurface or slices), with explicit sampling and memory budgets.

Use a crystal-like arrangement as a *generic geometry example*: spheres, sticks/lines, and a cell outline. No crystal domain package is necessary for this wave.

#### Wave 3 — Text, paths, and transform quality

- Improve text sizing, anchoring, wrapping/alignment, screen-space versus world-space labels, and crispness under zoom/DPR.
- Add SVG path import and robust path representation (line/quadratic/cubic segments), stroke/fill styles, joins/caps, dashed paths, and arrows/tips.
- Add explicit shape-to-shape interpolation for compatible geometry; support crossfade/replace transitions when topologies differ.
- Add formula rendering only after ordinary text and paths are stable. Pick a strategy (e.g. SVG-based TeX/MathJax-like output or another supported renderer) with documented limitations, async lifecycle, caching, accessibility text, and security considerations.
- Add math-specific components: matrices, vectors, braces/annotations, and simple tables as compositions, not special renderer primitives unless performance requires it.

#### Wave 4 — Reactive data, plotting breadth, and vector fields

- Add a small signal/dataflow model for changing scalar/vector values and derived visuals.
- Add parametric curves, polar/log coordinate mapping, implicit 2D curves/regions, contour lines, and basic charts as modular plot types.
- Add sampled scalar/vector fields, colored scalar images/heatmaps, vector glyphs/arrows, and streamline generation with clear sampling budgets.
- Ensure derived geometries can be throttled, updated incrementally, or sampled in workers/compute paths where appropriate.

Do not execute arbitrary expressions supplied as strings. Callback APIs are clear and safe for application code; a future expression language would need a deliberately sandboxed parser and bounded evaluator.

#### Wave 5 — Advanced animation and 3D presentation

- Add staggered child/group timing, lagged starts, path-following, number interpolation, traced paths, and custom user-defined transitions.
- Add scene/camera tracks, zoom boxes, camera-relative and fixed-screen overlays, split viewports, and multiple views when real examples justify them.
- Add highlighting/indication effects (pulse, outline/circumscribe, focus, passing flash, wave) as reusable effects composed from basic transitions.
- Add richer 3D surfaces, polyhedra, meshes, image textures, point clouds, lighting controls, and selection/picking.
- Add deterministic timeline seek/replay for interactive playback and reproducible screenshots; treat offline video export as a separate later product decision.

#### Wave 6 — Specialized modules and extension ecosystem

Add optional, independently versioned modules where they fit the general library: graph/network layouts; probability/statistical charts; complex-plane and linear-algebra helpers; specialized field visualizations; image and data-volume views; crystal structure parsing/rendering; and simulation packages such as N-body and PDE solvers. Each module should demonstrate reuse of the core rather than force its domain model into the core.

Only stabilize plugin/extension APIs after there are at least a few real modules and clear compatibility needs. Document public extension points, lifecycle/ownership rules, resource limits, API stability, and example authoring. Keep the core dependency surface modest.

### Cross-cutting behavior to design deliberately

- **Scene authoring vs interactive state:** Manim scenes are often rendered as a planned timeline; this library must also support user input, live data, interrupted transitions, and continuously running simulations. Specify how external state updates interact with transitions and how ownership conflicts are resolved.
- **Screen/world coordinate layers:** plots need mathematical coordinates; 3D structures need world coordinates; labels/UI need pixels or camera-facing anchors. Make conversions explicit instead of relying on global constants.
- **Topology changes:** curve resampling and mesh/isosurface updates can change vertex counts. Define whether updates replace geometry, stream into capacity-managed buffers, or use an indirect/compute path.
- **Precision and limits:** use CPU computation initially where it is simpler; move sampling or updates to GPU only with a clear performance/correctness case. Surface device limits and memory costs to callers.
- **Accessibility and browser semantics:** ordinary text should remain selectable/accessible where possible; expose labels/roles or a parallel DOM representation when rendered text is not accessible.
- **Interactivity:** pointer picking, keyboard focus, camera gestures, and animation playback controls need event contracts that do not assume the library owns the whole page.
- **Determinism:** separate elapsed-time interactive playback from fixed-step simulation time and any future deterministic capture clock.

### Feature acceptance template

Each family should ship with: (1) a small public API, (2) a visual example and source, (3) a crisp statement of coordinate/data semantics, (4) lifecycle/error behavior, (5) a performance budget or measurement notes, and (6) automated correctness checks appropriate to the math/rendering path. Add API surface only where an example needs it; avoid implementing the whole reference catalog before the first coherent library release.

## 7. MVP feature scope

### A. Package and runtime foundation

1. Add a library entry point with selected public exports and generated type declarations.
2. Define the supported browser/runtime baseline and a minimal clean-checkout build/dev flow. Keep the first package ESM/web-oriented unless a concrete consumer requires another module format.
3. Initialize WebGPU against a caller-provided canvas; validate adapter/device availability and surface actionable errors.
4. Handle canvas resize and device-pixel ratio, visibility/frame-loop lifecycle, and disposal of observers/listeners/GPU resources.
5. Handle device loss in a documented way (at minimum stop rendering and report the failure; recovery can follow).
6. Keep the page demo independent from the package entry point.

### B. World, primitives, and cameras

Start with a reusable vocabulary for math diagrams and 3D structures:

- 2D line/polyline, point/marker, circle, rectangle, and polygon.
- 3D points, line segments, polygons, spheres, cylinders, boxes, and sampled surfaces.
- Translation, rotation, scaling, visibility, grouping, and a compact style/color model.
- Orthographic camera for plots; perspective camera with orbit/pan/zoom for 3D content.
- Basic pointer selection/hover hooks that applications can use for domain-specific interaction.

Use instancing/batching where it naturally helps repeated geometry, but keep allocations and buffer capacities responsive to WebGPU limits. Avoid hard-coded particle/object caps in the public API. Decide how to handle large inputs through measurement rather than promising a specific object count now.

### C. Basic animation and interaction

Implement a small transition vocabulary: move, rotate, scale, fade/visibility, and a simple reveal for lines if it fits the renderer. Include linear and a few standard easing curves. Define sequencing and parallel grouping, cancellation, pause/resume, and a clear policy for transition completion.

Drive the timeline from a centralized clock/frame loop; do not create a `requestAnimationFrame` loop per object. Make transition progress depend on elapsed time rather than frame count. Specify what happens when the tab is suspended and resumed. Core transitions should be usable without adopting an application-wide animation editor.

The interactive distinction should be visible from the beginning: camera control and basic pointer events should coexist with animation, with clear event ownership and disposal. Full GUI controls, drag handles, keyframe editing, and notebook/editor experiences are later work.

### D. Function visualization progression

Treat 1D, 2D, and 3D function visualization as explicit early priorities, delivered incrementally rather than as one oversized plotting feature.

**1D: `y = f(x)` (first plotting milestone)**

- Sample a JavaScript callback over a finite domain and draw a polyline in a Cartesian coordinate system.
- Add linear axes, ticks/grid, basic labels, and simple zoom/pan or domain adjustment.
- Keep sampling explicit and capped; split across non-finite values or large discontinuities instead of drawing misleading bridges.
- Begin with CPU sampling and compact geometry upload. Do not evaluate arbitrary user-provided strings as code.

**2D: `z = f(x, y)` (next plotting milestone)**

- Render a sampled scalar field as a 3D height surface over a rectangular domain.
- Provide a basic perspective/orbit camera, surface color mapping, and simple axes/domain bounds.
- Make grid resolution and sampling budget explicit; initially sample on CPU and upload a mesh unless profiling justifies moving evaluation to compute.
- Handle non-finite/out-of-range values and provide a simple way to inspect or tune the domain.

**3D: `w = f(x, y, z)` (third plotting milestone)**

- Select one first representation—preferably a single isosurface level or orthogonal slices—rather than promising every volume visualization technique at once.
- Specify volume bounds, sample resolution, isovalue/slice controls, and memory budget.
- Keep extraction/rendering separate from the mathematical callback so later CPU/GPU strategies can change without changing the user’s model.
- Validate with analytically understandable fields (for example, a sphere-like level set) and expose resolution limits; dense volumes can consume memory quickly.

Do not conflate function visualization with a general PDE solver. A solver produces evolving data; field/volume visualizers should eventually consume such data, but the initial plotting API need not own numerical integration.

### E. Text strategy

Basic text is an early requirement: provide readable axis ticks, titles, annotations, and labels for 3D structures. Polished formula typography is not an MVP gate. Compare these approaches before committing:

- DOM/SVG overlay for crisp, accessible labels and easy browser text layout, with careful camera anchoring.
- Canvas-generated glyph atlas for labels that must live inside the 3D render path.
- A later font/glyph pipeline for scalable in-scene text and math notation.

Select the simplest route that meets the first math/geometry demos’ needs. Keep labels replaceable so a later renderer does not require redesigning plot data. Defer LaTeX-compatible formulas, glyph shaping edge cases, rich typography, and editable text objects.

### F. Basic animation and future simulation interfaces

Basic animation belongs in the early experience and should work across plots, text, and geometry: reveal, move, rotate, scale, fade, and animate a small number of data or style properties. Provide easing and simple sequencing/parallel composition. This is visualization animation, not yet a physical/numerical simulation engine.

Do not implement a general solver framework in the initial release. The core architecture should nevertheless avoid preventing these later capabilities:

- A simulation module can define initialization, stepping, reset, parameters, and optional state inspection without coupling to the render loop’s implementation.
- Compute work can be scheduled separately from drawing, with explicit dependencies and buffer ownership; simulation state may remain GPU-resident across frames.
- A renderer can consume GPU-resident positions/fields directly where supported, and use compact readback/snapshots only when needed for UI, export, or diagnostics.
- CPU reference stepping remains possible for small validation cases and fallback/debug use.
- Fixed-step accumulation, pause, single-step, bounded catch-up, and time scaling are explicit runtime policies rather than hidden behavior.
- Simulation modules document algorithm-specific stability/accuracy limitations; a visually smooth animation is not evidence of a numerically sound result.

Potential future modules—not core MVP promises—include N-body/particle dynamics, cellular/agent systems, scalar/vector field visualization, and selected PDE solvers. Add each as an independently useful module with its own numerical contract and examples.

## 8. Explicit non-goals for the first release

- Manim API compatibility, Python scene execution, or offline video-rendering workflows.
- A full CrystalMaker clone, structure-building editor, atom/bond editing, or crystallographic analysis suite.
- Efficient N-body simulation, molecular dynamics, GPU particle physics, PDE solvers, adaptive numerical methods, or user-defined compute shaders as core MVP requirements. These are strategic future capabilities, not reasons to delay the first library slice.
- CIF import, automatic symmetry interpretation, crystal analysis, and claims of crystallographic validation in the core package. A later optional crystal example/package can choose and document its own format scope.
- Polyhedra, lattice-plane/slab building, surface morphology, measurement tools, volumetric maps, diffraction, trajectories, or material-property databases as initial deliverables.
- Connecting to Materials Project, COD, OPTIMADE, or another remote structure service. A future optional crystal integration must respect its API and licensing rules.
- Full mathematical typesetting, 3D surfaces, vector fields, implicit plots, charts/dashboards, video export, a React wrapper, and a hosted authoring application.

These are not rejected forever; they are excluded so the first library remains buildable by a small team and its API can be evaluated with real use.

## 9. Proposed implementation sequence and exit criteria

### Phase 0 — Make the repository a trustworthy starting point

- Confirm the tracked source of truth and resolve the missing `src/editor.ts` import condition.
- Establish package metadata, a clean-checkout typecheck/build command, a minimal local demo server, and ignore rules for generated output where appropriate.
- Reconcile stale `CLAUDE.md` notes with the actual code.
- Record a minimal browser/device support statement and decide what the demo does when WebGPU is unavailable.

**Exit:** a new checkout can reproduce the documented build and open a working existing or minimal demo without relying on stale generated files.

### Phase 1 — Extract a library-shaped rendering slice

- Add public entry point and lifecycle-managed visualization instance.
- Separate renderer initialization/render/dispose from current app UI wiring.
- Implement resize/DPR handling and error/loss reporting.
- Draw and transform a line, marker, and sphere in a clean example.

**Exit:** a consumer-facing example imports the package surface, creates a view, adds/removes geometry, resizes, and disposes cleanly.

### Phase 2 — World, cameras, and timeline

- Add stable node ownership, transforms, styles, and basic grouping.
- Add 2D and 3D camera modes with orbit/pan/zoom behavior appropriate to each.
- Add centralized elapsed-time transitions and composition.
- Demonstrate an animated geometric construction or a few moving/rotating shapes.

**Exit:** transitions land on correct start/end values across different frame pacing; interaction and lifecycle do not leak listeners or loops.

### Phase 3 — 1D function-curve vertical slice

- Add coordinate mapping, axes/ticks/grid, basic labels, callback sampling, and discontinuity handling.
- Add one interactive plot example (for example domain selection and camera/zoom, not a full editor).
- Check the sampling budget and readable behavior at ordinary viewport sizes.

**Exit:** a consumer can add and animate a curve without depending on app internals; invalid function regions do not create spurious connecting lines.

### Phase 4 — 2D and 3D function visualization

- Add sampled 2D scalar surfaces with domain controls, color mapping, and a 3D camera.
- Add one bounded 3D scalar-field representation (isosurface or slices), selected based on implementation complexity and clarity.
- Make resolution, memory, and sampling limits visible in API/docs; validate with known functions.

**Exit:** example consumers can create a useful curve, height surface, and chosen 3D field representation with documented limits and without depending on demo internals.

### Phase 5 — Data flow and first simulation-facing seam

- Decide how changing CPU arrays and GPU buffers enter the world/render path without exposing backend details in every primitive.
- Prototype state updates and GPU residency with a deliberately small workload; keep this an architectural spike, not an early general compute API.
- Define lifecycle, pause/step, reset, and state inspection expectations, and compare GPU results with a simple CPU reference for the prototype.
- Do not add a PDE framework yet; write down the requirements that a first solver would impose on grids, boundaries, precision, and validation.

**Exit:** an optional simulation example can update visual state through an intentional seam, without taking ownership of the library’s browser/device lifecycle or requiring full-frame readback.

### Phase 6 — Stabilize the first library release

- Review public API naming and remove accidental app-only exports.
- Document initialization, lifecycle, coordinate conventions, WebGPU requirements, and known limitations.
- Add a few compact examples and measure rendering/interaction on target browsers and devices.
- Set realistic geometry-size and plotting-sampling guidance from measurements; avoid guarantees that have not been tested.
- Decide whether to retain the existing physics demo as a separate example, adapt it as an early simulation experiment, or leave it outside the first package.

**Exit:** the package, docs, and examples tell one consistent story and a new user can use the library without reading its source. Future N-body and PDE work has a clear place in the roadmap without being falsely represented as already delivered.

## 10. Quality, architecture, and risk checklist

### Correctness and lifecycle

- Every created observer, event handler, animation frame, GPU buffer, and device-owned resource has a clear owner and cleanup path.
- Renderer behavior is robust to zero-sized canvases, resize bursts, device loss, unsupported WebGPU, and configured capacity limits.
- World transforms and coordinate systems use documented units, handedness, matrix order, and depth conventions.
- Timeline behavior is elapsed-time-based; tab suspension and cancellation semantics are explicit.
- Function sampling has domain and output validation plus a maximum work budget.
- Future domain importers are grammar-aware for their declared subsets and report ambiguity instead of guessing.
- Domain coordinate math is independent from renderer packing.

### Performance without premature promises

- Batch repeated primitives (especially atom spheres) and avoid one draw call per site where practical.
- Do not read back all GPU state to the CPU each rendered frame for static visualization features.
- Use GPU compute only when a concrete feature warrants it; the existing simulation path is a candidate for later reuse, not a reason to make compute mandatory.
- Track CPU parsing/sampling cost separately from GPU draw cost.
- Establish browser/device baselines before publishing throughput claims.

### Main risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Project becomes a feature checklist for two mature products | Enforce the explicit MVP/non-goal list; ship small vertical slices. |
| Early public API copies a familiar tool too closely | Design from web embedding and library lifecycle; choose independent names and data flow. |
| Rendering prototype remains an application rather than a package | Create one external-style example that imports only public exports by Phase 1. |
| Future domain importer silently creates a plausible but wrong visualization | State format scope, retain source data, diagnose ambiguity, and use representative fixtures. |
| Simulation API becomes over-general before use cases are known | Keep the first compute seam narrow and let independent algorithms reveal the useful abstraction. |
| GPU performance is mistaken for numerical correctness | Require CPU reference cases, documented algorithm limits, and per-method validation. |
| Text work consumes the schedule | Use a replaceable plain-label route; defer formula typesetting. |
| WebGPU/device support varies | Capability-detect at startup, show actionable status, test measured target environments, and consider fallback only if demand supports its cost. |
| Existing compute code dictates unsuitable APIs | Keep simulation as an optional domain/example; build core around visualization lifecycle and renderable data. |

## 11. Decisions to make during implementation (not blockers for this plan)

1. What name and package namespace should the library use?
2. Should `World` own a timeline or should the visualization instance expose it separately?
3. Should plain labels begin as DOM/SVG overlays or as part of the render surface?
4. What is the first concrete simulation use case after the library’s visualization slice: particles/N-body, a field display, or a PDE?
5. Which compute/render synchronization and CPU-reference strategy best serves that use case?
6. Is a second rendering backend necessary for the intended audience, or is clear WebGPU-only behavior adequate initially?
7. Which existing pieces can be extracted with confidence, and which are cheaper/safer to rewrite behind the new boundaries?

Record the answers alongside implementation decisions. Keep them reversible until the library’s first consumers provide evidence.

## 12. Research references

### Math visualization

- [Manim Community: Building blocks](https://docs.manim.community/en/stable/tutorials/building_blocks.html)
- [Manim Community: Quickstart](https://docs.manim.community/en/stable/tutorials/quickstart.html)
- [Manim Community: Main documentation index](https://docs.manim.community/en/stable/index.html)
- [Manim Community: Example gallery](https://docs.manim.community/en/stable/examples.html)
- [Manim Community: Reference manual](https://docs.manim.community/en/stable/reference.html)
- [Manim Community: Output and configuration](https://docs.manim.community/en/stable/tutorials/output_and_config.html)
- [Manim Community: Configuration guide](https://docs.manim.community/en/stable/guides/configuration.html)
- [Manim Community: Deep dive into internals](https://docs.manim.community/en/stable/guides/deep_dive.html)
- [Manim Community: Axes](https://docs.manim.community/en/stable/reference/manim.mobject.graphing.coordinate_systems.Axes.html)
- [Manim Community: FunctionGraph](https://docs.manim.community/en/stable/reference/manim.mobject.graphing.functions.FunctionGraph.html)
- [Manim Community: Coordinate systems](https://docs.manim.community/en/stable/reference/manim.mobject.graphing.coordinate_systems.html)
- [Manim Community: 3D objects](https://docs.manim.community/en/stable/reference/manim.mobject.three_d.three_dimensions.html)
- [Manim Community: Vector fields](https://docs.manim.community/en/stable/reference/manim.mobject.vector_field.html)
- [Manim Community: Scene and 3D scene](https://docs.manim.community/en/stable/reference/manim.scene.scene.Scene.html)
- [Manim Community: Mobject reference index](https://docs.manim.community/en/stable/reference_index/mobjects.html)
- [Manim Community: Animation reference index](https://docs.manim.community/en/stable/reference_index/animations.html)
- [Manim Community: Text guide](https://docs.manim.community/en/stable/guides/using_text.html)
- [Manim Community: Plugin guide](https://docs.manim.community/en/stable/plugins.html)
- [Manim Community: Performance guide](https://docs.manim.community/en/stable/contributing/performance.html)
- [Manim Community: Testing guide](https://docs.manim.community/en/stable/contributing/testing.html)
- [Manim Community examples index](https://github.com/ManimCommunity/manim/blob/main/docs/source/examples.rst)
- [3Blue1Brown/manim repository](https://github.com/3b1b/manim) and [video project examples](https://github.com/3b1b/videos)

### Crystal visualization as a future application

- [CrystalMaker product overview](https://crystalmaker.com/crystalmaker/)
- [CrystalMaker feature specifications](https://crystalmaker.com/crystalmaker/specs/)
- [CrystalViewer specifications](https://crystalmaker.com/crystalviewer/specs/index.html)
- [CrystalMaker video tutorials](https://crystalmaker.com/crystalmaker/video-tutorials/index.html)
- [CrystalMaker supported file formats](https://crystalmaker.com/support/advice/pages/cm-file-formats.html)
- [CrystalMaker CIF parsing notes](https://crystalmaker.com/support/advice/pages/cm-cif-woes.html)
- [IUCr CIF specification](https://www.iucr.org/what-we-do/digital-standards/cif/specification)
- [IUCr CIF 1.1](https://www.iucr.org/resources/cif/spec/version1.1)
- [IUCr core CIF dictionary](https://www.iucr.org/resources/cif/dictionaries/cif_core)
- [Crystal Toolkit documentation](https://docs.crystaltoolkit.org/)
- [Crystallography Open Database](https://cod.psdi.ac.uk/)
- [OPTIMADE specification](https://www.optimade.org/specification/latest/)

### Web rendering

- [W3C WebGPU specification](https://www.w3.org/TR/webgpu/)
- [W3C WGSL specification](https://www.w3.org/TR/WGSL/)
- [WebGPU samples: compute boids](https://webgpu.github.io/webgpu-samples/?sample=computeBoids)
- [WebGPU samples: canvas resizing](https://webgpu.github.io/webgpu-samples/samples/resizeCanvas/)
- [WebGPU Fundamentals](https://webgpufundamentals.org/webgpu/lessons/)
- [Three.js WebGPURenderer guidance](https://threejs.org/manual/pages/webgpurenderer)
