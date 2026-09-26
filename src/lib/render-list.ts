import { Group, Visual } from './world.js';
import { identity, multiply, transform } from './math.js';

type Node = Group | Visual;
/** One drawable Visual with the world matrix it is drawn with, and its inherited opacity. */
export type SceneEntry = {node:Visual;matrix:Float32Array;opacity:number};
type Entry = SceneEntry;
type Cached = {values:(number | undefined)[];local:Float32Array;parent?:Float32Array;world:Float32Array;identity:boolean};

/** Renderer-private traversal. Public flatten() still returns independent matrix snapshots.
 * Matrices in this cache are immutable; a changed ancestor invalidates descendants by identity.
 * Compare scalar values to notice in-place edits to the public position/scale/orientation arrays.
 */
export class RenderList {
  private transforms=new WeakMap<Node,Cached>();
  private root=identity();
  private entries:Entry[]=[];
  private count=0;

  collect(world:Group):readonly Entry[] {
    this.count=0;this.visit(world,this.root,1);
    this.entries.length=this.count;
    return this.entries;
  }

  private matrix(node: Node, parent: Float32Array): Float32Array {
    let cache = this.transforms.get(node);
    const p = node.position, s = node.scale, o = node.orientation;
    const values = cache?.values;
    const sameBasis = values && values[3] === s[0] && values[4] === s[1] && values[5] === s[2]
      && values[6] === node.rotation && values[7] === o?.[0] && values[8] === o?.[1] && values[9] === o?.[2];
    const samePosition = values && values[0] === p[0] && values[1] === p[1] && values[2] === p[2];
    if (!sameBasis || !samePosition) {
      // Translation animation preserves the basis: copy its nine coefficients instead of
      // rebuilding rotations. Published frame matrices remain immutable snapshots.
      const local = sameBasis ? new Float32Array(cache!.local) : transform(p, s, node.rotation, o);
      if (sameBasis) { local[12] = p[0]; local[13] = p[1]; local[14] = p[2]; }
      // Multiplication by identity canonicalizes signed zero; preserve that result when eliding it.
      for (let i = 0; i < 16; i++) if (local[i] === 0) local[i] = 0;
      const identity = p[0] === 0 && p[1] === 0 && p[2] === 0
        && s[0] === 1 && s[1] === 1 && s[2] === 1 && node.rotation === 0
        && (!o || o.every(value => value === 0));
      if (!cache) {
        cache = { values: new Array(10), local, world: local, identity };
        this.transforms.set(node, cache);
      }
      const v = cache.values;
      for (let axis = 0; axis < 3; axis++) { v[axis] = p[axis]; v[axis + 3] = s[axis]; v[axis + 7] = o?.[axis]; }
      v[6] = node.rotation;
      cache.local = local;
      cache.identity = identity;
      cache.parent = undefined;
    }
    if (cache!.parent !== parent) {
      cache!.world = cache!.identity ? parent : parent === this.root ? cache!.local : multiply(parent, cache!.local);
      cache!.parent = parent;
    }
    return cache!.world;
  }

  private visit(node:Node,parent:Float32Array,opacity:number):void {
    if(!node.visible)return;
    const matrix=this.matrix(node,parent),alpha=opacity*node.opacity;
    if(node instanceof Group){for(const child of node.children)this.visit(child,matrix,alpha);}
    else {
      const entry=this.entries[this.count];
      if(entry){entry.node=node;entry.matrix=matrix;entry.opacity=alpha;}
      else this.entries.push({node,matrix,opacity:alpha});
      this.count++;
    }
  }
}
