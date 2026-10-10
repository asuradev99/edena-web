import { Geometry } from './geometry.js';
import { type Color, type Vec3 } from './math.js';
export type ElementMode = '3d' | '2d';
export declare class Visual {
    geometry: Geometry;
    color: Color;
    /** 2D elements face the camera while retaining world position, scale and depth. */
    mode: ElementMode;
    position: Vec3;
    scale: Vec3;
    /** Turn about +y. For a full 3D pose, set `orientation` as well. */
    rotation: number;
    /** Optional Euler rotation in radians, applied x then y then z, before `rotation`. */
    orientation: Vec3 | undefined;
    opacity: number;
    visible: boolean;
    reveal: number;
    /**
     * Wireframe override. Left undefined, a mesh that carries the `wireframe` hint on its `Geometry`
     * (the solids and parametric surfaces) draws its contours whenever it is rendered in one flat
     * colour — the default look for a 3D object. `false` suppresses it, which is what a crystal does
     * for four hundred atoms that should not each wear a wire cage; `true` forces it on.
     */
    wireframe: boolean | undefined;
    /**
     * Colour of this node's contour lines, when it draws any. Defaults to white, which reads on every
     * mesh colour the pages use; set it when a mesh is itself white or near-white.
     */
    wireframeColor: Color | undefined;
    /**
     * Geometry is normally treated as immutable and shared. It is writable for the rare
     * animated shape (a re-sized volume element, a live arrow); the renderer re-uploads the
     * position buffer when the object identity changes.
     */
    constructor(geometry: Geometry, color?: Color);
    get matrix(): Float32Array;
}
export declare class Group {
    /** Apply camera-facing 2D orientation to this group and its contents. */
    mode: ElementMode;
    /** Local transform, shared with attached labels and other annotations. */
    get matrix(): Float32Array;
    position: Vec3;
    scale: Vec3;
    rotation: number;
    /** Optional Euler rotation in radians, applied x then y then z, before `rotation`. */
    orientation: Vec3 | undefined;
    opacity: number;
    visible: boolean;
    readonly children: (Visual | Group)[];
    add(...nodes: (Visual | Group)[]): this;
    private contains;
    /** Remove one or more nodes; nodes that are not children are ignored. */
    remove(...nodes: (Visual | Group)[]): void;
    clear(): void;
    flatten(parent?: Float32Array, opacity?: number): Generator<{
        node: Visual;
        matrix: Float32Array;
        opacity: number;
    }>;
}
export declare class World extends Group {
}
