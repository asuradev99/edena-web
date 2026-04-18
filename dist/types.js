export const BOX_HALF = 5;
export const DEFAULT_PHYSICS = {
    integrator: "velocity-verlet",
    radius: 0.25,
    timeScale: 1.0,
    gravity: 0.0,
    ljEps: 0.10, // weakened — LJ now handles collisions; springs handle structure
    ljMin: 0.80,
    ljCutoff: 2.5,
    damping: 0.999,
    colorByKE: false,
    keScale: 5.0,
    showForces: false,
    springK: 5.0,
    boxHalf: 5.0,
};
//# sourceMappingURL=types.js.map