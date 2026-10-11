/**
 * A hexagonal boron-nitride monolayer: the two-atom honeycomb cell, tiled into a sheet, and the same
 * sheet with one atom missing. Kept as plain data (no DOM, no WebGPU) so both the viewer and the
 * unit tests can build it and ask what symmetry survives.
 */
import { type CrystalStructure, type Supercell } from '../index.js';
/** In-plane lattice constant of h-BN (a = 2.504 Å), which makes the B–N bond a/√3 ≈ 1.446 Å. */
export declare const HBN_LATTICE = 2.504;
/** Vacuum gap along c, so one layer has no periodic neighbour through the plane. */
export declare const HBN_GAP = 16;
/** The primitive two-atom h-BN cell, its plane centred in the vacuum gap. */
export declare function boronNitrideCell(gap?: number): CrystalStructure;
/** A `repeats × repeats` sheet of h-BN: one layer, however many cells across. */
export declare function boronNitrideSheet(repeats?: number, gap?: number): Supercell;
/**
 * The sheet with the atom nearest its middle removed — a monovacancy. The hole leaves the cell
 * charge-imbalanced (one boron fewer than nitrogen), but it sits on a site the layer's point group
 * already fixes, so the defected sheet carries exactly the symmetry of the perfect one; the viewer's
 * mapping report is what shows that, operation by operation.
 */
export declare function boronNitrideVacancy(repeats?: number, gap?: number, missing?: string): Supercell;
