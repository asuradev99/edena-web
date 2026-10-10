const magnitude = (v) => Math.hypot(...v);
/**
 * Trace one field line with classic RK4, normalising at each evaluation so `step` is an arc
 * length and the line does not bunch up where the field is strong. Non-finite samples end the
 * line instead of poisoning it.
 */
export function streamline(field, start, time = 0, options = {}) {
    const step = options.step ?? .06, steps = options.steps ?? 600, maxLength = options.maxLength ?? step * steps;
    const minStrength = options.minStrength ?? 1e-6, bounds = options.bounds;
    const direction = (point, sign) => {
        const value = field(point, time);
        if (!value.every(Number.isFinite))
            return undefined;
        const strength = magnitude(value);
        if (strength < minStrength)
            return undefined;
        return [sign * value[0] / strength, sign * value[1] / strength, sign * value[2] / strength];
    };
    const inside = (point) => !bounds || point.every((value, axis) => value >= bounds.min[axis] && value <= bounds.max[axis]);
    const half = (sign) => {
        const points = [];
        let point = [...start], length = 0;
        for (let i = 0; i < steps && length < maxLength; i++) {
            const k1 = direction(point, sign);
            if (!k1 || !inside(point))
                break;
            const p2 = [point[0] + k1[0] * step / 2, point[1] + k1[1] * step / 2, point[2] + k1[2] * step / 2];
            const k2 = direction(p2, sign) ?? k1;
            const p3 = [point[0] + k2[0] * step / 2, point[1] + k2[1] * step / 2, point[2] + k2[2] * step / 2];
            const k3 = direction(p3, sign) ?? k2;
            const p4 = [point[0] + k3[0] * step, point[1] + k3[1] * step, point[2] + k3[2] * step];
            const k4 = direction(p4, sign) ?? k3;
            const next = [
                point[0] + step / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
                point[1] + step / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
                point[2] + step / 6 * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]),
            ];
            if (!next.every(Number.isFinite))
                break;
            length += Math.hypot(next[0] - point[0], next[1] - point[1], next[2] - point[2]);
            point = next;
            const strength = magnitude(field(point, time));
            if (options.stop?.(point, strength)) {
                points.push(point);
                break;
            }
            points.push(point);
        }
        return points;
    };
    if (options.both)
        return [...half(-1).reverse(), [...start], ...half(1)];
    return [[...start], ...half(1)];
}
/**
 * Trace many field lines and drop the ones that are too short to read (for example a seed
 * that landed on a stagnation point).
 */
export function streamlines(field, seeds, time = 0, options = {}) {
    const minPoints = options.minPoints ?? 3;
    return seeds.map(seed => streamline(field, seed, time, options)).filter(line => line.length >= minPoints);
}
/** A sphere of unit seeds, rotated so no two lines start on top of each other. */
export function sphereSeeds(count, radius = 1) {
    const seeds = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < count; i++) {
        const y = 1 - 2 * (i + .5) / count;
        const ring = Math.sqrt(Math.max(0, 1 - y * y));
        const angle = golden * i;
        seeds.push([radius * ring * Math.cos(angle), radius * y, radius * ring * Math.sin(angle)]);
    }
    return seeds;
}
//# sourceMappingURL=vectorfield.js.map