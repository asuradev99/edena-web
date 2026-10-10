/**
 * Tiny MathML builders.
 *
 * Native MathML renders in browsers without a network round-trip to a TeX service, and a
 * DOM overlay stays crisp and selectable at any device pixel ratio. These helpers only
 * assemble strings, so they work equally well in an `innerHTML` panel or in a label.
 *
 * Convention: every helper returns a MathML *fragment*; wrap the whole expression once
 * with {@link mathml}. Numbers and identifiers are escaped, so pass plain text.
 */
export type M = string;
/** Identifier — variables, function names, element symbols. */
export declare const mi: (name: string) => M;
/** Number. */
export declare const mn: (value: number | string) => M;
/** Operator or punctuation. */
export declare const mo: (symbol: string) => M;
/** Upright text, for words inside an expression. */
export declare const mtext: (text: string) => M;
/** Horizontal grouping. */
export declare const row: (...parts: M[]) => M;
/** Fraction with an automatic bar. */
export declare const frac: (numerator: M, denominator: M) => M;
/** Superscript. Named `msup` to avoid colliding with other library exports. */
export declare const msup: (base: M, exponent: M) => M;
/** Subscript. */
export declare const msub: (base: M, index: M) => M;
/** Sub- and superscript together (integrals, sums, tensor indices). */
export declare const subsup: (base: M, below: M, above: M) => M;
/** Radical with an implicit index. */
export declare const sqrt: (radicand: M) => M;
/**
 * Parenthesised row that grows with its content.
 *
 * The whole pair is wrapped in one `<mrow>`, so the fragment is a *single* MathML element. That
 * matters when `paren` is used as the base of an `msup`/`msub`: an element with more than two
 * children is not a scripted base, and Chrome silently flattens it — `msup(paren(x), 2)` printed
 * `(x)2` rather than `(x)²` until this wrapper was added.
 */
export declare const paren: (inner: M) => M;
/**
 * Square-bracketed group. Same one-element rule as `paren`; the brackets a matrix is read inside,
 * and the natural delimiter for a row of numbers or a column of conditions.
 */
export declare const brackets: (inner: M) => M;
/** Vector arrow accent. */
export declare const vec: (base: M) => M;
/** Unit-vector hat accent. */
export declare const hat: (base: M) => M;
/** Overline (conjugates, means). */
export declare const bar: (base: M) => M;
/** Dot accent, written before the base so postfix derivatives read naturally. */
export declare const dotAccent: (base: M) => M;
/** A matrix/table of rows. */
export declare const matrix: (rows: M[][], options?: {
    columnAlign?: "left" | "center" | "right";
    rowSpacing?: string;
}) => M;
/** Cases: a value, then a condition. */
export declare const cases: (rows: [M, M][]) => M;
/** Integral with bounds: ∫ from `lower` to `upper`. */
export declare const integral: (lower: M, upper: M) => M;
/** Summation with bounds. */
export declare const summation: (lower: M, upper: M) => M;
/** Invisible spacing (use for equation layout). */
export declare const space: (width?: string) => M;
/** Wrap a fragment as a complete `<math>` element. */
export declare const mathml: (body: M, display?: "inline" | "block") => M;
/**
 * The font stack to put on `math` elements (or any ancestor) for typeset maths.
 *
 * A font first in this stack is the one Chrome shapes MathML with, and only a font carrying an
 * OpenType `MATH` table can stretch a bracket, grow a radical or place a big operator's limits.
 * **STIX Two Text — the face the pages used to name first — is a prose font with no `MATH` table**,
 * so those constructs were being approximated from size variants.
 *
 * Every maths-table face therefore comes *before* every prose face: if a page cannot load STIX Two
 * Math (offline, a blocked CDN, a font-synthesis failure) the next family Chrome reaches must still
 * be able to lay out stretchy delimiters, and STIX Two Text cannot. Only after the last maths face
 * do the text faces appear, as glyph fallbacks for anything the maths faces lack. The list stays
 * long rather than clever because a browser takes the first family it can resolve and then falls
 * through glyph by glyph.
 */
export declare const MATH_FONT_STACK = "\"STIX Two Math\", \"Cambria Math\", \"Latin Modern Math\", \"Noto Sans Math\", \"STIX Two Text\", \"STIXGeneral\", \"DejaVu Serif\", serif";
/** The CSS a page needs for maths to look right, ready to paste into a stylesheet. */
export declare const MATH_CSS = "math{font-family:\"STIX Two Math\", \"Cambria Math\", \"Latin Modern Math\", \"Noto Sans Math\", \"STIX Two Text\", \"STIXGeneral\", \"DejaVu Serif\", serif;font-style:normal;font-size:1.06em;line-height:1.35}\nmath mtext,math mo,math mn{font-style:normal}\nmath .mt-times{font-family:\"STIX Two Math\", \"Cambria Math\", \"Latin Modern Math\", \"Noto Sans Math\", \"STIX Two Text\", \"STIXGeneral\", \"DejaVu Serif\", serif}\nmath[display=\"block\"]{display:block;margin:.6em 0}";
/**
 * Typeset a number the way mathematics prints one: a real minus sign (U+2212, not a hyphen),
 * grouped thousands, a fixed number of decimals, and scientific notation at the extremes.
 */
export declare function number(value: number, decimals?: number): M;
/** Differential, e.g. `d` + `x` set upright with a thin space. */
export declare const differential: (variable: M) => M;
/** A derivative dy/dx. */
export declare const derivative: (y: M, x: M) => M;
/** The radius unit vector r̂. */
export declare const radialHat: (r?: string) => M;
/** Radical with an explicit index, e.g. a cube root. */
export declare const mroot: (radicand: M, index: M) => M;
/** Absolute value, with stretchy bars. */
export declare const abs: (inner: M) => M;
/** Norm, with double stretchy bars. */
export declare const norm: (inner: M) => M;
/** A function name set upright: sin, lim, max. */
export declare const operator: (name: string) => M;
/** Product with bounds. */
export declare const product: (lower: M, upper: M) => M;
/** A limit: `lim` with the approach set underneath it. */
export declare const limit: (approach: M) => M;
/** Vertically stacked rows, for a limit that needs two lines or a pair of conditions. */
export declare const stacked: (...rows: M[]) => M;
/** A value with its evaluation bounds, as written after a definite integral: [F] from a to b. */
export declare const evaluated: (inner: M, lower: M, upper: M) => M;
/** Colour a subexpression, using MathML's own colour attribute (survives scaling and printing). */
export declare const tint: (inner: M, colour: string) => M;
/** A prime, as in f′. */
export declare const prime: (base: M) => M;
/** Any accent above a base. */
export declare function mover(base: M, accent: M): M;
/** Any mark under a base, e.g. an underbrace bound. */
export declare function munder(base: M, mark: M): M;
