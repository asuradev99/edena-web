// The animated-derivation widget keeps its sequencing in pure functions so it can be tested here;
// the DOM half is exercised in the browser by scripts/check-basics.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkStep, lineOffsets, locate, stepCount, strikeRuns,
  MATH_CSS, MATH_FONT_STACK, number, mroot, abs, limit,
  mi, mn, mo, paren, brackets, msup, frac, cases, vec, hat, bar, dotAccent, mover, matrix, radialHat,
} from '../build/index.js';

test('stepCount and lineOffsets count one position per line plus one per beat', () => {
  const steps = [
    { tokens: [{ id: 'a', math: 'a' }], beats: [{ marks: [] }, { marks: [] }] },
    { tokens: [{ id: 'b', math: 'b' }] },
    { tokens: [{ id: 'c', math: 'c' }], beats: [{ marks: [] }] },
  ];
  assert.equal(stepCount(steps), 3 + 3);
  assert.deepEqual(lineOffsets(steps), [0, 3, 4]);
  assert.equal(stepCount([]), 0);
});

test('locate maps a flat position onto a line and its beats, and clamps out-of-range input', () => {
  const steps = [
    { tokens: [{ id: 'a', math: 'a' }], beats: [{ marks: [] }, { marks: [] }] },
    { tokens: [{ id: 'b', math: 'b' }], beats: [{ marks: [] }] },
  ];
  // line 0 owns positions 0..2, line 1 owns 3..4.
  assert.deepEqual([0, 1, 2, 3, 4].map(index => locate(steps, index)),
    [{ step: 0, beat: 0 }, { step: 0, beat: 1 }, { step: 0, beat: 2 }, { step: 1, beat: 0 }, { step: 1, beat: 1 }]);
  assert.deepEqual(locate(steps, -5), { step: 0, beat: 0 });
  assert.deepEqual(locate(steps, 999), { step: 1, beat: 1 });
  assert.deepEqual(locate(steps, 2.7), { step: 0, beat: 2 }, 'a fractional position floors to a beat');
});

test('checkStep rejects the authoring mistakes that would draw the wrong picture', () => {
  const ok = { tokens: [{ id: 'x', math: 'x' }, { id: 'y', math: 'y' }], beats: [{ marks: [{ kind: 'cancel', ids: ['x'] }] }] };
  assert.doesNotThrow(() => checkStep(ok));
  assert.throws(() => checkStep({ tokens: [] }), /at least one token/);
  assert.throws(() => checkStep({ tokens: [{ id: 'x', math: 'x' }, { id: 'x', math: 'x' }] }), /duplicate token id/);
  assert.throws(() => checkStep({ tokens: [{ id: 'x', math: 'x' }], beats: [{ marks: [{ kind: 'cancel', ids: ['nope'] }] }] }), /unknown token/);
  assert.throws(() => checkStep({ tokens: [{ id: 'x', math: 'x' }], beats: [{ marks: [{ kind: 'cancel', ids: [] }] }] }), /at least one token/);
  // A bracket must cover a run of neighbours: x and z are not neighbours here.
  const split = { tokens: [{ id: 'x', math: 'x' }, { id: 'y', math: 'y' }, { id: 'z', math: 'z' }], beats: [{ marks: [{ kind: 'bracket', ids: ['x', 'z'] }] }] };
  assert.throws(() => checkStep(split), /contiguous run/);
  // The same set in a different order is still contiguous once sorted.
  assert.doesNotThrow(() => checkStep({ tokens: split.tokens, beats: [{ marks: [{ kind: 'bracket', ids: ['z', 'x', 'y'] }] }] }));
});

test('number typesets a real minus, groups thousands, and goes scientific at the extremes', () => {
  // Two decimals by default, so a column of tick labels stays aligned.
  assert.equal(number(3), '<mrow><mn>3.00</mn></mrow>');
  assert.equal(number(3, 0), '<mrow><mn>3</mn></mrow>');
  assert.equal(number(-1.5), '<mrow><mo>\u2212</mo><mn>1.50</mn></mrow>');
  assert.equal(number(-1.5).includes('-'), false, 'a hyphen must never stand in for a minus');
  assert.match(number(12345, 0), /12\u2009345/, 'thousands are grouped with a thin space');
  assert.match(number(1234567, 0), /<mn>1\.2<\/mn>/, 'a large number keeps a decimal on its mantissa');
  assert.match(number(0.00042), /<msup><mn>10<\/mn><mn>-4<\/mn><\/msup>/);
  assert.match(number(2.5e7), /<msup><mn>10<\/mn><mn>7<\/mn><\/msup>/);
  assert.throws(() => number(Number.NaN), /finite/);
});

test('the new maths builders produce namespaced-ready MathML', () => {
  assert.equal(mroot('<mn>8</mn>', '<mn>3</mn>'), '<mroot><mn>8</mn><mn>3</mn></mroot>');
  assert.equal(abs('<mi>x</mi>'), '<mrow><mo>|</mo><mi>x</mi><mo>|</mo></mrow>');
  assert.equal(limit('<mrow><mi>h</mi><mo>\u2192</mo><mn>0</mn></mrow>'),
    '<munder><mo lspace="0.16em" rspace="0.16em">lim</mo><mrow><mi>h</mi><mo>\u2192</mo><mn>0</mn></mrow></munder>');
});

test('the maths stylesheet names the font stack the widget relies on', () => {
  assert.match(MATH_CSS, /math\{font-family:/);
  assert.match(MATH_FONT_STACK, /STIX Two Text/);
  assert.match(MATH_FONT_STACK, /serif$/, 'the stack must end in a generic family');
  // A font without an OpenType MATH table cannot stretch a bracket or place limits, so a
  // maths-table face has to lead the stack (STIX Two Text, the old first entry, has none).
  assert.match(MATH_FONT_STACK, /^"STIX Two Math"/, 'the stack must lead with a MATH-table face');
  assert.match(MATH_FONT_STACK, /"Noto Sans Math"/, 'a second maths-table face is a useful offline fallback');
  // Leading is not enough: if STIX Two Math fails to load (offline, blocked CDN), the next family
  // Chrome reaches must also be able to lay out stretchy delimiters. So *every* maths-table face has
  // to come before *every* prose face; a prose face in the middle would strand the fallback.
  const stack = MATH_FONT_STACK.split(',').map(part => part.trim().replace(/^"|"$/g, ''));
  const mathsFaces = ['STIX Two Math', 'Cambria Math', 'Latin Modern Math', 'Noto Sans Math'];
  const proseFaces = ['STIX Two Text', 'STIXGeneral', 'DejaVu Serif', 'serif'];
  const lastMaths = Math.max(...mathsFaces.map(face => stack.indexOf(face)));
  const proseIndexes = proseFaces.map(face => stack.indexOf(face)).filter(index => index >= 0);
  assert.ok(proseIndexes.length > 0, 'the stack needs a prose fallback');
  assert.ok(Math.min(...proseIndexes) > lastMaths,
    `every maths-table face must precede every prose face, got: ${MATH_FONT_STACK}`);
});

// --- Polish pass: fragments used as operands, and cancellation runs ------------------------------

test('every builder that takes an operand groups a multi-root fragment first', () => {
  // `paren` is one element now, so it is a valid script base…
  const group = '<mrow><mo stretchy="true">(</mo><mi>x</mi><mo stretchy="true">)</mo></mrow>';
  assert.equal(paren(mi('x')), group);
  // …and Chrome raises the exponent instead of laying it on the baseline.
  assert.equal(msup(paren(mi('x')), mn('2')), `<msup>${group}<mn>2</mn></msup>`);
  // A single-element operand is untouched, so published output does not move.
  assert.equal(msup(mi('x'), mn('2')), '<msup><mi>x</mi><mn>2</mn></msup>');
  assert.equal(frac(mi('a'), mi('b')), '<mfrac><mi>a</mi><mi>b</mi></mfrac>');
  // A bare concatenation handed to an accent is grouped rather than silently flattened.
  assert.equal(mover('<mo>a</mo><mo>b</mo>', mo('^')),
    '<mover accent="true"><mrow><mo>a</mo><mo>b</mo></mrow><mo>^</mo></mover>');
  assert.equal(vec(paren(mi('x'))), `<mover accent="true">${group}<mo stretchy="true">\u2192</mo></mover>`);
  // Every accent builder, not just `mover`, has to group its base — they used to inline it.
  const bare = '<mo>a</mo><mo>b</mo>';
  for (const [name, mark] of [['vec', '\u2192'], ['hat', '^'], ['bar', '\u00af'], ['dotAccent', '\u02d9']]) {
    const built = { vec, hat, bar, dotAccent }[name](bare);
    assert.equal(built, `<mover accent="true"><mrow>${bare}</mrow><mo stretchy="true">${mark}</mo></mover>`,
      `${name} must group a multi-root base`);
    // A single-element base is left alone, so the common case is byte-identical to before.
    assert.equal({ vec, hat, bar, dotAccent }[name](mi('v')),
      `<mover accent="true"><mi>v</mi><mo stretchy="true">${mark}</mo></mover>`, `${name} must not wrap a single element`);
  }
  // `radialHat` rides `hat`, so it inherits the grouping.
  assert.match(radialHat(), /^<mover accent="true"><mi>r<\/mi>/);
  // Brackets obey the same rule and are one element, so they can hold a matrix.
  assert.equal(brackets(mi('x')), '<mrow><mo stretchy="true">[</mo><mi>x</mi><mo stretchy="true">]</mo></mrow>');
  assert.match(brackets(matrix([[mn('1')], [mn('2')]])), /^<mrow><mo stretchy="true">\[<\/mo><mtable/);
  assert.match(brackets(matrix([[mn('1')], [mn('2')]])), /<\/mtable><mo stretchy="true">\]<\/mo><\/mrow>$/);
  // `cases` used to be a brace plus a table, i.e. two roots; it is one element now.
  assert.match(cases([[mn('1'), mi('x')]]), /^<mrow>.*<\/mrow>$/);
});

test('strikeRuns splits a cancellation at the terms it does not name', () => {
  const order = ['x1', 'plus', 'twice', 'h1', 'minus', 'x2'];
  // The two x² tokens are not neighbours, so they get a strike each and the middle is spared.
  assert.deepEqual(strikeRuns(order, ['x1', 'x2']), [['x1'], ['x2']]);
  // Adjacent tokens share one strike, whatever order they were named in.
  assert.deepEqual(strikeRuns(order, ['twice', 'h1']), [['twice', 'h1']]);
  assert.deepEqual(strikeRuns(order, ['h1', 'twice']), [['twice', 'h1']]);
  // A run of three, and a name that does not exist being ignored.
  assert.deepEqual(strikeRuns(['a', 'b', 'c', 'd'], ['a', 'b', 'c']), [['a', 'b', 'c']]);
  // A ghost is not in the line, so it cannot separate two terms that are neighbours in it…
  assert.deepEqual(strikeRuns(['a', 'b'], ['a', 'ghost', 'b']), [['a', 'b']]);
  // …but a real term between them does.
  assert.deepEqual(strikeRuns(['a', 'x', 'b'], ['a', 'ghost', 'b']), [['a'], ['b']]);
  assert.deepEqual(strikeRuns(order, []), []);
});
