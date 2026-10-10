/**
 * LaTeX → MathML.
 *
 * Pages write mathematics the way it is written everywhere else — `\frac{a}{b}`, `\sqrt{x^2+1}`,
 * `\sum_{i=1}^n`, `\begin{pmatrix}` — and this module turns that source into the same native MathML
 * that {@link ./mathtext} builds by hand. Nothing is fetched: no TeX service, no MathJax, no font
 * work, and the result lays out with the page's own maths fonts and stays selectable text.
 *
 * A *practical* subset, deliberately: fractions, radicals with and without an index, scripts of any
 * depth, `\left…\right` delimiters, the standard symbol tables (operators, relations, arrows, greek),
 * function names, accents, `\text{}`, `\operatorname{}`, letter styles (`\mathbb`, `\mathbf`,
 * `\mathcal`, `\mathrm`, …) and the matrix / cases / aligned environments. What is *not* here is the
 * macro machinery — `\newcommand`, `\def`, packages, TikZ — because that is a typesetting system
 * rather than a notation. An unknown command degrades to upright text, or throws under `strict`.
 *
 * Convention: `latex()` returns a complete `<math>` element ready for `innerHTML`;
 * {@link latexFragment} returns the bare fragment, for a caller assembling a larger expression with
 * the `mathtext` builders.
 */
import { type M } from './mathtext.js';
export type LatexOptions = {
    /** `block` puts the expression on its own centred lines; `inline` sits in the text flow. */
    display?: 'inline' | 'block';
    /** Throw on an unknown command instead of typesetting its name as upright text. */
    strict?: boolean;
};
/** Parse `source` into a MathML fragment, for use inside a `mathtext` expression. */
export declare function latexFragment(source: string, options?: LatexOptions): M;
/** Parse `source` into a complete `<math>` element, ready for `innerHTML`. */
export declare function latex(source: string, options?: LatexOptions): M;
/** The commands a source used that this subset does not know — for a page that wants to warn. */
export declare function latexUnknownCommands(source: string, options?: LatexOptions): string[];
/** True when every command in `source` is understood. */
export declare function latexIsSupported(source: string): boolean;
