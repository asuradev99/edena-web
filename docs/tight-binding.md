# Two-dimensional tight binding

Open the [project workspace](../index.html) and choose **Tight binding**. Its default is the
requested **hexagonal Bravais lattice with a one-atom basis**, one orbital, equal nearest-neighbor
hopping, and zero site energy. This is also called the triangular lattice; it has six neighbors.
It is distinct from honeycomb, which has two basis sites.

The default primitive vectors are a₁ = (1, 0), a₂ = (1/2, √3/2). The interface starts with t = −1.
Its analytic dispersion, using reciprocal fractional coordinates (u, v), is

    E(u,v) = 2t [cos(2πu) + cos(2πv) + cos(2π(u−v))].

Consequently E(Γ) = 6t, E(M) = −2t, and E(K) = −3t. The default path is Γ–M–K–Γ,
with M = (1/2, 0), K = (2/3, 1/3). The first Brillouin zone is a hexagon.

## Model convention

`TightBinding2D` implements a spinless, non-interacting model with an orthonormal basis of localized
orbitals and two periodic directions. There may be 1–16 orbitals in a primitive cell. Each row in
**Basis & site energies** is one orbital; multiple rows may share a position if needed.

Lattice vectors are Cartesian. Orbital positions τ and hopping cell offsets R are fractional in
the primitive real-space lattice. k coordinates along the band path are fractional in reciprocal
vectors satisfying aᵢ·bⱼ = 2πδᵢⱼ. The Bloch convention is

    Hᵢⱼ(k) += tᵢⱼ(R) exp[2πi k·(R + τⱼ − τᵢ)].

Each bond is supplied once. Its Hermitian conjugate is added automatically. Do not enter both
(i, j, R, t) and (j, i, −R, conjugate(t)). Same-orbital, same-cell terms belong in the site-energy
column. Hopping signs are explicit: the solver does not insert another minus sign.

This follows the orbital-position convention described by
[PythTB's Hamiltonian documentation](https://pythtb.readthedocs.io/en/latest/generated/pythtb/TBModel/pythtb.TBModel.hamiltonian.html).
The solver is implemented locally and does not call PythTB or a remote service.

## Views and interaction

The page opens on the **3D dispersion**, the periodic band over the first Brillouin zone.

- **Band structure:** every band along the editable k path, with the chemical potential marked.
- **3D dispersion:** a selected band E(kₓ,kᵧ), with energy on the vertical axis, clipped to the first Brillouin zone. A horizontal filled slice marks occupied momenta at μ.
- **Fermi area slice:** the selected band’s occupied region Eₙ(k) ≤ μ, with a gold boundary Eₙ(k) = μ. Evolve μ to see pockets merge and change topology. The filled region is the Fermi sea; in two dimensions its boundary is the Fermi surface.
- **Brillouin zone & k path:** the Wigner–Seitz cell of the reciprocal lattice, and the selected path.
- **Lattice & bonds:** a patch of the real-space model and the primitive cell.
- **Density of states:** a finite-grid histogram, normalized in spinless states per cell per energy unit.

Drag the 3D dispersion to orbit; other views stay flat with pan and zoom. Controls occupy a side column and do not cover the plot.
The k-grid is computed in a worker only when applying a model. Fermi-energy changes reuse those
bands and cached BZ-clipped triangles. Filled slices interpolate triangle edges at μ without new eigenvalue solves. The first Brillouin zone is calculated after Gauss reduction, so a skewed representation
of a lattice does not require an arbitrary large reciprocal-neighbor search.

Sampling resolution controls contour and DOS accuracy. Small pockets and sharp DOS singularities
need a finer grid. Occupation is a sampled integral, not an exact filling constraint. A contour
at an isolated band extremum may collapse to a point and have no line segment. The model has no
self-consistent interactions, overlap matrix, or automatic physical spin degeneracy.

The nearest-neighbor button searches translations within ±2 cells. Explicit bonds support other
ranges and complex amplitudes. Editing a primitive lattice does not automatically reinterpret its
symmetry-point labels: edit the k path when changing the crystal. Model JSON export/import preserves
lattice vectors, basis energies, hopping amplitudes, and the path.

## Library use

```js
import { TightBinding2D, tightBindingPreset, sampleTightBinding, fermiContours } from 'edena-web';
const { model, path } = tightBindingPreset('hexagonal', -1);
const solver = new TightBinding2D(model);
console.log(solver.energies([0, 0])); // [-6]
const sampled = sampleTightBinding(model, path, 64);
const lines = fermiContours(sampled, 0, 0); // μ = 0, first band
```

Square, honeycomb, and kagome presets are also included. The one- and two-orbital solvers use direct
expressions; larger complex Hermitian matrices use a real symmetric Jacobi eigensolver, with a
convergence check. Analytic triangular, square, honeycomb, and complex-chain spectra, Hermiticity,
reciprocal periodicity, BZ area, and contour-energy agreement are covered by the numerical tests.
