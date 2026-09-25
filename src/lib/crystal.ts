import type { Vec3 } from './math.js';

export type CrystalOperation = { rotation: number[][]; translation: Vec3; label: string };
export type CrystalStructure = {
  comment: string;
  lattice: [Vec3, Vec3, Vec3];
  species: string[];
  positions: Vec3[];
};

const number = '[-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[Ee][-+]?\\d+)?';
const vec = (line: string): Vec3 | undefined => {
  const values = line.trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
  return values.length >= 3 ? [values[0], values[1], values[2]] : undefined;
};
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cartesian = (fractional: Vec3, lattice: CrystalStructure['lattice']): Vec3 => [
  fractional[0] * lattice[0][0] + fractional[1] * lattice[1][0] + fractional[2] * lattice[2][0],
  fractional[0] * lattice[0][1] + fractional[1] * lattice[1][1] + fractional[2] * lattice[2][1],
  fractional[0] * lattice[0][2] + fractional[1] * lattice[1][2] + fractional[2] * lattice[2][2],
];
const determinant = (a: Vec3, b: Vec3, c: Vec3) => dot(a, [b[1] * c[2] - b[2] * c[1], b[2] * c[0] - b[0] * c[2], b[0] * c[1] - b[1] * c[0]]);
const fractionalFromCartesian = (p: Vec3, lattice: CrystalStructure['lattice']): Vec3 => {
  const d = determinant(lattice[0], lattice[1], lattice[2]);
  if (Math.abs(d) < 1e-12) throw new Error('POSCAR lattice vectors are linearly dependent');
  const b = lattice[1], c = lattice[2], a = lattice[0];
  return [
    dot(p, [b[1] * c[2] - b[2] * c[1], b[2] * c[0] - b[0] * c[2], b[0] * c[1] - b[1] * c[0]]) / d,
    dot(p, [c[1] * a[2] - c[2] * a[1], c[2] * a[0] - c[0] * a[2], c[0] * a[1] - c[1] * a[0]]) / d,
    dot(p, [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]) / d,
  ];
};

/** Parse VASP 5 POSCAR/CONTCAR text, including Selective dynamics and Cartesian coordinates. */
export function parsePOSCAR(text: string): CrystalStructure {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter((line, index) => line || index < 7);
  if (lines.length < 8) throw new Error('POSCAR needs a comment, scale, lattice, species/counts, and positions');
  const scale = Number(lines[1]);
  if (!Number.isFinite(scale) || scale === 0) throw new Error('POSCAR scale must be non-zero');
  const rawLattice = [vec(lines[2]), vec(lines[3]), vec(lines[4])];
  if (rawLattice.some(v => !v)) throw new Error('POSCAR has invalid lattice vectors');
  const lattice = rawLattice as [Vec3, Vec3, Vec3];
  const lengths = lattice.map(v => Math.hypot(...v));
  const factor = scale > 0 ? scale : Math.cbrt(Math.abs(scale) / Math.abs(determinant(lattice[0], lattice[1], lattice[2])));
  for (const v of lattice) for (let i = 0; i < 3; i++) v[i] *= factor;
  let cursor = 5;
  const maybeSpecies = lines[cursor].split(/\s+/);
  const hasSpecies = maybeSpecies.every(token => !Number.isNaN(Number(token)));
  const speciesNames = hasSpecies ? maybeSpecies.map((_, i) => `X${i + 1}`) : maybeSpecies;
  if (!hasSpecies) cursor++;
  const counts = lines[cursor].split(/\s+/).map(Number);
  if (!counts.length || counts.some(n => !Number.isInteger(n) || n < 0) || counts.every(n => n === 0)) throw new Error('POSCAR has invalid atom counts');
  cursor++;
  if (/^S(?:elective)?\b/i.test(lines[cursor])) cursor++;
  const direct = /^D/i.test(lines[cursor]);
  if (/^[DC]/i.test(lines[cursor])) cursor++;
  const total = counts.reduce((sum, n) => sum + n, 0), positions: Vec3[] = [], species: string[] = [];
  for (let i = 0; i < total; i++) {
    const p = vec(lines[cursor + i]);
    if (!p) throw new Error(`POSCAR position ${i + 1} is invalid`);
    const f = direct ? p : fractionalFromCartesian(p.map(x => x * factor) as Vec3, lattice);
    positions.push(f.map(x => ((x % 1) + 1) % 1) as Vec3);
    for (let s = 0; s < counts.length; s++) if (i < counts.slice(0, s + 1).reduce((a, b) => a + b, 0)) { species.push(speciesNames[s] ?? `X${s + 1}`); break; }
  }
  return { comment: lines[0], lattice, species, positions };
}

function operationKey(rotation: number[][], translation: Vec3) { return `${rotation.flat().map(v => v.toFixed(5)).join(',')}|${translation.map(v => v.toFixed(5)).join(',')}`; }

/** Parse phonopy symmetry.yaml (and the common bracketed symmetry-operation export). */
export function parsePhonopySymmetry(text: string): CrystalOperation[] {
  const source = text.replace(/#.*$/gm, '');
  const operations: CrystalOperation[] = [];
  const rotationSection = source.match(/(?:^|\n)\s*rotations\s*:\s*([\s\S]*?)(?=\n\S[^\n]*:|$)/i)?.[1] ?? source;
  const translationSection = source.match(/(?:^|\n)\s*translations\s*:\s*([\s\S]*?)(?=\n\S[^\n]*:|$)/i)?.[1] ?? '';
  const flat9 = new RegExp(`\\[\\s*(${number})\\s*,?\\s*(${number})\\s*,?\\s*(${number})\\s*,?\\s*(${number})\\s*,?\\s*(${number})\\s*,?\\s*(${number})\\s*,?\\s*(${number})\\s*,?\\s*(${number})\\s*,?\\s*(${number})\\s*\\]`, 'g');
  const translations: Vec3[] = [];
  const translationPattern = new RegExp(`\\[\\s*(${number})\\s*,?\\s*(${number})\\s*,?\\s*(${number})\\s*\\]`, 'g');
  let translationMatch: RegExpExecArray | null;
  while ((translationMatch = translationPattern.exec(translationSection))) translations.push(translationMatch.slice(1).map(Number) as Vec3);
  let flatMatch: RegExpExecArray | null;
  while ((flatMatch = flat9.exec(rotationSection))) {
    const values = flatMatch.slice(1).map(Number); const rotation = [values.slice(0, 3), values.slice(3, 6), values.slice(6, 9)]; const translation = translations[operations.length] ?? [0, 0, 0];
    if (!operations.some(op => operationKey(op.rotation, op.translation) === operationKey(rotation, translation))) operations.push({ rotation, translation, label: `R${operations.length + 1}` });
  }
  const matrix = new RegExp(`\\[\\s*\\[\\s*(${number})\\s*,?\\s*(${number})\\s*,?\\s*(${number})\\s*\\]\\s*,?\\s*\\[\\s*(${number})\\s*,?\\s*(${number})\\s*,?\\s*(${number})\\s*\\]\\s*,?\\s*\\[\\s*(${number})\\s*,?\\s*(${number})\\s*,?\\s*(${number})\\s*\\]\\s*\\]`, 'g');
  let match: RegExpExecArray | null;
  if (!operations.length) while ((match = matrix.exec(source))) {
    const values = match.slice(1).map(Number); const rotation = [values.slice(0, 3), values.slice(3, 6), values.slice(6, 9)];
    const key = operationKey(rotation, [0, 0, 0]);
    if (!operations.some(op => operationKey(op.rotation, op.translation) === key)) operations.push({ rotation, translation: [0, 0, 0], label: `R${operations.length + 1}` });
  }
  // Phonopy's canonical YAML commonly emits one row per nested list:
  // `- - [ 1 0 0 ]`, rather than one bracketed 3×3 matrix.
  if (!operations.length) {
    const section = source.match(/(?:^|\n)\s*rotations\s*:\s*([\s\S]*?)(?=\n\S[^\n]*:|$)/i)?.[1] ?? source;
    const rowPattern = new RegExp(`\\[\\s*(${number})\\s*,?\\s*(${number})\\s*,?\\s*(${number})\\s*\\]`, 'g');
    const rows: number[][] = [];
    while ((match = rowPattern.exec(section))) rows.push(match.slice(1).map(Number));
    for (let i = 0; i + 2 < rows.length; i += 3) operations.push({ rotation: rows.slice(i, i + 3), translation: [0, 0, 0], label: `R${operations.length + 1}` });
  }
  if (!operations.length) {
    const json = (() => { try { return JSON.parse(text); } catch { return undefined; } })();
    const rotations = json?.rotations ?? json?.symmetry_operations?.map((op: { rotation: number[][] }) => op.rotation);
    if (Array.isArray(rotations)) for (const rotation of rotations) if (Array.isArray(rotation) && rotation.length === 3) operations.push({ rotation, translation: [0, 0, 0], label: `R${operations.length + 1}` });
  }
  if (!operations.length) throw new Error('No 3×3 rotation matrices found. Choose a phonopy symmetry.yaml or bracketed rotation file.');
  return operations;
}
