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
export const frac = (numerator: M, denominator: M): M => `<mfrac>${numerator}${denominator}</mfrac>`;
/** Superscript. Named `msup` to avoid colliding with other library exports. */
export const msup = (base: M, exponent: M): M => `<msup>${base}${exponent}</msup>`;
/** Subscript. */
export const msub = (base: M, index: M): M => `<msub>${base}${index}</msub>`;
/** Sub- and superscript together (integrals, sums, tensor indices). */
export const subsup = (base: M, below: M, above: M): M => `<msubsup>${base}${below}${above}</msubsup>`;
/** Radical with an implicit index. */
export const sqrt = (radicand: M): M => `<msqrt>${radicand}</msqrt>`;
/** Parenthesised row that grows with its content. */
export const paren = (inner: M): M => `<mo stretchy="true">(</mo>${inner}<mo stretchy="true">)</mo>`;
/** Vector arrow accent. */
export const vec = (base: M): M => `<mover accent="true">${base}<mo stretchy="true">→</mo></mover>`;
/** Unit-vector hat accent. */
export const hat = (base: M): M => `<mover accent="true">${base}<mo stretchy="true">^</mo></mover>`;
/** Overline (conjugates, means). */
export const bar = (base: M): M => `<mover accent="true">${base}<mo stretchy="true">¯</mo></mover>`;
/** Dot accent, written before the base so postfix derivatives read naturally. */
export const dotAccent = (base: M): M => `<mover accent="true">${base}<mo stretchy="true">˙</mo></mover>`;
/** A matrix/table of rows. */
export const matrix = (rows: M[][], options: { columnAlign?: 'left' | 'center' | 'right'; rowSpacing?: string } = {}): M =>
  `<mtable columnalign="${options.columnAlign ?? 'center'}" rowspacing="${options.rowSpacing ?? '.4em'}">${rows
    .map(cells => `<mtr>${cells.map(cell => `<mtd>${cell}</mtd>`).join('')}</mtr>`)
    .join('')}</mtable>`;
/** Cases: a value, then a condition. */
export const cases = (rows: [M, M][]): M =>
  `<mo stretchy="true">{</mo>${matrix(rows.map(([value, condition]) => [value, mtext('if ')] as M[]).map((row_, index) => [...row_, rows[index][1]]), { columnAlign: 'left', rowSpacing: '.5em' })}`;
/** Integral with bounds: ∫ from `lower` to `upper`. */
export const integral = (lower: M, upper: M): M => subsup(mo('∫'), lower, upper);
/** Summation with bounds. */
export const summation = (lower: M, upper: M): M => subsup(mo('∑'), lower, upper);
/** Invisible spacing (use for equation layout). */
export const space = (width = '.5em'): M => `<mspace width="${width}"/>`;
/** Wrap a fragment as a complete `<math>` element. */
export const mathml = (body: M, display: 'inline' | 'block' = 'inline'): M =>
  `<math xmlns="http://www.w3.org/1998/Math/MathML" display="${display}">${body}</math>`;

/** Differential, e.g. `d` + `x` set upright with a thin space. */
export const differential = (variable: M): M => row(mo('d'), variable);
/** A derivative dy/dx. */
export const derivative = (y: M, x: M): M => frac(differential(y), differential(x));
/** The radius unit vector r̂. */
export const radialHat = (r: string = 'r'): M => hat(mi(r));
