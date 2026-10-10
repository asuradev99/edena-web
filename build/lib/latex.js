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
import { mn, mo, mtext, row, frac, msup, msub, subsup, sqrt, mroot, matrix, mover, munder, operator, space, mathml, } from './mathtext.js';
const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const mrow = (parts) => `<mrow>${parts.join('')}</mrow>`;
/** Upright/bold/script text, spelled the way MathML Core allows it to be spelled. */
const styled = (body, css) => {
    // CSS font-style alone does not cancel MathML's Unicode math-auto transform.
    if (css.includes('font-style:normal'))
        body = body.replaceAll('<mi>', '<mi mathvariant="normal">');
    return `<mstyle style="${css}">${body}</mstyle>`;
};
// ---------------------------------------------------------------------------------------------
// Symbol tables
// ---------------------------------------------------------------------------------------------
/** Greek: LaTeX sets lower case italic and capitals upright. */
const GREEK = {
    alpha: ['α', false], beta: ['β', false], gamma: ['γ', false], delta: ['δ', false],
    epsilon: ['ϵ', false], varepsilon: ['ε', false], zeta: ['ζ', false], eta: ['η', false],
    theta: ['θ', false], vartheta: ['ϑ', false], iota: ['ι', false], kappa: ['κ', false],
    lambda: ['λ', false], mu: ['μ', false], nu: ['ν', false], xi: ['ξ', false],
    pi: ['π', false], varpi: ['ϖ', false], rho: ['ρ', false], varrho: ['ϱ', false],
    sigma: ['σ', false], varsigma: ['ς', false], tau: ['τ', false], upsilon: ['υ', false],
    phi: ['ϕ', false], varphi: ['φ', false], chi: ['χ', false], psi: ['ψ', false], omega: ['ω', false],
    Gamma: ['Γ', true], Delta: ['Δ', true], Theta: ['Θ', true], Lambda: ['Λ', true],
    Xi: ['Ξ', true], Pi: ['Π', true], Sigma: ['Σ', true], Upsilon: ['Υ', true],
    Phi: ['Φ', true], Psi: ['Ψ', true], Omega: ['Ω', true],
};
/** Operators, relations, arrows and the other characters a maths font expects. */
const SYMBOLS = {
    pm: '±', mp: '∓', times: '×', div: '÷', cdot: '⋅', ast: '∗', star: '⋆', circ: '∘', bullet: '∙',
    le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠', equiv: '≡', approx: '≈', sim: '∼',
    simeq: '≃', cong: '≅', propto: '∝', ll: '≪', gg: '≫', perp: '⊥', parallel: '∥', mid: '∣',
    in: '∈', notin: '∉', ni: '∋', subset: '⊂', subseteq: '⊆', supset: '⊃', supseteq: '⊇',
    cup: '∪', cap: '∩', setminus: '∖', emptyset: '∅', varnothing: '∅',
    forall: '∀', exists: '∃', nexists: '∄', neg: '¬', land: '∧', lor: '∨', implies: '⟹', iff: '⟺',
    to: '→', rightarrow: '→', leftarrow: '←', leftrightarrow: '↔', Rightarrow: '⇒', Leftarrow: '⇐',
    Leftrightarrow: '⇔', mapsto: '↦', uparrow: '↑', downarrow: '↓', hookrightarrow: '↪', longrightarrow: '⟶',
    infty: '∞', partial: '∂', nabla: '∇', ell: 'ℓ', hbar: 'ℏ', imath: 'ı', jmath: 'ȷ',
    dots: '…', ldots: '…', cdots: '⋯', vdots: '⋮', ddots: '⋱', prime: '′',
    angle: '∠', triangle: '△', square: '□', diamond: '◇', dagger: '†', ddagger: '‡',
    aleph: 'ℵ', wp: '℘', Re: 'ℜ', Im: 'ℑ', top: '⊤', bot: '⊥', vdash: '⊢', models: '⊨',
    langle: '⟨', rangle: '⟩', lceil: '⌈', rceil: '⌉', lfloor: '⌊', rfloor: '⌋',
};
/** Large operators; MathML moves their bounds above/below on its own in display style. */
const BIG = {
    sum: '∑', prod: '∏', coprod: '∐', int: '∫', oint: '∮', iint: '∬', iiint: '∭',
    bigcup: '⋃', bigcap: '⋂', bigoplus: '⨁', bigotimes: '⨂', bigwedge: '⋀', bigvee: '⋁',
};
/** Function names, set upright with the spacing a function name wants. */
const FUNCTIONS = new Set([
    'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan',
    'sinh', 'cosh', 'tanh', 'coth', 'log', 'ln', 'lg', 'exp', 'det', 'dim', 'ker', 'deg',
    'gcd', 'hom', 'arg', 'Pr', 'sup', 'inf', 'min', 'max', 'lim', 'limsup', 'liminf', 'tr', 'rank',
]);
/** Accents drawn over or under the next operand. */
const ACCENTS = {
    vec: ['→', 'over'], hat: ['^', 'over'], widehat: ['^', 'over'], bar: ['¯', 'over'],
    overline: ['¯', 'over'], tilde: ['~', 'over'], widetilde: ['~', 'over'], dot: ['˙', 'over'],
    ddot: ['¨', 'over'], acute: ['´', 'over'], grave: ['`', 'over'], check: ['ˇ', 'over'],
    breve: ['˘', 'over'], underline: ['_', 'under'], underbrace: ['⏟', 'under'], overbrace: ['⏞', 'over'],
};
/** Double-struck letters, for the number systems a physics page keeps quoting. */
const DOUBLE_STRUCK = {
    C: 'ℂ', H: 'ℍ', N: 'ℕ', P: 'ℙ', Q: 'ℚ', R: 'ℝ', Z: 'ℤ',
    A: '𝔸', B: '𝔹', D: '𝔻', E: '𝔼', F: '𝔽', G: '𝔾', I: '𝕀', J: '𝕁', K: '𝕂', L: '𝕃', M: '𝕄',
    O: '𝕆', S: '𝕊', T: '𝕋', U: '𝕌', V: '𝕍', W: '𝕎', X: '𝕏', Y: '𝕐',
};
/** `\mathcal`, where Unicode carries the script alphabet. */
const SCRIPT = {
    A: '𝒜', B: 'ℬ', C: '𝒞', D: '𝒟', E: 'ℰ', F: 'ℱ', G: '𝒢', H: 'ℋ', I: 'ℐ', J: '𝒥', K: '𝒦',
    L: 'ℒ', M: 'ℳ', N: '𝒩', O: '𝒪', P: '𝒫', Q: '𝒬', R: 'ℛ', S: '𝒮', T: '𝒯', U: '𝒰', V: '𝒱',
    W: '𝒲', X: '𝒳', Y: '𝒴', Z: '𝒵',
};
/** What `\left`/`\right`/`\big` understand as a delimiter. */
const DELIMITERS = {
    '(': '(', ')': ')', '[': '[', ']': ']', '{': '{', '}': '}', '|': '|', '.': '',
    '\\{': '{', '\\}': '}', '\\|': '‖', '\\langle': '⟨', '\\rangle': '⟩',
    '\\lceil': '⌈', '\\rceil': '⌉', '\\lfloor': '⌊', '\\rfloor': '⌋', '\\vert': '|', '\\Vert': '‖',
};
/** Named horizontal spacing. */
const SPACING = {
    ',': '.167em', ':': '.222em', ';': '.278em', '!': '-.167em', ' ': '.333em',
    quad: '1em', qquad: '2em', thinspace: '.167em', medspace: '.222em', thickspace: '.278em', enspace: '.5em',
};
const rest = (state) => state.src.slice(state.at);
const startsWith = (state, text) => state.src.startsWith(text, state.at);
/** Read one token and advance: a `\command`, a `\x` escape, or a single character. */
function readToken(state) {
    const point = state.src.codePointAt(state.at);
    const ch = point === undefined ? undefined : String.fromCodePoint(point);
    if (ch === undefined)
        return '';
    if (ch === '\\') {
        const match = /^\\([A-Za-z]+|.)/.exec(rest(state));
        if (!match) {
            state.at += 1;
            return '\\';
        }
        state.at += match[0].length;
        return match[0];
    }
    state.at += ch.length;
    return ch;
}
/** Read a balanced `{…}` group and return its raw contents (commands left as written). */
function readGroup(state) {
    if (state.src[state.at] !== '{')
        return '';
    state.at++;
    let depth = 1, out = '';
    while (state.at < state.src.length) {
        const ch = state.src[state.at];
        if (ch === '\\') {
            const token = readToken(state);
            out += token;
            continue;
        }
        if (ch === '{')
            depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) {
                state.at++;
                break;
            }
        }
        out += ch;
        state.at++;
    }
    return out;
}
/** Run `work` over `source` as a fresh input, then restore the reader. Keeps one `unknown` list. */
function inSource(state, source, work) {
    const src = state.src, at = state.at;
    state.src = source;
    state.at = 0;
    const result = work();
    state.src = src;
    state.at = at;
    return result;
}
/** Parse an expression from a raw source string against the current reader's options. */
const parseSource = (state, source) => inSource(state, source, () => parseExpression(state));
/** One mandatory argument: a brace group, or the single token that follows, parsed as an expression. */
function argument(state) {
    while (state.src[state.at] === ' ')
        state.at++;
    if (state.src[state.at] === '{')
        return parseSource(state, readGroup(state));
    const token = readToken(state);
    return token.startsWith('\\') ? command(state, token) : plainAtom(state, token);
}
/** A digit run, one letter, or one character — no scripts. */
function plainAtom(state, token) {
    if (/[0-9.]/.test(token)) {
        let digits = token;
        while (state.at < state.src.length && /[0-9.]/.test(state.src[state.at])) {
            digits += state.src[state.at];
            state.at++;
        }
        return mn(digits);
    }
    if (/^\p{L}$/u.test(token))
        return `<mi>${escape(token)}</mi>`;
    if (token === '-')
        return mo('−');
    if (token === '*')
        return mo('∗');
    if (token === "'")
        return mo('′');
    return mo(token);
}
/** Attach `^`, `_` and primes — in any order, any number of times — to a base. */
function scripts(state, base) {
    let above, below;
    for (;;) {
        while (state.src[state.at] === ' ')
            state.at++;
        const ch = state.src[state.at];
        if (ch === '^' || ch === '_') {
            state.at++;
            const value = argument(state);
            if (ch === '^')
                above = above === undefined ? value : above + value;
            else
                below = below === undefined ? value : below + value;
            continue;
        }
        if (ch === "'") {
            let marks = 0;
            while (state.src[state.at] === "'") {
                marks++;
                state.at++;
            }
            const value = mo('′'.repeat(marks));
            above = above === undefined ? value : above + value;
            continue;
        }
        break;
    }
    if (above !== undefined && below !== undefined)
        return subsup(base, below, above);
    if (above !== undefined)
        return msup(base, above);
    if (below !== undefined)
        return msub(base, below);
    return base;
}
/** One atom with its scripts: the unit every list is built from. */
function nextAtom(state) {
    const ch = state.src[state.at];
    if (ch === undefined)
        return mtext('');
    if (ch === '\\')
        return scripts(state, command(state, readToken(state)));
    if (ch === '{')
        return scripts(state, group(state));
    if (ch === '}' || ch === '&' || startsWith(state, '\\\\'))
        return mtext('');
    const token = readToken(state);
    return scripts(state, plainAtom(state, token));
}
/**
 * Parse a list until `}`, the end of the source, or an environment separator. Whitespace is skipped:
 * LaTeX typesets no space for it in maths mode (spacing is asked for explicitly, with `\,` and
 * friends), and a stray `&` or `\\` is left for the environment that owns it.
 */
function parseExpression(state) {
    const parts = [];
    for (;;) {
        while (state.src[state.at] === ' ')
            state.at++;
        if (state.at >= state.src.length)
            break;
        const ch = state.src[state.at];
        if (ch === '}' || ch === '&' || startsWith(state, '\\\\'))
            break;
        if (ch === '{') {
            parts.push(scripts(state, group(state)));
            continue;
        }
        parts.push(nextAtom(state));
    }
    return row(...parts);
}
/** A group used as one operand. `parseExpression` already returns one `<mrow>`, which is what an
 * operand has to be, so this only has to read the braces. */
function group(state) {
    return parseSource(state, readGroup(state));
}
// ---------------------------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------------------------
/** Everything a backslash command can mean. */
function command(state, token) {
    const name = token.slice(1);
    const greek = GREEK[name];
    if (greek)
        return greek[1] ? styled(`<mi>${escape(greek[0])}</mi>`, 'font-style:normal') : `<mi>${escape(greek[0])}</mi>`;
    const symbol = SYMBOLS[name];
    if (symbol)
        return mo(symbol);
    const big = BIG[name];
    if (big)
        return mo(big);
    if (FUNCTIONS.has(name))
        return operator(name);
    if (name === 'frac' || name === 'dfrac' || name === 'tfrac')
        return frac(argument(state), argument(state));
    if (name === 'sqrt') {
        let index;
        const save = state.at;
        while (state.src[state.at] === ' ')
            state.at++;
        if (state.src[state.at] === '[') {
            state.at++;
            let depth = 1, out = '';
            while (state.at < state.src.length) {
                const ch = state.src[state.at];
                if (ch === '[')
                    depth++;
                else if (ch === ']') {
                    depth--;
                    if (depth === 0) {
                        state.at++;
                        break;
                    }
                }
                out += ch;
                state.at++;
            }
            index = parseSource(state, out);
        }
        else
            state.at = save;
        const radicand = argument(state);
        return index === undefined ? sqrt(radicand) : mroot(radicand, index);
    }
    if (name === 'left') {
        // Scan forward to the matching \right, letting nextAtom consume whole groups on the way.
        const open = delimiter(readDelimiterToken(state));
        const parts = [];
        for (;;) {
            while (state.src[state.at] === ' ')
                state.at++;
            if (state.at >= state.src.length || startsWith(state, '\\right') || state.src[state.at] === '}')
                break;
            parts.push(nextAtom(state));
        }
        let close = '<mo></mo>';
        if (startsWith(state, '\\right')) {
            state.at += '\\right'.length;
            close = delimiter(readDelimiterToken(state));
        }
        return mrow([open, row(...parts), close]);
    }
    if (/^[bB]ig(g|l|r|m)?$/.test(name) || /^[bB]igg[glrm]?$/.test(name)) {
        return `<mo minsize="1.2em" maxsize="1.2em">${escape(DELIMITERS[readDelimiterToken(state)] ?? '')}</mo>`;
    }
    const accent = ACCENTS[name];
    if (accent) {
        const target = argument(state);
        return accent[1] === 'over' ? mover(target, mo(accent[0])) : munder(target, mo(accent[0]));
    }
    if (name === 'text' || name === 'textrm' || name === 'textnormal' || name === 'mbox' || name === 'textup')
        return mtext(readGroup(state));
    if (name === 'textit')
        return styled(mtext(readGroup(state)), 'font-style:italic');
    if (name === 'textbf')
        return styled(mtext(readGroup(state)), 'font-weight:bold');
    if (name === 'operatorname')
        return operator(readGroup(state));
    if (name === 'mathbb')
        return blackboard(readGroup(state));
    if (name === 'mathcal' || name === 'mathscr')
        return scriptStyle(readGroup(state));
    if (name === 'mathbf' || name === 'boldsymbol' || name === 'bm' || name === 'bf')
        return styled(group(state), 'font-weight:bold');
    if (name === 'mathrm' || name === 'mathsf' || name === 'mathtt' || name === 'textsc')
        return styled(group(state), 'font-style:normal');
    if (name === 'mathit')
        return styled(group(state), 'font-style:italic');
    if (name === 'begin')
        return environment(state, readGroup(state));
    // Style switches and limit placement that change nothing here: MathML decides both from the
    // operator dictionary and the enclosing display style.
    if (name === 'displaystyle' || name === 'textstyle' || name === 'limits' || name === 'nolimits'
        || name === 'scriptstyle' || name === 'scriptscriptstyle' || name === 'left.' || name === '!')
        return name === '!' ? space('-.167em') : mtext('');
    const gap = SPACING[name];
    if (gap)
        return space(gap);
    if (name === '\\')
        return `<mspace linebreak="newline"/>`;
    if (name === '{' || name === '}' || name === '%' || name === '#' || name === '&' || name === '_' || name === '$')
        return mtext(name);
    if (name === 'right' || name === 'end')
        return mtext(''); // stray closer, already consumed above
    state.unknown.push(name);
    if (state.strict)
        throw new Error(`Unknown LaTeX command \\${name}`);
    return mtext(name);
}
/** The token after `\left`/`\right`/`\big`, which may be a command such as `\langle`. */
function readDelimiterToken(state) {
    while (state.src[state.at] === ' ')
        state.at++;
    const ch = state.src[state.at];
    if (ch === undefined)
        return '.';
    if (ch === '\\')
        return readToken(state);
    state.at += 1;
    return ch;
}
function delimiter(token) {
    const glyph = DELIMITERS[token] ?? (token === '\\' ? '' : token);
    return glyph === '' ? '<mo></mo>' : `<mo stretchy="true">${escape(glyph)}</mo>`;
}
const lettersOf = (source) => [...source.replace(/[^A-Za-z0-9]/g, '')];
function blackboard(source) {
    return row(...lettersOf(source).map(letter => `<mi>${escape(DOUBLE_STRUCK[letter] ?? letter)}</mi>`));
}
function scriptStyle(source) {
    return row(...lettersOf(source).map(letter => `<mi>${escape(SCRIPT[letter] ?? letter)}</mi>`));
}
// ---------------------------------------------------------------------------------------------
// Environments
// ---------------------------------------------------------------------------------------------
/** How each environment is fenced, and how its columns are aligned. */
const ENVIRONMENTS = {
    matrix: { open: '', close: '', align: 'center' },
    pmatrix: { open: '(', close: ')', align: 'center' },
    bmatrix: { open: '[', close: ']', align: 'center' },
    Bmatrix: { open: '{', close: '}', align: 'center' },
    vmatrix: { open: '|', close: '|', align: 'center' },
    Vmatrix: { open: '‖', close: '‖', align: 'center' },
    cases: { open: '{', close: '', align: 'left' },
    aligned: { open: '', close: '', align: 'left' },
    align: { open: '', close: '', align: 'left' },
    gathered: { open: '', close: '', align: 'center' },
    array: { open: '', close: '', align: 'center' },
};
/**
 * `\begin{pmatrix} a & b \\ c & d \end{pmatrix}`. Rows are split on `\\` and columns on `&`, at
 * brace depth zero so a nested group containing either is left alone; the environment name chooses
 * the fences.
 */
function environment(state, name) {
    const end = `\\end{${name}}`;
    let body = '';
    while (state.at < state.src.length) {
        if (startsWith(state, end)) {
            state.at += end.length;
            break;
        }
        if (state.src[state.at] === '\\') {
            body += readToken(state);
            continue;
        }
        body += state.src[state.at];
        state.at++;
    }
    if (name === 'array')
        body = body.replace(/^\s*\{[^}]*\}/, ''); // the column preamble
    const rows = [[]];
    let cell = '', depth = 0;
    for (let index = 0; index < body.length; index++) {
        const ch = body[index];
        if (ch === '\\' && body.startsWith('\\\\', index)) {
            if (depth === 0) {
                rows[rows.length - 1]?.push(cell);
                rows.push([]);
                cell = '';
                index++;
                continue;
            }
            cell += '\\\\';
            index++;
            continue;
        }
        if (ch === '\\') {
            cell += ch + (body[index + 1] ?? '');
            index++;
            continue;
        }
        if (ch === '{')
            depth++;
        if (ch === '}')
            depth--;
        if (ch === '&' && depth === 0) {
            rows[rows.length - 1]?.push(cell);
            cell = '';
            continue;
        }
        cell += ch;
    }
    rows[rows.length - 1]?.push(cell);
    const shape = ENVIRONMENTS[name] ?? ENVIRONMENTS.matrix;
    const table = matrix(rows.map(cells => {
        const parsed = cells.map(one => parseSource(state, one));
        return parsed.length ? parsed : [mtext('')];
    }), { columnAlign: shape.align });
    if (shape.open === '' && shape.close === '')
        return table;
    return mrow([
        shape.open === '' ? '' : `<mo stretchy="true">${escape(shape.open)}</mo>`,
        table,
        shape.close === '' ? '' : `<mo stretchy="true">${escape(shape.close)}</mo>`,
    ]);
}
/** Strip the `$…$` / `$$…$$` a page may have copied along with the expression. */
const unwrap = (source) => source.trim().replace(/^\$\$?/, '').replace(/\$\$?$/, '');
function parseLatex(source, options) {
    const state = { src: unwrap(source), at: 0, strict: options.strict ?? false, unknown: [] };
    const fragment = parseExpression(state);
    return { fragment, unknown: state.unknown };
}
/** Parse `source` into a MathML fragment, for use inside a `mathtext` expression. */
export function latexFragment(source, options = {}) {
    return parseLatex(source, options).fragment;
}
/** Parse `source` into a complete `<math>` element, ready for `innerHTML`. */
export function latex(source, options = {}) {
    return mathml(latexFragment(source, options), options.display ?? 'inline');
}
/** The commands a source used that this subset does not know — for a page that wants to warn. */
export function latexUnknownCommands(source, options = {}) {
    return parseLatex(source, options).unknown;
}
/** True when every command in `source` is understood. */
export function latexIsSupported(source) {
    return parseLatex(source, {}).unknown.length === 0;
}
//# sourceMappingURL=latex.js.map