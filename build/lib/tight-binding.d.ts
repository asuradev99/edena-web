/** Spinless, orthogonal-orbital tight binding in two periodic dimensions. */
export type Point2 = [number, number];
export type TightBindingModel = {
    lattice: [Point2, Point2];
    sites: {
        position: Point2;
        energy: number;
        label?: string;
    }[];
    /** Each undirected bond is entered once; its Hermitian conjugate is added automatically. */
    hoppings: {
        from: number;
        to: number;
        cell: Point2;
        real: number;
        imag?: number;
    }[];
};
export type KPoint = {
    label: string;
    k: Point2;
};
export declare function reciprocalLattice(lattice: [Point2, Point2]): [Point2, Point2];
export declare function latticePoint(p: Point2, basis: [Point2, Point2]): Point2;
export declare function reducedK(k: Point2, lattice: [Point2, Point2]): Point2;
/** Clip a convex polygon against n·p <= bound. Extra coordinates interpolate with its edges. */
export declare function clipHalfPlane<T extends number[]>(polygon: T[], normal: Point2, bound: number): T[];
/** Wigner–Seitz cell of the reciprocal lattice, in Cartesian k coordinates, counterclockwise. */
export declare function brillouinZone(lattice: [Point2, Point2]): Point2[];
export declare function insideZone(p: Point2, polygon: Point2[]): boolean;
export declare function clipToZone<T extends number[]>(points: T[], zone: Point2[]): T[];
/** Eigenvalues of a complex Hermitian matrix, stored as separate row-major real/imaginary arrays. */
export declare function hermitianEigenvalues(real: Float64Array, imag: Float64Array, n: number): number[];
export declare class TightBinding2D {
    readonly model: TightBindingModel;
    readonly reciprocal: [Point2, Point2];
    readonly zone: Point2[];
    constructor(model: TightBindingModel);
    /** k is in reciprocal fractional coordinates. H_ij = t exp[2πi k·(R+τ_j−τ_i)]. */
    hamiltonian(k: Point2): {
        real: Float64Array;
        imag: Float64Array;
    };
    energies(k: Point2): number[];
}
export declare function tightBindingPreset(name?: string, t?: number): {
    model: TightBindingModel;
    path: KPoint[];
};
/** Nearest-neighbor shell among cells in a configurable search radius. */
export declare function nearestHoppings(model: TightBindingModel, t: number, radius?: number): TightBindingModel['hoppings'];
