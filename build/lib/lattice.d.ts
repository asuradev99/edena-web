import { type Vec3 } from './math.js';
import type { CrystalOperation, CrystalStructure } from './crystal.js';
/**
 * Geometry above the parsers in `crystal.ts`: cell parameters, fractional ↔ Cartesian
 * conversion, supercells, bond/neighbour finding with periodic images, Miller planes, the
 * 48 cubic point-group operations (generated, not hand-listed), and an exact
 * `mapsOntoSelf` test in fractional space.
 *
 * Everything is pure and returns plain data, so a viewer can rebuild freely without GPU
 * bookkeeping.
 */
export type Lattice = CrystalStructure['lattice'];
export declare function cellVolume(lattice: Lattice): number;
/** Right-handed cell from lengths (Å) and angles (degrees): a along x, b in the xy plane. */
export declare function cellFromParameters(a: number, b: number, c: number, alpha?: number, beta?: number, gamma?: number): Lattice;
/** Fractional coordinates to Cartesian: columns of `lattice` are the cell vectors. */
export declare function fractionalToCartesian(fractional: Vec3, lattice: Lattice): Vec3;
/** Cartesian coordinates back to fractional, throwing when the cell is singular. */
export declare function cartesianToFractional(point: Vec3, lattice: Lattice): Vec3;
/** Wrap fractional coordinates into the half-open cell [0, 1). */
export declare const wrapFractional: (fractional: Vec3) => Vec3;
/** Squared separation in fractional space, using the minimum image convention. */
export declare function fractionalDistanceSquared(a: Vec3, b: Vec3): number;
/** Cartesian separation in ångström between two **fractional** sites, using the shortest image. */
export declare function periodicDistance(a: Vec3, b: Vec3, lattice: Lattice): number;
export type Supercell = CrystalStructure & {
    offsets: Vec3[]; /** The original, unreplicated cell. */
    base: CrystalStructure;
};
/**
 * Replicate a structure `repeats` times along each cell vector. The returned lattice is the
 * supercell, so the fractional coordinates stay inside [0, 1) and the viewer can draw one box.
 */
export declare function supercell(structure: CrystalStructure, repeats?: [number, number, number]): Supercell;
export type SiteKind = 'sc' | 'bcc' | 'fcc' | 'diamond' | 'rock-salt' | 'perovskite';
/**
 * Generate a common lattice type. `cell` may be supplied (so a hexagonal cell stays
 * hexagonal); otherwise a cubic cell of the given side is used. Labels are real element
 * symbols where the structure has a conventional chemistry, and `A`/`B` otherwise — remap
 * them by passing `species`.
 */
export declare function latticeSites(kind: SiteKind, options?: {
    cell?: Lattice;
    side?: number;
    species?: string[];
}): CrystalStructure;
export type Bond = {
    i: number;
    j: number; /** Image offset applied to site `j`, in cells. */
    image: Vec3;
    length: number;
};
/**
 * Find bonded pairs within `cutoff` ångström. With `periodic` (the default) a bond may wrap
 * across a cell face and reports the image offset it used; otherwise only offsets inside the
 * given cell are considered, which is what a supercell wants (its copies are already real sites).
 *
 * `maxNeighbours` keeps only each site's nearest `n` partners, so a too-generous cutoff cannot
 * turn the scene into a hairball.
 */
export declare function bonds(positions: Vec3[], lattice: Lattice, cutoff: number, options?: {
    periodic?: boolean;
    self?: boolean;
    maxNeighbours?: number;
}): Bond[];
export type Neighbour = {
    index: number;
    length: number;
    image: Vec3;
};
/** Closest sites to a Cartesian point, nearest first. */
export declare function nearestNeighbours(positions: Vec3[], lattice: Lattice, point: Vec3, count?: number, cutoff?: number): Neighbour[];
/**
 * A square patch of the (hkl) plane, centred in the cell. Returns the four corners in
 * Cartesian coordinates, ordered as a polygon. Useful for a cleavage-plane overlay.
 */
export declare function millerPlane(lattice: Lattice, h: number, k: number, l: number, size?: number): Vec3[];
/** All 48 signed-permutation matrices — the point group m-3m of a cubic crystal. */
export declare const CUBIC_OPERATIONS: number[][][];
/**
 * Every integer matrix with entries in {−1, 0, 1} that preserves the lattice metric, i.e. the
 * point group of the cell written in its own basis. The Gram matrix `G` (G_ij = aᵢ·aⱼ) defines
 * the metric, and a fractional map `M` is a symmetry exactly when `Mᵀ G M = G`.
 *
 * This is what makes the viewer correct for non-cubic cells: a cubic cell yields 48 operations,
 * a hexagonal cell 24, tetragonal 16, and so on. (Crystals whose basis breaks the lattice
 * symmetry keep the lattice operations, and {@link mapsOntoSelf} reports which ones survive.)
 */
export declare function latticePointGroup(lattice: Lattice, tolerance?: number): number[][][];
/** Apply a symmetry operation to a fractional position and wrap it back into the cell. */
export declare function applyOperation(operation: CrystalOperation, fractional: Vec3): Vec3;
/**
 * Does this operation map the structure onto itself? Exact up to `tolerance` in fractional
 * space, and species-aware, so a rotation that permutes different elements does not count.
 */
export declare function mapsOntoSelf(structure: CrystalStructure, operation: CrystalOperation, tolerance?: number): boolean;
/** For each site, the index it is sent to (or −1 when the operation leaves the cell). */
export declare function siteMapping(structure: CrystalStructure, operation: CrystalOperation, tolerance?: number): number[];
/** Space-group representatives modulo integer lattice translations, for the supplied cell. */
export declare function spaceGroupOperations(structure: CrystalStructure, tolerance?: number): CrystalOperation[];
/** Include all periodic images on the closed unit-cell boundary, without duplicating interior sites. */
export declare function closedCell(structure: CrystalStructure, tolerance?: number): CrystalStructure;
/** A nearby symmetry element and its unavoidable screw/glide displacement. */
export type CenteredIsometry = Isometry & {
    /** Cartesian location of the element, in the original lattice frame. */
    centre: Vec3;
    /** Integer translation added to the supplied operation; equivalent modulo the base lattice. */
    latticeShift: Vec3;
};
/**
 * Place an equivalent operation near a requested fractional centre. For each nearby lattice
 * representative, solve b = (I-R)q + v: q moves the element and Rv=v is the screw/glide part.
 * Prefer the least residual translation, then the nearest element. The 27-image search uses the
 * same conventional/reduced-cell assumption as latticePointGroup; this is not a lattice reduction.
 */
export declare function centeredIsometry(lattice: Lattice, operation: CrystalOperation, centre?: Vec3): CenteredIsometry;
/** Affine animation transform: evaluate once per frame, then reuse for every atom and vector. */
export declare function symmetryAnimationTransform(motion: Isometry, progress: number): {
    translation: Vec3;
    columns: [Vec3, Vec3, Vec3];
};
/** Animation with a visible pause between rotation/reflection and translation stages. */
export declare function symmetryAnimationPoint(motion: Isometry, point: Vec3, progress: number): Vec3;
/** Group sites into symmetry orbits under a list of operations. */
export declare function symmetryOrbits(structure: CrystalStructure, operations: CrystalOperation[], tolerance?: number): number[][];
/** Bounding box of the Cartesian sites, plus the cell corners, in ångström. */
export declare function structureBounds(structure: CrystalStructure): {
    min: Vec3;
    max: Vec3;
    centre: Vec3;
    extent: number;
};
/** Shortest non-zero interatomic distance, used to scale balls so they never fuse. */
export declare function shortestDistance(positions: Vec3[], lattice: Lattice): number;
/** The lattice as a 3×3 matrix whose columns are the cell vectors (fractional → Cartesian). */
export declare function latticeMatrix(lattice: Lattice): number[][];
/**
 * The operation's linear part in Cartesian coordinates: `A·R·A⁻¹`. For an operation that
 * preserves the lattice this is an ordinary orthogonal matrix, which is what lets the viewer
 * animate a rotation as a circular arc rather than a chord.
 */
export declare function cartesianOperation(lattice: Lattice, rotation: number[][]): number[][];
/** Axis and angle of a proper rotation matrix (det +1). Undefined for the identity. */
export declare function axisAngle(m: number[][]): {
    axis: Vec3;
    angle: number;
} | undefined;
/** Rodrigues' rotation of a point about an axis through the origin. */
export declare function rotateAboutAxis(point: Vec3, axis: Vec3, angle: number): Vec3;
/**
 * The -1 eigenvector of an improper orthogonal matrix `m`: the normal of its mirror plane.
 * `m + I` has rank two for a reflection, so the cross product of its two most independent columns
 * is that normal. (Taking the *longest* column of `m + I` instead — an easy mistake — returns a
 * vector lying in the plane, which mislabels and mis-draws every diagonal mirror.)
 */
export declare function improperNormal(m: number[][]): Vec3;
/**
 * A crystal operation re-expressed as the rigid motion it performs, so it can be animated.
 *
 * A proper operation is a rotation by `angle` about `axis`. An improper orthogonal operation is
 * always a rotoreflection S(θ, n) = R(θ, n)·σ_n — a rotation about `n` composed with a reflection
 * in the plane normal to it — so `axis` is the plane normal and `angle` the spin that goes with it.
 */
export type Isometry = {
    /** Unit axis: the rotation axis, or the mirror-plane normal for an improper operation. */
    axis: Vec3;
    /** Rotation angle for a proper operation, or the rotoreflection angle. */
    angle: number;
    /** True when the map also reflects through the plane normal to `axis`. */
    improper: boolean;
    /** True for the inversion, a rotoreflection by 180° whose axis may be any direction. */
    inversion: boolean;
    /** Screw/glide part, in Cartesian coordinates of the lattice. */
    translation: Vec3;
    /** The identity: no axis, no angle, no translation. */
    trivial: boolean;
};
/** Decompose an operation into a rotation or rotoreflection about the origin. */
export declare function operationIsometry(lattice: Lattice, operation: CrystalOperation): Isometry;
/**
 * The motion of `operationIsometry`, evaluated part-way: the identity at t = 0 and the full map at
 * t = 1.
 *
 * Each family performs exactly the geometric move its matrix expresses, rather than an interpolation
 * invented for the occasion:
 *
 * - a proper rotation turns about the operation's own axis, by the angle of the matrix;
 * - a mirror is a reflection, so the site travels straight through the plane;
 * - an inversion is a point operation, so the site travels straight through the centre;
 * - a roto-reflection is two moves in sequence — first the rotation about the axis, then the
 *   reflection in the plane normal to it — because that is literally how `R(θ, n)·σ_n` acts. At the
 *   halfway point the rotation is complete and the fold has not begun.
 */
export declare function isometryPoint(isometry: Isometry, point: Vec3, t: number): Vec3;
/**
 * Where an animation should leave `point`: the operation's own image, slid back into the cell
 * centred on the origin only when it falls outside. A cubic cell maps onto itself under its whole
 * point group, so there the correction is identically zero and every atom travels its true arc.
 */
export declare function isometryTarget(isometry: Isometry, point: Vec3, lattice: Lattice): Vec3;
/** True when the cell is cubic to within a relative tolerance (angles in degrees). */
export declare function isCubic(lattice: Lattice, tolerance?: number): boolean;
