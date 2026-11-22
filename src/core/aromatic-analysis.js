// @ts-check
/**
 * Análisis completo de un nombre de derivado del benceno (misma forma que `analyze` para cadenas):
 * lectura -> molécula -> nombre -> dibujo -> pasos. Todo determinista; si no se puede afirmar, se dice.
 */
import { normalize } from './parser.js';
import { parseAromatic, buildAromatic, nameAromatic, readRing } from './aromatic.js';
import { renderRingSvg, ringSemi } from './aromatic-render.js';

/**
 * @typedef {import('./analyze.js').Analysis} Analysis
 * @typedef {import('./analyze.js').Note} Note
 * @typedef {import('./explain.js').Step} Step
 * @typedef {import('./aromatic-render.js').RingGroup} RingGroup
 * @typedef {{ ringOrder: number[], groups: RingGroup[], variantes: string[], comunes: string[], svg: (opts?: { locants?: boolean }) => string }} AromaticView
 */

/** @param {string} s */
const squash = (s) => normalize(s).replace(/\s+/g, '').replace(/benzen/g, 'bencen').replace(/(^|acido)(orto|meta|para)-/, (_, a, w) => `${a}${w[0]}-`);

const COUNT_WORD = ['', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis'];

/** Descripción del padre retenido. @type {Record<string, string>} */
const PARENT_TEXT = {
  tolueno: '«tolueno» es el nombre retenido del metilbenceno: el CH₃ ocupa la posición 1.',
  fenol: '«fenol» es el nombre retenido del benceno con un –OH. El grupo –OH es el principal y define la posición 1.',
  anilina: '«anilina» es el nombre retenido del benceno con un –NH₂. El grupo –NH₂ es el principal y define la posición 1.',
  benzoico: '«ácido benzoico» es el benceno con un –COOH. El ácido es el grupo principal y define la posición 1.',
  benzaldehído: '«benzaldehído» es el benceno con un –CHO. El aldehído es el grupo principal y define la posición 1.',
  'bencenosulfónico': '«ácido bencenosulfónico» es el benceno con un –SO₃H. El ácido sulfónico es el grupo principal y define la posición 1.',
};

/** @param {number[]} nums */
const listEs = (nums) => (nums.length > 1 ? `${nums.slice(0, -1).join(', ')} y ${nums[nums.length - 1]}` : String(nums[0]));

/**
 * @param {string} text
 * @param {Analysis} base  análisis vacío (se devuelve ampliado)
 * @returns {(Analysis & { aromatic: AromaticView | null }) | null}  null si el texto no es un derivado del benceno
 */
export function analyzeAromatic(text, base) {
  const p = parseAromatic(text);
  if (p.status === 'no_aromatico') return null;
  if (p.status !== 'valido') return { ...base, status: p.status, errors: p.errors, aromatic: null };

  const b = buildAromatic(p.ast);
  if (b.status === 'invalido') return { ...base, status: 'invalido', errors: b.errors, aromatic: null };
  if (b.status === 'incompleto') {
    const opciones = b.options
      .map((o) => {
        const n = nameAromatic(o.molecule);
        return n.ok ? `«${n.systematic}»` : null;
      })
      .filter((x) => x !== null);
    const e = b.errors[0];
    const message = opciones.length > 1 ? `${e.message} Según la posición que elijas sería: ${opciones.join(' o ')}.` : e.message;
    return { ...base, status: 'incompleto', errors: [{ code: e.code, message }], aromatic: null };
  }

  const mol = b.molecule;
  const named = nameAromatic(mol);
  const read = readRing(mol);
  if ('error' in read) return { ...base, status: 'invalido', errors: [{ code: 'anillo', message: read.error }], aromatic: null };

  /** @type {Note[]} */
  const notes = [];
  const typed = squash(text);
  let correcto = false;
  /** @type {Analysis['names']} */
  let names = null;
  /** @type {number[]} */
  let ringOrder = read.ring;
  /** @type {RingGroup[]} */
  let groups = read.subs.map((s) => ({ pos: s.idx + 1, sub: s.sub, atomIds: s.atomIds }));

  if (named.ok) {
    names = { sistematico: named.systematic, iupac2013: named.iupac2013, radicofuncional: null };
    ringOrder = named.ringOrder;
    groups = named.groups;
    const canon = squash(named.systematic);
    const alt = named.alternatives.find((a) => squash(a) === typed);
    const comun = named.commons.find((c) => squash(c) === typed);
    correcto = typed === canon || alt !== undefined;
    if (comun || p.ast.parent.common) {
      notes.push({ type: 'comun', severity: 'info', message: `«${comun ?? text.trim()}» es un nombre común; el sistemático es «${named.systematic}».` });
    } else if (!correcto) {
      notes.push({
        type: 'nombre_canonico', severity: 'aviso',
        message: `Es la misma estructura, pero el nombre correcto es «${named.systematic}»: se numera desde el grupo principal (o con los localizadores más bajos) y los prefijos van en orden alfabético.`,
        correct: named.systematic,
      });
    }
    if (alt !== undefined) {
      notes.push({
        type: 'equivalencia', severity: 'info',
        message: /^[omp]-/.test(alt) || /\bo-|\bm-|\bp-/.test(alt)
          ? `Con dos sustituyentes también se usa orto (o-, posiciones 1,2), meta (m-, 1,3) y para (p-, 1,4); con localizadores es «${named.systematic}».`
          : `Es válido; el nombre retenido (el más usado) es «${named.systematic}».`,
      });
    } else if (typed === canon && named.alternatives.length) {
      const noms = named.alternatives.map((a) => `«${a}»`).join(' o ');
      notes.push({ type: 'equivalencia', severity: 'info', message: `También se puede nombrar ${noms}.` });
    }
    const otros = named.commons.filter((c) => squash(c) !== typed);
    if (otros.length && !comun && !p.ast.parent.common) {
      notes.push({ type: 'comun_equivalente', severity: 'info', message: `En el lenguaje cotidiano también se llama ${otros.map((c) => `«${c}»`).join(' o ')}.` });
    }
  } else {
    notes.push({ type: 'sin_nombre', severity: 'aviso', message: `La estructura es válida, pero no puedo generar su nombre: ${named.reason}.` });
  }

  const semi = ringSemi(groups);
  /** @type {AromaticView} */
  const aromatic = {
    ringOrder,
    groups,
    variantes: named.ok ? named.alternatives : [],
    comunes: named.ok ? named.commons : [],
    svg: (o = {}) => renderRingSvg(mol, ringOrder, groups, o),
  };

  return {
    ...base,
    status: 'valido',
    errors: [],
    notes,
    molecule: mol,
    chain: ringOrder,
    names,
    correcto,
    formula: mol.formula(),
    semidesarrollada: semi,
    steps: steps(mol, ringOrder, groups, named),
    aromatic,
  };
}

/**
 * @param {import('./molecule.js').Molecule} mol
 * @param {number[]} ringOrder
 * @param {RingGroup[]} groups
 * @param {ReturnType<typeof nameAromatic>} named
 * @returns {Step[]}
 */
function steps(mol, ringOrder, groups, named) {
  /** @type {Step[]} */
  const out = [];
  out.push({
    title: 'Anillo aromático',
    text: 'Estos nombres parten del benceno, C₆H₆: seis carbonos en anillo con tres dobles enlaces alternados (se dibuja una de las dos formas de Kekulé, que son la misma molécula). Cada carbono lleva un hidrógeno que otro grupo puede reemplazar.',
    atomIds: ringOrder, spans: [],
  });
  const parent = named.ok ? named.parent : null;
  const anchored = named.ok && parent !== 'benceno';
  const anchorGroup = anchored ? groups.find((g) => g.pos === 1) : undefined;
  if (named.ok) {
    out.push({
      title: 'Nombre base',
      text: anchored ? (PARENT_TEXT[/** @type {string} */ (parent)] ?? '') : 'Ningún grupo es principal: el padre es «benceno» y todos los sustituyentes se nombran como prefijos.',
      atomIds: anchorGroup ? [...ringOrder, ...anchorGroup.atomIds] : ringOrder, spans: [],
    });
  }
  /** @type {Map<string, RingGroup[]>} */
  const by = new Map();
  for (const g of groups) {
    if (anchorGroup && g === anchorGroup) continue;
    by.set(g.sub.name, [...(by.get(g.sub.name) ?? []), g]);
  }
  for (const [name, gs] of by) {
    const pos = gs.map((g) => g.pos).sort((a, b) => a - b);
    out.push({
      title: `Sustituyente «${name}»`,
      text: `${gs.length > 1 ? `${COUNT_WORD[gs.length]} grupos` : 'Un grupo'} –${gs[0].sub.label} (${name}) en ${pos.length > 1 ? 'las posiciones' : 'la posición'} ${listEs(pos)}${named.ok ? '' : ' del anillo'}.`,
      atomIds: gs.flatMap((g) => g.atomIds), spans: [],
    });
  }
  if (named.ok) {
    const others = groups.filter((g) => g !== anchorGroup).map((g) => g.pos).sort((a, b) => a - b);
    if (others.length && (anchored || others.length > 1)) {
      out.push({
        title: 'Numeración',
        text: anchored
          ? `Se numera desde el carbono con el grupo principal (C1) y en el sentido que da los localizadores más bajos al resto: ${others.join(', ')}.`
          : `Sin grupo principal se elige la numeración con los localizadores más bajos (${others.join(', ')}); si hay empate, el primer prefijo en orden alfabético recibe el más bajo.`,
        atomIds: ringOrder, spans: [],
      });
    }
    out.push({
      title: 'Nombre',
      text: `Los prefijos se ordenan alfabéticamente (sin contar di-, tri-…) y se escriben delante del padre: «${named.systematic}».`,
      atomIds: [], spans: [],
    });
  }
  const sust = groups.length;
  out.push({
    title: 'Fórmula',
    text: `${sust === 0 ? 'Ningún hidrógeno del benceno se reemplaza' : `Se reemplazan ${sust} ${sust === 1 ? 'hidrógeno' : 'hidrógenos'} del benceno (uno por sustituyente)`}. Fórmula molecular: ${mol.formula()}.`,
    atomIds: [], spans: [],
  });
  return out;
}
