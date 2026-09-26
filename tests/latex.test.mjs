// LaTeX → MathML. The converter is pure string work, so every claim about the tree it builds is
// checked here rather than in a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { latex, latexFragment, latexUnknownCommands, latexIsSupported } from '../build/index.js';

test('fractions, radicals and their indices come out as the right MathML elements', () => {
  assert.match(latexFragment('\\frac{a}{b}'), /^<mrow><mfrac><mrow><mi>a<\/mi><\/mrow><mrow><mi>b<\/mi><\/mrow><\/mfrac><\/mrow>$/);
  assert.match(latexFragment('\\sqrt{x}'), /<msqrt><mrow><mi>x<\/mi><\/mrow><\/msqrt>/);
  assert.match(latexFragment('\\sqrt[3]{x}'), /<mroot><mrow><mi>x<\/mi><\/mrow><mrow><mn>3<\/mn><\/mrow><\/mroot>/);
  // A fraction nested in a radical, scripted and delimited, all at once.
  const nested = latexFragment('\\left(\\frac{\\sqrt{x^2+1}}{2}\\right)^{-1}');
  assert.match(nested, /<msup>/);
  assert.match(nested, /<mfrac>/);
  assert.match(nested, /<msqrt>/);
  assert.match(nested, /<mrow><mo>−<\/mo><mn>1<\/mn><\/mrow>/);
});

test('scripts of any depth, in either order, and primes', () => {
  assert.match(latexFragment('x_1^2'), /<msubsup><mi>x<\/mi><mn>1<\/mn><mn>2<\/mn><\/msubsup>/);
  assert.match(latexFragment('x^2_1'), /<msubsup><mi>x<\/mi><mn>1<\/mn><mn>2<\/mn><\/msubsup>/);
  assert.match(latexFragment('e^{i\\pi}'), /<msup><mi>e<\/mi><mrow><mi>i<\/mi><mi>π<\/mi><\/mrow><\/msup>/);
  assert.match(latexFragment("f''(x)"), /<msup><mi>f<\/mi><mo>′′<\/mo><\/msup>/);
  // depth: x squared, that whole thing raised, that whole thing raised again
  assert.match(latexFragment('x^{2^{3}}'), /<msup><mi>x<\/mi><mrow><msup><mn>2<\/mn><mrow><mn>3<\/mn><\/mrow><\/msup><\/mrow><\/msup>/);
});

test('every operand a script or fraction takes is a single element (the MathML arity rule)', () => {
  // `msup`/`mfrac` take exactly two children; a multi-root operand silently loses its place.
  for (const source of ['\\left(\\frac{a}{b}\\right)^2', 'x_{i+1}^{n-1}', '\\frac{a+b}{c-d}', '\\sqrt{x^2+1}^3']) {
    const fragment = latexFragment(source);
    for (const tag of ['msup', 'msub', 'msubsup', 'mfrac', 'msqrt', 'mroot', 'mover', 'munder']) {
      for (const count of operandCounts(fragment, tag)) {
        const expected = tag === 'msubsup' ? 3 : tag === 'msqrt' ? 1 : 2;
        assert.equal(count, expected, `${tag} in ${source} has ${count} children, expected ${expected}`);
      }
    }
  }
});

/** The child count of every `<tag>` occurrence in a fragment. */
function operandCounts(fragment, tag) {
  const counts = [];
  const tags = /<(\/?)([a-z][\w-]*)[^>]*?(\/?)>/g;
  const stack = [];
  let match;
  while ((match = tags.exec(fragment))) {
    const closing = match[1] === '/', selfClosing = match[3] === '/';
    if (selfClosing) continue;
    if (!closing) stack.push({ tag: match[2], children: 0 });
    else {
      const top = stack.pop();
      if (!top) continue;
      if (stack.length) stack[stack.length - 1].children++;
      if (top.tag === tag) counts.push(top.children);
    }
  }
  return counts;
}

test('symbols, greek, blackboard letters and upright functions', () => {
  assert.match(latexFragment('\\alpha'), /<mi>α<\/mi>/);
  assert.match(latexFragment('\\Gamma'), /font-style:normal/);
  assert.match(latexFragment('a \\le b \\Rightarrow c'), /<mo>≤<\/mo>/);
  assert.match(latexFragment('a \\le b \\Rightarrow c'), /<mo>⇒<\/mo>/);
  assert.match(latexFragment('\\mathbb{R}^n'), /<mi>ℝ<\/mi>/);
  assert.match(latexFragment('\\mathcal{L}'), /<mi>ℒ<\/mi>/);
  assert.match(latexFragment('\\sin\\theta'), /<mo lspace="0.16em" rspace="0.16em">sin<\/mo>/);
  assert.match(latexFragment('\\nabla\\cdot\\vec{E}'), /<mo>∇<\/mo><mo>⋅<\/mo><mover accent="true">/);
  assert.match(latexFragment('\\hbar\\omega'), /<mo>ℏ<\/mo><mi>ω<\/mi>/);
});

test('spacing is asked for, not inherited: whitespace in the source typesets nothing', () => {
  const fragment = latexFragment('a  +   b');
  assert.equal(fragment, '<mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow>');
  assert.doesNotMatch(fragment, /<mo> <\/mo>/);
  assert.match(latexFragment('x\\,dx'), /<mspace width="\.167em"\/>/);
  assert.match(latexFragment('a\\quad b'), /<mspace width="1em"\/>/);
  // and a minus is the mathematical one, not a hyphen
  assert.match(latexFragment('a-b'), /<mo>−<\/mo>/);
});

test('text, operators, escaped characters and dollar wrappers', () => {
  assert.match(latexFragment('\\text{where } x'), /<mtext>where <\/mtext>/);
  assert.match(latexFragment('\\operatorname{tr}(A)'), /<mo lspace="0.16em" rspace="0.16em">tr<\/mo>/);
  assert.equal(latexFragment('$x$'), latexFragment('x'));
  assert.equal(latexFragment('$$\\frac{a}{b}$$'), latexFragment('\\frac{a}{b}'));
  assert.match(latexFragment('a < b'), /<mo>&lt;<\/mo>/);          // escaped, never raw markup
  assert.match(latexFragment('100\\%'), /<mtext>%<\/mtext>/);
});

test('matrices, cases and aligned rows', () => {
  const matrix = latexFragment('\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}');
  assert.equal((matrix.match(/<mtr>/g) ?? []).length, 2);
  assert.equal((matrix.match(/<mtd>/g) ?? []).length, 4);
  assert.match(matrix, /<mo stretchy="true">\(<\/mo>/);
  assert.match(matrix, /<mo stretchy="true">\)<\/mo>/);
  assert.match(matrix, /columnalign="center"/);
  const cases = latexFragment('\\begin{cases} x & x > 0 \\\\ -x & x < 0 \\end{cases}');
  assert.match(cases, /<mo stretchy="true">\{<\/mo>/);
  assert.match(cases, /columnalign="left"/);
  // nested braces inside a cell must not split the row
  const nested = latexFragment('\\begin{pmatrix} \\frac{a}{b} & {c} \\\\ d & e \\end{pmatrix}');
  assert.equal((nested.match(/<mtd>/g) ?? []).length, 4);
});

test('unknown commands degrade or throw, and the report names them', () => {
  assert.match(latexFragment('\\foo{x}'), /<mtext>foo<\/mtext>/);
  assert.deepEqual(latexUnknownCommands('\\foo{x} + \\bar{y}'), ['foo']);
  assert.equal(latexIsSupported('\\frac{a}{b}'), true);
  assert.equal(latexIsSupported('\\notacommand'), false);
  assert.throws(() => latex('\\notacommand', { strict: true }), /Unknown LaTeX command/);
  assert.doesNotThrow(() => latex('\\notacommand'));
});

test('latex() wraps the fragment in a complete math element, honouring display', () => {
  const inline = latex('\\frac{a}{b}');
  assert.match(inline, /^<math xmlns="http:\/\/www\.w3\.org\/1998\/Math\/MathML" display="inline">/);
  assert.match(inline, /<\/math>$/);
  const block = latex('\\int_0^1 x\\,dx', { display: 'block' });
  assert.match(block, /display="block"/);
  // the fragment is what a mathtext expression would embed, so it must not carry the wrapper
  assert.doesNotMatch(latexFragment('x'), /<math/);
});

test('a physics-scale expression round-trips as one coherent tree', () => {
  const fragment = latexFragment('\\hat{H}\\psi = -\\frac{\\hbar^2}{2m}\\nabla^2\\psi + V(\\mathbf{r})\\psi');
  assert.match(fragment, /<mover accent="true">/);                    // the hat
  assert.match(fragment, /<mi>ψ<\/mi>/);
  assert.match(fragment, /<mfrac>/);
  assert.match(fragment, /<msup><mo>ℏ<\/mo><mn>2<\/mn><\/msup>/);
  assert.match(fragment, /<mo>=<\/mo>/);
  // balanced tags: every element opened is closed
  const stack = [];
  for (const match of fragment.matchAll(/<(\/?)([a-z][\w-]*)[^>]*?(\/?)>/g)) {
    if (match[3] === '/') continue;
    if (match[1] === '/') assert.equal(stack.pop(), match[2], `stray </${match[2]}>`);
    else stack.push(match[2]);
  }
  assert.deepEqual(stack, []);
});
