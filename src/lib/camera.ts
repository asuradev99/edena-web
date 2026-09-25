import { cross, normalize, multiply, identity, clamp, type Vec3 } from './math.js';

export type ProjectionMode = 'orthographic' | 'perspective';

/** Orbit camera with an orthographic default for plots and an opt-in perspective mode for 3D scenes. */
export class OrbitCamera {
  yaw=.38; pitch=.22; height=5.6;
  projection:ProjectionMode='orthographic';
  /** Vertical field of view used by perspective projection. */
  fovY=Math.PI/4;
  near=.01; far=1000; distance=10;
  target:Vec3=[0,0,0];
  matrix(aspect:number):Float32Array {
    if(!Number.isFinite(aspect)||aspect<=0)throw new Error('Camera aspect must be positive');
    const back:Vec3=[Math.sin(this.yaw)*Math.cos(this.pitch),Math.sin(this.pitch),Math.cos(this.yaw)*Math.cos(this.pitch)];
    const right=normalize(cross([0,1,0],back)), up=cross(back,right);
    const view=identity();
    for(let i=0;i<3;i++) { view[i*4]=right[i];view[i*4+1]=up[i];view[i*4+2]=back[i]; }
    view[12]=-right.reduce((s,x,i)=>s+x*this.target[i],0);
    view[13]=-up.reduce((s,x,i)=>s+x*this.target[i],0);
    view[14]=-this.distance-back.reduce((s,x,i)=>s+x*this.target[i],0);
    const proj=this.projection==='perspective'?perspective(this.fovY,aspect,this.near,this.far):orthographic(this.height,aspect);
    return multiply(proj,view);
  }
  project(point:Vec3, width:number,height:number):[number,number] {
    return this.projectWith(this.matrix(width/height),point,width,height);
  }
  /** Project with a matrix computed once, so many labels share one camera evaluation per frame. */
  projectWith(m:Float32Array, point:Vec3, width:number,height:number):[number,number] {
    const x=m[0]*point[0]+m[4]*point[1]+m[8]*point[2]+m[12];
    const y=m[1]*point[0]+m[5]*point[1]+m[9]*point[2]+m[13];
    const w=m[3]*point[0]+m[7]*point[1]+m[11]*point[2]+m[15] || 1;
    return [(x/w+1)*width/2,(1-y/w)*height/2];
  }
  /**
   * Set while something else owns the gesture — a demo dragging a handle on the canvas — so the
   * orbit control leaves the pointer alone. `attachHandles` in `interact.ts` maintains it.
   */
  locked=false;
  /**
   * A world-space ray through a canvas pixel, with its origin on the camera plane. Orthographic
   * cameras get parallel rays; perspective cameras get a pinhole. Used for picking.
   */
  ray(px:number,py:number,width:number,height:number):{origin:Vec3;direction:Vec3} {
    if(!(width>0)||!(height>0))throw new Error('A picking ray needs a positive viewport');
    const back:Vec3=[Math.sin(this.yaw)*Math.cos(this.pitch),Math.sin(this.pitch),Math.cos(this.yaw)*Math.cos(this.pitch)];
    const right=normalize(cross([0,1,0],back)), up=cross(back,right);
    const eye:Vec3=[this.target[0]+back[0]*this.distance,this.target[1]+back[1]*this.distance,this.target[2]+back[2]*this.distance];
    const ndcX=(px/width)*2-1, ndcY=1-(py/height)*2;
    if(this.projection==='perspective'){
      const f=1/Math.tan(this.fovY/2), vx=ndcX*(width/height)/f, vy=ndcY/f;
      const direction:Vec3=[right[0]*vx+up[0]*vy-back[0],right[1]*vx+up[1]*vy-back[1],right[2]*vx+up[2]*vy-back[2]];
      return {origin:eye,direction:normalize(direction)};
    }
    const half=this.height/2, aspect=width/height;
    return {origin:[
      eye[0]+right[0]*ndcX*half*aspect+up[0]*ndcY*half,
      eye[1]+right[1]*ndcX*half*aspect+up[1]*ndcY*half,
      eye[2]+right[2]*ndcX*half*aspect+up[2]*ndcY*half,
    ],direction:[-back[0],-back[1],-back[2]]};
  }
  attach(canvas:HTMLCanvasElement):()=>void {
    const abort=new AbortController(), opts={signal:abort.signal}; let active=false, x=0,y=0;
    canvas.addEventListener('pointerdown',e=>{if(e.button!==0||this.locked)return; active=true;x=e.clientX;y=e.clientY;try{canvas.setPointerCapture(e.pointerId);}catch{/* synthetic pointers have no capture target */}},opts);
    canvas.addEventListener('pointermove',e=>{if(!active||this.locked)return;this.yaw-=(e.clientX-x)*.006;this.pitch=clamp(this.pitch+(e.clientY-y)*.006,-1.4,1.4);x=e.clientX;y=e.clientY;},opts);
    const end=()=>{active=false;};
    canvas.addEventListener('pointerup',end,opts);canvas.addEventListener('pointercancel',end,opts);canvas.addEventListener('lostpointercapture',end,opts);
    canvas.addEventListener('wheel',e=>{
      e.preventDefault();
      if(this.projection==='perspective')this.distance=clamp(this.distance*Math.exp(e.deltaY*.001),.2,1000);
      else this.height=clamp(this.height*Math.exp(e.deltaY*.001),.05,1000);
    },{...opts,passive:false});
    return ()=>abort.abort();
  }
}

function orthographic(height:number,aspect:number):Float32Array {
  if(!Number.isFinite(height)||height<=0)throw new Error('Camera height must be positive');
  const proj=identity(); proj[0]=2/(height*aspect);proj[5]=2/height;proj[10]=-1/100;proj[14]=0;return proj;
}

/** WebGPU's depth range is [0, 1], so this matrix differs from OpenGL's. */
function perspective(fovY:number,aspect:number,near:number,far:number):Float32Array {
  if(!Number.isFinite(fovY)||fovY<=0||fovY>=Math.PI||!Number.isFinite(near)||!Number.isFinite(far)||near<=0||far<=near)throw new Error('Invalid perspective camera parameters');
  const f=1/Math.tan(fovY/2), nf=1/(near-far), proj=new Float32Array(16);
  proj[0]=f/aspect;proj[5]=f;proj[10]=far*nf;proj[11]=-1;proj[14]=near*far*nf;return proj;
}
