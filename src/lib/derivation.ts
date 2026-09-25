/**
 * An animated derivation: the thing a good explanation does with text.
 *
 * A derivation is a list of *lines*, each a row of typeset *tokens*, and each line carries a list
 * of *beats*. A beat applies marks — a bracket that grows around a group, a highlight, a colour
 * change, a cancellation struck through — so the algebra can be read as it happens rather than
 * appearing finished.
 *
 * The tokens are laid out as HTML (one `<math>` per token inside a span) rather than as a single
 * `<math>` element, because MathML Core has no cancellation element and no way to animate a part of
 * an expression: Chrome ignores `menclose` entirely and cannot measure a subexpression. Keeping the
 * pieces addressable means every mark is a class change, so it animates with plain CSS, survives a
 * font swap, and can be inspected from a test.
 *
 * The model half — {@link stepCount}, {@link locate}, {@link checkStep} — is pure, so the sequencing
 * can be unit-tested without a DOM.
 */
import { mathml, MATH_FONT_STACK, type M } from './mathtext.js';

/** One addressable piece of an expression: `2x`, `=`, `(`, `h`. */
export type DerivationToken = {
  /** Unique within its line; marks refer to tokens by this. */
  id: string;
  /** Typeset fragment (without the surrounding `<math>`). */
  math: M;
  /** Base colour; marks may override it. */
  colour?: string;
  /** Plain form, for the accessible name and for tests. */
  text?: string;
};

/** A mark applied to one or more tokens when a beat plays. */
export type DerivationMark =
  | { kind: 'highlight'; ids: string[]; colour?: string }
  | { kind: 'cancel'; ids: string[]; colour?: string }
  | { kind: 'recolour'; ids: string[]; colour: string }
  | { kind: 'bracket'; ids: string[]; colour?: string; note?: M }
  | { kind: 'note'; id: string; math: M; colour?: string };

/** One step of the explanation within a line. */
export type DerivationBeat = {
  marks: DerivationMark[];
  /** A caption for the line, replaced as beats play (e.g. "expand the square"). */
  note?: M;
};

/** A line of the derivation and the beats that animate it. */
export type DerivationStep = { tokens: DerivationToken[]; beats?: DerivationBeat[]; note?: M };

export type DerivationPosition = { step: number; beat: number; index: number; total: number };

/* --------------------------------------------------------------------------------------------
 * The model: pure, so it can be tested without a browser.
 * ------------------------------------------------------------------------------------------ */

/** How many positions the whole script has: one per line, plus one per beat. */
export function stepCount(steps: DerivationStep[]): number {
  return steps.reduce((total, step) => total + 1 + (step.beats?.length ?? 0), 0);
}

/** The flat index at which each line starts. */
export function lineOffsets(steps: DerivationStep[]): number[] {
  const offsets: number[] = [];
  let index = 0;
  for (const step of steps) {
    offsets.push(index);
    index += 1 + (step.beats?.length ?? 0);
  }
  return offsets;
}

/** Map a flat index to the line and the number of beats played on it. */
export function locate(steps: DerivationStep[], index: number): { step: number; beat: number } {
  const offsets = lineOffsets(steps);
  const clamped = Math.max(0, Math.min(stepCount(steps) - 1, Math.floor(index)));
  let step = 0;
  for (let candidate = 0; candidate < offsets.length; candidate++) if (offsets[candidate] <= clamped) step = candidate;
  return { step, beat: clamped - offsets[step] };
}

/**
 * Validate a script. Errors here are authoring mistakes — a mark pointing at a token that does not
 * exist, a repeated id, a bracket around a non-contiguous run — and they are worth throwing on
 * rather than silently drawing the wrong picture.
 */
export function checkStep(step: DerivationStep, where = 'step'): void {
  if (!step.tokens.length) throw new Error(`${where}: a line needs at least one token`);
  const ids = step.tokens.map(token => token.id);
  if (new Set(ids).size !== ids.length) throw new Error(`${where}: duplicate token id`);
  const position = new Map(ids.map((id, index) => [id, index]));
  for (const [beatIndex, beat] of (step.beats ?? []).entries()) {
    for (const mark of beat.marks) {
      const marked = mark.kind === 'note' ? [mark.id] : mark.ids;
      if (!marked.length) throw new Error(`${where} beat ${beatIndex}: a mark needs at least one token`);
      for (const id of marked) if (!position.has(id)) throw new Error(`${where} beat ${beatIndex}: unknown token "${id}"`);
      if (mark.kind === 'bracket') {
        const indexes = marked.map(id => position.get(id) as number).sort((a, b) => a - b);
        if (indexes[indexes.length - 1] - indexes[0] !== indexes.length - 1) {
          throw new Error(`${where} beat ${beatIndex}: a bracket needs a contiguous run of tokens`);
        }
      }
    }
  }
}

/* --------------------------------------------------------------------------------------------
 * The styles. Injected once per document; a page can override any of the custom properties.
 * ------------------------------------------------------------------------------------------ */

const STYLE_ID = 'edena-derivation-styles';
const STYLES = `
.dvn{--dvn-font:${MATH_FONT_STACK};--dvn-ink:#e9f2fa;--dvn-muted:#7d8a9c;--dvn-accent:#f7d681;
  --dvn-bracket:#9db0c2;--dvn-wash:#f7d68122;--dvn-gap:.5em;
  display:flex;flex-direction:column;gap:.7em;font-family:var(--dvn-font);font-size:19px;line-height:1.5;color:var(--dvn-ink)}
.dvn-line{display:flex;align-items:center;gap:1.1em;min-height:2.4em;opacity:.3;transform:scale(.99);transform-origin:left center;transition:opacity .55s ease,transform .55s ease}
.dvn-line.is-current{opacity:1;transform:none}
.dvn-row{position:relative;display:flex;align-items:center;flex-wrap:wrap;row-gap:1.1em;column-gap:.16em}
.dvn-tok{position:relative;display:inline-block;color:var(--dvn-colour,var(--dvn-ink));transition:color .5s ease,opacity .45s ease,transform .45s ease}
.dvn-tok.is-entering{opacity:0;transform:translateY(-.3em)}
.dvn-tok.is-cancelled{color:var(--dvn-muted)}
.dvn-tok.is-note-above{padding-top:.9em}
.dvn-hl{position:absolute;inset:-.3em -.38em;border-radius:.45em;background:var(--dvn-wash);opacity:0;transform:scaleX(.72);transition:opacity .4s ease,transform .45s cubic-bezier(.3,0,.2,1)}
.dvn-tok.is-highlighted .dvn-hl{opacity:1;transform:scaleX(1)}
.dvn-strike{position:absolute;top:50%;height:2px;border-radius:2px;background:var(--dvn-strike,var(--dvn-muted));opacity:.9;transform:rotate(-7deg) scaleX(0);transform-origin:left center;transition:transform .42s cubic-bezier(.4,0,.2,1);pointer-events:none}
.dvn-strike.is-in{transform:rotate(-7deg) scaleX(1)}
.dvn-bracket{position:relative;align-self:stretch;min-height:1.5em;width:.42em;border:2.5px solid var(--dvn-bracket);opacity:0;transition:opacity .3s ease,transform .5s cubic-bezier(.3,0,.2,1)}
.dvn-bracket.is-left{border-right:none;border-radius:.5em 0 0 .5em;transform:scaleY(.12);transform-origin:center right}
.dvn-bracket.is-right{border-left:none;border-radius:0 .5em .5em 0;transform:scaleY(.12);transform-origin:center left}
.dvn-bracket.is-in{opacity:1;transform:scaleY(1)}
.dvn-bracket-note{position:absolute;top:calc(100% + .12em);left:50%;transform:translateX(-50%);white-space:nowrap;font-size:.72em;color:var(--dvn-bracket);letter-spacing:.02em}
.dvn-note{white-space:nowrap;font-size:.78em;color:var(--dvn-muted);letter-spacing:.01em}
.dvn-note.is-in{color:var(--dvn-accent)}
.dvn-anchor{position:absolute;left:50%;top:-.2em;transform:translate(-50%,-100%);white-space:nowrap;font-size:.7em;color:var(--dvn-accent)}
.dvn *,.dvn *::before,.dvn *::after{transition-property:color,opacity,transform;transition-duration:.45s}
.dvn.no-anim,.dvn.no-anim *,.dvn.no-anim *::before,.dvn.no-anim *::after{transition:none !important}
@media (prefers-reduced-motion: reduce){.dvn *,.dvn *::before,.dvn *::after{transition-duration:.01s !important}}
`;

function ensureStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLES;
  doc.head.append(style);
}

/* --------------------------------------------------------------------------------------------
 * The widget.
 * ------------------------------------------------------------------------------------------ */

type BuiltLine = {
  element: HTMLDivElement;
  row: HTMLDivElement;
  tokens: Map<string, HTMLSpanElement>;
  order: DerivationToken[];
  note: HTMLSpanElement;
  strikes: HTMLDivElement[];
};

export type DerivationOptions = {
  /** Extra class on the root, for a page that wants to place or resize it. */
  className?: string;
  /** Milliseconds each beat is held during playback. */
  interval?: number;
  /** Called whenever the position changes, however it changed. */
  onChange?: (position: DerivationPosition) => void;
};

export class Derivation {
  private steps: DerivationStep[] = [];
  private built = new Map<number, BuiltLine>();
  private offsets: number[] = [];
  private current = 0;
  private timer: number | undefined;
  private observer: ResizeObserver | undefined;
  private readonly root: HTMLDivElement;

  constructor(private host: HTMLElement, private options: DerivationOptions = {}) {
    ensureStyles(host.ownerDocument);
    this.root = host.ownerDocument.createElement('div');
    this.root.className = `dvn${options.className ? ` ${options.className}` : ''}`;
    this.root.setAttribute('role', 'math');
    this.root.setAttribute('aria-live', 'polite');
    host.append(this.root);
  }

  /** Replace the script. Nothing is drawn until the next `seek`. */
  set(steps: DerivationStep[]): void {
    steps.forEach((step, index) => checkStep(step, `line ${index + 1}`));
    this.pause();
    this.steps = steps;
    this.offsets = lineOffsets(steps);
    for (const line of this.built.values()) line.element.remove();
    this.built.clear();
    this.current = 0;
    this.render(0, false);
  }

  get total(): number {
    return stepCount(this.steps);
  }

  get position(): DerivationPosition {
    const { step, beat } = this.current >= 0 ? locate(this.steps, this.current) : { step: 0, beat: 0 };
    return { step, beat, index: this.current, total: this.total };
  }

  /** Move to a flat position: the line index plus the number of beats played on it. */
  seek(index: number, animate = true): void {
    if (!this.steps.length) return;
    const target = Math.max(0, Math.min(this.total - 1, Math.round(index)));
    // Scrubbing backwards should show the state immediately; playing forwards should show the move.
    const forwards = target >= this.current;
    this.current = target;
    this.render(target, animate && forwards);
    this.options.onChange?.(this.position);
  }

  next(): void {
    if (this.current >= this.total - 1) return;
    this.seek(this.current + 1);
  }

  previous(): void {
    this.seek(this.current - 1, false);
  }

  reset(): void {
    this.pause();
    this.current = 0;
    this.render(0, false);
    this.options.onChange?.(this.position);
  }

  play(): void {
    this.pause();
    if (this.current >= this.total - 1) this.reset();
    const interval = this.options.interval ?? 900;
    this.timer = this.host.ownerDocument.defaultView?.setInterval(() => {
      if (this.current >= this.total - 1) { this.pause(); return; }
      this.next();
    }, interval);
    // A timer is not a frame loop: the first beat should follow the same rhythm as the rest.
    this.next();
  }

  pause(): void {
    if (this.timer !== undefined) {
      this.host.ownerDocument.defaultView?.clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  get playing(): boolean {
    return this.timer !== undefined;
  }

  dispose(): void {
    this.pause();
    this.observer?.disconnect();
    for (const line of this.built.values()) line.element.remove();
    this.built.clear();
    this.root.remove();
  }

  /* --------------------------------------------------------------------------------------- */

  private render(index: number, animate: boolean): void {
    for (const [lineIndex, line] of this.built) {
      if (lineIndex > this.position.step) {
        line.element.remove();
        this.built.delete(lineIndex);
      }
    }
    if (animate) this.root.classList.remove('no-anim');
    else this.root.classList.add('no-anim');
    const { step, beat } = this.position;
    for (let lineIndex = 0; lineIndex <= step; lineIndex++) {
      const line = this.line(lineIndex);
      const isCurrent = lineIndex === step;
      line.element.classList.toggle('is-current', isCurrent);
      this.decorate(lineIndex, isCurrent ? beat : (this.steps[lineIndex].beats?.length ?? 0), isCurrent && animate);
    }
    // Watch for reflows: the strike-through is positioned from measured token offsets.
    if (!this.observer && typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(() => this.repositionStrikes());
      this.observer.observe(this.root);
    }
    const view = this.host.ownerDocument.defaultView;
    void this.host.ownerDocument.fonts?.ready.then(() => this.repositionStrikes());
    if (!animate && view) view.requestAnimationFrame(() => this.root.classList.remove('no-anim'));
    this.root.setAttribute('aria-label', this.describe(step, beat));
  }

  /** Plain-text form of the current state, for screen readers and for tests. */
  describe(step = this.position.step, beat = this.position.beat): string {
    const line = this.steps[step];
    if (!line) return '';
    const text = line.tokens.map(token => token.text ?? token.id).join(' ');
    const markState = (line.beats ?? []).slice(0, beat).flatMap(entry => entry.marks).map(mark => mark.kind);
    return markState.length ? `${text} (${markState.join(', ')})` : text;
  }

  private line(index: number): BuiltLine {
    const existing = this.built.get(index);
    if (existing) return existing;
    const doc = this.host.ownerDocument;
    const step = this.steps[index];
    const element = doc.createElement('div');
    element.className = 'dvn-line';
    element.dataset.step = String(index);
    const row = doc.createElement('div');
    row.className = 'dvn-row';
    const tokens = new Map<string, HTMLSpanElement>();
    for (const token of step.tokens) {
      const span = doc.createElement('span');
      span.className = 'dvn-tok';
      span.dataset.id = token.id;
      if (token.colour) span.style.setProperty('--dvn-colour', token.colour);
      span.innerHTML = mathml(token.math);
      const wash = doc.createElement('span');
      wash.className = 'dvn-hl';
      span.append(wash);
      row.append(span);
      tokens.set(token.id, span);
    }
    const note = doc.createElement('span');
    note.className = 'dvn-note';
    if (step.note) note.innerHTML = mathml(step.note);
    element.append(row, note);
    this.root.append(element);
    const built: BuiltLine = { element, row, tokens, order: step.tokens, note, strikes: [] };
    this.built.set(index, built);
    if (index === this.position.step) {
      // Freshly added tokens drop in rather than appearing: the class is removed on the next frame.
      for (const span of tokens.values()) span.classList.add('is-entering');
      doc.defaultView?.requestAnimationFrame(() => { for (const span of tokens.values()) span.classList.remove('is-entering'); });
    }
    return built;
  }

  private decorate(lineIndex: number, upToBeat: number, animate: boolean): void {
    const step = this.steps[lineIndex];
    const line = this.line(lineIndex);
    for (const strike of line.strikes) strike.remove();
    line.strikes = [];
    for (const element of line.row.querySelectorAll('.dvn-bracket,.dvn-anchor')) element.remove();
    for (const [id, span] of line.tokens) {
      span.classList.remove('is-cancelled', 'is-highlighted', 'is-note-above');
      const token = step.tokens.find(candidate => candidate.id === id);
      if (token?.colour) span.style.setProperty('--dvn-colour', token.colour);
      else span.style.removeProperty('--dvn-colour');
    }
    line.note.classList.remove('is-in');
    const beats = step.beats ?? [];
    for (let beat = 0; beat < Math.min(upToBeat, beats.length); beat++) {
      const entry = beats[beat];
      for (const mark of entry.marks) this.applyMark(line, mark, animate);
      if (entry.note) {
        line.note.innerHTML = mathml(entry.note);
        line.note.classList.add('is-in');
      }
    }
    if (!upToBeat && step.note) line.note.innerHTML = mathml(step.note);
    this.repositionStrikes();
  }

  private applyMark(line: BuiltLine, mark: DerivationMark, animate: boolean): void {
    const spans = (ids: string[]) => ids.map(id => line.tokens.get(id)).filter((span): span is HTMLSpanElement => !!span);
    switch (mark.kind) {
      case 'highlight':
        for (const span of spans(mark.ids)) {
          if (mark.colour) span.style.setProperty('--dvn-wash', `${mark.colour}44`);
          span.classList.add('is-highlighted');
        }
        break;
      case 'recolour':
        for (const span of spans(mark.ids)) span.style.setProperty('--dvn-colour', mark.colour);
        break;
      case 'cancel': {
        const marked = spans(mark.ids);
        for (const span of marked) span.classList.add('is-cancelled');
        const strike = line.element.ownerDocument.createElement('div');
        strike.className = 'dvn-strike';
        if (mark.colour) strike.style.setProperty('--dvn-strike', mark.colour);
        strike.dataset.ids = mark.ids.join(',');
        line.row.append(strike);
        line.strikes.push(strike);
        if (!animate) strike.classList.add('is-in');
        else void line.element.ownerDocument.defaultView?.requestAnimationFrame(() => strike.classList.add('is-in'));
        break;
      }
      case 'bracket': {
        const marked = spans(mark.ids);
        if (!marked.length) break;
        const doc = line.element.ownerDocument;
        const left = doc.createElement('span');
        left.className = 'dvn-bracket is-left';
        if (mark.colour) left.style.setProperty('--dvn-bracket', mark.colour);
        const right = doc.createElement('span');
        right.className = 'dvn-bracket is-right';
        if (mark.colour) right.style.setProperty('--dvn-bracket', mark.colour);
        if (mark.note) {
          const note = doc.createElement('span');
          note.className = 'dvn-bracket-note';
          note.innerHTML = mathml(mark.note);
          right.append(note);
        }
        marked[0].before(left);
        marked[marked.length - 1].after(right);
        if (!animate) { left.classList.add('is-in'); right.classList.add('is-in'); }
        else {
          doc.defaultView?.requestAnimationFrame(() => left.classList.add('is-in'));
          // The closing bracket follows the opening one, which reads as a brace being drawn.
          doc.defaultView?.setTimeout(() => right.classList.add('is-in'), 90);
        }
        break;
      }
      case 'note': {
        const span = line.tokens.get(mark.id);
        if (!span) break;
        span.classList.add('is-note-above');
        const anchor = line.element.ownerDocument.createElement('span');
        anchor.className = 'dvn-anchor';
        if (mark.colour) anchor.style.color = mark.colour;
        anchor.innerHTML = mathml(mark.math);
        span.append(anchor);
        break;
      }
    }
  }

  /** Strikes span measured token boxes, so they survive a font swap or a reflow. */
  private repositionStrikes(): void {
    for (const line of this.built.values()) {
      for (const strike of line.strikes) {
        const ids = (strike.dataset.ids ?? '').split(',').filter(Boolean);
        const spans = ids.map(id => line.tokens.get(id)).filter((span): span is HTMLSpanElement => !!span);
        if (!spans.length) continue;
        const first = spans[0], last = spans[spans.length - 1];
        strike.style.left = `${first.offsetLeft - 4}px`;
        strike.style.width = `${last.offsetLeft + last.offsetWidth - first.offsetLeft + 8}px`;
      }
    }
  }
}
