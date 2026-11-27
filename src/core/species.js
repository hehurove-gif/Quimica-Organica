// @ts-check
/**
 * Especies que participan en una reacción: orgánicas (grafo), sales, polímeros e inorgánicas
 * (catálogo cerrado). Cada una lleva su conteo de átomos para el balanceo y una clave de igualdad.
 */
import { normalize } from './parser.js';
import { analyze } from './analyze.js';
import { nameMolecule } from './namer.js';
import { semidesarrollada } from './render.js';

/** @typedef {import('./molecule.js').Molecule} Molecule */
/** @typedef {import('./balance.js').Counts} Counts */
/**
 * @typedef {{
 *   kind: 'organic' | 'salt' | 'polymer' | 'inorganic' | 'symbol',
 *   name: string | null, formula: string, semi: string | null, counts: Counts, key: string,
 *   mol?: Molecule, cation?: string, unit?: string, role?: 'principal' | 'secundario' | 'mezcla', coef?: number,
 *   chain?: number[],
 * }} Species
 */

const SUB = '₀₁₂₃₄₅₆₇₈₉';
/** @param {string} s */
const sub = (s) => s.replace(/\d/g, (d) => SUB[Number(d)]);

/** @param {string} formula @returns {Counts} */
function parseFormula(formula) {
  /** @type {Counts} */
  const c = {};
  for (const [, el, n] of formula.matchAll(/([A-Z][a-z]?)(\d*)/g)) c[el] = (c[el] || 0) + (n ? Number(n) : 1);
  return c;
}

/** @type {Record<string, { formula: string, name: string, symbol?: boolean }>} */
const INORGANIC = {
  H2O: { formula: 'H2O', name: 'agua' },
  HCl: { formula: 'HCl', name: 'cloruro de hidrógeno' },
  HBr: { formula: 'HBr', name: 'bromuro de hidrógeno' },
  HI: { formula: 'HI', name: 'yoduro de hidrógeno' },
  Cl2: { formula: 'Cl2', name: 'cloro' },
  Br2: { formula: 'Br2', name: 'bromo' },
  H2: { formula: 'H2', name: 'hidrógeno' },
  O2: { formula: 'O2', name: 'oxígeno' },
  CO2: { formula: 'CO2', name: 'dióxido de carbono' },
  Na2CO3: { formula: 'Na2CO3', name: 'carbonato de sodio' },
  K2CO3: { formula: 'K2CO3', name: 'carbonato de potasio' },
  Li2CO3: { formula: 'Li2CO3', name: 'carbonato de litio' },
  NaOH: { formula: 'NaOH', name: 'hidróxido de sodio' },
  KOH: { formula: 'KOH', name: 'hidróxido de potasio' },
  LiOH: { formula: 'LiOH', name: 'hidróxido de litio' },
  '[O]': { formula: 'O', name: 'oxígeno naciente [O] (del oxidante)', symbol: true },
  '[H]': { formula: 'H', name: 'hidrógeno naciente [H] (del reductor)', symbol: true },
};

/** @param {string} id @returns {Species} */
export function inorganic(id) {
  const d = INORGANIC[id];
  if (!d) throw new Error(`Especie inorgánica desconocida: ${id}`);
  const shown = d.symbol ? id : sub(d.formula);
  return {
    kind: d.symbol ? 'symbol' : 'inorganic', name: d.name, formula: shown, semi: shown,
    counts: parseFormula(d.formula), key: `i:${d.formula}`,
  };
}

/** Catión (símbolo) de una base o de una sal. @type {Record<string, string>} */
export const CATION_OF = { sodio: 'Na', potasio: 'K', litio: 'Li' };

/** @param {Molecule} mol @returns {Counts} */
export function countsOf(mol) {
  /** @type {Counts} */
  const c = {};
  for (const a of mol.atoms) {
    c[a.el] = (c[a.el] || 0) + 1;
    const h = mol.implicitH(a.id);
    if (h) c.H = (c.H || 0) + h;
  }
  return c;
}

/**
 * Especie orgánica (o sal, si se indica el catión) a partir de un grafo.
 * @param {Molecule} mol
 * @param {{ cation?: string, name?: string | null }} [opts] cation: símbolo (Na, K, Li) si el grafo es un carboxilato
 * @returns {Species}
 */
export function fromMolecule(mol, opts = {}) {
  const key = mol.canonicalKey() ?? '';
  const counts = countsOf(mol);
  if (opts.cation) {
    counts[opts.cation] = 1;
    return {
      kind: 'salt', name: opts.name ?? null, formula: `${mol.formula()}${opts.cation}`, semi: null,
      counts, key: `s:${key}:${opts.cation}`, mol, cation: opts.cation,
    };
  }
  const r = nameMolecule(mol);
  return {
    kind: 'organic', name: opts.name ?? (r.ok ? r.systematic : null), formula: mol.formula(),
    semi: r.ok ? semidesarrollada(mol, r.chain) : null, counts, key: `o:${key}`, mol, chain: r.ok ? r.chain : undefined,
  };
}

/**
 * Especie a partir de un análisis válido de `analyze()`.
 * @param {import('./analyze.js').Analysis} a
 * @returns {Species}
 */
export function fromAnalysis(a) {
  const mol = /** @type {Molecule} */ (a.molecule);
  const name = a.names?.sistematico ?? null;
  const key = mol.canonicalKey() ?? '';
  if (a.formula?.startsWith('(') && a.formula.endsWith('ₙ')) {
    return {
      kind: 'polymer', name, formula: a.formula, semi: a.semidesarrollada, counts: countsOf(mol),
      key: `p:${key}`, mol, unit: a.semidesarrollada ?? undefined,
    };
  }
  const m = /de (sodio|potasio|litio)$/.exec(name ?? '');
  if (m && mol.atoms.some((x) => x.q === -1)) {
    const cation = CATION_OF[m[1]];
    const counts = countsOf(mol);
    counts[cation] = 1;
    return {
      kind: 'salt', name, formula: a.formula ?? mol.formula(), semi: a.semidesarrollada, counts,
      key: `s:${key}:${cation}`, mol, cation, chain: a.chain,
    };
  }
  return {
    kind: 'organic', name, formula: a.formula ?? mol.formula(), semi: a.semidesarrollada,
    counts: countsOf(mol), key: `o:${key}`, mol, chain: a.chain,
  };
}

/**
 * Busca una especie por nombre: primero el catálogo inorgánico, luego el analizador.
 * @param {string} text
 * @returns {{ ok: true, species: Species } | { ok: false, analysis: import('./analyze.js').Analysis | null, message: string }}
 */
export function speciesFromName(text) {
  const t = normalize(text).replace(/\s+/g, ' ').trim();
  for (const id of Object.keys(INORGANIC)) {
    if (normalize(INORGANIC[id].name) === t || id.toLowerCase() === t) return { ok: true, species: inorganic(id) };
  }
  const a = analyze(text);
  if (a.status === 'valido' && a.molecule) return { ok: true, species: fromAnalysis(a) };
  return { ok: false, analysis: a, message: a.errors[0]?.message ?? `No pude leer «${text}».` };
}
