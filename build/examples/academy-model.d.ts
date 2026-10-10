/**
 * The pure model behind the academy chapters.
 *
 * Everything the academy page *claims* numerically lives here, with no DOM and no WebGPU, so
 * `tests/academy.test.mjs` can check the claims the prose makes: the observed convergence order
 * of Euler and RK4, the legal surface budget, and the orbit/fixed-site counts the symmetry
 * chapter prints. The page is wiring; this file is the argument.
 */
import { type Vec3, type CrystalStructure, type CrystalOperation, type SiteKind, applyOperation, structureBounds } from '../index.js';
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
export declare const CPU_BUDGET = 250000;
export type ProjectionMode = 'orthographic' | 'perspective';
/**
 * The on-screen size of an object a small distance from the eye, relative to one twice as far,
 * under each projection. Perspective divides by depth, so it is exactly the distance ratio;
 * orthographic has no depth term at all, so it is 1 no matter how far anything is.
 */
export declare function relativeSize(nearDistance: number, farDistance: number, projection: ProjectionMode): number;
export type SurfaceCost = {
    columns: number;
    rows: number;
    quads: number;
    triangles: number;
    samples: number;
    withinBudget: boolean;
};
/**
 * The exact arithmetic behind `functionSurface`/`colorMappedSurface`: an `nu`×`nv` quad grid
 * evaluates `(nu+1)·(nv+1)` samples and emits `2·nu·nv` triangles. The builder's guard counts
 * **quads**, so {@link withinBudget} compares `nu·nv` to {@link CPU_BUDGET} — a fully square grid
 * is legal up to 500×500, and 501×501 is rejected before a single sample is taken.
 */
export declare function surfaceCost(resolution: number | [number, number]): SurfaceCost;
export type FieldCost = {
    resolution: [number, number, number];
    samples: number;
    withinBudget: boolean;
};
/**
 * The same budget spent differently by `isosurface`: it samples a **lattice** of
 * `(nx+1)(ny+1)(nz+1)` points before marching any tetrahedra, and rejects the request when that
 * exceeds {@link CPU_BUDGET}. The sharpest legal cubic grid is 61³ (238 328 samples); 62³
 * (250 047) is one step past it, which is why the state board records the boundary as "61³".
 */
export declare function fieldCost(resolution: number | [number, number, number]): FieldCost;
/** The normalised position a value occupies in a `range`, before the colormap clamps it to [0, 1]. */
export declare function normalise(value: number, range: [number, number]): number;
/** True when a value falls outside the printed range and is therefore shown at the palette's end. */
export declare function clamped(value: number, range: [number, number]): boolean;
export type Integrator = 'euler' | 'rk4';
export type DecaySample = {
    t: number[];
    y: number[];
    exact: number[];
};
/**
 * Integrate y′ = −rate·y from y(0) = 1, whose exact solution is exp(−rate·t). Every `stepSize`
 * advances by exactly `stepSize`, so two runs that differ only in `stepSize` are directly
 * comparable — which is what makes an observed convergence order meaningful.
 */
export declare function decaySolution(rate: number, stepSize: number, steps: number, method: Integrator): DecaySample;
/** The absolute error at the end of a run — the number the chapter prints. */
export declare function finalAbsoluteError(sample: DecaySample): number;
/**
 * The order a method *appears* to have: halving the step should divide the error by `2^p`. This is
 * an estimate from two runs, not a proof, and float64 round-off flattens it once the error is
 * near 1e-13 — the chapter says so.
 */
export declare function observedOrder(errorAtStep: number, errorAtHalfStep: number): number;
/** Total energy of the 1D harmonic well `V = ½k x²`, `T = ½mv²`, for a whole `ParticleState`. */
export declare function harmonicEnergy(positions: Float32Array, velocities: Float32Array, stiffness: number, mass?: number): number;
export type LatticeChoice = Extract<SiteKind, 'sc' | 'bcc' | 'fcc' | 'perovskite'>;
/** The named operations the chapter offers, written in the cubic cell's own basis. */
export declare const SYMMETRY_OPERATIONS: Record<string, {
    label: string;
    rotation: number[][];
}>;
export declare function operationNamed(name: keyof typeof SYMMETRY_OPERATIONS): CrystalOperation;
export type OrbitReport = {
    /** `mapping[i]` is the site that site `i` is sent to (fractional, wrapped). */
    mapping: number[];
    /** Sites the operation leaves where they are. */
    fixed: number[];
    /** Sites it moves. */
    moved: number[];
    /** Sets of sites that trade places; each is a full orbit. */
    orbits: number[][];
    /** Whether the whole decorated structure is invariant (species-aware, within tolerance). */
    ontoSelf: boolean;
    /** How many of the 48 cubic operations preserve this structure. */
    latticeOperations: number;
};
/**
 * Everything the symmetry panel reports, from the library's own public functions — no shader, no
 * viewer, just the same `siteMapping`/`symmetryOrbits` the crystal viewer uses.
 */
export declare function orbitReport(structure: CrystalStructure, operation: CrystalOperation, tolerance?: number): OrbitReport;
export type Atom = {
    species: string;
    fractional: Vec3;
    position: Vec3;
};
/** Fractional sites of a generated lattice, converted to Cartesian and centred on the cell. */
export declare function centredAtoms(structure: CrystalStructure): Atom[];
export declare function structureFor(kind: LatticeChoice): CrystalStructure;
/**
 * The same structure with one site displaced by `delta` in fractional z. A real crystal is never
 * exactly on its ideal sites, so `mapsOntoSelf` has a tolerance; this is the honest way to show what
 * that tolerance means. The returned structure is a fresh object — the parser's data is untouched.
 */
export declare function displaced(structure: CrystalStructure, site: number, delta: number): CrystalStructure;
/** Re-exported so the page and the tests agree on exactly which operation was applied. */
export { applyOperation, structureBounds };
