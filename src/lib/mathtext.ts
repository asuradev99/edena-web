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

const escape = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Declare that a fragment is a single MathML element, wrapping it in an `<mrow>` only when it is
 * not. Everything a page writes as one *operand* — the base of a script, each side of a fraction —
 * has to be one child: an element with more than its allotted number of children loses its place,
 * and Chrome then renders a superscript on the baseline instead of raised. Fragments built by
 * joining several elements (that is what `paren` used to be) are therefore grouped here. Single
 * elements, including self-closing ones, come back byte-identical, so the common case costs nothing
 * and the published string output does not change.
 */
const one = (fragment: M): M => {
  let depth = 0, roots = 0;
  const tags = /<(\/?)([a-z][\w-]*)[^>]*?(\/?)>/g;
  let match: RegExpExecArray | null;
  while ((match = tags.exec(fragment))) {
    const closing = match[1] === '/', selfClosing = match[3] === '/';
    if (!closing && depth === 0 && ++roots > 1) return `<mrow>${fragment}</mrow>`;
    if (selfClosing) continue;
    if (closing) depth--;
    else depth++;
  }
  // No tags at all is a bare text node, which is itself a valid single operand.
  return roots === 0 || (roots === 1 && depth === 0) ? fragment : `<mrow>${fragment}</mrow>`;
};

/** Identifier — variables, function names, element symbols. */
export const mi = (name: string): M => `<mi>${escape(name)}</mi>`;
/** Number. */
export const mn = (value: number | string): M => `<mn>${escape(String(value))}</mn>`;
/** Operator or punctuation. */
export const mo = (symbol: string): M => `<mo>${escape(symbol)}</mo>`;
/** Upright text, for words inside an expression. */
export const mtext = (text: string): M => `<mtext>${escape(text)}</mtext>`;
/** Horizontal grouping. */
export const row = (...parts: M[]): M => `<mrow>${parts.join('')}</mrow>`;
/** Fraction with an automatic bar. */
export const frac = (numerator: M, denominator: M): M => `<mfrac>${one(numerator)}${one(denominator)}</mfrac>`;
/** Superscript. Named `msup` to avoid colliding with other library exports. */
export const msup = (base: M, exponent: M): M => `<msup>${one(base)}${one(exponent)}</msup>`;
/** Subscript. */
export const msub = (base: M, index: M): M => `<msub>${one(base)}${one(index)}</msub>`;
/** Sub- and superscript together (integrals, sums, tensor indices). */
export const subsup = (base: M, below: M, above: M): M => `<msubsup>${one(base)}${one(below)}${one(above)}</msubsup>`;
/** Radical with an implicit index. */
export const sqrt = (radicand: M): M => `<msqrt>${one(radicand)}</msqrt>`;
/**
 * Parenthesised row that grows with its content.
 *
 * The whole pair is wrapped in one `<mrow>`, so the fragment is a *single* MathML element. That
 * matters when `paren` is used as the base of an `msup`/`msub`: an element with more than two
 * children is not a scripted base, and Chrome silently flattens it — `msup(paren(x), 2)` printed
 * `(x)2` rather than `(x)²` until this wrapper was added.
 */
export const paren = (inner: M): M => `<mrow><mo stretchy="true">(</mo>${inner}<mo stretchy="true">)</mo></mrow>`;
/**
 * Square-bracketed group. Same one-element rule as `paren`; the brackets a matrix is read inside,
 * and the natural delimiter for a row of numbers or a column of conditions.
 */
export const brackets = (inner: M): M => `<mrow><mo stretchy="true">[</mo>${inner}<mo stretchy="true">]</mo></mrow>`;
/**
 * One accent over one operand. Private, because `vec`/`hat`/`bar`/`dotAccent` differ only in the
 * mark: each used to splice its base straight into the `<mover>`, so a multi-root fragment (a
 * bracketed sum, say) became extra children and Chrome dropped the accent. `one` is what keeps the
 * base a single child. `mover` below is the public escape hatch for any other accent.
 */
const accentOver = (base: M, mark: string): M => `<mover accent="true">${one(base)}<mo stretchy="true">${mark}</mo></mover>`;
/** Vector arrow accent. */
export const vec = (base: M): M => accentOver(base, '\u2192');
/** Unit-vector hat accent. */
export const hat = (base: M): M => accentOver(base, '^');
/** Overline (conjugates, means). */
export const bar = (base: M): M => accentOver(base, '\u00af');
/** Dot accent, written before the base so postfix derivatives read naturally. */
export const dotAccent = (base: M): M => accentOver(base, '\u02d9');
/** A matrix/table of rows. */
export const matrix = (rows: M[][], options: { columnAlign?: 'left' | 'center' | 'right'; rowSpacing?: string } = {}): M =>
  `<mtable columnalign="${options.columnAlign ?? 'center'}" rowspacing="${options.rowSpacing ?? '.4em'}">${rows
    .map(cells => `<mtr>${cells.map(cell => `<mtd>${cell}</mtd>`).join('')}</mtr>`)
    .join('')}</mtable>`;
/** Cases: a value, then a condition. */
export const cases = (rows: [M, M][]): M =>
  `<mrow><mo stretchy="true">{</mo>${matrix(rows.map(([value, condition]) => [value, mtext('if ')] as M[]).map((row_, index) => [...row_, rows[index][1]]), { columnAlign: 'left', rowSpacing: '.5em' })}</mrow>`;
/** Integral with bounds: ∫ from `lower` to `upper`. */
export const integral = (lower: M, upper: M): M => subsup(mo('∫'), lower, upper);
/** Summation with bounds. */
export const summation = (lower: M, upper: M): M => subsup(mo('∑'), lower, upper);
/** Invisible spacing (use for equation layout). */
export const space = (width = '.5em'): M => `<mspace width="${width}"/>`;
/** Wrap a fragment as a complete `<math>` element. */
export const mathml = (body: M, display: 'inline' | 'block' = 'inline'): M =>
  `<math xmlns="http://www.w3.org/1998/Math/MathML" display="${display}">${body}</math>`;

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
export const MATH_FONT_STACK =
  '"STIX Two Math", "Cambria Math", "Latin Modern Math", "Noto Sans Math", "STIX Two Text", "STIXGeneral", "DejaVu Serif", serif';

/** The CSS a page needs for maths to look right, ready to paste into a stylesheet. */
export const MATH_CSS = `math{font-family:${MATH_FONT_STACK};font-style:normal;font-size:1.06em;line-height:1.35}
math mtext,math mo,math mn{font-style:normal}
math mi{font-style:italic}
math .mt-times{font-family:${MATH_FONT_STACK}}
math[display="block"]{display:block;margin:.6em 0}`;

/**
 * Typeset a number the way mathematics prints one: a real minus sign (U+2212, not a hyphen),
 * grouped thousands, a fixed number of decimals, and scientific notation at the extremes.
 */
export function number(value: number, decimals = 2): M {
  if (!Number.isFinite(value)) throw new Error('Number must be finite');
  const sign = value < 0 ? mo('\u2212') : '';
  const size = Math.abs(value);
  if (size !== 0 && (size >= 1e5 || size < 1e-3)) {
    const exponent = Math.floor(Math.log10(size));
    const mantissa = size / 10 ** exponent;
    // At least one decimal on the mantissa: 1234567 at zero decimals should read 1.2 × 10⁶, not 1 × 10⁶.
    return row(sign, mn(mantissa.toFixed(Math.min(3, Math.max(1, decimals)))), mo('\u00d7'), msup(mn('10'), mn(exponent)));
  }
  const fixed = size.toFixed(decimals);
  const [whole, fraction] = fixed.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009');
  return row(sign, mn(fraction ? `${grouped}.${fraction}` : grouped));
}

/** Differential, e.g. `d` + `x` set upright with a thin space. */
export const differential = (variable: M): M => row(mo('d'), variable);
/** A derivative dy/dx. */
export const derivative = (y: M, x: M): M => frac(differential(y), differential(x));
/** The radius unit vector r̂. */
export const radialHat = (r: string = 'r'): M => hat(mi(r));

/** Radical with an explicit index, e.g. a cube root. */
export const mroot = (radicand: M, index: M): M => `<mroot>${one(radicand)}${one(index)}</mroot>`;
/** Absolute value, with stretchy bars. */
export const abs = (inner: M): M => row(mo('|'), inner, mo('|'));
/** Norm, with double stretchy bars. */
export const norm = (inner: M): M => row(mo('\u2016'), inner, mo('\u2016'));
/** A function name set upright: sin, lim, max. */
export const operator = (name: string): M => `<mo lspace="0.16em" rspace="0.16em">${escape(name)}</mo>`;
/** Product with bounds. */
export const product = (lower: M, upper: M): M => subsup(mo('\u220f'), lower, upper);
/** A limit: `lim` with the approach set underneath it. */
export const limit = (approach: M): M => munder(operator('lim'), approach);
/** Vertically stacked rows, for a limit that needs two lines or a pair of conditions. */
export const stacked = (...rows: M[]): M => matrix(rows.map(value => [value]), { rowSpacing: '.15em' });
/** A value with its evaluation bounds, as written after a definite integral: [F] from a to b. */
export const evaluated = (inner: M, lower: M, upper: M): M =>
  row(`<mo stretchy="true">[</mo>`, inner, `<mo stretchy="true">]</mo>`, subsup(mo(''), lower, upper));
/** Colour a subexpression, using MathML's own colour attribute (survives scaling and printing). */
export const tint = (inner: M, colour: string): M => `<mstyle mathcolor="${escape(colour)}">${inner}</mstyle>`;
/** A prime, as in f′. */
export const prime = (base: M): M => mover(base, mo('\u2032'));
/** Any accent above a base. */
export function mover(base: M, accent: M): M {
  return `<mover accent="true">${one(base)}${one(accent)}</mover>`;
}
/** Any mark under a base, e.g. an underbrace bound. */
export function munder(base: M, mark: M): M {
  return `<munder>${one(base)}${one(mark)}</munder>`;
}
