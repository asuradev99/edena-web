# 8.511 Homework 3 — solutions to problems 1–3

*Bloch bands, a Lifshitz transition, and van Hove singularities in two dimensions.*

## Conventions and units

| quantity | definition | use below |
|---|---|---|
| lattice | square, spacing `a`; `G = 2π/a` | `x̂`, `ŷ` are the primitive directions |
| energies | `E_G ≡ ħ²G²/(2m)` | `ε⁰_G₀(k) = |k−G₀|²/G² · E_G` |
| momenta | `u = qx/G`, `v = qy/G` | the quadratic expansion uses dimensionless `u, v` |
| potential | `v1 ≡ V1/E_G` (**signed**), `v3 ≡ V3/E_G` | `|v1|, |v3| ≪ 1` (weak-potential hypothesis, Eq. 2) |
| spin | dispersion independent of spin | **factor 2** in every state count and in the DOS |
| area | per unit **physical** area, not per cell | multiply by `a²` for a per-cell DOS |

The potential is `U(x,y) = V1[cos Gx + cos Gy] + V3[cos G(x+y) + cos G(x−y)]`, unchanged under
`x → −x`, `y → −y`, `x ↔ y` and 90° rotations (point group `C₄ᵥ`).

---

## Problem 1 — Empty-lattice bands

### 1(a) Lattice, reciprocal lattice, first Brillouin zone

`U` is built from `cos Gx` and `cos Gy` with `G = 2π/a`, so it is periodic under `x → x + a` and
`y → y + a`, and the diagonal terms `cos G(x ± y)` introduce no smaller period. The Bravais lattice is
therefore the **square lattice of spacing `a`**:

```
a₁ = a x̂,  a₂ = a ŷ            b₁ = G x̂,  b₂ = G ŷ            (bᵢ·aⱼ = 2π δᵢⱼ)
```

The reciprocal lattice is also square with spacing `G`. The first Brillouin zone is the square
`−G/2 ≤ kx, ky ≤ G/2`, with the high-symmetry points

* `Γ = (0,0)` — zone centre,
* `X = (G/2, 0)` — midpoint of an edge (`kx = G/2`),
* `M = (G/2, G/2)` — corner (shared by four zones).

*Sketch:* a square with `Γ` in the middle, `X` at the midpoint of each side and `M` at each corner; the
`Δ` line joins `Γ–X`, `Σ` joins `Γ–M`, `Z` joins `X–M`. The four-fold rotation relates the four `X`
points to one another and the four `M` corners to one another.

### 1(b) Degenerate states at X and at M

Empty-lattice energies `ε⁰_G₀(k) = (ħ²/2m)|k − G₀|²`, folded into the zone. In units of `E_G` with
`u = k/G`, the shells are `|u − (m,n)|²` for `G₀ = (m,n)G`.

**At X, `u = (1/2, 0)`:**
```
G₀ = (0,0): |(1/2,0)|²      = 1/4          ← lowest shell
G₀ = (1,0): |(−1/2,0)|²     = 1/4          ← lowest shell
G₀ = (0,1) or (1,1):         1/4 + 1 = 5/4  (and (1,0)+(0,1) = 5/4)
```
So the lowest shell contains **exactly two degenerate plane waves**, `|k⟩` and `|k−(G,0)⟩`, both with
`ε⁰ = ħ²G²/(8m) = E_G/4`. The next shell lies `E_G` higher.

**At M, `u = (1/2, 1/2)`:**
```
G₀ = (0,0), (G,0), (0,G), (G,G)  →  |(±1/2, ±1/2)|² = 1/2  (all four)
```
So **four states are degenerate** with `ε⁰ = ħ²G²/(4m) = E_G/2`.

### 1(c) Nonzero Fourier components, and which ones couple these states

Writing `cos Gx = (e^{iGx} + e^{−iGx})/2` and similarly for the others,

```
U_Q ≠ 0  for   Q = (±G, 0), (0, ±G)        with  U_Q = V1/2
               Q = (±G, ±G)  (all four)    with  U_Q = V3/2,   i.e. (G,G), (−G,−G) from cos G(x+y)
                                                                and  (G,−G), (−G,G) from cos G(x−y)
U_{Q=0} = 0  (the average of the potential has been set to zero; the cosines all average out)
```

**At X.** The two states differ by `Q = (G,0)`, so they are coupled by the `(G,0)` component,
`U_{(G,0)} = V1/2`. **That is the only component coupling them at leading order.** The `V3`
components would connect `k` to `k ± (G,±G)`, whose folded empty-lattice energies are `5/4 E_G` (see 1(b)),
so no `V3` component is resonant with the pair — `V3` can only enter at second order,
`O(V3²/E_G)`.

**At M.** The four states differ by `(G,0)`, `(0,G)`, `(G,G)` and `(G,−G)`, so they are coupled by
`V1/2` along the two axis directions and by `V3/2` along the two diagonals — this is precisely the
matrix of problem 4(b):
`H_M − E_M^(0) I = ½ [[0,V1,V1,V3],[V1,0,V3,V1],[V1,V3,0,V1],[V3,V1,V1,0]]`.

---

## Problem 2 — Gap at X, effective masses, and a Lifshitz transition

### 2(a) The two-state Hamiltonian

Near `X`, `k = (G/2 + qx, qy)`. Take the two plane waves `|1⟩ = |k⟩` and `|2⟩ = |k − (G,0)⟩`. Their
diagonal energies are the empty-lattice values, and from 1(c) the only resonant off-diagonal element is
`U_{(G,0)} = V1/2`:

```
H_X(q) = [ ħ²/(2m)((G/2+qx)² + qy²)      V1/2                     ]
         [ V1/2                          ħ²/(2m)((−G/2+qx)² + qy²) ]
```

**Why `V3` is absent.** `V3` has Fourier components only on the diagonals `Q = (±G, ±G)`. Adding such a
`Q` to either state gives a plane wave of empty-lattice energy `(ħ²/2m)|(±G/2,0) ± (G,±G)|² =
(ħ²/2m)(5G²/4) = (5/4)E_G`, which is not degenerate with the pair at `E_G/4`. Degenerate perturbation
theory keeps only matrix elements between states that are (nearly) degenerate, so `V3` moves these
energies only at second order, `∼V3²/E_G`, which is `O(v1², v1v3, v3²)` in the weak-potential counting —
higher order than the linear `V1` term that the problem asks for. (It is not zero in general; it belongs
to the next order, and it is what shifts `E(X)` away from `1/4 − v1/2` by a term `∝ v1²` — see the
numerical check below.)

### 2(b) Eigenvalues and the gap

Write `a = ħ²/(2m)`. The trace and the difference of the diagonal entries are

```
mean      = a[(G/2)² + qx² + qy²] = (ħ²G²/8m) + (ħ²/2m)(qx² + qy²) = E_G/4 + a(qx² + qy²)
half-diff = a·(2·(G/2)·qx)        = (ħ²G/2m)·qx
```

so

```
E±(q) = E_G/4 + (ħ²/2m)(qx² + qy²) ± sqrt( (ħ²G qx / 2m)² + (V1/2)² )
```

In the dimensionless units `u = qx/G`, `v = qy/G` and energies in `E_G` this is exactly the form

```
E± = 1/4 + u² + v² ± sqrt( u² + (v1/2)² ),          v1 = V1/E_G  (signed)
```

Note that `E±` depends on `V1` only through `V1²`: **the spectrum, the gap and every effective mass
below are functions of `|v1|`, not of the sign of `V1`.** (A change of basis, `|2⟩ → −|2⟩`, flips the
sign of the off-diagonal element and leaves the eigenvalues alone.) If `v1` is instead defined as the
positive magnitude `|V1|/E_G`, the two conventions agree and `|v1| = v1`; the equations below are
written for a signed `v1` and use `|v1|` explicitly.

**Gap at X** (`u = v = 0`): `E± = 1/4 ± v1/2`, hence

```
ΔE(X) = E₊ − E₋ = |v1| E_G = |V1|
```

The gap is opened by the periodic potential and is **linear in `|V1|`** — the size of the Fourier
component that mixes the two degenerate states, as expected from degenerate perturbation theory.

### 2(c) Quadratic expansion and the effective masses

The square root depends only on `u`, and for `|u| ≪ |v1|/2`

```
sqrt(u² + (v1/2)²) = (|v1|/2)·sqrt(1 + 4u²/v1²) = |v1|/2 + u²/|v1| + O(u⁴/|v1|³)
```

so, subtracting the value at X,

```
E±(q) − E±(0) = u²(1 ± 1/|v1|) + v²                 [in units of E_G, u, v dimensionless]
```

**The expansion is needed only in `u`.** The two-state spectrum is *exact* in `v` — the square root does
not contain `qy` at all, because the potential does not mix the two states in the `y` direction — so the
`v²` term above is exact, and only the `qx` direction carries a restriction (see the note below).

Restoring dimensions, `u² E_G = (ħ²/2m)qx²`, so

```
E± − E±(0) = ħ²qx²/(2m*_x) + ħ²qy²/(2m*_y),
        1/m*_x = (1/m)(1 ± 1/|v1|)   ⇒   m*_x = m|v1|/(|v1| ± 1),       m*_y = m
```

(The last expression is the one to quote when `V1` may be negative: `m*_x = m|v1|/(|v1| ± 1)`, not
`m v1/(v1 ± 1)`. The two agree only if `v1` is defined as the positive magnitude.) For `V1 < 0` the sign
flips too — the bands swap which one is which — but the magnitudes and the classification below are
unchanged, because only `|v1|` appears.

**Signs in the weak-potential limit `|v1| ≪ 1`:**

| band | `1 ± 1/|v1|` | `m*_x` | `m*_y` | classification of X |
|---|---|---|---|---|
| upper `E₊` | `1 + 1/|v1| > 0` | `+m|v1|/(1+|v1|) > 0`, small | `+m > 0` | **local minimum** |
| lower `E₋` | `1 − 1/|v1| < 0` | `−m|v1|/(1−|v1|) < 0` | `+m > 0` | **saddle point** |

So X is a minimum of the upper band and a **saddle point** of the lower band. The masses are *light*:
`|m*_x| ≈ m|v1| ≪ m`. That is the standard signature of a gap opened at a band crossing — the bands become
steep (nearly linear) in the direction the gap mixes, and flat (free-electron-like, `m*_y = m`) along the
zone boundary, which is the direction the potential does not mix.

> **Domain of validity (important).** The expansion is a statement about a window of width
> `|qx| ≪ |V1|/(2E_G)·G` in the `x` direction alone (equivalently `|u| ≪ |v1|/2`); `qy` needs no such
> restriction, since the exact two-state spectrum is already quadratic in `qy`. It is not a statement
> about the whole band: the true lower-band minimum along `qy = 0` is at
> `|u| = sqrt(1 − v1²)/2 ≈ 1/2`, i.e. at the far side of the zone. The quadratic form is therefore valid
> only for `|q|` well inside that window, and as `v1 → 0` the window closes: the formula's `v1 → 0`
> limit is *not* the free-electron mass. (The numerical check below confirms the minimum position.)

### 2(d) The velocity normal to the zone boundary

From `E± = 1/4 + u² + v² ± sqrt(u² + (v1/2)²)`,

```
∂E±/∂u = 2u ± u / sqrt(u² + (v1/2)²)   →   0   as u → 0      (since v1 ≠ 0)
```

so with `v_n = (1/ħ)∇_k E_n`, the component of velocity **normal to the zone boundary vanishes at X**:
both bands have zero group velocity along `x̂` there.

**Symmetry argument (no expansion needed).** `x → −x` is a symmetry of `U`; it maps a Bloch state at
`kx` to one at `−kx`, so `E_n(−kx, ky) = E_n(kx, ky)` for the folded band structure. Combining this with
periodicity `E_n(kx) = E_n(kx + G)` gives

```
E_n(G/2 + qx, qy) = E_n(G/2 − qx, qy)
```

i.e. `E_n` is an **even function of `qx` about the zone boundary**, so its derivative at `qx = 0`
vanishes identically. The vanishing velocity is thus a consequence of the mirror symmetry of the
potential about the line `kx = G/2`, not of the weak-potential approximation.

### 2(e) Constant-energy contours, and the Lifshitz transition

Near X the lower band has the local form (2c)

```
E₋(q) − E_c = − (ħ²/2|m*_x|) qx² + (ħ²/2m) qy² ,      E_c = E_G(1/4 − v1/2)
```

a saddle with a negative mass along `qx` and a positive mass along `qy`.

**Contours of the lower band:**

| energy | level set | shape |
|---|---|---|
| `E < E_c` | `−(ħ²/2|m*_x|)qx² + (ħ²/2m)qy² = E − E_c < 0` | hyperbolas opening along **`±qx`** (the negative-mass direction) |
| `E = E_c` | `qy = ± sqrt(|m*_x|/m) qx` | the **two crossing lines** through X — the neck |
| `E > E_c` | same left side `> 0` | hyperbolas opening along **`±qy`** (the positive-mass direction) |

*Sketch:* below `E_c`, two branches that open left and right of X and join far away into a closed curve
around Γ; at `E_c`, two straight lines crossing exactly at X; above `E_c`, two branches that open up and
down and join into a curve running around M.

The asymptote slope is `sqrt(|m*_x|/m) = sqrt(v1/(1−v1))`, which is `≪ 1` in the weak-potential limit:
the contour at the critical energy is **nearly parallel to the zone boundary** (the `y` direction). That is
the direction in which the potential does not mix the two states, so the band stays free-electron-like
there and the contour runs straight along it.

**The Lifshitz transition.** As the chemical potential rises through `E_c` (equivalently: as a control
parameter moves `E_c` through a fixed `μ`):

1. `μ < E_c`: the Fermi contour is a single closed loop around `Γ` that does **not** reach the zone
   boundary. It is an **electron** pocket (the enclosed states are occupied, the band has a minimum at Γ).
2. `μ = E_c`: the loop touches the zone boundary at the four edge midpoints `(±G/2, 0)` and
   `(0, ±G/2)` simultaneously — four **necks** form. On the Brillouin-zone **torus** those four
   midpoints are only **two inequivalent points**: `(G/2,0)` and `(−G/2,0)` differ by a reciprocal
   vector `(G,0)`, so they are the same point, and likewise `(0,±G/2)` are one point. The two
   inequivalent saddles are `X = (G/2,0)` and the symmetry-related `(0,G/2)`. The Fermi velocity
   vanishes at both, so the DOS diverges logarithmically (problem 3b) — with **two** saddles'
   worth of weight, which is what fixes the coefficient in 3(b).
3. `μ > E_c`: the necks have opened. The occupied region now reaches the zone boundary, and what remains
   enclosed by the Fermi contour is a region around `M` — a **hole** pocket (the enclosed states are
   *empty*; `M` is the maximum of the lower band).

The contour **reconnects through the saddle point**: the pieces that opened along `qx` become the pieces
that run along `qy` and close around `M`. Nothing is broken spontaneously — the potential keeps its full
`C₄ᵥ` symmetry at every `μ` — the *topology* of the Fermi surface changes, which is what makes it a
Lifshitz transition. In a repeated-zone picture the same statement reads: closed electron orbits around
each `Γ` at low `μ` become open orbits (and hole pockets around `M`) above `E_c`.

*Numerical confirmation* (plane-wave model, `|m|,|n| ≤ 3`, `v1 = 0.08`, `v3 = 0.03`):
`E(Γ) = −0.0065 E_G`, `E(X) = 0.2079 E_G`, `E(M) = 0.4343 E_G`; the set `{E < μ}` fails to touch the zone
boundary for `μ = E(X) − 0.005` and does touch it for `μ = E(X) + 0.005`, and the lowest-band DOS peaks
at `E(X)`.

### The `V1 = 0` exception

If `V1 = 0` the two diagonal entries are never mixed, and:

* the gap closes: `E₊ − E₋ = 0` **at every point of the zone boundary** `qx = ±G/2`, not just at X — the
  free-electron degeneracy along the boundary is not lifted;
* `E± = 1/4 + v² ± |u|`, so X is a **kink**: the one-sided slopes are `±1` in units of `E_G/G`, i.e.
  `±ħG/2m`, and the group velocity *jumps* across X. **X is not a critical point at all**, so the
  "saddle" language and the effective-mass formula `m*_x = m|v1|/(|v1| ± 1)` both fail (the formula's
  window closes);
* the dispersion collapses to `E − 1/4 = v² + (|u| − 1/2)²`, whose DOS near `1/4` is a **finite step**,
  not a logarithm. Numerically, `dν/d ln|E − 1/4| = −0.014` (i.e. zero within noise) against `−0.101`
  for the true saddle.

**And if `V3 ≠ 0` while `V1 = 0`, the lattice itself changes.** The potential then reduces to

```
U = V3[cos G(x+y) + cos G(x−y)] = 2V3 cos Gx cos Gy
```

which is invariant under the **half-diagonal translations** `t = (a/2, +a/2)` and `t = (a/2, −a/2)`
(both cosines change sign together, so the product does not), but *not* under the half-axis
`(a/2, 0)` or `(0, a/2)`. The translation group is therefore the centred (diagonal) lattice

```
t₁ = (a/2)(x̂ + ŷ),   t₂ = (a/2)(x̂ − ŷ),      primitive-cell area |det| = a²/2
```

— half the square cell — so the **true Brillouin zone has twice the area of the square zone** and its
reciprocal lattice is the checkerboard sublattice generated by `(G,G)` and `(G,−G)` (an index-2
sublattice of the square one: `(G,0)` is *not* in it). The practical consequence is that with `V1 = 0`
the square-zone description is a **doubled** zone: the band structure is folded onto itself, the
`C₄ᵥ`-related `X` points of the square zone are not all inequivalent in the primitive zone, and the
two-fold degeneracy that runs along the whole line `kx = ±G/2` is a **folding** degeneracy (two copies
of one band meeting) rather than a gap-protected contact at a single point.

So the logarithmic van Hove singularity of problems 2(e) and 3(b) requires `V1 ≠ 0`; it is the gap that
makes X a genuine saddle, and it is `V1 ≠ 0` that makes the square lattice the primitive one.

---

## Problem 3 — Van Hove singularities in two dimensions

With `E(q) − E_c = ħ²qx²/(2mx) + ħ²qy²/(2my)`, the DOS per unit area **including the spin factor 2** is

```
ν(E) = 2 ∫ d²q/(2π)² δ(E − E(q)) = (sqrt(|mx my|)/(π² ħ²)) · J,
J = ∫ du dv δ(Δ − s(u² + v²)),   u = ħqx/sqrt(2|mx|),  v = ħqy/sqrt(2|my|),   Δ = E − E_c
```

using `d²q = (2 sqrt(|mx my|)/ħ²) du dv` and `s = sign(mx)` (for `mx my > 0`).

### 3(a) A minimum or maximum: a finite step

With `mx my > 0`, `E − E_c = s(u² + v²)` and polar coordinates give

```
J = ∫₀^∞ 2πρ dρ δ(Δ − sρ²) = π Θ(Δ/s)   (using δ(ρ² − a) = δ(ρ − √a)/2√a)
```

hence

```
ν(E) = sqrt(|mx my|)/(π ħ²) · Θ(Δ/s)
```

a **one-sided step of height `sqrt(|mx my|)/(π ħ²)`**: zero on the forbidden side of `E_c` and this
constant on the allowed side. It jumps **up** at a minimum (`s > 0`) and **down** to zero at a maximum
(`s < 0`); the magnitude is the same in both cases and depends only on the geometric mean of the two
masses.

*Sketch:* flat zero, then a vertical jump to a plateau at `E_c` (minimum); a plateau that drops
vertically to zero (maximum). There is a **discontinuity but no divergence**.

*Consistency check:* for `mx = my = m` this is the familiar two-dimensional result
`ν = m/(πħ²)` (with `ħ = 1`, `ν = 1/π ≈ 0.3183`), which the numerical contour integral reproduces to
seven digits, and `(mx, my) = (4,1)` gives exactly twice that, as `sqrt(mx my) = 2`.

### 3(b) A saddle point: a logarithm

With `mx my < 0` (take `mx = −|mx|`, `my > 0`) the level set is a hyperbola with **two sheets**, and
`E − E_c = −u² + v²`. Parametrising the upper sheet and its mirror,

```
v = ± r cosh θ,   u = r sinh θ   ⇒   E − E_c = r²,   du dv = r dr dθ
```

The cutoff `|u|, |v| ≤ L` bounds `θ` through the *tighter* of the two constraints
`r|sinh θ| ≤ L`, `r cosh θ ≤ L`, i.e. by `|θ| ≤ θ_max = asinh(L/sqrt|Δ|)` (smaller than
`arcosh(L/sqrt|Δ|)`). Each sheet therefore contributes `2θ_max · ½ = θ_max`, and

```
J = 2 · θ_max ≈ 2 ln(2L/sqrt(|Δ|))          (both sheets; one sheet alone gives half of this)
```

where `L` is the momentum cutoff in the transformed variables. Therefore

```
ν(E) = sqrt(|mx my|)/(π² ħ²) · ln( E_cut / |E − E_c| ),     E_cut = 4L²,   C ≡ sqrt(|mx my|)/(π² ħ²)
```

(the constant term `2 ln 2L` of `J` is `ln E_cut`, which is what makes the cutoff enter only as the
argument of the logarithm). The same `J` follows from differentiating the area of the filled region,
`d/dΔ [Area{v² − u² < Δ}] = 2 asinh(L/√Δ)`, which is a useful independent check of the sheet count.

```
ν(E) = sqrt(|mx my|)/(π² ħ²) · ln( E_cut / |E − E_c| ),     E_cut = 4L²  (in the transformed units)
```

**The singularity is logarithmic, and its prefactor is `sqrt(|mx my|)/(π² ħ²)`.** Two points deserve
emphasis:

* **The cutoff enters only additively.** `ln(E_cut/|Δ|) = ln E_cut − ln|Δ|`, so changing the cutoff
  (momentum or energy) shifts the constant but leaves the coefficient of `ln|Δ|` — and hence the
  prefactor — untouched. The divergence is integrable: `∫ dE ln(1/|E−E_c|)` is finite, so the number of
  states below `E_c` remains finite even though `ν(E_c) = ∞`.
* **The slope is `−C`, not `−C/2`.** With `C ≡ sqrt(|mx my|)/(π² ħ²)` and `ν = C ln(E_cut/|Δ|)`,

  ```
  dν / d ln|E − E_c| = −C = −sqrt(|mx my|)/(π² ħ²)
  ```

  The factor is easy to lose: counting only the *upper* sheet of the hyperbola gives `J = θ_max`
  instead of `2θ_max`, i.e. *half* the prefactor, while still producing a perfect logarithm in `|Δ|`.
  Both sheets must be counted because both contribute states at the same energy. The numerical check
  below distinguishes `−C` from `−C/2` (it measures `−0.1017` against `C = 0.1013`, and rejects `0.0507`).

**Multiplicity: count inequivalent critical points, not drawn ones.** `C` above is the contribution of
*one* saddle point. This band structure has **two** inequivalent `X` saddles per zone — `(G/2,0)` and
`(0,G/2)`, related by the 90° rotation and at the same energy (the four edge midpoints of a *drawing*
collapse to two points on the torus, since `±G/2` along an axis is one point). The total van Hove
weight is therefore

```
ν(E) = 2C ln(E_cut/|E − E_c|) = 2·sqrt(|mx my|)/(π² ħ²) · ln(E_cut/|E − E_c|)
```

and quoting `4 ×` would be double counting. The counting was checked against an independent model
(square-lattice tight binding `E = −2t(cos kx + cos ky)`, whose `X` saddle is at `E = 0` with
`mx = −1/2`, `my = +1/2`, so `C = 1/(2π²)`): the measured coefficient is `0.1125`, which is nearest to
`2C = 0.1013` and far from both `C = 0.0507` and `4C = 0.2026`. (It is not exactly `2C` because the
tight-binding dispersion carries quartic corrections and needs a cutoff; the *counting* is what that
check pins.)

*Relation to 3(a):* the step prefactor is `sqrt(|mx my|)/(π ħ²)` and the log prefactor **per saddle** is
exactly that divided by `π`. The saddle's prefactor is therefore **smaller** than the extremum's, yet its DOS is
**unbounded** at `E_c`. "Stronger singularity" means the latter, not the former.

### 3(c) Why a saddle gives a stronger singularity

The DOS is the number of states per unit energy, so write it as a level-set integral:

```
ν(E) = (2/(2π)²) ∮_{E(q)=E} dℓ / |∇_q E|
```

A critical point is where `|∇_q E|` vanishes, so it is exactly where this integrand can blow up; the
question is how the contour length `dℓ` and the gradient vanish together.

* **At a minimum or maximum** the level set near `E_c` is a small ellipse of radius `ρ ∝ sqrt|Δ|`. Both
  its length (`∝ ρ`) and the gradient on it (`|∇E| ∝ ρ`) go to zero linearly, so their ratio tends to a
  finite number: the integral converges to a constant and the DOS has a genuine jump.
* **At a saddle** the level set is a hyperbola. For `E → E_c` the hyperbola degenerates into its two
  asymptotes, and its branches run off to the cutoff with a gradient that stays finite (the saddle is the
  only place the gradient vanishes). The contour integral therefore accumulates
  `∫ dℓ/|∇E| ∼ ln(L/sqrt|Δ|)`: each decade closer to `E_c` adds a fixed amount of contour length whose
  gradient is essentially unchanged, giving a logarithm of the cutoff-to-distance ratio.

Geometrically this is the same fact as the Lifshitz transition of 2(e): at a saddle, the constant-energy
contour **reconnects**, and just at the critical energy a whole neighbourhood of momentum space along the
reconnecting directions is at the same energy — a curve's worth of states rather than a point's worth.
That extra weight is the logarithmic van Hove singularity, and it is why the DOS of a two-dimensional
band whose Fermi surface passes through a saddle has a peak there (the signature seen in the measured DOS
of the cuprates and of graphene-like systems at the appropriate fillings). A minimum or maximum only
affects a compact neighbourhood, which is why it produces a mere step.

---

## Independent numerical verification

All 26 assertions below pass; the script is `/tmp/edena/verify-hw3.mjs` (node, ~40 s). Units are
`a`, `G`, `E_G`, and `v1 = 0.08`, `v3 = 0.03` unless stated. The last four rows answer the review
questions: the sign of `V1`, the saddle multiplicity, the `V1 = 0`/`V3 ≠ 0` lattice, and the domain of
the expansion.

| claim | analytic | numeric |
|---|---|---|
| `E± = 1/4 + u² + v² ± sqrt(u² + (v1/2)²)` | exact 2×2 spectrum | agrees to `1e-13` over 15 points |
| gap at X | `v1 = 0.08` | `0.0800000000` |
| `m/m*_x`, upper band | `1 + 1/|v1| = 13.5` | `13.49996…` (Richardson-extrapolated) |
| `m/m*_x`, lower band | `1 − 1/|v1| = −11.5` | `−11.49996…` |
| spectrum is even in `V1` (only `|v1|` enters) | identical for `±V1` | agrees to `1e-15` at `v1 = −0.08` |
| `m/m*_y`, both bands | `1` | `1.0000000` |
| lower-band minimum along `qy = 0` | `sqrt(1−v1²)/2 = 0.49839743` | `0.498395` |
| `∂E/∂qx` at X | `0` | `< 1e-9` |
| `E(G/2+x, y) = E(G/2−x, y)` | exact | `< 1e-15` |
| plane-wave `E(X) → 1/4 − v1/2` | leading order | differences fall `×3.93, ×3.96` per halving of `v1` (i.e. `O(v1²)`) |
| extremum DOS prefactor | `1/π = 0.31830989` | `0.31830989` (contour integral) |
| same, `(mx,my) = (4,1)` | `2/π = 0.63661977` | `0.63661977` |
| saddle `dν/d ln|E−E_c|` | `−1/π² = −0.10132118` | `−0.10172` |
| saddle log law | `ν + C ln|Δ|` constant | constant to 2% over two decades |
| `V1 = 0`: bands degenerate on the boundary | `0` | `0` (2×2) |
| `V1 = 0`: one-sided slopes at X | `±1` | `±1.000001` |
| `V1 = 0`: no log divergence | slope `≈ 0` | `−0.014` (vs `−0.101` for the saddle) |
| four drawn edge midpoints | two inequivalent `X` points on the torus | folding gives exactly `2` |
| total van Hove coefficient | nearest of `C`, `2C`, `4C` | measured `0.1125`; distances `0.0619` (`C`), `0.0112` (`2C`), `0.0901` (`4C`) |
| `V1 = 0`, `V3 ≠ 0`: periodicity | `U` invariant under `(a/2, ±a/2)`, **not** `(a/2, 0)` | diagonal shifts `0` to `1e-15`; axis shift `≈ 1` |

The two independent methods for the DOS — a level-set contour integral `∮dℓ/|∇E|` for the extremum, and
cumulative grid counts for the saddle — agree with the analytic prefactors, which is the check that the
`(2π)²`, the two spin states, and the `d²q` Jacobian have all been counted correctly. A third model, the
exact square-lattice tight-binding band, is used only to pin the **counting** of inequivalent saddles,
since its quartic terms bias the fitted prefactor by ~10%.

---

## Summary of results

```
P1(a)  square lattice a; reciprocal G; BZ |kx|,|ky| ≤ G/2; Γ, X = (G/2,0), M = (G/2,G/2)
P1(b)  X: two states (0,0), (G,0) at E_G/4     M: four states at E_G/2
P1(c)  U = V1/2 on (±G,0),(0,±G);  V3/2 on (±G,±G);  (G,0) couples X; axes + diagonals couple M
P2(a)  H_X = [[ħ²((G/2+qx)²+qy²)/2m, V1/2], [V1/2, ħ²((−G/2+qx)²+qy²)/2m]];  V3 is off-resonant
P2(b)  E± = E_G/4 + (ħ²/2m)(qx²+qy²) ± sqrt((ħ²Gqx/2m)² + (V1/2)²);  gap = |V1|
P2(c)  m*_x = m|v1|/(|v1| ± 1),  m*_y = m;  X = minimum of E₊, saddle of E₋
       (signed v1 = V1/E_G — only |v1| enters; expansion valid for |qx| ≪ |v1|G/2, no bound on qy)
P2(d)  ∂E/∂qx = 0 at X, from the expansion and from E(G/2+x) = E(G/2−x)
P2(e)  contour: closed around Γ → necks at the four edge midpoints (= TWO inequivalent X on the
       torus) → hole pocket around M;  asymptote |qx| = sqrt(|v1|/(1−|v1|))|qy| (nearly parallel to
       the boundary);  no symmetry breaking
P3(a)  ν = sqrt(|mx my|)/(π ħ²) · Θ(E−E_c): a step, height sqrt(|mx my|)/(π ħ²)
P3(b)  per saddle: C = sqrt(|mx my|)/(π² ħ²), ν = C ln(E_cut/|E−E_c|);  dν/d ln|E−E_c| = −C;
       total for this band = 2C (two inequivalent X saddles)
P3(c)  a saddle adds a curve's worth of states (contour reconnects) → log; an extremum adds a
       compact neighbourhood → step
V1 = 0  gap closes, bands degenerate along the whole zone boundary, X is a kink, the log is gone;
       and with V3 ≠ 0 the potential 2V3cos Gx cos Gy gains the half-diagonal translations
       (a/2, ±a/2): cell a²/2, doubled zone, the square-zone degeneracy is a folding effect
```
