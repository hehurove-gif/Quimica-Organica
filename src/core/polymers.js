// @ts-check
/**
 * Polímeros de adición de monómeros vinílicos (polietileno, PVC, poliestireno, teflón…).
 * Determinista y de catálogo cerrado: el monómero se lee con el analizador normal y su unidad
 * repetitiva sale de una tabla (nunca se deduce ni se inventa). Fuera de la tabla → `fuera_de_alcance`.
 * La molécula devuelta es el MONÓMERO (el grafo real que interviene); la unidad repetitiva va en
 * `semidesarrollada` y en las notas. No se modelan n, tacticidad ni terminales de cadena.
 */
import { normalize } from './parser.js';

/** @typedef {import('./analyze.js').Analysis} Analysis */

/** Monómero (texto sistemático) -> unidad repetitiva. */
const UNITS = /** @type {[string, string][]} */ ([
  ['eteno', '–[CH₂–CH₂]ₙ–'],
  ['propeno', '–[CH₂–CH(CH₃)]ₙ–'],
  ['1-buteno', '–[CH₂–CH(CH₂–CH₃)]ₙ–'],
  ['2-metilpropeno', '–[CH₂–C(CH₃)₂]ₙ–'],
  ['cloroeteno', '–[CH₂–CHCl]ₙ–'],
  ['1-fluoroeteno', '–[CH₂–CHF]ₙ–'],
  ['1,1-dicloroeteno', '–[CH₂–CCl₂]ₙ–'],
  ['tetrafluoroeteno', '–[CF₂–CF₂]ₙ–'],
  ['etenilbenceno', '–[CH₂–CH(C₆H₅)]ₙ–'],
  ['ácido propenoico', '–[CH₂–CH(COOH)]ₙ–'],
  ['propenoato de metilo', '–[CH₂–CH(COOCH₃)]ₙ–'],
  ['2-metilpropenoato de metilo', '–[CH₂–C(CH₃)(COOCH₃)]ₙ–'],
]);

/** Nombres comunes de polímero (sin tildes) -> monómero. */
const COMMON = /** @type {Record<string, string>} */ ({
  polietileno: 'etileno',
  polipropileno: 'propileno',
  'policloruro de vinilo': 'cloruro de vinilo',
  poliestireno: 'estireno',
  politetrafluoroetileno: 'tetrafluoroeteno',
  teflon: 'tetrafluoroeteno',
  'polimetacrilato de metilo': 'metacrilato de metilo',
  'poliacrilato de metilo': 'acrilato de metilo',
});

/** @type {Map<string, string> | null} */
let unitByKey = null;

/** @param {(t: string) => Analysis} analyzeFn */
function units(analyzeFn) {
  if (!unitByKey) {
    unitByKey = new Map();
    for (const [mon, unit] of UNITS) {
      const key = analyzeFn(mon).molecule?.canonicalKey();
      if (key) unitByKey.set(key, unit);
    }
  }
  return unitByKey;
}

/**
 * @param {string} text
 * @param {Analysis} base
 * @param {(t: string) => Analysis} analyzeFn
 * @returns {Analysis | null} null si no tiene forma de polímero
 */
export function analyzePolymer(text, base, analyzeFn) {
  const t = normalize(text).replace(/\s+/g, ' ').trim();
  if (!/^(poli|teflon$)/.test(t)) return null;
  const common = COMMON[t];
  const monText = common ?? (/^poli\((.+)\)$/.exec(t)?.[1] ?? t.replace(/^poli/, ''));
  if (!monText) return null;
  if (/(butadieno|isopreno)/.test(monText)) {
    return { ...base, status: 'fuera_de_alcance', errors: [{ code: 'fuera_de_alcance', message: 'Los polímeros de dienos (polibutadieno, poliisopreno, caucho…) todavía no están soportados: no dibujo una unidad repetitiva que pudiera engañarte.' }] };
  }
  const mon = analyzeFn(monText);
  if (mon.status !== 'valido' || !mon.molecule) return null; // que lo explique el analizador normal
  const key = mon.molecule.canonicalKey();
  const unit = key ? units(analyzeFn).get(key) : undefined;
  if (!unit) {
    return {
      ...base, status: 'fuera_de_alcance',
      errors: [{ code: 'fuera_de_alcance', message: `No tengo catalogada la unidad repetitiva del polímero de «${mon.names?.sistematico ?? monText}», así que no la invento.` }],
    };
  }
  const monName = mon.names?.sistematico ?? monText;
  const nombre = `poli(${monName})`;
  const monFormula = mon.formula ?? '';
  const correcto = !common && t.replace(/[\s()]/g, '') === normalize(nombre).replace(/[\s()]/g, '');
  /** @type {import('./analyze.js').Note[]} */
  const notes = [
    { type: 'polimero', severity: 'info', message: `Polímero de adición: n moléculas de «${monName}» (monómero, dibujado) se unen abriendo el doble enlace C=C. Unidad que se repite: ${unit}. No se modelan n, la ordenación espacial ni los extremos de la cadena.` },
  ];
  if (common) notes.push({ type: 'comun', severity: 'info', message: `«${text.trim()}» es un nombre común; el nombre sistemático basado en el monómero es «${nombre}».`, correct: nombre });
  else if (!correcto) notes.push({ type: 'nombre_canonico', severity: 'aviso', message: `Es el mismo polímero, pero el nombre basado en el monómero es «${nombre}».`, correct: nombre });
  return {
    ...base,
    status: 'valido',
    notes,
    ast: mon.ast,
    molecule: mon.molecule,
    chain: mon.chain,
    trace: mon.trace,
    aromatic: mon.aromatic,
    names: { sistematico: nombre, iupac2013: nombre, radicofuncional: null },
    correcto,
    formula: `(${monFormula})ₙ`,
    semidesarrollada: unit,
    steps: mon.steps,
  };
}
