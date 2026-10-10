/** Homework 3, problems 1–3. Energies in E_G = ℏ²G²/(2m); momenta in G. */
export declare const RECIPROCAL: [number, number][];
export declare const potential: (x: number, y: number, v1: number, v3: number) => number;
export declare function coupling(dx: number, dy: number, v1: number, v3: number): number;
export declare function planeWaveMatrix(kx: number, ky: number, v1: number, v3: number): number[][];
/** Symmetric Jacobi diagonalization. Nine plane waves, not a full-basis exact solution. */
export declare function eigenvalues(matrix: readonly (readonly number[])[]): number[];
export declare function eigenstates(matrix: readonly (readonly number[])[]): {
    energy: number;
    coefficients: number[];
}[];
/** Dimensionless Bloch amplitude, coordinates in a; cell-average |psi|² = 1. */
export declare function xWavefunction(coefficients: readonly number[], x: number, y: number, phase?: number): {
    real: number;
    imag: number;
    density: number;
};
export declare const bands: (kx: number, ky: number, v1: number, v3: number) => number[];
export declare function xBands(qx: number, qy: number, v1: number): [number, number];
export declare function xCoefficients(v1: number): {
    lower: number;
    upper: number;
    critical: number;
    gap: number;
};
export declare function xVelocity(qx: number, qy: number, v1: number, upper?: boolean): [number, number];
export type Grid = {
    n: number;
    min: number;
    max: number;
    values: Float64Array;
};
export declare function grid(fn: (x: number, y: number) => number, n?: number, min?: number, max?: number): Grid;
export declare function bandGrids(v1: number, v3: number, n?: number, min?: number, max?: number, centerX?: number): Grid[];
export type Segment = [[number, number], [number, number]];
export declare function contours(g: Grid, level: number): Segment[];
export type CriticalKind = 'minimum' | 'saddle' | 'maximum';
export declare const criticalEnergy: (x: number, y: number, a: number, b: number, kind: CriticalKind) => number;
/** Spin-included DOS in G²/E_G units, for ε=A qx²+B qy² in dimensionless variables.
 * The saddle result is its universal singular part, valid |ε| << cutoff, not a whole-band DOS.
 */
export declare function singularDOS(energy: number, a: number, b: number, kind: CriticalKind, cutoff?: number): number;
/** Lorentzian delta on a bounded patch; numerical broadening rounds both steps and logarithms. */
export declare function numericalDOS(energies: readonly number[], a: number, b: number, kind: CriticalKind, eta: number, n?: number, cutoff?: number): number[];
