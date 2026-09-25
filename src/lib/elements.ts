/**
 * Shared chemistry table for the crystal viewer and any future example.
 *
 * Radii are approximate covalent radii in ångström. The colours are CPK hues brightened
 * for a near-black stage: the standard palette is tuned for white paper, and its darker
 * entries (carbon, iron, iodine) vanish against a dark background.
 */
export type ElementAppearance = { radius: number; color: string };

export const ELEMENTS: Record<string, ElementAppearance> = {
  H: { radius: .31, color: '#f2f2f7' }, He: { radius: .28, color: '#d6f0ff' }, Li: { radius: 1.28, color: '#cc80ff' },
  Be: { radius: .96, color: '#c2ff00' }, B: { radius: .84, color: '#ffb5b5' }, C: { radius: .76, color: '#b9b9c4' },
  N: { radius: .71, color: '#6f8dff' }, O: { radius: .66, color: '#ff4d4d' }, F: { radius: .57, color: '#8ff05a' },
  Ne: { radius: .58, color: '#b3e3f5' }, Na: { radius: 1.66, color: '#c07af0' }, Mg: { radius: 1.41, color: '#96f542' },
  Al: { radius: 1.21, color: '#d6c3c3' }, Si: { radius: 1.11, color: '#f5d6a8' }, P: { radius: 1.07, color: '#ff9a3d' },
  S: { radius: 1.05, color: '#f7f75c' }, Cl: { radius: 1.02, color: '#5cf25c' }, Ar: { radius: .97, color: '#9fe8f5' },
  K: { radius: 2.03, color: '#a86cf0' }, Ca: { radius: 1.76, color: '#67ff42' }, Ti: { radius: 1.6, color: '#cdd2d8' },
  V: { radius: 1.53, color: '#9aa7b4' }, Cr: { radius: 1.39, color: '#8fa4d6' }, Mn: { radius: 1.39, color: '#a08fd6' },
  Fe: { radius: 1.32, color: '#f0804d' }, Co: { radius: 1.26, color: '#6f9be0' }, Ni: { radius: 1.24, color: '#6ee06e' },
  Cu: { radius: 1.32, color: '#e09a52' }, Zn: { radius: 1.22, color: '#9aa0d0' }, Ga: { radius: 1.22, color: '#d6a8a8' },
  Ge: { radius: 1.2, color: '#8fb3b3' }, As: { radius: 1.19, color: '#cfa0f0' }, Se: { radius: 1.2, color: '#ffb84d' },
  Br: { radius: 1.2, color: '#e06060' }, Sr: { radius: 1.95, color: '#5cff5c' }, Y: { radius: 1.9, color: '#94ffff' },
  Zr: { radius: 1.75, color: '#a8e3e3' }, Nb: { radius: 1.64, color: '#8fc7e3' }, Mo: { radius: 1.45, color: '#7fd0d0' },
  Ag: { radius: 1.45, color: '#d8d8d8' }, Cd: { radius: 1.44, color: '#ffdf9e' }, In: { radius: 1.42, color: '#c49a94' },
  Sn: { radius: 1.39, color: '#93a8a8' }, Sb: { radius: 1.39, color: '#bd8fd0' }, Te: { radius: 1.38, color: '#e39a3d' },
  I: { radius: 1.39, color: '#c36cd6' }, Ba: { radius: 2.15, color: '#4dff4d' }, La: { radius: 2.07, color: '#8fffc3' },
  W: { radius: 1.62, color: '#6fb8ff' }, Pt: { radius: 1.36, color: '#e6e6f0' }, Au: { radius: 1.36, color: '#ffd83d' },
  Hg: { radius: 1.32, color: '#c9c9e0' }, Pb: { radius: 1.46, color: '#9aa0aa' }, Bi: { radius: 1.48, color: '#b08fd0' },
};

const FALLBACK_COLORS = ['#7fd4ff', '#ffd479', '#ff9ec4', '#b7a6ff', '#8ff0b0', '#ffb27f', '#9ad0ff', '#f0a6ff'];

/** Same symbol always gets the same fallback colour, so an unknown element is still trackable. */
export function appearanceFor(element: string): ElementAppearance {
  const key = element[0]?.toUpperCase() + element.slice(1).toLowerCase();
  const known = ELEMENTS[element] ?? ELEMENTS[key];
  if (known) return known;
  let hash = 0;
  for (const character of element) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return { radius: .85, color: FALLBACK_COLORS[hash % FALLBACK_COLORS.length] };
}
