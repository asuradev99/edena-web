import { identity, multiply, transform } from './math.js';
export class Visual {
    geometry;
    color;
    /** 2D elements face the camera while retaining world position, scale and depth. */
    mode = '3d';
    position = [0, 0, 0];
    scale = [1, 1, 1];
    /** Turn about +y. For a full 3D pose, set `orientation` as well. */
    rotation = 0;
    /** Optional Euler rotation in radians, applied x then y then z, before `rotation`. */
    orientation;
    opacity = 1;
    visible = true;
    reveal = 1;
    /**
     * Wireframe override. Left undefined, a mesh that carries the `wireframe` hint on its `Geometry`
     * (the solids and parametric surfaces) draws its contours whenever it is rendered in one flat
     * colour — the default look for a 3D object. `false` suppresses it, which is what a crystal does
     * for four hundred atoms that should not each wear a wire cage; `true` forces it on.
     */
    wireframe;
    /**
     * Colour of this node's contour lines, when it draws any. Defaults to white, which reads on every
     * mesh colour the pages use; set it when a mesh is itself white or near-white.
     */
    wireframeColor;
    /**
     * Geometry is normally treated as immutable and shared. It is writable for the rare
     * animated shape (a re-sized volume element, a live arrow); the renderer re-uploads the
     * position buffer when the object identity changes.
     */
    constructor(geometry, color = [1, 1, 1, 1]) {
        this.geometry = geometry;
        this.color = color;
    }
    get matrix() { return transform(this.position, this.scale, this.rotation, this.orientation); }
}
export class Group {
    /** Apply camera-facing 2D orientation to this group and its contents. */
    mode = '3d';
    /** Local transform, shared with attached labels and other annotations. */
    get matrix() { return transform(this.position, this.scale, this.rotation, this.orientation); }
    position = [0, 0, 0];
    scale = [1, 1, 1];
    rotation = 0;
    /** Optional Euler rotation in radians, applied x then y then z, before `rotation`. */
    orientation;
    opacity = 1;
    visible = true;
    children = [];
    add(...nodes) {
        const existing = nodes.length > 8 ? new Set(this.children) : undefined;
        for (const node of nodes) {
            if (node === this || (node instanceof Group && node.contains(this)))
                throw new Error('Group cycle');
            if (existing ? !existing.has(node) : !this.children.includes(node)) {
                this.children.push(node);
                existing?.add(node);
            }
        }
        return this;
    }
    contains(node) { return this.children.some(c => c === node || (c instanceof Group && c.contains(node))); }
    /** Remove one or more nodes; nodes that are not children are ignored. */
    remove(...nodes) {
        if (nodes.length === 1) {
            const index = this.children.indexOf(nodes[0]);
            if (index >= 0)
                this.children.splice(index, 1);
            return;
        }
        const removed = new Set(nodes);
        let kept = 0;
        for (const child of this.children)
            if (!removed.has(child))
                this.children[kept++] = child;
        this.children.length = kept;
    }
    clear() { this.children.length = 0; }
    *flatten(parent = identity(), opacity = 1) {
        if (!this.visible)
            return;
        const matrix = multiply(parent, transform(this.position, this.scale, this.rotation, this.orientation));
        for (const node of this.children) {
            if (!node.visible)
                continue;
            if (node instanceof Group)
                yield* node.flatten(matrix, opacity * this.opacity);
            else
                yield { node, matrix: multiply(matrix, node.matrix), opacity: opacity * this.opacity * node.opacity };
        }
    }
}
export class World extends Group {
}
//# sourceMappingURL=world.js.map