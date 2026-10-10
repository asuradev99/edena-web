export type Cue = {
    start: number;
    duration: number;
    update: (progress: number) => void;
    ease?: (t: number) => number;
};
/** Absolute-time evaluation makes replay and seeking independent of previous frames. */
export declare class Timeline {
    readonly duration: number;
    time: number;
    playing: boolean;
    speed: number;
    private cues;
    constructor(duration: number);
    add(cue: Cue): this;
    seek(time: number): void;
    play(): void;
    pause(): void;
    tick(delta: number): void;
}
export declare function tween(time: number, start: number, duration: number, from: number, to: number): number;
