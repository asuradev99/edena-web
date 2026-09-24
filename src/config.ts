import { Sphere, PhysicsParams, AtomType, Bond } from "./types.js";

// ── On-disk schema ────────────────────────────────────────────────────────────

export interface SerializedSphere {
  position: [number, number, number];
  velocity: [number, number, number];
  radius:   number;
  color:    [number, number, number];
  type?:    AtomType;
}

export interface Config {
  version:  1;
  physics:  PhysicsParams;
  spheres:  SerializedSphere[];
  bonds?:   Bond[];
}

// ── Conversions ───────────────────────────────────────────────────────────────

export function spheresToConfig(spheres: Sphere[], physics: PhysicsParams, bonds: Bond[] = []): Config {
  return {
    version: 1,
    physics: { ...physics },
    spheres: spheres.map(s => ({
      position: [...s.position] as [number, number, number],
      velocity: [...s.velocity] as [number, number, number],
      radius:   s.radius,
      color:    [...s.color]    as [number, number, number],
      type:     s.type,
    })),
    bonds: bonds.map(b => ({ ...b })),
  };
}

export function configToSpheres(cfg: Config): Sphere[] {
  return cfg.spheres.map((s, i) => ({
    id:       i + 1,
    position: [...s.position] as [number, number, number],
    velocity: [...s.velocity] as [number, number, number],
    radius:   s.radius,
    mass:     s.radius ** 3 * 50,
    color:    [...s.color]    as [number, number, number],
    type:     s.type === 2 ? 2 : 1,
  }));
}

// ── File I/O ──────────────────────────────────────────────────────────────────

export function saveConfig(cfg: Config, filename = "edena-config.json"): void {
  const json = JSON.stringify(cfg, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Returns null if the JSON is invalid or the version is unrecognised. */
export function parseConfig(json: string): Config | null {
  try {
    const obj = JSON.parse(json) as Partial<Config>;
    if (obj.version !== 1 || !Array.isArray(obj.spheres) || !obj.physics) return null;
    return obj as Config;
  } catch {
    return null;
  }
}

/** Opens a file-picker and resolves with the parsed config (or null on cancel / parse failure). */
export function loadConfigFromFile(): Promise<Config | null> {
  return new Promise(resolve => {
    const input = document.createElement("input");
    input.type   = "file";
    input.accept = ".json,application/json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = () => resolve(parseConfig(reader.result as string));
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}
