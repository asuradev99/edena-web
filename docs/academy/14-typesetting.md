# 14 · Typesetting mathematics

**Code:** `src/lib/mathtext.ts` — builders (`mi`, `mn`, `mo`, `mtext`, `row`, `frac`, `msup`, `msub`,
`subsup`, `sqrt`, `mroot`, `matrix`, `cases`, `integral`, `limit`, `abs`, `norm`, `vec`, `hat`, `bar`,
`dotAccent`, `prime`, `paren`, `brackets`, `tint`, `space`), plus `number`, `mathml`, `MATH_FONT_STACK`.

## Why functions instead of hand-written MathML

MathML Core has an arity rule: `msup`, `msub`, `msubsup`, `mfrac`, `mover`, `munder`, `mroot` and
`msqrt` take **exactly their operands as children**. A fragment like

```
<mo stretchy="true">(</mo><mi>x</mi><mo stretchy="true">)</mo>
```

is three top-level nodes. Used directly as the base of `msup`, Chrome does not raise the exponent — it
lays a second base beside the first, and `(x+h)²` printed as `(x+h)2`. Every builder that takes an
operand therefore routes it through an internal `one(fragment)`, which counts top-level roots and wraps
a multi-root fragment in `<mrow>`. A single element is returned byte-identical, so no published output
moved; a test asserts both halves.

`paren` and `brackets` are one element each (`<mrow>…</mrow>`), which is what makes them valid script
bases and lets `brackets(matrix(...))` hold a matrix.

## Accents

`mover` with `accent="true"` places a mark over its base, and the mark needs a `MATH` table to be sized
and positioned by the font. `vec`, `hat`, `bar` and `dotAccent` all go through one `accentOver`, so they
all group their base the same way — a bug class (an accent silently flattening a multi-root base) is
fixed once.

## Numbers

`number(value, decimals)`:

- emits `−` (U+2212) for a negative, never a hyphen;
- groups the integer part with a thin space (U+2009) in threes;
- falls back to a real `msup` exponent outside `1e-4 … 1e6`, or below the requested decimals.

`tickMath` and `formatTick` in `plot.ts` share the same "snap to zero" rule, so `-1.7e-16` never
appears on an axis.

## Faces

`MATH_FONT_STACK` lists every maths-table face before any prose face:

```
"STIX Two Math", "Cambria Math", "Latin Modern Math", "Noto Sans Math", "STIX Two Text", …
```

The order is load-bearing, not taste: only a font with an OpenType `MATH` table can stretch a
delimiter or place a limit, and a specified `font-family` on a `<math>` element beats an inherited one,
so the stack has to be stated *on* the `math` element for it to apply at all. A test asserts every
maths face precedes every prose face.

## Limits

- The builder set is what the pages need, not all of MathML.
- Caller-supplied fragments are not sanitised.
- Whether a delimiter stretches is the browser's decision, driven by the font and the content height;
  the library cannot force it.
