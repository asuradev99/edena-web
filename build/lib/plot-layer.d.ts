import { Group } from './world.js';
import type { PlotFrame } from './plot.js';
import type { LabelLayer } from './labels.js';
/** A complete chart frame with aligned labels and owned resources. Update it without accumulating
 * old ticks, geometries or glyph textures. Curves and other data remain ordinary world objects. */
export declare class PlotLayer {
    private world;
    private labels;
    readonly group: Group;
    tickLabels: HTMLSpanElement[];
    titleLabels: HTMLSpanElement[];
    private parts;
    private ticks;
    private titles;
    constructor(world: Group, labels: LabelLayer, frame: PlotFrame);
    update(frame: PlotFrame): void;
    private updateLabels;
    dispose(): void;
}
