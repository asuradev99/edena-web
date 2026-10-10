import { length, sub } from './math.js';
import { Text } from './text.js';
import { viewFor } from './view-registry.js';
import { mathml, mtext } from './mathtext.js';
import { latex } from './latex.js';
/** World-anchored text. Scene labels use cached GPU glyphs and the scene depth buffer;
 * captions with occlude:false and cameras without a view use ordinary DOM projection. */
export class LabelLayer {
    host;
    camera;
    labels = [];
    observer;
    dirty = true;
    width = 0;
    height = 0;
    occlude;
    billboard;
    faceCamera;
    constructor(host, camera, options = {}) {
        this.host = host;
        this.camera = camera;
        this.occlude = options.occlude ?? true;
        this.billboard = options.billboard ?? false;
        this.faceCamera = options.faceCamera ?? false;
        this.observer = new ResizeObserver(() => { this.dirty = true; });
        this.observer.observe(host);
    }
    add(text, point, color = '#ffffff', anchor = 'center', flags = {}) {
        const element = this.create(point, color, anchor, flags);
        element.textContent = text;
        return element;
    }
    /**
     * Label whose content is HTML, so it can carry MathML — from the `mathtext` builders or from
     * {@link ./latex}. The page styles the host and can target the optional class.
     */
    addHTML(html, point, color = '#ffffff', className = '', anchor = 'center', flags = {}) {
        const element = this.create(point, color, anchor, flags);
        element.innerHTML = html;
        if (className)
            element.className = className;
        return element;
    }
    /**
     * Label written in LaTeX: `addMath('\frac{d f}{d x}', () => point)`. A stacked fraction or a
     * radical is asked for rather than approximated — `\frac{a}{b}` prints a fraction, not `a/b`.
     */
    addMath(source, point, color = '#ffffff', className = 'math-label', anchor = 'center', flags = {}) {
        return this.addHTML(latex(source), point, color, className, anchor, flags);
    }
    /** Plot-generated alignment and pixel gaps work identically for GPU and DOM labels. */
    addAnchors(anchors, color = '#93a6b8', className = 'math-label', parent) {
        return anchors.map(anchor => this.addHTML(mathml(anchor.math ?? mtext(anchor.text)), () => anchor.position, color, className, anchor.anchor ?? 'center', { ...anchor, parent }));
    }
    /** Access the scene object to rotate or scale a label. Position follows its point callback. */
    object(element) {
        const object = this.labels.find(label => label.element === element)?.object;
        if (!object)
            throw new Error('This label is a billboard or overlay, not a world-space Text');
        return object;
    }
    /** Remove labels and release their GPU textures, observers and uniform slots together. */
    remove(...elements) {
        const removed = new Set(elements);
        this.labels = this.labels.filter(label => {
            if (!removed.has(label.element))
                return true;
            if (label.depth)
                viewFor(this.camera)?.text.remove(label.depth);
            if (label.object)
                label.parent?.remove(label.object);
            label.element.remove();
            return false;
        });
    }
    create(point, color, anchor = 'center', flags = {}) {
        const element = document.createElement('span');
        const horizontal = anchor === 'left' ? 0 : anchor === 'right' ? 1 : .5;
        const vertical = flags.vertical === 'top' ? 0 : flags.vertical === 'bottom' ? 1 : .5;
        const shift = `translate(${-100 * horizontal}%, ${-100 * vertical}%)`;
        Object.assign(element.style, { position: 'absolute', left: '0', top: '0', color, pointerEvents: 'none', transform: shift, whiteSpace: 'nowrap', visibility: 'hidden', textShadow: 'none',
            marginLeft: `${flags.offset?.[0] ?? 0}px`, marginTop: `${flags.offset?.[1] ?? 0}px` });
        this.host.append(element);
        const view = viewFor(this.camera);
        const depthEnabled = this.occlude && (flags.occlude ?? true);
        const object = view && depthEnabled && !(flags.billboard ?? this.billboard)
            ? new Text(element, { anchor, vertical: flags.vertical, faceCamera: flags.faceCamera ?? this.faceCamera }) : undefined;
        const parent = object ? flags.parent ?? view.world : undefined;
        if (object)
            parent.add(object);
        const depth = object ? view.text.addObject(object, true)
            : depthEnabled ? view?.text.add(element, point, horizontal, vertical) : undefined;
        if (depth)
            element.style.clipPath = 'inset(50%)';
        this.labels.push({ element, point, depth, object, parent, distance: 0, horizontal, vertical,
            keepInView: !object && (flags.keepInView ?? true) });
        return element;
    }
    // Read layout only after a resize. CSS translate moves text without changing its layout or
    // overriding the anchor transform. Preserve subpixel placement (no camera-motion snapping).
    update() {
        if (this.dirty) {
            this.width = this.host.clientWidth;
            this.height = this.host.clientHeight;
            this.dirty = false;
        }
        const width = this.width, height = this.height;
        if (width <= 0 || height <= 0) {
            for (const { element } of this.labels)
                element.style.visibility = 'hidden';
            return;
        }
        const matrix = this.camera.matrix(width / height);
        let eye;
        const overlays = [];
        for (const label of this.labels) {
            const p = label.point();
            if (label.object) {
                const boxHeight = label.depth?.ready ? label.depth.height - 2 * label.depth.padding : label.element.offsetHeight;
                if (boxHeight > 0) {
                    // Establish world units once. Camera zoom thereafter scales the text with the scene.
                    label.units ??= (this.camera.mode === '2d' || this.camera.projection === 'orthographic' ? this.camera.height
                        : 2 * this.camera.distance * Math.tan(this.camera.fovY / 2)) / height;
                    label.object.height = boxHeight * label.units;
                }
                const units = label.units ?? 0;
                label.object.position = [p[0] + (parseFloat(label.element.style.marginLeft) || 0) * units,
                    p[1] - (parseFloat(label.element.style.marginTop) || 0) * units, p[2]];
                // The renderer positions the accessibility copy with the complete world matrix,
                // including nested and camera-facing groups, in the same frame as the glyphs.
                continue;
            }
            const z = matrix[2] * p[0] + matrix[6] * p[1] + matrix[10] * p[2] + matrix[14];
            const w = matrix[3] * p[0] + matrix[7] * p[1] + matrix[11] * p[2] + matrix[15];
            const clipX = matrix[0] * p[0] + matrix[4] * p[1] + matrix[8] * p[2] + matrix[12];
            const clipY = matrix[1] * p[0] + matrix[5] * p[1] + matrix[9] * p[2] + matrix[13];
            let x = (clipX / (w || 1) + 1) * width / 2;
            let y = (1 - clipY / (w || 1)) * height / 2;
            // Match WebGPU's clip volume for both text paths.
            const visible = Number.isFinite(x) && Number.isFinite(y) && w > 0 && z >= 0 && z <= w
                && x >= 0 && x <= width && y >= 0 && y <= height;
            const marginX = parseFloat(label.element.style.marginLeft) || 0;
            const marginY = parseFloat(label.element.style.marginTop) || 0;
            const projectedX = x, projectedY = y;
            x += marginX;
            y += marginY;
            if (visible && label.keepInView && (!label.depth || label.depth.ready || label.depth.fallback)) {
                const boxWidth = label.depth?.ready ? label.depth.width - 2 * label.depth.padding : label.element.offsetWidth;
                const boxHeight = label.depth?.ready ? label.depth.height - 2 * label.depth.padding : label.element.offsetHeight;
                x = constrain(x, boxWidth, label.horizontal, width);
                y = constrain(y, boxHeight, label.vertical, height);
            }
            if (label.depth) {
                label.depth.offset[0] = x - projectedX;
                label.depth.offset[1] = y - projectedY;
            }
            // CSS margins are applied by the DOM; the GPU offset already includes them.
            x -= parseFloat(label.element.style.marginLeft) || 0;
            y -= parseFloat(label.element.style.marginTop) || 0;
            if (label.depth?.ready) {
                const visibility = visible ? 'visible' : 'hidden';
                if (label.element.style.visibility !== visibility)
                    label.element.style.visibility = visibility;
                const hidden = visible ? 'false' : 'true';
                if (label.element.getAttribute('aria-hidden') !== hidden)
                    label.element.setAttribute('aria-hidden', hidden);
                if (visible) {
                    // Keep the clipped accessibility copy anchored for browser tools and consumers that
                    // inspect label positions. The actual glyphs still render once through the depth buffer.
                    const translation = `${x}px ${y}px`;
                    if (label.element.style.translate !== translation)
                        label.element.style.translate = translation;
                }
                continue;
            }
            if (label.depth && !label.depth.fallback) {
                // Keep the accessibility copy out of the picture while its GPU glyphs are loading.
                if (label.element.style.clipPath !== 'inset(50%)')
                    label.element.style.clipPath = 'inset(50%)';
                const visibility = visible ? 'visible' : 'hidden';
                if (label.element.style.visibility !== visibility)
                    label.element.style.visibility = visibility;
                continue;
            }
            const visibility = visible ? 'visible' : 'hidden';
            if (label.element.style.visibility !== visibility)
                label.element.style.visibility = visibility;
            if (!visible)
                continue;
            label.distance = length(sub(p, eye ??= this.camera.ray(width / 2, height / 2, width, height).origin));
            const translation = `${x}px ${y}px`;
            if (label.element.style.translate !== translation)
                label.element.style.translate = translation;
            overlays.push(label);
        }
        // Only intentional DOM overlays need CSS stacking. Depth-tested labels use the GPU z buffer.
        if (overlays.length === 1) {
            const element = overlays[0].element;
            if (element.style.zIndex !== '0')
                element.style.zIndex = '0';
            return;
        }
        if (!overlays.length)
            return;
        overlays.sort((a, b) => b.distance - a.distance);
        overlays.forEach((label, index) => {
            const zIndex = String(index);
            if (label.element.style.zIndex !== zIndex)
                label.element.style.zIndex = zIndex;
        });
    }
    dispose() {
        this.observer.disconnect();
        for (const { element, depth, object, parent } of this.labels) {
            if (depth)
                viewFor(this.camera)?.text.remove(depth);
            if (object)
                parent?.remove(object);
            element.remove();
        }
        this.labels = [];
    }
}
function constrain(value, size, anchor, extent) {
    const low = 4 + size * anchor, high = extent - 4 - size * (1 - anchor);
    return low <= high ? Math.max(low, Math.min(high, value)) : extent / 2 + size * (anchor - .5);
}
//# sourceMappingURL=labels.js.map