import type { Vec3 } from './math.js';
export type CrystalOperation = {
    rotation: number[][];
    translation: Vec3;
    label: string;
};
export type CrystalStructure = {
    comment: string;
    lattice: [Vec3, Vec3, Vec3];
    species: string[];
    positions: Vec3[];
};
/** Parse VASP 5 POSCAR/CONTCAR text, including Selective dynamics and Cartesian coordinates. */
export declare function parsePOSCAR(text: string): CrystalStructure;
/** Parse phonopy symmetry.yaml (and the common bracketed symmetry-operation export). */
export declare function parsePhonopySymmetry(text: string): CrystalOperation[];
