# 12 · Streamlines: RK4 with arc-length steps

**Code:** `src/lib/vectorfield.ts` (`VectorField`, `streamline`, `streamlines`, `sphereSeeds`).

## The equation actually solved

A field line of `v(x)` satisfies `dx/dt = v(x)`. For drawing we want the *shape*, not the timing, so
the library integrates the normalised field:

```
dx/ds = v̂(x) = v(x) / |v(x)|
```

`step` is therefore an **arc length**: every step advances the same distance across the picture, so
lines do not bunch up where the field is strong. This is a deliberate change from a time-parameterised
ODE and it is why a slow region is not over-sampled.

## RK4, normalised at each stage

Each step evaluates the direction four times and takes the classical weighted average:

```
k1 = v̂(x)                x2 = x + (h/2)k1
k2 = v̂(x2)               x3 = x + (h/2)k2
k3 = v̂(x3)               x4 = x + h·k3
k4 = v̂(x4)
x' = x + (h/6)(k1 + 2k2 + 2k3 + k4)
```

The local truncation error is `O(h⁵)` and the global error `O(h⁴)` *for a smooth unit field*. Note the
honest caveat: because each stage is renormalised, the integrator solves the unit-speed equation, so
the error bound applies to that normalised system, not to the raw field. Non-finite samples end the
line instead of poisoning the rest of it.

## When a line stops

`streamline` stops on any of:

- `|v| < minStrength` — a **stagnation point**, where the direction is undefined. The default is `1e-6`.
- the point leaves `bounds`;
- a caller-supplied `stop(point, strength)` returns true;
- `steps` or `maxLength` is reached;
- a non-finite sample.

`streamlines` then drops any trace shorter than `minPoints` (default 3), which is why a seed sitting
exactly on a stagnation point disappears rather than appearing as a dot. `both: true` integrates in
both directions from each seed and joins them.

## Seeding

`sphereSeeds(count, radius)` lays points on a sphere by the golden-angle spiral
(`y = 1 − 2(i+½)/n`, `φ = i·π(3−√5)`), which spreads directions evenly without a pole cluster.
Uniform random seeding would leave visibly uneven gaps.

## Limits

- No adaptive step and no error estimate: the tolerance is a step size *you* choose, not a bound the
  code guarantees.
- Lines are independent, so nothing stops two of them from overlapping; there is no density
  equalisation.
- The field is sampled per integration stage, so an expensive `v` is the cost centre.
- This RK4 is the **field-line tracer**. It is not the particle library's integrator:
  `src/lib/simulation.ts` uses a semi-implicit Euler step chosen for stability at fixed `dt`, and the
  GPU core in `particles.ts` does the same on the GPU.

## Try it

Academy chapter 12: a swirling field with a stagnation point, a step-size slider, and a marker walking
the first surviving line so the arc-length step is visible.
