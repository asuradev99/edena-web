export const BOX_HALF = 5;

export interface Sphere {
  id: number;
  position: [number, number, number];
  velocity: [number, number, number];
  radius: number;
  mass: number;
  color: [number, number, number]; // RGB 0..1
}

export type Integrator = "velocity-verlet";

export interface PhysicsParams {
  integrator: Integrator;
  radius:     number;   // uniform particle radius (all spheres same size)
  timeScale:  number;   // multiplier on base DT (0.1 – 4.0)
  gravity:    number;
  ljEps:      number;
  ljMin:      number;
  ljCutoff:   number;
  damping:    number;   // global velocity multiplier per substep (0.990–1.000)
  colorByKE:  boolean;
  keScale:    number;   // KE value that maps to "hot" end of heat map
  showForces: boolean;
  springK:    number;   // Hooke's law spring constant (nearest-neighbour bonds)
  boxHalf:    number;   // half-width of the simulation box (box spans ±boxHalf)
}

export const DEFAULT_PHYSICS: PhysicsParams = {
  integrator: "velocity-verlet",
  radius:     0.25,
  timeScale:  1.0,
  gravity:    0.0,
  ljEps:      0.10,    // weakened — LJ now handles collisions; springs handle structure
  ljMin:      0.80,
  ljCutoff:   2.5,
  damping:    0.999,
  colorByKE:  false,
  keScale:    5.0,
  showForces: false,
  springK:    5.0,
  boxHalf:    5.0,
};
