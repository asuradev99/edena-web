/**
 * A hexagonal boron-nitride monolayer: the two-atom honeycomb cell, tiled into a sheet, and the same
 * sheet with one atom missing. Kept as plain data (no DOM, no WebGPU) so both the viewer and the
 * unit tests can build it and ask what symmetry survives.
 */
import { fractionalDistanceSquared, supercell, type CrystalStructure, type Lattice, type Supercell, type Vec3 } from '../index.js';

/** In-plane lattice constant of h-BN (a = 2.504 Å), which makes the B–N bond a/√3 ≈ 1.446 Å. */
export const HBN_LATTICE = 2.504;
/** Vacuum gap along c, so one layer has no periodic neighbour through the plane. */
export const HBN_GAP = 16;

/** The primitive two-atom h-BN cell, its plane centred in the vacuum gap. */
export function boronNitrideCell(gap = HBN_GAP): CrystalStructure {
  const a = HBN_LATTICE;
  // 120° hexagonal cell: |a₁| = |a₂| = a, with a₁·a₂ = −a²/2.
  const lattice: Lattice = [[a, 0, 0], [-a / 2, (a * Math.sqrt(3)) / 2, 0], [0, 0, gap]];
  return {
    comment: 'hexagonal boron nitride monolayer',
    lattice,
    species: ['B', 'N'],
    // The two honeycomb sublattices: boron at (⅓, ⅔), nitrogen at (⅔, ⅓).
    positions: [[1 / 3, 2 / 3, 1 / 2], [2 / 3, 1 / 3, 1 / 2]],
  };
}

/** A `repeats × repeats` sheet of h-BN: one layer, however many cells across. */
export function boronNitrideSheet(repeats = 9, gap = HBN_GAP): Supercell {
  return supercell(boronNitrideCell(gap), [repeats, repeats, 1]);
}

/**
 * The sheet with the atom nearest its middle removed — a monovacancy. The hole leaves the cell
 * charge-imbalanced (one boron fewer than nitrogen), but it sits on a site the layer's point group
 * already fixes, so the defected sheet carries exactly the symmetry of the perfect one; the viewer's
 * mapping report is what shows that, operation by operation.
 */
export function boronNitrideVacancy(repeats = 9, gap = HBN_GAP, missing = 'B'): Supercell {
  const sheet = boronNitrideSheet(repeats, gap);
  const centre: Vec3 = [.5, .5, .5];
  let cut = -1, best = Infinity;
  sheet.positions.forEach((position, index) => {
    if (sheet.species[index] !== missing) return;
    const distance = fractionalDistanceSquared(position, centre);
    if (distance < best - 1e-12) { best = distance; cut = index; }
  });
  if (cut < 0) throw new Error(`No ${missing} atom to remove`);
  return {
    ...sheet,
    positions: sheet.positions.filter((_, index) => index !== cut),
    species: sheet.species.filter((_, index) => index !== cut),
  };
}
