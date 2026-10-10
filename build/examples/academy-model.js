/**
 * The pure model behind the academy chapters.
 *
 * Everything the academy page *claims* numerically lives here, with no DOM and no WebGPU, so
 * `tests/academy.test.mjs` can check the claims the prose makes: the observed convergence order
 * of Euler and RK4, the legal surface budget, and the orbit/fixed-site counts the symmetry
 * chapter prints. The page is wiring; this file is the argument.
 */
import { latticeSites, latticePointGroup, applyOperation, siteMapping, symmetryOrbits, mapsOntoSelf, fractionalToCartesian, structureBounds, } from '../index.js';
/**
 * The CPU budget the surface builders and the isosurface extractor share — but they spend it
 * against *different* counters, which is the point of chapter 02:
 *
 * - `parametricSurface`/`functionSurface`/`colorMappedSurface` compare **quads** (`nu·nv`), so a
 *   square grid tops out at exactly 500×500 (250 000 quads).
 * - `isosurface` compares **samples** (`(nx+1)(ny+1)(nz+1)`), so a cubic grid tops out at 61³.
 *
 * Both guards are exercised by `tests/academy.test.mjs`; the chapter prints whichever applies.
 */
export const CPU_BUDGET = 250_000;
/**
 * The on-screen size of an object a small distance from the eye, relative to one twice as far,
 * under each projection. Perspective divides by depth, so it is exactly the distance ratio;
 * orthographic has no depth term at all, so it is 1 no matter how far anything is.
 */
export function relativeSize(nearDistance, farDistance, projection) {
    if (!(nearDistance > 0) || !(farDistance > 0))
        throw new Error('Projection distances must be positive');
    return projection === 'perspective' ? farDistance / nearDistance : 1;
}
/**
 * The exact arithmetic behind `functionSurface`/`colorMappedSurface`: an `nu`×`nv` quad grid
 * evaluates `(nu+1)·(nv+1)` samples and emits `2·nu·nv` triangles. The builder's guard counts
 * **quads**, so {@link withinBudget} compares `nu·nv` to {@link CPU_BUDGET} — a fully square grid
 * is legal up to 500×500, and 501×501 is rejected before a single sample is taken.
 */
export function surfaceCost(resolution) {
    const [nu, nv] = Array.isArray(resolution) ? resolution : [resolution, resolution];
    if (!Number.isInteger(nu) || !Number.isInteger(nv) || nu < 1 || nv < 1)
        throw new Error('Surface resolution must be positive integers');
    const columns = nu + 1, rows = nv + 1;
    const quads = nu * nv;
    return { columns, rows, quads, triangles: quads * 2, samples: columns * rows, withinBudget: quads <= CPU_BUDGET };
}
/**
 * The same budget spent differently by `isosurface`: it samples a **lattice** of
 * `(nx+1)(ny+1)(nz+1)` points before marching any tetrahedra, and rejects the request when that
 * exceeds {@link CPU_BUDGET}. The sharpest legal cubic grid is 61³ (238 328 samples); 62³
 * (250 047) is one step past it, which is why the state board records the boundary as "61³".
 */
export function fieldCost(resolution) {
    const [nx, ny, nz] = Array.isArray(resolution) ? resolution : [resolution, resolution, resolution];
    if (![nx, ny, nz].every(value => Number.isInteger(value) && value > 0))
        throw new Error('Field resolution must be positive integers');
    const samples = (nx + 1) * (ny + 1) * (nz + 1);
    return { resolution: [nx, ny, nz], samples, withinBudget: samples <= CPU_BUDGET };
}
/* ---------------------------------------------------------------------------------------------
 * 03 · Colour: where the range clamps.
 * ------------------------------------------------------------------------------------------- */
/** The normalised position a value occupies in a `range`, before the colormap clamps it to [0, 1]. */
export function normalise(value, range) {
    const [lo, hi] = range;
    if (!(hi > lo))
        throw new Error('Colour range must be increasing');
    return (value - lo) / (hi - lo);
}
/** True when a value falls outside the printed range and is therefore shown at the palette's end. */
export function clamped(value, range) {
    return value < range[0] || value > range[1];
}
/**
 * Integrate y′ = −rate·y from y(0) = 1, whose exact solution is exp(−rate·t). Every `stepSize`
 * advances by exactly `stepSize`, so two runs that differ only in `stepSize` are directly
 * comparable — which is what makes an observed convergence order meaningful.
 */
export function decaySolution(rate, stepSize, steps, method) {
    if (!(rate > 0) || !Number.isFinite(rate))
        throw new Error('Decay rate must be positive and finite');
    if (!(stepSize > 0) || !Number.isFinite(stepSize))
        throw new Error('Step size must be positive and finite');
    if (!Number.isInteger(steps) || steps < 1)
        throw new Error('Step count must be a positive integer');
    const t = [0], y = [1], exact = [1];
    let value = 1;
    for (let step = 1; step <= steps; step += 1) {
        value = method === 'euler'
            ? value + stepSize * (-rate * value)
            : rk4(value, stepSize, sample => -rate * sample);
        t.push(step * stepSize);
        y.push(value);
        exact.push(Math.exp(-rate * step * stepSize));
    }
    return { t, y, exact };
}
function rk4(value, stepSize, slope) {
    const k1 = slope(value);
    const k2 = slope(value + stepSize * k1 / 2);
    const k3 = slope(value + stepSize * k2 / 2);
    const k4 = slope(value + stepSize * k3);
    return value + stepSize * (k1 + 2 * k2 + 2 * k3 + k4) / 6;
}
/** The absolute error at the end of a run — the number the chapter prints. */
export function finalAbsoluteError(sample) {
    return Math.abs(sample.y[sample.y.length - 1] - sample.exact[sample.exact.length - 1]);
}
/**
 * The order a method *appears* to have: halving the step should divide the error by `2^p`. This is
 * an estimate from two runs, not a proof, and float64 round-off flattens it once the error is
 * near 1e-13 — the chapter says so.
 */
export function observedOrder(errorAtStep, errorAtHalfStep) {
    if (!(errorAtStep > 0) || !(errorAtHalfStep > 0))
        return 0;
    return Math.log2(errorAtStep / errorAtHalfStep);
}
/* ---------------------------------------------------------------------------------------------
 * 05 · The simulation seam: semi-implicit Euler, and the energy it does not conserve.
 * ------------------------------------------------------------------------------------------- */
/** Total energy of the 1D harmonic well `V = ½k x²`, `T = ½mv²`, for a whole `ParticleState`. */
export function harmonicEnergy(positions, velocities, stiffness, mass = 1) {
    const count = positions.length;
    let energy = 0;
    for (let index = 0; index < count; index += 1) {
        energy += .5 * mass * velocities[index] * velocities[index] + .5 * stiffness * positions[index] * positions[index];
    }
    return energy;
}
/** The named operations the chapter offers, written in the cubic cell's own basis. */
export const SYMMETRY_OPERATIONS = {
    identity: { label: 'E (identity)', rotation: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] },
    c2x: { label: 'C₂ (x)', rotation: [[1, 0, 0], [0, -1, 0], [0, 0, -1]] },
    c4z: { label: 'C₄ (z)', rotation: [[0, -1, 0], [1, 0, 0], [0, 0, 1]] },
    mirror: { label: 'σ (⊥ z)', rotation: [[1, 0, 0], [0, 1, 0], [0, 0, -1]] },
    inversion: { label: 'i (inversion)', rotation: [[-1, 0, 0], [0, -1, 0], [0, 0, -1]] },
    improper: { label: 'S₄ (z)', rotation: [[0, -1, 0], [1, 0, 0], [0, 0, -1]] },
};
export function operationNamed(name) {
    const chosen = SYMMETRY_OPERATIONS[name];
    if (!chosen)
        throw new Error(`Unknown operation "${String(name)}"`);
    return { rotation: chosen.rotation, translation: [0, 0, 0], label: chosen.label };
}
/**
 * Everything the symmetry panel reports, from the library's own public functions — no shader, no
 * viewer, just the same `siteMapping`/`symmetryOrbits` the crystal viewer uses.
 */
export function orbitReport(structure, operation, tolerance = 1e-4) {
    const mapping = siteMapping(structure, operation, tolerance);
    const fixed = [], moved = [];
    mapping.forEach((target, index) => (target === index ? fixed : moved).push(index));
    return {
        mapping,
        fixed,
        moved,
        orbits: symmetryOrbits(structure, [operation], tolerance),
        ontoSelf: mapsOntoSelf(structure, operation, tolerance),
        latticeOperations: latticePointGroup(structure.lattice).length,
    };
}
/** Fractional sites of a generated lattice, converted to Cartesian and centred on the cell. */
export function centredAtoms(structure) {
    const { centre } = structureBounds(structure);
    return structure.positions.map((fractional, index) => {
        const cartesian = fractionalToCartesian(fractional, structure.lattice);
        return {
            species: structure.species[index],
            fractional,
            position: [cartesian[0] - centre[0], cartesian[1] - centre[1], cartesian[2] - centre[2]],
        };
    });
}
export function structureFor(kind) {
    return latticeSites(kind);
}
/**
 * The same structure with one site displaced by `delta` in fractional z. A real crystal is never
 * exactly on its ideal sites, so `mapsOntoSelf` has a tolerance; this is the honest way to show what
 * that tolerance means. The returned structure is a fresh object — the parser's data is untouched.
 */
export function displaced(structure, site, delta) {
    if (!Number.isInteger(site) || site < 0 || site >= structure.positions.length)
        throw new Error('Displaced site is out of range');
    if (!Number.isFinite(delta))
        throw new Error('Displacement must be finite');
    const positions = structure.positions.map((position, index) => index === site ? [position[0], position[1], position[2] + delta] : position);
    return { ...structure, positions };
}
/** Re-exported so the page and the tests agree on exactly which operation was applied. */
export { applyOperation, structureBounds };
//# sourceMappingURL=academy-model.js.map