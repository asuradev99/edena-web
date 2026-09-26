# 21 · Area under a curve, and the quadrature rule it really is

**Code:** `src/lib/plot.ts` — `areaUnder(fn, x, { baseline, samples })`, plus `plotFrame` for the axes
and `functionCurve` for the outline.

## The picture is the rule

`areaUnder` walks the range in `samples` equal intervals and emits one quad per interval:

```ts
for (let index = 1; index <= samples; index++) {
  const left = at(index - 1), right = at(index);
  const highLeft = fn(left), highRight = fn(right);
  // bottomLeft, topLeft, topRight   and   bottomLeft, topRight, bottomRight
}
```

Two triangles whose top edge runs from `(left, f(left))` to `(right, f(right))` — a **trapezoid**. So
the shaded area is the trapezoid sum

```
T_n = Σ (f(x_i) + f(x_{i+1}))/2 · Δx
```

and the error the panel prints is the difference between that sum and the closed form, not an estimate
of an estimate.

## What the error should do

For a twice-differentiable `f` the composite trapezoid rule satisfies

```
|T_n − ∫ f| ≤ (b − a)³ / (12 n²) · max |f″|
```

so halving `Δx` quarters the error — second order, visible as a factor of four per doubling in the
readout. That is the empirical way to *measure* an order, and the same trick as the integrator chapter:
compare successive errors and take `log2(ratio)`.

## Why √x is in the table

`√x` on `[0, 1]` has an infinite slope at the left endpoint, so `f″` is unbounded and the second-order
bound does not apply. Its error falls like `n^-1.5`. Including it is deliberate: a table of smooth
functions only would let a reader conclude that "this method is always second order", which is false.

## Limits

- Trapezoid only; there is no Simpson, Romberg or adaptive refinement to choose from.
- Uniform sampling: a feature narrower than one interval is integrated wrongly with no warning, and the
  geometry cannot show the error because it draws exactly the samples it evaluated.
- `samples` is the number of *intervals* (`samples + 1` evaluations), and the geometry guard only
  requires `samples ≥ 2`.
- `baseline` may be a number or a function of `x`, which is what makes an area between two curves
  possible; a strip touching a non-finite sample is skipped, leaving a gap in the fill.
