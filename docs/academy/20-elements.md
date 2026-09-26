# 20 · Element appearance

**Code:** `src/lib/elements.ts` — `ElementAppearance`, `ELEMENTS`, `appearanceFor`.

## One table

```ts
type ElementAppearance = { radius: number; color: string };
export const ELEMENTS: Record<string, ElementAppearance> = { H: { radius: .31, color: '#f2f6ff' }, … };
export function appearanceFor(element: string): ElementAppearance {
  return ELEMENTS[element.trim()] ?? ELEMENTS[element.trim().replace(/^./, c => c.toUpperCase())] ?? FALLBACK;
}
```

Radius is a covalent radius in ångström; colour is the library's own palette. The lookup trims
whitespace and tries a capitalised form, so `'na'`, `' Na '` and `'Na'` all resolve, and anything
unknown returns the same neutral fallback — a structure with an unusual symbol still draws something
rather than vanishing.

## Why the colours are not the classic CPK values

The renderer is unlit: a sphere in one flat colour plus a wireframe. On a near-black background the
traditional dark-grey carbon disappears, so the palette here lifts the darks and pushes neighbouring
hues apart. The convention is kept where it is useful as an identity (hydrogen pale, oxygen red,
nitrogen blue, sulfur yellow, chlorine green) and relaxed where a print palette would fail on screen.

Because `visual.color` multiplies the geometry's own colours, a caller can tint a whole structure
without touching the table — pass `rgba('#ffffff')` for the table's colours unchanged, or a hue to
shift everything at once.

## Consistency with the lattice chapter

`lattice.ts` draws bonds between atoms that are within a species-dependent cut-off; the radii here are
what makes a bond meet the spheres rather than float between them. Radii are in ångström, the same unit
`parsePOSCAR` leaves the lattice in.

## Limits

- A static table, not the periodic table: only listed symbols are styled, everything else falls back.
- One radius per element, not per bond order or oxidation state.
- No isotope, charge or spin distinction.
- The table is deliberately small — adding an element is a one-line change, and the panel's
  `appearanceFor('Xx')` readout shows exactly what an unknown symbol gets.

## Try it

Academy chapter 20: four groups of elements drawn with their radii and colours, with the fallback
printed beside them.
