# Deepcode: finish the polish and academy session

Lead handoff from astra, 2026-09-25. Read this together with the latest messages in `team/log.md`.
The current working tree contains intentional, uncommitted work from all three lanes. Preserve it.

## Product direction

Edena is an original TypeScript visualization library, with WebGPU rendering and GPU-resident
simulation. Applications demonstrate reusable library capabilities. It is not a Manim port or a
crystal-specific framework. Prioritize clear plots, correct 3D depth, legible mathematical text,
smooth animation, and efficient simulation. Keep the restrained dark mathematical-animation aesthetic.

This session has two deliverables: polish existing features, and finish a substantial educational
project explaining the mathematics and programming behind them. Do not add unrelated demos, new
dependencies, PDE solvers, lighting systems, or approximate gravity algorithms to fill time.

## Ownership and coordination

- The interactive instance, handle `deepseek`, owns existing typography, derivations and basics.
- The exec instance, handle `deepcode`, owns academy HTML/TypeScript, its model/tests, and chapters.
- Astra's renderer, simulation runtime, showcase and regression changes are implemented. After
  acknowledging this handoff in the channel, deepseek may take integration ownership of these files.
  Coordinate changes with the academy instance before touching its files.
- Check the channel at task boundaries. Resolve claims before edits; do not duplicate the academy.
- Do not commit or push this session until requested. Do not undo another lane's changes.

## Priority 1: close the review findings

Typography:

- Apply operand grouping to `vec`, `hat`, `bar`, `dotAccent` as well as scripts/fractions. A
  multi-root fragment must be one child where MathML requires one operand. Verify actual browser
  placement, not just generated strings.
- Put actual MATH-table fonts before STIX Two Text and other prose faces in fallback stacks.
  Check offline fallback, fractions, radicals, scripts, accents, limits, and multiline derivations.
- Verify cancellation strokes only cover intended terms, including wrapped rows on a phone.
- Verify measurement labels follow the same world transform as their geometry; keep static captions
  clear of plots and make sure off-screen label work is skipped.
- Coordinate the remaining shared HTML font changes, including index and physics-lab, through the log.

Academy correctness: resolve astra's detailed 22:13 review note before expanding prose. Specifically:

- Column-vector camera composition is projection × view. Perspective divides by camera-axis depth,
  not Euclidean eye distance. Identical equally oriented objects have equal orthographic scale.
- `LabelLayer` now hides anchors outside the clip volume; raw projection and layer visibility are
  different operations. Mesh occlusion of DOM labels is still not implemented.
- Batching requires shared geometry AND compatible material; transparent objects remain separate.
- Triangle order `a,c,b` corresponds to dv × du for the documented parameter grid. The existing
  geometry comment claiming the opposite also deserves a coordinated comment correction.
- Surface guard counts quads; isosurface guard counts samples. Both surface builders DO cache their
  sample grids; astra corrected an earlier mistaken note about repeated callback evaluations.
- Clamped fraction on a sample grid estimates the field, not rendered pixel area. Opposite ends
  clamp to different colors; 100% clamped need not mean a single color.
- Do not claim a particular step reaches roundoff limits without measurements. Explain local vs
  global integration error and the stability condition for bounded symplectic oscillator energy.
- State unit mass where using acceleration -k*x and energy (v²+k*x²)/2.
- Symmetry tolerance concerns operation residuals: a z displacement can preserve C4(z), while
  inversion gives a 2*delta residual. Unmatched sites (-1) are not ordinary permutations.
- `measure()` integrates its target. Explain separate benchmark instances and the new standard
  compute-pass timestamp writes. Older speed figures are historical, not fresh verification.

## Priority 2: finish the educational project coherently

Keep the six existing live labs. Finish accurate companion source-reading chapters for animation/
Timeline/MathML, scalar fields/marching tetrahedra/streamlines, renderer/WGSL/resources, and an
end-to-end runnable example with performance interpretation (chapters 07–10 requested in the log).

Each chapter should connect an equation to the actual source, show a small useful example, name the
assumptions/error or stability limits, and link a working experiment. Distinguish library APIs from
academy-only educational routines. Do not claim academy RK4 is the particle library's integrator.
Review `academy.html` prose alongside Markdown: correcting only one leaves contradictory teaching.

Keep page startup and per-frame work small. Share a device, pause hidden/off-screen work, throttle
readouts, honor reduced motion, and inspect both desktop and phone layouts. Make all controls work;
the existing six-control check does not establish that every control is covered.

## Already implemented by astra

- `src/lib/render-list.ts`: private cached transform traversal, preserving public `flatten()`
  semantics and noticing in-place edits to position/scale/orientation. Tested nested transforms,
  visibility, opacity, shared children and reparenting.
- `src/lib/view.ts`: skip unchanged GPU uploads; upload changed instance intervals; recycle retired
  batch buffers across tint animations. Labels cache dimensions, move with CSS translate, clip their
  anchors, support zero-size hosts, and disconnect their observer on disposal.
- `src/lib/particles.ts`: standard compute-pass timestamp writes, working measurement iterations
  through 1024, and ordered smoothstep edges for particle alpha.
- `src/examples/physics-lab.ts`: benchmark a disposable simulation only on configuration changes;
  pause-aware animation clock; stale count-change protection; GPU/observer/control cleanup;
  off-screen suspension; fractional-step accumulator for Kepler.
- `src/showcase/main.ts`: diagnostics options forwarded to all views, responsive curve framing,
  proper tick MathML and pixel gaps, pause-aware clock and off-screen rendering.
- README renderer notes and academy navigation; shorter landing introduction.
- `scripts/check-renderer.mjs`, `scripts/check-runtime.mjs`, `scripts/cdp.mjs`,
  `tests/world-cache.test.mjs`.

Measured here: 10,000 static-node traversal ~8.38 ms original versus ~0.96 ms cached (CPU microbenchmark,
not full-frame FPS). Real GPU test: 1,000 static nodes upload zero bytes after initialization;
camera-only change uploads 80 bytes; one changed x component uploads 4 bytes; 20 tint changes allocate
zero new batch buffers. Do not extrapolate these into an unmeasured 50K direct-nbody FPS claim.

## Completion gates

1. Resolve the review findings and cross-check new prose against source and numerical results.
2. Run typecheck, unit tests, link checks, and all relevant browser checks on the final build:

   ```sh
   npm run typecheck
   npm test
   node scripts/check-links.mjs
   node scripts/check-renderer.mjs 9555
   node scripts/check-runtime.mjs 9555
   node scripts/check-academy.mjs 9555
   node scripts/check-basics.mjs 9555
   node scripts/check-depth.mjs 9555
   node scripts/check-pages.mjs 9555
   git diff --check
   ```

3. Run GPU/browser checks sequentially per browser. Astra started isolated Vulkan Chrome on 9555
   (profile `/tmp/edena-polish-browser-a3Mlmm`); shared 9444 caused depth timeouts under concurrent
   checks. Do not kill a browser another lane uses. Close test tabs.
4. Latest observed results: 102/102 unit tests; links for nine pages; academy six labs/six controls;
   renderer/timing and physics runtime checks; depth including all 48 crystal operations passed.
   Page health passed eight pages before academy existed. A basics check was running when handed
   off—retrieve or rerun it; do not assume success. Changes after these results need relevant checks.
5. Inspect screenshots, especially narrow plots and equations. A canvas having width/height alone
   is not evidence that it drew. Distinguish real GPU time, CPU time, frame pacing, and workload size.
6. Update `team/state.md` with current facts and remaining limits, and append a final channel report
   listing files, fixes, commands/results, and any unresolved issues. Remove stale audit claims or
   mark them resolved after verifying. Ensure README links and documented commands work.

When these gates pass, report a concrete handoff with the academy URL and test evidence. Prefer a
finished, reviewed set of improvements over endlessly adding features or asserting success without
verification.
