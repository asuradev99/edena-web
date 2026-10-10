/**
 * Coalesce rapid calls into one per animation frame.
 *
 * A slider drag can fire `input` several times between two frames. When the handler rebuilds a
 * surface, re-solves a field or re-rasterises a label, every extra event is a full rebuild of the
 * same picture with one number changed. Route the handler through `coalesce` and the work happens
 * once a frame, with the latest arguments; events that arrive while a frame is pending are folded
 * into it. The last call wins, so a coalesced `change` still runs after the value settles.
 */
export declare function coalesce<A extends unknown[]>(fn: (...args: A) => void): (...args: A) => void;
