// @ts-check
/**
 * Lector/escritor SMILES para estructuras ACÍCLICAS con C, N, O y halógenos.
 * Sirve de formato de intercambio y de oráculo de las pruebas (tabla de oro).
 * No admite anillos, aromáticos, cargas, isótopos ni estereoquímica (se rechazan con error).
 */
import { Molecule } from './molecule.js';

const ATOMS = ['Cl', 'Br', 'C', 'N', 'O', 'F', 'I'];

/**
 * @param {string} smiles
 * @returns {Molecule}
 */
export function fromSmiles(smiles) {
  const m = new Molecule();
  /** @type {number[]} */
  const stack = [];
  let prev = -1;
  /** @type {1 | 2 | 3} */
  let order = 1;
  let pendingBond = false;
  let i = 0;
  while (i < smiles.length) {
    const ch = smiles[i];
    if (ch === '(') {
      if (prev < 0) throw new Error('SMILES: paréntesis sin átomo previo');
      stack.push(prev);
      i++;
    } else if (ch === ')') {
      const p = stack.pop();
      if (p === undefined) throw new Error('SMILES: paréntesis de cierre sin apertura');
      prev = p;
      i++;
    } else if (ch === '-' || ch === '=' || ch === '#') {
      order = ch === '-' ? 1 : ch === '=' ? 2 : 3;
      pendingBond = true;
      i++;
    } else if (/[0-9%]/.test(ch)) {
      throw new Error('SMILES: los anillos todavía no están soportados');
    } else if (ch === '[' || ch === '.' || ch === '@' || ch === '/' || ch === '\\' || ch === '+') {
      throw new Error(`SMILES: «${ch}» todavía no está soportado`);
    } else {
      const sym = ATOMS.find((a) => smiles.startsWith(a, i));
      if (!sym) throw new Error(`SMILES: símbolo no reconocido en la posición ${i} («${ch}»)`);
      const id = m.addAtom(sym);
      if (prev >= 0) m.addBond(prev, id, order);
      else if (pendingBond) throw new Error('SMILES: enlace sin átomo previo');
      prev = id;
      order = 1;
      pendingBond = false;
      i += sym.length;
    }
  }
  if (stack.length) throw new Error('SMILES: paréntesis sin cerrar');
  if (pendingBond) throw new Error('SMILES: enlace sin átomo siguiente');
  if (m.atoms.length === 0) throw new Error('SMILES vacío');
  return m;
}

/**
 * SMILES de una molécula acíclica (no canónico: válido y reproducible).
 * @param {Molecule} mol
 * @returns {string}
 */
export function toSmiles(mol) {
  if (!mol.isTree()) throw new Error('toSmiles: solo estructuras acíclicas y conexas');
  const leaves = mol.atoms.filter((a) => mol.neighbors(a.id).length <= 1).map((a) => a.id);
  const start = leaves.length ? Math.min(...leaves) : 0;
  /** @param {number} id @param {number} parent @returns {number} */
  const size = (id, parent) =>
    1 + mol.neighbors(id).filter((n) => n.id !== parent).reduce((s, n) => s + size(n.id, id), 0);
  /** @param {number} id @param {number} parent @returns {string} */
  const walk = (id, parent) => {
    const kids = mol
      .neighbors(id)
      .filter((n) => n.id !== parent)
      .map((n) => ({ ...n, sz: size(n.id, id) }))
      .sort((a, b) => a.sz - b.sz || a.id - b.id);
    let out = mol.element(id);
    kids.forEach((k, idx) => {
      const sym = k.order === 2 ? '=' : k.order === 3 ? '#' : '';
      const piece = `${sym}${walk(k.id, id)}`;
      out += idx < kids.length - 1 ? `(${piece})` : piece;
    });
    return out;
  };
  return walk(start, -1);
}
