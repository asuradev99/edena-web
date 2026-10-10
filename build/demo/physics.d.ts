/** Uniform solid insulating sphere, expressed in units R and E(R). */
export declare function normalizedField(radius: number): number;
export declare function enclosedFraction(radius: number): number;
export declare const DURATION = 192;
export declare const chapters: readonly [{
    readonly start: 0;
    readonly end: 16;
    readonly title: "A ball of charge";
}, {
    readonly start: 16;
    readonly end: 34;
    readonly title: "One small charge";
}, {
    readonly start: 34;
    readonly end: 50;
    readonly title: "Use the symmetry";
}, {
    readonly start: 50;
    readonly end: 72;
    readonly title: "The triple integral";
}, {
    readonly start: 72;
    readonly end: 98;
    readonly title: "Integrate the angles";
}, {
    readonly start: 98;
    readonly end: 116;
    readonly title: "Why shells cancel";
}, {
    readonly start: 116;
    readonly end: 136;
    readonly title: "The radial integral";
}, {
    readonly start: 136;
    readonly end: 153;
    readonly title: "Inside & outside";
}, {
    readonly start: 153;
    readonly end: 178;
    readonly title: "Draw the field";
}, {
    readonly start: 178;
    readonly end: 192;
    readonly title: "Gauss’s law: a check";
}];
export declare function chapterAt(t: number): number;
export declare function scriptedRadius(t: number): number;
