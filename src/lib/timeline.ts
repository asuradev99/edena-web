import { clamp, lerp, smooth } from './math.js';
export type Cue = { start:number; duration:number; update:(progress:number)=>void; ease?:(t:number)=>number };
/** Absolute-time evaluation makes replay and seeking independent of previous frames. */
export class Timeline {
  time=0;
  playing=false;
  speed=1;
  private cues:Cue[]=[];
  constructor(readonly duration:number) { if(!Number.isFinite(duration)||duration<=0) throw new Error('Duration must be positive'); }
  add(cue:Cue):this {
    if(!Number.isFinite(cue.start)||!Number.isFinite(cue.duration)||cue.start<0||cue.duration<=0||cue.start+cue.duration>this.duration) throw new Error('Cue outside timeline');
    this.cues.push(cue); return this;
  }
  seek(time:number):void {
    if(!Number.isFinite(time)) throw new Error('Time must be finite');
    this.time=clamp(time,0,this.duration);
    for(const cue of this.cues) cue.update((cue.ease??smooth)(clamp((this.time-cue.start)/cue.duration)));
  }
  play():void { if(this.time>=this.duration) this.seek(0); this.playing=true; }
  pause():void { this.playing=false; }
  tick(delta:number):void {
    if(!this.playing||!Number.isFinite(delta)||delta<0) return;
    this.seek(this.time+delta*this.speed);
    if(this.time>=this.duration) this.pause();
  }
}
export function tween(time:number,start:number,duration:number,from:number,to:number):number {
  return lerp(from,to,smooth((time-start)/duration));
}
