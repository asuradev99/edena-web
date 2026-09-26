# 22 · The difference quotient and the secant limit

**Code:** `src/lib/plot.ts` — `secantSlope(fn, a, b)`, `lineThrough(point, slope, x, width)`,
`functionCurve`.

## The definition, computed literally

```ts
export function secantSlope(fn, a, b) { return (fn(b) - fn(a)) / (b - a); }
```

That is the difference quotient. The derivative is its limit as `b → a`:

```
f′(a) = lim_{h→0} (f(a + h) − f(a)) / h
```

The lab writes the derivative out by hand (`cos x + 0.7x` for `sin x + 0.35x²`), draws it as a fixed
tangent, and then lets `h` fall. Nothing in the library differentiates symbolically, and there is no
automatic differentiation — the tangent is a fact the page supplies, which is why the panel can show
the approach instead of asserting it.

## Why the error is O(h)

By Taylor's theorem, `f(a+h) = f(a) + h f′(a) + h²f″(ξ)/2`, so

```
(f(a+h) − f(a))/h − f′(a) = h f″(ξ)/2 = O(h)
```

The chord slope is the *average* of `f′` over the interval, so the gap closes linearly: each factor of
ten in `h` removes about one digit. Unlike the quadrature chapter (order 2) or RK4 (order 4), this is a
first-order approximation — and it is the one the derivative is *defined* by, not an approximation to
something easier.

## The honest end of the slider

`(f(a+h) − f(a))` is a subtraction of two nearly equal numbers. Once `h` is small enough that the two
values agree to most of a double's significant digits, the quotient is dominated by round-off. The
slider runs from `h = 10^-0.4` to `10^-3.4`; the mathematics says "go to zero", the arithmetic says
"not past here". Saying so is the point of the last paragraph of the chapter.

## Where else this shape appears

- `limit(approach)` in `mathtext.ts` typesets the `lim` operator for exactly this statement.
- The basics tour's secant demo animates the same construction on a parabola, with the chord shrinking
  onto the tangent as the beats play.
- `derivative(y, x)` builds the `dy/dx` notation from `differential`.

## Limits

- `secantSlope` rejects `|b − a| < 1e-12` rather than returning an infinity, so a caller cannot
  accidentally divide by a denormal.
- `lineThrough` is infinite in extent only within the range it is given; the lab passes the plot domain,
  so the secant is clipped to the frame rather than the picture.
- No second derivative, no numerical differentiation of a sampled function, and no error estimate.
