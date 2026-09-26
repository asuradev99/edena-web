# 08 · Time, interpolation and easing

**Code:** `src/lib/timeline.ts` (`Timeline`, `tween`), `src/lib/math.ts` (`lerp`, `smooth`, `clamp`).

## The three primitives

```
lerp(a, b, t)          = a + (b − a)·t
smooth(t)              = t² (3 − 2t),  t clamped to [0, 1]
tween(time, start, duration, from, to) = lerp(from, to, smooth((time − start)/duration))
```

`smooth` is the Hermite ease with zero slope at both ends: `smooth'(0) = smooth'(1) = 0`. It is C¹
but not C², so acceleration jumps at the endpoints. It changes *when* a value arrives, never where it
starts or ends.

## Absolute time is the whole design

`Timeline.seek(t)` clamps `t` into `[0, duration]` and then evaluates **every** cue:

```ts
for (const cue of this.cues) cue.update((cue.ease ?? smooth)(clamp((t - cue.start) / cue.duration)));
```

Because each cue is a function of `t` and not of a previous frame, seeking is idempotent: `seek(2.5)`
produces the same state whether you arrived from 0, from 3, or by jumping. `play()` and `tick(delta)`
are sugar over `seek(time + delta·speed)`.

That has a hard consequence for authors: **a cue must set absolute state.** A cue that writes
`x += v·p` will be double-counted the moment the reader scrubs, because the cue re-fires on every
seek. The demo pages all obey this — every cue assigns.

## Why not a per-frame animation loop

A frame-clock (`x += v·dt`) is simpler but drifts: pausing, a dropped frame or a background tab
changes the result, and scrubbing is impossible without a second code path. Absolute time makes
pausing and scrubbing the same operation as playing, and makes a screenshot reproducible.

## Limits

- Cue times outside `[0, duration]` are rejected at `add()`, not clipped.
- `ease` is any `(t) => number`, but the built-ins are closed-form; there is no spring, no
  bezier-solver and no keyframe interpolation between arbitrary curves.
- `tick` ignores a negative or non-finite delta rather than throwing.
- One timeline is one clock. Two timelines that must agree need the same `seek` on both.

## Try it

Academy chapter 08: three markers on one `Timeline` — `lerp`, `smooth`, and a delayed `tween` — with a
scrubber that seeks the same clock.
