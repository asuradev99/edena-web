// ── Conversions ───────────────────────────────────────────────────────────────
export function spheresToConfig(spheres, physics) {
    return {
        version: 1,
        physics: { ...physics },
        spheres: spheres.map(s => ({
            position: [...s.position],
            velocity: [...s.velocity],
            radius: s.radius,
            color: [...s.color],
        })),
    };
}
export function configToSpheres(cfg) {
    return cfg.spheres.map((s, i) => ({
        id: i + 1,
        position: [...s.position],
        velocity: [...s.velocity],
        radius: s.radius,
        mass: s.radius ** 3 * 50,
        color: [...s.color],
    }));
}
// ── File I/O ──────────────────────────────────────────────────────────────────
export function saveConfig(cfg, filename = "edena-config.json") {
    const json = JSON.stringify(cfg, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
/** Returns null if the JSON is invalid or the version is unrecognised. */
export function parseConfig(json) {
    try {
        const obj = JSON.parse(json);
        if (obj.version !== 1 || !Array.isArray(obj.spheres) || !obj.physics)
            return null;
        return obj;
    }
    catch {
        return null;
    }
}
/** Opens a file-picker and resolves with the parsed config (or null on cancel / parse failure). */
export function loadConfigFromFile() {
    return new Promise(resolve => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json,application/json";
        input.onchange = () => {
            const file = input.files?.[0];
            if (!file) {
                resolve(null);
                return;
            }
            const reader = new FileReader();
            reader.onload = () => resolve(parseConfig(reader.result));
            reader.onerror = () => resolve(null);
            reader.readAsText(file);
        };
        input.oncancel = () => resolve(null);
        input.click();
    });
}
//# sourceMappingURL=config.js.map