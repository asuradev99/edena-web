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
import { type M } from './mathtext.js';
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
export type DerivationMark = {
    kind: 'highlight';
    ids: string[];
    colour?: string;
} | {
    kind: 'cancel';
    ids: string[];
    colour?: string;
} | {
    kind: 'recolour';
    ids: string[];
    colour: string;
} | {
    kind: 'bracket';
    ids: string[];
    colour?: string;
    note?: M;
} | {
    kind: 'note';
    id: string;
    math: M;
    colour?: string;
};
/** One step of the explanation within a line. */
export type DerivationBeat = {
    marks: DerivationMark[];
    /** A caption for the line, replaced as beats play (e.g. "expand the square"). */
    note?: M;
};
/** A line of the derivation and the beats that animate it. */
export type DerivationStep = {
    tokens: DerivationToken[];
    beats?: DerivationBeat[];
    note?: M;
};
export type DerivationPosition = {
    step: number;
    beat: number;
    index: number;
    total: number;
};
/** How many positions the whole script has: one per line, plus one per beat. */
export declare function stepCount(steps: DerivationStep[]): number;
/** The flat index at which each line starts. */
export declare function lineOffsets(steps: DerivationStep[]): number[];
/** Map a flat index to the line and the number of beats played on it. */
export declare function locate(steps: DerivationStep[], index: number): {
    step: number;
    beat: number;
};
/**
 * Validate a script. Errors here are authoring mistakes — a mark pointing at a token that does not
 * exist, a repeated id, a bracket around a non-contiguous run — and they are worth throwing on
 * rather than silently drawing the wrong picture.
 */
export declare function checkStep(step: DerivationStep, where?: string): void;
/**
 * Split a cancellation's tokens into the runs that neighbour each other in `order`.
 *
 * A cancel mark is drawn as a line through the tokens it names, so the runs matter: cancelling the
 * two `x²` terms of `(x+h)² − x²` must not draw one line through the `2xh + h²` between them, which
 * would read as though those had gone too. Each returned run is a contiguous slice of the line, in
 * the line's own order, and a token named but not present is ignored (the DOM half filters them the
 * same way). Pure, so the rule can be unit-tested without a browser.
 */
export declare function strikeRuns(order: string[], ids: string[]): string[][];
export type DerivationOptions = {
    /** Extra class on the root, for a page that wants to place or resize it. */
    className?: string;
    /** Milliseconds each beat is held during playback. */
    interval?: number;
    /** Called whenever the position changes, however it changed. */
    onChange?: (position: DerivationPosition) => void;
};
export declare class Derivation {
    private host;
    private options;
    private steps;
    private built;
    private offsets;
    private current;
    private timer;
    private observer;
    private readonly root;
    private readonly live;
    constructor(host: HTMLElement, options?: DerivationOptions);
    /** Replace the script. Nothing is drawn until the next `seek`. */
    set(steps: DerivationStep[]): void;
    get total(): number;
    get position(): DerivationPosition;
    /** Move to a flat position: the line index plus the number of beats played on it. */
    seek(index: number, animate?: boolean): void;
    next(): void;
    previous(): void;
    reset(): void;
    play(): void;
    pause(): void;
    get playing(): boolean;
    dispose(): void;
    private render;
    /** Plain-text form of the current state, for screen readers and for tests. */
    describe(step?: number, beat?: number): string;
    private line;
    private decorate;
    private applyMark;
    /** Strikes span measured token boxes, so they survive a font swap or a reflow. */
    private repositionStrikes;
}
