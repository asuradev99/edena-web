import { type Vec3 } from './math.js';
/**
 * Unindexed triangles. Immutable geometry is shareable across visual nodes.
 *
 * Closed solids are wound outward, so a model's signed volume is positive; `box`, `cylinder` and the
 * parametric surfaces all follow that rule. The renderer does not cull or light, so this is a
 * property of the data rather than of the picture, and tests can check it cheaply.
 */
export declare class Geometry {
    readonly vertices: Float32Array;
    /** Optional per-vertex linear RGB (three floats per vertex, same length as `vertices`). */
    readonly colors?: Float32Array;
    /** Independent line segments, rendered with an antialiased width in CSS pixels. */
    readonly segments?: Float32Array;
    readonly lineWidth: number;
    /**
     * Contour lines for a surface or solid, as a line list (two positions per segment). The renderer
     * draws them over the mesh when it is painted in one flat colour, which is the default look for a
     * 3D object. They are the mesh's own *grid* — a meridian and a parallel, never the triangulation
     * diagonal — because the point is to show the form with as few lines as possible. Line art (tubes)
     * and shaded or per-vertex-coloured meshes carry none: a shaded ball already reads as a solid, and
     * outlining a tube would look furry.
     */
    readonly outline?: Float32Array;
    /** True when this geometry carries contour lines. */
    get wireframe(): boolean;
    constructor(vertices: number[] | Float32Array, colors?: number[] | Float32Array, outline?: number[] | Float32Array, lines?: {
        segments?: number[] | Float32Array;
        width?: number;
    });
}
/** Endpoint pairs with stable screen-space thickness; useful for grids, ticks and guides. */
export declare function lineSegments(points: readonly Vec3[], width?: number): Geometry;
/** Tubes give lines consistent world-space width in 3D (including WebGPU). */
export declare function polyline(points: Vec3[], width?: number, sides?: number): Geometry;
/** Concatenate geometries. Colors survive a merge; uncolored inputs become white. */
export declare function merge(...geometries: Geometry[]): Geometry;
export declare function circle(radius?: number, segments?: number, plane?: 'xy' | 'xz' | 'yz', width?: number): Geometry;
export declare function wireSphere(radius?: number, meridians?: number, parallels?: number, width?: number): Geometry;
export declare function parametricSurface(fn: (u: number, v: number) => Vec3, uRange: [number, number], vRange: [number, number], resolution?: [number, number]): Geometry;
export declare const sphere: (radius?: number) => Geometry;
/**
 * A sphere whose per-vertex colors carry a light-model shade, so the unlit triangle pipeline
 * still reads as a solid ball instead of a flat disc. The shade is greyscale; set the
 * `Visual` color to the element hue and the renderer multiplies the two together. Render a
 * larger, faint copy of the same mesh for a glow rim.
 */
export declare function shadedSphere(radius?: number, options?: {
    light?: Vec3;
    fill?: Vec3;
    ambient?: number;
    shininess?: number;
    resolution?: [number, number];
}): Geometry;
export declare const functionSurface: (f: (x: number, y: number) => number, x: [number, number], y: [number, number], resolution?: [number, number]) => Geometry;
export declare function functionCurve(fn: (x: number) => number, domain: [number, number], samples?: number, width?: number, maxJump?: number): Geometry;
/** Point in the library's spherical convention: θ from +Y, φ in the xz-plane. */
export declare const sphericalPoint: (radius: number, theta: number, phi: number) => Vec3;
/**
 * The curvilinear box a volume element cuts out of a spherical shell: radii `r0…r1`, polar
 * angles `theta0…theta1`, azimuths `phi0…phi1`. Small extents read as one `dV`; large ones
 * read as a wedge of the ball. The six faces are subdivided so the curvature stays smooth.
 */
export declare function sphericalWedge(r0: number, r1: number, theta0: number, theta1: number, phi0: number, phi1: number, subdivision?: number): Geometry;
/** The twelve edges of a spherical wedge as tubes, for a crisp wireframe over a translucent fill. */
export declare function sphericalWedgeOutline(r0: number, r1: number, theta0: number, theta1: number, phi0: number, phi1: number, width?: number, arc?: number): Geometry;
/** The twelve edges of an axis-aligned box, for cell and unit-cube wireframes. */
export declare function boxEdges(min: Vec3, max: Vec3, width?: number): Geometry;
/**
 * A solid axis-aligned box: six quads, wound outward. `boxEdges` draws the cage of a cell; this is
 * the surface itself, which is what makes a translucent solid — nested boxes, a volume element, a
 * region of a field — visible rather than a wireframe. Faces share no vertices, so a `Visual` can
 * fade one box without touching its neighbours.
 */
export declare function box(min: Vec3, max: Vec3): Geometry;
/**
 * A cylinder about the y axis, centred on the origin: the third solid the transparency demos want
 * beside `box` and `sphere`. Give `topRadius` a different value for a frustum, or zero for a cone.
 * Caps are on by default so the surface encloses a volume, which is what makes translucency read.
 */
export declare function cylinder(radius: number, height: number, sides?: number, topRadius?: number, capTop?: boolean, capBottom?: boolean): Geometry;
export declare function arrow(start: Vec3, end: Vec3, width?: number): Geometry;
