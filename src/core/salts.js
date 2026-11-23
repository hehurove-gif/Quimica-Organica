// @ts-check
/**
 * Sales de ácidos carboxílicos (jabones: estearato de sodio…). Determinista: se lee el ácido
 * con el analizador normal y se pasa su grupo –COOH a carboxilato (O⁻). El catión (Na⁺, K⁺, Li⁺)
 * no es un átomo del grafo orgánico: se informa en el nombre, la fórmula y las notas.
 * Solo monocarboxilatos de metales alcalinos; el resto es `fuera_de_alcance`.
 */
import { normalize } from './parser.js';

/** @typedef {import('./analyze.js').Analysis} Analysis */

const CATIONS = /** @type {Record<string, { sym: string, ion: string }>} */ ({
  sodio: { sym: 'Na', ion: 'Na⁺' }, potasio: { sym: 'K', ion: 'K⁺' }, litio: { sym: 'Li', ion: 'Li⁺' },
});

/** Acilos comunes de ácidos grasos y otros (sal -> ácido sistemático sin tildes). */
const COMMON_SALT = /** @type {Record<string, string>} */ ({
  formiato: 'acido metanoico', acetato: 'acido etanoico', propionato: 'acido propanoico', butirato: 'acido butanoico',
  laurato: 'acido dodecanoico', miristato: 'acido tetradecanoico', palmitato: 'acido hexadecanoico', estearato: 'acido octadecanoico',
  lactato: 'acido 2-hidroxipropanoico', oxalato: 'acido etanodioico',
});

/**
 * @param {string} text
 * @param {Analysis} base
 * @param {(t: string) => Analysis} analyzeFn
 * @returns {Analysis | null} null si el texto no tiene forma de sal
 */
export function analyzeSalt(text, base, analyzeFn) {
  const t = normalize(text).replace(/\s+/g, ' ').trim();
  const m = /^(.+ato) de (sodio|potasio|litio)$/.exec(t);
  if (!m) return null;
  const [, anion, cname] = m;
  const cat = CATIONS[cname];
  const common = COMMON_SALT[anion] !== undefined;
  const acidText = COMMON_SALT[anion] ?? `acido ${anion.replace(/ato$/, 'ico')}`;
  const acid = analyzeFn(acidText);
  if (acid.status !== 'valido' || !acid.molecule) {
    if (acid.status === 'incompleto') return { ...base, status: 'incompleto', errors: acid.errors };
    return { ...base, status: 'fuera_de_alcance', errors: [{ code: 'fuera_de_alcance', message: `No pude leer «${anion}» como sal de un ácido soportado, así que no dibujo una estructura parcial.` }] };
  }
  const mol = acid.molecule;
  /** ids de O del –OH de cada carboxilo */
  const oh = mol.atoms.filter((a) => a.el === 'O' && mol.neighbors(a.id).length === 1 && mol.implicitH(a.id) === 1
    && mol.neighbors(mol.neighbors(a.id)[0].id).some((n) => mol.element(n.id) === 'O' && n.order === 2)).map((a) => a.id);
  if (oh.length !== 1) {
    return { ...base, status: 'fuera_de_alcance', errors: [{ code: 'fuera_de_alcance', message: 'Solo se soportan las sales de ácidos con un único grupo carboxilo (una carga, un catión).' }] };
  }
  mol.atoms[oh[0]].q = -1;
  const sist = acid.names?.sistematico ?? '';
  const nombre = `${sist.replace(/^ácido /, '').replace(/ico$/, 'ato')} de ${cname}`;
  const typed = t.replace(/\s+/g, '');
  const correcto = typed === normalize(nombre).replace(/\s+/g, '');
  /** @type {import('./analyze.js').Note[]} */
  const notes = [
    { type: 'sal', severity: 'info', message: `Es una sal: el anión carboxilato (O⁻, dibujado) y el catión ${cat.ion}, que no forma parte de la cadena y no se dibuja. Se forma al neutralizar el ácido o al saponificar un éster con ${cat.sym}OH.` },
  ];
  if (acid.molecule.atoms.filter((a) => a.el === 'C').length >= 12 && cat.sym !== 'Li') {
    notes.push({ type: 'jabon', severity: 'info', message: 'Los jabones son sales de sodio o potasio de ácidos grasos: la cola de hidrocarburo es hidrófoba y el carboxilato iónico, hidrófilo.' });
  }
  if (common) notes.push({ type: 'comun', severity: 'info', message: `«${anion} de ${cname}» es un nombre común; el sistemático es «${nombre}».`, correct: nombre });
  else if (!correcto) notes.push({ type: 'nombre_canonico', severity: 'aviso', message: `Es la misma estructura, pero el nombre correcto es «${nombre}».`, correct: nombre });
  const semi = (acid.semidesarrollada ?? '').replace(/^HOOC/, '⁻OOC').replace(/COOH$/, 'COO⁻');
  return {
    ...base,
    status: 'valido',
    notes,
    molecule: mol,
    chain: acid.chain,
    trace: acid.trace,
    ast: acid.ast,
    names: { sistematico: nombre, iupac2013: nombre, radicofuncional: null },
    correcto: correcto && !common,
    formula: `${mol.formula()}${cat.sym}`,
    semidesarrollada: `${semi} ${cat.ion}`,
    steps: acid.steps,
  };
}
