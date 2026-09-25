import { Geometry } from './geometry.js';
import { identity, multiply, transform, type Color, type Vec3 } from './math.js';

export class Visual {
  position:Vec3=[0,0,0];
  scale:Vec3=[1,1,1];
  /** Turn about +y. For a full 3D pose, set `orientation` as well. */
  rotation=0;
  /** Optional Euler rotation in radians, applied x then y then z, before `rotation`. */
  orientation:Vec3|undefined;
  opacity=1;
  visible=true;
  reveal=1;
  /**
   * Geometry is normally treated as immutable and shared. It is writable for the rare
   * animated shape (a re-sized volume element, a live arrow); the renderer re-uploads the
   * position buffer when the object identity changes.
   */
  constructor(public geometry:Geometry, public color:Color=[1,1,1,1]) {}
  get matrix():Float32Array { return transform(this.position,this.scale,this.rotation,this.orientation); }
}
export class Group {
  position:Vec3=[0,0,0]; scale:Vec3=[1,1,1]; rotation=0;
  /** Optional Euler rotation in radians, applied x then y then z, before `rotation`. */
  orientation:Vec3|undefined;
  opacity=1; visible=true;
  readonly children:(Visual|Group)[]=[];
  add(...nodes:(Visual|Group)[]):this {
    for(const node of nodes) {
      if(node===this || (node instanceof Group && node.contains(this))) throw new Error('Group cycle');
      if(!this.children.includes(node)) this.children.push(node);
    }
    return this;
  }
  private contains(node:Group):boolean { return this.children.some(c=>c===node||(c instanceof Group&&c.contains(node))); }
  /** Remove one or more nodes; nodes that are not children are ignored. */
  remove(...nodes:(Visual|Group)[]):void { for(const node of nodes){const index=this.children.indexOf(node); if(index>=0)this.children.splice(index,1);} }
  clear():void { this.children.length=0; }
  *flatten(parent:Float32Array=identity(), opacity=1):Generator<{node:Visual; matrix:Float32Array; opacity:number}> {
    if(!this.visible) return;
    const matrix=multiply(parent,transform(this.position,this.scale,this.rotation,this.orientation));
    for(const node of this.children) {
      if(!node.visible) continue;
      if(node instanceof Group) yield* node.flatten(matrix,opacity*this.opacity);
      else yield {node,matrix:multiply(matrix,node.matrix),opacity:opacity*this.opacity*node.opacity};
    }
  }
}
export class World extends Group {}
