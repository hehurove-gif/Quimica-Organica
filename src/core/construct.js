// @ts-check
/**
 * Constructor guiado por cadena (T11). Sin DOM: el estado es un «borrador» (draft) y todo lo demás
 * se deriva de él con las mismas reglas deterministas del resto del núcleo.
 *
 *   borrador -> SMILES -> Molecule -> nombre canónico (namer) -> analyze(nombre) -> explicación
 *
 * Reutilizar `analyze` sobre el nombre canónico asegura que dibujo, pasos y nombres sean los
 * mismos que ve quien escribe el nombre a mano. Si la ida y vuelta no reconstruye la misma
 * molécula, se declara `fuera_de_alcance`: nunca se muestra un nombre que no corresponda.
 *
 * Modo «verifica mi respuesta»: compara el grafo (clave canónica) de lo que se escribió con el
 * de lo que se dibujó; nunca la cadena de texto.
 */
import { fromSmiles } from './smiles.js';
import { nameMolecule } from './namer.js';
import { analyze } from './analyze.js';

/**
 * @typedef {{ pos: number, kind: string }} DraftGroup
 * @typedef {{ n: number, bonds: (1 | 2 | 3)[], groups: DraftGroup[] }} Draft
 * @typedef {import('./analyze.js').Analysis} Analysis
 * @typedef {{
 *   status: 'valido' | 'invalido' | 'fuera_de_alcance',
 *   errors: string[],
 *   smiles: string,
 *   molecule: import('./molecule.js').Molecule | null,
 *   formula: string | null,
 *   canonicalName: string | null,
 *   analysis: Analysis | null,
 * }} Description
 */

export const MAX_CHAIN = 10;

/**
 * Grupos que se pueden colgar de un carbono de la cadena. `smiles` es la rama que se añade.
 * @type {{ kind: string, label: string, smiles: string, family: string }[]}
 */
export const GROUPS = [
  { kind: 'F', label: 'F (fluoro)', smiles: 'F', family: 'Halógenos' },
  { kind: 'Cl', label: 'Cl (cloro)', smiles: 'Cl', family: 'Halógenos' },
  { kind: 'Br', label: 'Br (bromo)', smiles: 'Br', family: 'Halógenos' },
  { kind: 'I', label: 'I (yodo)', smiles: 'I', family: 'Halógenos' },
  { kind: 'OH', label: '–OH (hidroxi)', smiles: 'O', family: 'Oxígeno' },
  { kind: '=O', label: '=O (oxo / carbonilo)', smiles: '=O', family: 'Oxígeno' },
  { kind: 'OCH3', label: '–OCH₃ (metoxi)', smiles: 'OC', family: 'Oxígeno' },
  { kind: 'OC2H5', label: '–OCH₂CH₃ (etoxi)', smiles: 'OCC', family: 'Oxígeno' },
  { kind: 'NH2', label: '–NH₂ (amino)', smiles: 'N', family: 'Nitrógeno' },
  { kind: 'NHCH3', label: '–NHCH₃ (metilamino)', smiles: 'NC', family: 'Nitrógeno' },
  { kind: 'N(CH3)2', label: '–N(CH₃)₂ (dimetilamino)', smiles: 'N(C)C', family: 'Nitrógeno' },
  { kind: 'metil', label: 'metil', smiles: 'C', family: 'Radicales' },
  { kind: 'etil', label: 'etil', smiles: 'CC', family: 'Radicales' },
  { kind: 'propil', label: 'propil', smiles: 'CCC', family: 'Radicales' },
  { kind: 'isopropil', label: 'isopropil', smiles: 'C(C)C', family: 'Radicales' },
  { kind: 'butil', label: 'butil', smiles: 'CCCC', family: 'Radicales' },
  { kind: 'isobutil', label: 'isobutil', smiles: 'CC(C)C', family: 'Radicales' },
  { kind: 'sec-butil', label: 'sec-butil', smiles: 'C(C)CC', family: 'Radicales' },
  { kind: 'terc-butil', label: 'terc-butil', smiles: 'C(C)(C)C', family: 'Radicales' },
];

/** @param {number} n @returns {Draft} */
export function emptyDraft(n = 4) {
  const len = Math.min(Math.max(Math.trunc(n) || 1, 1), MAX_CHAIN);
  return { n: len, bonds: /** @type {(1 | 2 | 3)[]} */ (Array(len - 1).fill(1)), groups: [] };
}

/**
 * Cambia la longitud de la cadena conservando lo que siga existiendo (los grupos de carbonos
 * que desaparecen se descartan).
 * @param {Draft} d @param {number} n @returns {Draft}
 */
export function setLength(d, n) {
  const len = Math.min(Math.max(Math.trunc(n) || 1, 1), MAX_CHAIN);
  /** @type {(1 | 2 | 3)[]} */
  const bonds = [];
  for (let i = 0; i < len - 1; i++) bonds.push(d.bonds[i] ?? 1);
  return { n: len, bonds, groups: d.groups.filter((g) => g.pos <= len) };
}

/**
 * Orden del enlace entre el carbono `i` y el `i+1` (1-based).
 * @param {Draft} d @param {number} i @param {1 | 2 | 3} order @returns {Draft}
 */
export function setBond(d, i, order) {
  if (i < 1 || i > d.n - 1) return d;
  const bonds = d.bonds.slice();
  bonds[i - 1] = order;
  return { ...d, bonds };
}

/** @param {Draft} d @param {number} pos @param {string} kind @returns {Draft} */
export function addGroup(d, pos, kind) {
  if (pos < 1 || pos > d.n || !GROUPS.some((g) => g.kind === kind)) return d;
  return { ...d, groups: [...d.groups, { pos, kind }] };
}

/** Quita el grupo número `index` de la lista de grupos del carbono `pos`. @param {Draft} d @param {number} pos @param {number} index @returns {Draft} */
export function removeGroup(d, pos, index) {
  let seen = -1;
  const groups = d.groups.filter((g) => {
    if (g.pos !== pos) return true;
    seen++;
    return seen !== index;
  });
  return { ...d, groups };
}

/** @param {Draft} d */
export function draftToSmiles(d) {
  let s = '';
  for (let i = 1; i <= d.n; i++) {
    if (i > 1) s += ['', '', '=', '#'][d.bonds[i - 2]];
    s += 'C';
    for (const g of d.groups.filter((x) => x.pos === i)) {
      const def = /** @type {{ smiles: string }} */ (GROUPS.find((x) => x.kind === g.kind));
      s += `(${def.smiles})`;
    }
  }
  return s;
}

/** Clave de la rama que sale de `from` por `to`: orden del enlace + subárbol. */
const branchKey = (/** @type {import('./molecule.js').Molecule} */ mol, /** @type {number} */ from, /** @type {number} */ to) => {
  const bd = mol.bonds.find((x) => (x.a === from && x.b === to) || (x.a === to && x.b === from));
  return `${bd ? bd.order : 1}${mol._rooted(to, from, '')}`;
};

/** @type {Map<string, string>} clave de rama -> grupo del catálogo */
const CATALOG_KEYS = (() => {
  /** @type {Map<string, string>} */
  const map = new Map();
  for (const g of GROUPS) {
    const m = fromSmiles(`C(${g.smiles})`);
    const root = 0;
    const nb = m.neighbors(root)[0];
    map.set(branchKey(m, root, nb.id), g.kind);
  }
  return map;
})();

/**
 * Molécula + cadena dibujada -> borrador, para llevar al constructor lo que se escribió como nombre.
 * Devuelve null si algo no se puede expresar con el catálogo (cadena de más de 10 carbonos, grupos
 * o radicales que el constructor no ofrece).
 * @param {import('./molecule.js').Molecule} mol @param {number[]} chain
 * @returns {Draft | null}
 */
export function moleculeToDraft(mol, chain) {
  if (chain.length < 1 || chain.length > MAX_CHAIN) return null;
  if (chain.some((id) => mol.element(id) !== 'C')) return null;
  /** @type {(1 | 2 | 3)[]} */
  const bonds = [];
  for (let i = 1; i < chain.length; i++) {
    const bd = mol.bonds.find((x) => (x.a === chain[i - 1] && x.b === chain[i]) || (x.a === chain[i] && x.b === chain[i - 1]));
    if (!bd) return null;
    bonds.push(/** @type {1 | 2 | 3} */ (bd.order));
  }
  /** @type {DraftGroup[]} */
  const groups = [];
  const inChain = new Set(chain);
  let covered = chain.length;
  for (let i = 0; i < chain.length; i++) {
    for (const nb of mol.neighbors(chain[i])) {
      if (inChain.has(nb.id)) continue;
      const kind = CATALOG_KEYS.get(branchKey(mol, chain[i], nb.id));
      if (!kind) return null;
      groups.push({ pos: i + 1, kind });
      covered += fromSmiles(`C(${/** @type {{ smiles: string }} */ (GROUPS.find((g) => g.kind === kind)).smiles})`).atoms.length - 1;
    }
  }
  if (covered !== mol.atoms.length) return null;
  return { n: chain.length, bonds, groups };
}

/**
 * Borrador -> molécula -> nombre. Nunca devuelve un nombre que no reconstruya la misma molécula.
 * @param {Draft} d
 * @returns {Description}
 */
export function describe(d) {
  const smiles = draftToSmiles(d);
  /** @type {Description} */
  const base = { status: 'invalido', errors: [], smiles, molecule: null, formula: null, canonicalName: null, analysis: null };
  let mol;
  try {
    mol = fromSmiles(smiles);
  } catch (e) {
    return { ...base, errors: [e instanceof Error ? e.message : String(e)] };
  }
  const issues = mol.validate();
  if (issues.length) return { ...base, errors: issues.map((i) => i.message) };

  const canon = nameMolecule(mol);
  if (!canon.ok || !canon.systematic) {
    return { ...base, status: 'fuera_de_alcance', molecule: mol, formula: mol.formula(), errors: [canon.ok ? 'No se pudo generar el nombre.' : canon.reason] };
  }
  const analysis = analyze(canon.systematic);
  if (analysis.status !== 'valido' || !analysis.molecule || analysis.molecule.canonicalKey() !== mol.canonicalKey()) {
    return {
      ...base, status: 'fuera_de_alcance', molecule: mol, formula: mol.formula(),
      errors: ['El nombre generado no reconstruye la misma estructura, así que no lo muestro.'],
    };
  }
  return { status: 'valido', errors: [], smiles, molecule: mol, formula: mol.formula(), canonicalName: canon.systematic, analysis };
}

/**
 * @typedef {{
 *   verdict: 'vacio' | 'sin_estructura' | 'no_se_entiende' | 'correcta' | 'correcta_con_avisos' | 'isomero' | 'distinta',
 *   message: string,
 *   student: { formula: string | null, semidesarrollada: string | null } | null,
 *   notes: string[],
 *   expected: string | null,
 * }} Verdict
 */

/**
 * «Verifica mi respuesta»: ¿el nombre escrito corresponde a la estructura dibujada?
 * @param {Draft} d @param {string} text
 * @returns {Verdict}
 */
export function verify(d, text) {
  /** @type {Verdict} */
  const base = { verdict: 'vacio', message: '', student: null, notes: [], expected: null };
  if (text.trim() === '') return { ...base, message: 'Escribe el nombre que crees que tiene la estructura.' };
  const mine = describe(d);
  if (mine.status === 'invalido' || !mine.molecule) {
    return { ...base, verdict: 'sin_estructura', message: `La estructura dibujada no es válida: ${mine.errors.join(' ')}` };
  }
  const a = analyze(text);
  if (a.status !== 'valido' || !a.molecule) {
    const why = a.errors.map((e) => e.message).join(' ');
    return { ...base, verdict: 'no_se_entiende', message: a.status === 'incompleto' ? `El nombre está incompleto. ${why}` : why || 'No entiendo ese nombre.', expected: mine.canonicalName };
  }
  const student = { formula: a.formula, semidesarrollada: a.semidesarrollada };
  const notes = a.notes.filter((n) => n.severity === 'aviso').map((n) => n.message);
  if (a.molecule.canonicalKey() === mine.molecule.canonicalKey()) {
    // `correcto`: el nombre escrito ya es la forma canónica (o una equivalente aceptada sin reparos)
    return !a.correcto && notes.length
      ? { ...base, verdict: 'correcta_con_avisos', message: 'La estructura es la correcta, pero el nombre se puede escribir mejor.', student, notes, expected: mine.canonicalName }
      : { ...base, verdict: 'correcta', message: '¡Correcto! Ese nombre corresponde a la estructura.', student, expected: mine.canonicalName };
  }
  const same = a.formula === mine.formula;
  return {
    ...base,
    verdict: same ? 'isomero' : 'distinta',
    message: same
      ? `Tu nombre tiene la misma fórmula (${mine.formula}) pero describe otra molécula: es un isómero. Revisa la cadena principal, la numeración y los localizadores.`
      : `Tu nombre describe otra molécula: ${a.formula}, y la estructura dibujada es ${mine.formula}. Revisa qué grupos y cuántos carbonos tiene la estructura.`,
    student, notes, expected: mine.canonicalName,
  };
}
