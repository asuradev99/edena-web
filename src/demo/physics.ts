/** Uniform solid insulating sphere, expressed in units R and E(R). */
export function normalizedField(radius:number):number {
  if(!Number.isFinite(radius)||radius<0)throw new Error('Radius must be finite and nonnegative');
  return radius<=1?radius:1/(radius*radius);
}
export function enclosedFraction(radius:number):number {
  if(!Number.isFinite(radius)||radius<0)throw new Error('Radius must be finite and nonnegative');
  return Math.min(1,radius**3);
}
export const DURATION=192;
export const chapters = [
  {start:0,end:16,title:'A ball of charge'},
  {start:16,end:34,title:'One small charge'},
  {start:34,end:50,title:'Use the symmetry'},
  {start:50,end:72,title:'The triple integral'},
  {start:72,end:98,title:'Integrate the angles'},
  {start:98,end:116,title:'Why shells cancel'},
  {start:116,end:136,title:'The radial integral'},
  {start:136,end:153,title:'Inside & outside'},
  {start:153,end:178,title:'Draw the field'},
  {start:178,end:192,title:'Gauss’s law: a check'},
] as const;
export function chapterAt(t:number):number { for(let i=chapters.length-1;i>=0;i--)if(t>=chapters[i].start)return i;return 0; }
export function scriptedRadius(t:number):number {
  const ease=(a:number,b:number,start:number,duration:number)=>{const p=Math.max(0,Math.min(1,(t-start)/duration)),s=p*p*(3-2*p);return a+(b-a)*s;};
  if(t<98)return 1.55;
  if(t<116)return ease(1.55,.52,105,3);
  if(t<136)return ease(.52,.72,116,2);
  if(t<153)return ease(.72,1.6,144,3);
  if(t<157)return 0;
  if(t<164)return ease(0,1,157,7);
  if(t<178)return ease(1,2.7,166,8);
  return ease(2.7,1.45,178,2);
}
