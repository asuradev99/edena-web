import { Group, Visual } from './world.js';
import { rgba } from './math.js';
import type { Anchor, PlotFrame } from './plot.js';
import type { LabelLayer } from './labels.js';

type FrameLabel = { key: string; anchor: Anchor; element: HTMLSpanElement };

/** A complete chart frame with aligned labels and owned resources. Update it without accumulating
 * old ticks, geometries or glyph textures. Curves and other data remain ordinary world objects. */
export class PlotLayer {
  readonly group = new Group();
  tickLabels: HTMLSpanElement[] = [];
  titleLabels: HTMLSpanElement[] = [];
  private parts: Visual[] = [];
  private ticks: FrameLabel[] = [];
  private titles: FrameLabel[] = [];

  constructor(private world: Group, private labels: LabelLayer, frame: PlotFrame) {
    world.add(this.group);
    this.update(frame);
  }

  update(frame: PlotFrame): void {
    const geometry = [frame.minorGrid, frame.grid, frame.minor, frame.ticks, frame.axes];
    const opacity = [.08, .2, .35, .6, .85];
    geometry.forEach((shape, index) => {
      if (this.parts[index]) this.parts[index].geometry = shape;
      else {
        const part = new Visual(shape, rgba('#e8f0f6', opacity[index]));
        this.parts.push(part);
        this.group.add(part);
      }
    });
    this.ticks = this.updateLabels(this.ticks, frame.labels, '#93a6b8');
    this.titles = this.updateLabels(this.titles, frame.titles, '#cfe4ea');
    this.tickLabels = this.ticks.map(label => label.element);
    this.titleLabels = this.titles.map(label => label.element);
  }

  private updateLabels(previous: FrameLabel[], anchors: readonly Anchor[], color: string): FrameLabel[] {
    const result = anchors.map((anchor, index) => {
      // Position changes only update the point callback. Keep DOM, glyph textures and observers
      // when an axis is rebuilt with the same text and alignment.
      const key = JSON.stringify([anchor.text, anchor.math, anchor.anchor, anchor.vertical, anchor.offset]);
      const label = previous[index];
      if (label?.key === key) { label.anchor.position = anchor.position; return label; }
      if (label) this.labels.remove(label.element);
      const owned = { ...anchor };
      const [element] = this.labels.addAnchors([owned], color, 'math-label', this.group);
      return { key, anchor: owned, element };
    });
    this.labels.remove(...previous.slice(anchors.length).map(label => label.element));
    return result;
  }

  dispose(): void {
    this.labels.remove(...this.tickLabels, ...this.titleLabels);
    this.tickLabels = []; this.titleLabels = [];
    this.ticks = []; this.titles = [];
    this.world.remove(this.group);
  }
}
