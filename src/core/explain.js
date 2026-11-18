// @ts-check
/**
 * Explicación paso a paso. NO es texto libre: cada paso se deriva de lo que el parser leyó
 * y de lo que el constructor hizo realmente con el grafo.
 */
import { COMMON_RADICALS, stemOf } from './lexicon.js';

/**
 * @typedef {import('./parser.js').Ast} Ast
 * @typedef {import('./parser.js').Group} Group
 * @typedef {import('./parser.js').Span} Span
 * @typedef {import('./build.js').BuildResult} BuildResult
 * @typedef {import('./molecule.js').Molecule} Molecule
 * @typedef {{ title: string, text: string, atomIds: number[], spans: Span[] }} Step
 */

const ELEMENT_NAME = /** @type {Record<string, string>} */ ({ F: 'flúor', Cl: 'cloro', Br: 'bromo', I: 'yodo' });
const COUNT = ['', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez'];

/** @param {number} n @param {string} one @param {string} many */
const plural = (n, one, many) => (n === 1 ? one : many);

/**
 * Posiciones (1..n) de la cadena a las que quedó unido un grupo del nombre.
 * @param {Molecule} mol
 * @param {number[]} chain
 * @param {number[]} atomIds
 */
function attachedPositions(mol, chain, atomIds) {
  /** @type {number[]} */
  const out = [];
  for (const a of atomIds) {
    for (const nb of mol.neighbors(a)) {
      const i = chain.indexOf(nb.id);
      if (i >= 0 && !atomIds.some((x) => x === nb.id)) out.push(i + 1);
    }
  }
  return out.sort((x, y) => x - y);
}

/**
 * @param {Ast} ast
 * @param {BuildResult} built
 * @param {Molecule} mol
 * @param {{ systematic: string, radicofuncional: string | null } | null} canon
 * @returns {Step[]}
 */
export function explain(ast, built, mol, canon) {
  /** @type {Step[]} */
  const steps = [];
  const chain = built.chain;

  if (ast.form === 'sustitutivo' && ast.common) {
    steps.push({
      title: 'Nombre común',
      text: `«${ast.common.name}» es un nombre común. Su nombre sistemático es «${ast.common.systematic}»; a partir de aquí se construye con ese.`,
      atomIds: [],
      spans: [],
    });
  }

  if (ast.form === 'radicofuncional') {
    steps.push({
      title: 'Forma radicofuncional',
      text: `«${ast.halide.text} de …» se lee como «halogenuro de + radical»: un radical alquilo con un átomo de ${ELEMENT_NAME[ast.halide.el]} unido al carbono que tiene la valencia libre.`,
      atomIds: built.trace.filter((t) => t.role === 'halogenuro').flatMap((t) => t.atomIds),
      spans: [ast.halide.span],
    });
    const n = ast.radical.n;
    steps.push({
      title: 'Radical',
      text: `El radical tiene una cadena de ${n} carbono${n === 1 ? '' : 's'} (${stemOf(n)}il). Se numera desde el carbono que se une al ${ELEMENT_NAME[ast.halide.el]}: ese es el C1.`,
      atomIds: chain,
      spans: [ast.radicalSpan],
    });
  } else {
    const n = ast.parent.n;
    steps.push({
      title: 'Cadena principal',
      text: `«${stemOf(n)}ano»: ${n} carbono${n === 1 ? '' : 's'} unidos en cadena (C1${n > 1 ? ` … C${n}` : ''}), todos con enlaces sencillos.`,
      atomIds: chain,
      spans: ast.parent.span ? [ast.parent.span] : [],
    });
  }

  const groups = ast.form === 'sustitutivo' ? ast.groups : ast.radical.groups;
  for (const t of built.trace.filter((x) => x.role === 'grupo')) {
    const g = groups[/** @type {number} */ (t.groupIndex)];
    const pos = attachedPositions(mol, chain, t.atomIds);
    const k = pos.length;
    const where = k === 1 ? `al carbono ${pos[0]}` : `a los carbonos ${pos.join(', ')}`;
    const spans = g.span ? [g.span] : [];
    if (g.sub.kind === 'halo') {
      const name = ELEMENT_NAME[g.sub.el];
      steps.push({
        title: `Sustituyente «${g.sub.canon || g.sub.text}»`,
        text:
          k === 1
            ? `Un átomo de ${name} (${g.sub.el}) se une ${where}, en lugar de un hidrógeno.`
            : `${COUNT[k] || k} átomos de ${name} (${g.sub.el}): ${pos.every((p) => p === pos[0]) ? `todos en el carbono ${pos[0]}` : `uno en cada uno de los carbonos ${pos.join(', ')}`}.`,
        atomIds: t.atomIds,
        spans,
      });
    } else if (g.sub.kind === 'func') {
      const oxo = g.sub.fg === 'oxo';
      steps.push({
        title: `Sustituyente «${g.sub.text}»`,
        text: oxo
          ? `Un oxígeno con doble enlace (=O) se une ${where}, en lugar de dos hidrógenos.`
          : `Un grupo hidroxilo (–OH) se une ${where}, en lugar de un hidrógeno.`,
        atomIds: t.atomIds,
        spans,
      });
    } else {
      const sub = g.sub;
      const r = sub.radical;
      const common = COMMON_RADICALS.find((c) => c.canon === sub.common);
      const extra = common
        ? ` «${common.canon}» es el nombre común de «${common.systematic}»: cadena de ${r.n} carbonos numerada desde el que se une.`
        : '';
      steps.push({
        title: `Sustituyente «${g.sub.text}»`,
        text: `${k === 1 ? 'Un radical' : `${COUNT[k] || k} radicales`} de ${r.n} carbono${r.n === 1 ? '' : 's'} ${plural(k, 'se une', 'se unen')} ${where}.${extra}`,
        atomIds: t.atomIds,
        spans,
      });
    }
  }

  if (ast.form === 'radicofuncional' && canon) {
    steps.push({
      title: 'Nombre sustitutivo equivalente',
      text: `Es la misma molécula que «${canon.systematic}»: se elige la cadena más larga y se numera por el extremo que da los localizadores más bajos.`,
      atomIds: [],
      spans: [],
    });
  }

  steps.push({
    title: 'Valencias',
    text: `Cada carbono completa sus 4 enlaces con hidrógenos (no se dibujan todos, se calculan). Fórmula molecular: ${mol.formula()}.`,
    atomIds: mol.atoms.map((a) => a.id),
    spans: [],
  });
  return steps;
}
