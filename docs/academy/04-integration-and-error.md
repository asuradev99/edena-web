# 04 · Integration and error budgets

Live lab: [`academy.html#ch-integration`](../../academy.html#ch-integration) ·
model: [`decaySolution`, `observedOrder`, `finalAbsoluteError`](../../src/examples/academy-model.ts) ·
library: [`src/lib/simulation.ts`](../../src/lib/simulation.ts)

## What the code does

The lab integrates `y′ = −y`, `y(0) = 1`, whose exact solution is `e^{−t}`, over `t ∈ [0, 2]` with
two methods:

- **Euler** — `y ← y + dt · f(y)`, one evaluation per step. This is the scheme inside
  `stepParticles`, where it appears in its *semi-implicit* form: the velocity is updated first and
  the position then uses the new velocity.
- **RK4** — the classical fourth-order Runge–Kutta stage average, four evaluations per step.

`decaySolution(rate, stepSize, steps, method)` returns the numeric series and the exact series
sampled at the same times, so the error at the end is a subtraction, not an estimate.

## What is exact

The endpoint error `|y(T) − e^{−T}|` for each run is exactly what the arithmetic produces; the lab
prints it in scientific notation. The *order* is the interesting quantity, and it is estimated by
halving the step:

```
p ≈ log₂( e(dt) / e(dt/2) )
```

Halving the step means doubling the number of steps, so this compares equal-length integrations.
Measured with the model over `[0, 2]`:

| `dt` | Euler error | RK4 error |
|------|-------------|-----------|
| 0.5    | 7.28 × 10⁻² | 2.15 × 10⁻⁴ |
| 0.25   | 3.52 × 10⁻² | 1.09 × 10⁻⁵ |
| 0.125  | 1.73 × 10⁻² | 6.11 × 10⁻⁷ |
| 0.0625 | 8.55 × 10⁻³ | 3.63 × 10⁻⁸ |

The successive ratios give Euler ≈ 1.03 and RK4 ≈ 4.15: one order for Euler, four for RK4, exactly
as the truncation-error analysis says. The test asserts Euler's observed order is in `[0.8, 1.4]`
and RK4's in `[3.5, 4.6]`, so a one-step-size sanity check cannot pass a broken integrator.

## What is approximate

- The observed order is an **estimate from two runs**, not a proof. It is also *asymptotic*: at
  large `dt` the leading term has not taken over, and the estimate is biased.
- At `dt = 0.00625` the RK4 error is around 10⁻¹¹ and the float64 round-off of the arithmetic is
  comparable, so the estimate becomes noisy and eventually meaningless. The lab's smallest options
  are kept deliberately coarse enough that the trend is still visible.
- The local truncation error is `O(dt²)` for Euler and `O(dt⁵)` per step; only the *global* order
  (one less) is what the ratio measures.

## Limits

- RK4 costs four evaluations per step. Accuracy is not free, and for a real-time page the right
  method depends on the frame budget, not on the order alone.
- Neither method has adaptive step control here. `stepParticles` takes a fixed `dt`, and it is the
  caller's job to choose it and to keep the frame delta finite (the pages clamp it).
- The global error is not the same as visual error: a phase error in an oscillation can look fine
  while a conserved quantity has drifted.

## Where to look

- [`src/examples/academy-model.ts`](../../src/examples/academy-model.ts) — `decaySolution`, `rk4`,
  `finalAbsoluteError`, `observedOrder`.
- [`src/lib/simulation.ts`](../../src/lib/simulation.ts) — `stepParticles`, `ParticleSimulation`.
- [`tests/academy.test.mjs`](../../tests/academy.test.mjs) — the order assertions.
