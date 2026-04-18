// Run with: node scripts/gen-default-config.mjs
// Generates default-config.json — 200 particles on a simple cubic lattice,
// zero velocity, default physics params.

import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Default physics (must match DEFAULT_PHYSICS in types.ts) ──────────────────
const DEFAULT_PHYSICS = {
  integrator: "velocity-verlet",
  radius:     0.25,
  timeScale:  1.0,
  gravity:    0.0,
  ljEps:      0.10,    // weakened — springs handle structure, LJ handles collisions
  ljMin:      0.80,
  ljCutoff:   2.5,
  damping:    0.999,
  colorByKE:  false,
  keScale:    5.0,
  showForces: false,
  springK:    5.0,
  boxHalf:    5.0,
};

// ── Golden-angle colour spread ────────────────────────────────────────────────
function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2*l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if      (h < 60)  { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else              { r = c; b = x; }
  return [
    Math.round((r + m) * 1000) / 1000,
    Math.round((g + m) * 1000) / 1000,
    Math.round((b + m) * 1000) / 1000,
  ];
}

// ── FCC layout: 4×4×4 supercell = 256 atoms ──────────────────────────────────
//
// FCC conventional unit cell (lattice constant a):
//   basis atoms at (0,0,0), (a/2,a/2,0), (a/2,0,a/2), (0,a/2,a/2)
//   → 4 atoms/cell × 4³ cells = 256 atoms
//   → nearest-neighbour distance = a/√2
//   → with NN_DIST = 0.65, a = 0.65 × √2 ≈ 0.919
//   → each atom has exactly 12 nearest neighbours
//
const NN_DIST = 0.65;
const A       = NN_DIST * Math.sqrt(2);   // ≈ 0.9192
const NCELLS  = 4;                        // supercell side length in unit cells

// FCC basis (in units of A)
const BASIS = [
  [0,   0,   0  ],
  [0.5, 0.5, 0  ],
  [0.5, 0,   0.5],
  [0,   0.5, 0.5],
];

// Lattice extent: 0 to (NCELLS-1)*A + A/2 = 3.5*A  → centre = 1.75*A
const CENTER = 1.75 * A;

const spheres = [];
let hue = 0;

for (let ix = 0; ix < NCELLS; ix++) {
  for (let iy = 0; iy < NCELLS; iy++) {
    for (let iz = 0; iz < NCELLS; iz++) {
      for (const [bx, by, bz] of BASIS) {
        hue = (hue + 137.508) % 360;
        spheres.push({
          position: [
            +((ix + bx) * A - CENTER).toFixed(5),
            +((iy + by) * A - CENTER).toFixed(5),
            +((iz + bz) * A - CENTER).toFixed(5),
          ],
          velocity: [0, 0, 0],
          radius:   0.25,
          color:    hslToRgb(hue, 0.75, 0.62),
        });
      }
    }
  }
}

const config = {
  version: 1,
  physics: DEFAULT_PHYSICS,
  spheres,
};

const outPath = join(__dirname, "..", "default-config.json");
writeFileSync(outPath, JSON.stringify(config, null, 2), "utf8");
console.log(`Wrote ${spheres.length} particles to ${outPath}`);
