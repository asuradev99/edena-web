# 06 · Symmetry and tolerance

Live lab: [`academy.html#ch-symmetry`](../../academy.html#ch-symmetry) ·
model: [`orbitReport`, `operationNamed`, `displaced`](../../src/examples/academy-model.ts) ·
library: [`src/lib/lattice.ts`](../../src/lib/lattice.ts)

## What the code does

A symmetry operation is a map, and the useful questions are mechanical. For a structure with
fractional sites, `applyOperation(operation, site)` sends one site to another (wrapping back into
the cell). Everything else is built on that:

| Function | Question it answers |
|----------|---------------------|
| `applyOperation(operation, site)` | Where does this one site go? |
| `siteMapping(structure, operation, tol)` | One target index per site |
| `symmetryOrbits(structure, operations, tol)` | Which sites trade places with each other |
| `mapsOntoSelf(structure, operation, tol)` | Is the *decorated* structure invariant (species-aware)? |
| `latticePointGroup(lattice, tol)` | Which of the cell's own operations preserve its metric? |

All of it happens in **fractional** coordinates, which is why a non-cubic cell keeps only the
operations that preserve its Gram matrix: 48 for cubic, 24 for hexagonal, 16 for tetragonal.

## What is exact

The classification of a chosen operation: which sites are fixed (`mapping[i] === i`), which move,
and how the moving ones fall into orbits. On a face-centred cell (`latticeSites('fcc')`, four sites,
all one species `A`):

- `E` fixes all four; `C₄(z)` fixes **2** and swaps the other two: orbits `[[0], [1, 2], [3]]`.
- A species-aware check agrees, because all four are the same element.

On a perovskite cell (five sites, species `A`, `B`, three `O`), the *same* `C₄(z)`:

- fixes **3** (the `A`, the `B`, and one oxygen) and swaps the remaining two oxygens:
  orbit `[3, 4]`.

The operation is identical. The number of fixed atoms is a property of the basis. That single
comparison is the point of the chapter, and the lab prints both numbers from the library's own
functions.

## What is approximate

Symmetry is a statement about a **tolerance**, and the default here is `1e-4` in fractional units
(about 4 × 10⁻⁴ Å for a 3.9 Å cell). The strain slider displaces one atom in fractional `z`:

- While the displacement is below tolerance, `mapsOntoSelf` still returns `true` — the atom is
  treated as sitting on its ideal site.
- The moment it exceeds tolerance, the report flips to `onto-self: no` and the moved count rises.

Nothing physical changed; the verdict changed because a number crossed a threshold. The model's
`displaced(structure, site, delta)` exists so this can be shown without touching the parser's data.

## Limits

- The panel's operations are the cell's **point group**. It does not test translations, so screw and
  glide operations (which the phonopy parser preserves) are outside what the lab can display.
- `1e-4` is a chosen default, not a physical constant. `latticePointGroup` uses a tolerance relative
  to the cell's own metric so a rounded POSCAR is not punished more than a small cell, but a truly
  distorted cell must still be rejected.
- The orbit arrows show the *before* positions and the map between them; they are not an animation
  of the operation. The crystal viewer handles the animated isometry (`operationIsometry`,
  `isometryPoint`) separately.
- Species colours here are a local palette for readability, not the CPK colours in
  `src/lib/elements.ts` that the crystal viewer uses.

## Where to look

- [`src/lib/lattice.ts`](../../src/lib/lattice.ts) — `applyOperation`, `siteMapping`,
  `symmetryOrbits`, `mapsOntoSelf`, `latticePointGroup`.
- [`src/lib/crystal.ts`](../../src/lib/crystal.ts) — `CrystalOperation`, the parsers.
- [`src/examples/symmetry.ts`](../../src/examples/symmetry.ts) — the full crystal viewer.
