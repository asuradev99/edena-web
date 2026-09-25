// The animated-derivation widget keeps its sequencing in pure functions so it can be tested here;
// the DOM half is exercised in the browser by scripts/check-basics.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkStep, lineOffsets, locate, stepCount,
  MATH_CSS, MATH_FONT_STACK, number, mroot, abs, limit,
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
});
