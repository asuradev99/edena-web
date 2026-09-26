# 19 · Crystal files: POSCAR and phonopy

**Code:** `src/lib/crystal.ts` — `parsePOSCAR`, `parsePhonopySymmetry`, `CrystalStructure`,
`CrystalOperation`.

## POSCAR

```
comment line
scale                      ← a positive length, or a negative target volume
ax ay az                   ← lattice vector a
bx by bz                   ← lattice vector b
cx cy cz                   ← lattice vector c
Na Cl                      ← species (symbols, or bare counts)
1 1                        ← counts per species
Direct                     ← 'Direct'/'D' = fractional, anything else = cartesian
0.0 0.0 0.0
0.5 0.5 0.5
```

The parser is tolerant where the format is: blank lines and trailing comments are ignored, species may
be symbols or numbers, and `Selective dynamics` lines are skipped. It is strict where a mistake would be
silent — a truncated vector or a count that does not match the coordinates throws.

### The scale rule

A **positive** scale multiplies every lattice vector. A **negative** scale is VASP's other convention:
its magnitude is a *target cell volume*, and the vectors are rescaled by
`cbrt(|scale| / |det(lattice)|)` so the cell encloses that many cubic ångström. Treating it as a
multiplier shrinks a cell by two orders of magnitude, which looks like a plausible tiny crystal rather
than an error — so the academy prints the resulting volume next to the file that produced it.

## Fractional → cartesian

Fractional coordinates `f` map to cartesian by the lattice **as rows**:

```
x = f₁·a + f₂·b + f₃·c
```

which is `Mᵀ·f` when `M` stores `a`, `b`, `c` as rows. The parser returns fractional positions and the
lattice, and leaves the conversion to the caller, because the symmetry code wants fractional values
(it compares positions modulo 1) while the renderer wants cartesian ones.

## Phonopy symmetry

```yaml
rotations:
- - [ 1, 0, 0 ]
  - [ 0, 1, 0 ]
  - [ 0, 0, 1 ]
- - [ -1, 0, 0 ]
  - [ 0, 1, 0 ]
  - [ 0, 0, -1 ]
translations:
- [ 0, 0, 0 ]
- [ 0, 0, 0 ]
```

`parsePhonopySymmetry` splits the `rotations:` section from the `translations:` one, matches each
bracketed row, groups every three rows into a `3×3` rotation, and pairs them with the translations in
order — returning `{ rotation, translation, label }`. It also accepts a flat nine-number bracket, a
nested `[[a,b,c],[…]]` matrix, or a JSON `{"rotations": […]}` document, and it de-duplicates identical
operations. Those operations feed `lattice.ts`, which is what the symmetry chapter uses.

## Limits

- Only these two shapes: no CIF, no `Selective dynamics` flags, no magnetic moments, no per-site labels.
- Fractional coordinates are used as given — not reduced into `[0, 1)`.
- A malformed file throws with a message rather than guessing a repair.
- Both functions are pure text → data with no DOM, which is what lets the test suite feed them the
  awkward files directly (CRLF, extra blanks, numeric species, a missing count).
