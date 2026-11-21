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
 * Posiciones de la cadena (1..n) a las que quedó unido un grupo del nombre. Si se une al
 * nitrógeno de una amina o amida se devuelve «N» (el localizador de los N-sustituyentes).
 * @param {Molecule} mol
 * @param {number[]} chain
 * @param {number[]} atomIds
 * @returns {(number | 'N')[]}
 */
function attachedPositions(mol, chain, atomIds) {
  /** @type {number[]} */
  const nums = [];
  let onN = 0;
  for (const a of atomIds) {
    for (const nb of mol.neighbors(a)) {
      if (atomIds.some((x) => x === nb.id)) continue;
      const i = chain.indexOf(nb.id);
      if (i >= 0) nums.push(i + 1);
      else if (mol.atoms[nb.id].el === 'N') onN++;
    }
  }
  nums.sort((x, y) => x - y);
  return [...nums, ...Array(onN).fill('N')];
}

/**
 * Carbonos de un conjunto de átomos (el nombre de un radical ramificado no coincide con su
 * cadena: «isobutil» tiene 4 carbonos aunque su cadena base sea de 3).
 * @param {Molecule} mol @param {number[]} atomIds
 */
const carbonsIn = (mol, atomIds) => atomIds.filter((id) => mol.atoms[id].el === 'C').length;

/** @param {(number | 'N')[]} pos */
function whereText(pos) {
  if (pos.length === 1) return pos[0] === 'N' ? 'al nitrógeno (N)' : `al carbono ${pos[0]}`;
  if (pos.every((p) => p === 'N')) return `al nitrógeno (localizador N, ${pos.length} veces)`;
  if (pos.includes('N')) return `a las posiciones ${pos.join(', ')} (N es el nitrógeno)`;
  return `a los carbonos ${pos.join(', ')}`;
}

/**
 * Clase de amina según los radicales unidos al nitrógeno (primaria R–NH₂, secundaria R₂NH, terciaria R₃N).
 * @param {number} radicals
 */
const aminaClase = (radicals) => ['', 'primaria (R–NH₂)', 'secundaria (R₂NH)', 'terciaria (R₃N)'][radicals] || '';

/** Nombre de los radicales de una forma radicofuncional, p. ej. «etil + metil». @param {import('./parser.js').RadicalTerm[]} terms */
const termsText = (terms) => terms.map((t) => `${t.mult > 1 ? `${COUNT[t.mult] || t.mult} × ` : ''}${t.text}`).join(' + ');

/**
 * Aminas y éteres en forma radicofuncional («etilmetilamina», «dietil éter»).
 * @param {Extract<Ast, { form: 'radicoamina' | 'radicoeter' }>} ast
 * @param {BuildResult} built
 * @param {Molecule} mol
 * @param {{ systematic: string, radicofuncional: string | null } | null} canon
 * @returns {Step[]}
 */
function explainRadicals(ast, built, mol, canon) {
  /** @type {Step[]} */
  const steps = [];
  const isAmine = ast.form === 'radicoamina';
  const total = ast.radicals.reduce((s, t) => s + t.mult, 0);
  const hetero = built.trace[0];
  steps.push({
    title: isAmine ? 'Forma radicofuncional: amina' : 'Forma radicofuncional: éter',
    text: isAmine
      ? `«…ilamina» se lee como «radicales + amina»: un nitrógeno unido a ${total} radical${total === 1 ? '' : 'es'} (${termsText(ast.radicals)}). Es una amina ${aminaClase(total)}; los enlaces que le faltan al nitrógeno (3 en total) los completan hidrógenos.`
      : `«… éter» se lee como «radical + radical + éter»: un oxígeno entre dos radicales, R–O–R′ (${termsText(ast.radicals)}). Los radicales se nombran por orden alfabético y la palabra «éter» va al final.`,
    atomIds: hetero.atomIds,
    spans: [isAmine ? ast.aminaSpan : ast.eterSpan],
  });
  ast.radicals.forEach((t, i) => {
    const item = built.trace[i + 1];
    const n = t.radical.n;
    steps.push({
      title: `Radical «${t.text}»`,
      text: `${t.mult > 1 ? `${COUNT[t.mult] || t.mult} radicales iguales (el prefijo ${['', '', 'di-', 'tri-'][t.mult] || ''} lo indica), cada uno` : 'Un radical'} de ${n} carbono${n === 1 ? '' : 's'}: el alcano correspondiente pierde un hidrógeno y su terminación -ano pasa a -ilo. Se une ${isAmine ? 'al nitrógeno' : 'al oxígeno'} por su carbono 1.`,
      atomIds: item ? item.atomIds : [],
      spans: t.span ? [t.span] : [],
    });
  });
  if (canon) {
    steps.push({
      title: 'Nombre sustitutivo equivalente',
      text: isAmine
        ? `La misma molécula se nombra «${canon.systematic}»: la cadena más larga unida al nitrógeno es la base y los demás radicales van como sustituyentes sobre el N.`
        : `La misma molécula se nombra «${canon.systematic}»: la cadena más larga es la base y el otro lado del oxígeno se nombra como alcoxi (-oxi).`,
      atomIds: [],
      spans: [],
    });
  }
  steps.push(valencias(mol));
  return steps;
}

/** @param {Molecule} mol @returns {Step} */
function valencias(mol) {
  const hasN = mol.atoms.some((a) => a.el === 'N');
  const hasO = mol.atoms.some((a) => a.el === 'O');
  const extra = [hasN ? 'el nitrógeno 3' : '', hasO ? 'el oxígeno 2' : ''].filter(Boolean).join(' y ');
  return {
    title: 'Valencias',
    text: `Cada carbono completa sus 4 enlaces${extra ? ` (${extra})` : ''} con hidrógenos (no se dibujan todos, se calculan). Fórmula molecular: ${mol.formula()}.`,
    atomIds: mol.atoms.map((a) => a.id),
    spans: [],
  };
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

  if (ast.form === 'radicoamina' || ast.form === 'radicoeter') return explainRadicals(ast, built, mol, canon);

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
      text: `«${stemOf(n)}${ast.unsat || ast.suffix ? '-' : 'ano'}»: ${n} carbono${n === 1 ? '' : 's'} unidos en cadena (C1${n > 1 ? ` … C${n}` : ''}). ${ast.unsat ? 'Los enlaces son sencillos salvo los que indica «-' + (ast.unsat.kind === 'en' ? 'eno' : 'ino') + '».' : 'Todos los enlaces son sencillos.'}`,
      atomIds: chain,
      spans: ast.parent.span ? [ast.parent.span] : [],
    });
  }

  for (const t of built.trace.filter((x) => x.role === 'insaturacion')) {
    const triple = t.label === 'ino';
    const bonds = built.molecule ? mol.bonds.filter((b) => b.order > 1 && t.atomIds.includes(b.a) && t.atomIds.includes(b.b)) : [];
    const where = bonds
      .map((b) => Math.min(chain.indexOf(b.a), chain.indexOf(b.b)) + 1)
      .sort((x, y) => x - y)
      .map((i) => `C${i}=C${i + 1}`.replace('=', triple ? '≡' : '='))
      .join(', ');
    steps.push({
      title: `Enlace ${triple ? 'triple' : 'doble'} «-${t.label}»`,
      text: `Hay ${bonds.length === 1 ? 'un enlace' : `${bonds.length} enlaces`} ${triple ? 'triple' : 'doble'} entre carbonos (${where}). Cada carbono del enlace pierde hidrógenos para conservar sus 4 enlaces.`,
      atomIds: t.atomIds,
      spans: t.span ? [t.span] : [],
    });
  }
  for (const t of built.trace.filter((x) => x.role === 'funcion')) {
    /** @type {Record<string, string>} */
    const what = {
      ol: 'un alcohol: un grupo hidroxilo –OH en lugar de un hidrógeno',
      al: 'un aldehído: un grupo –CHO en el extremo de la cadena (el C1 lleva =O y un hidrógeno)',
      ona: 'una cetona: un grupo carbonilo C=O en un carbono interior de la cadena',
      oico: 'un ácido carboxílico: un grupo –COOH en el extremo de la cadena (=O y –OH en el mismo carbono)',
      amina: 'una amina: un grupo –NH₂ unido a la cadena, en lugar de un hidrógeno',
      amida: 'una amida: un grupo –CONH₂ en el extremo de la cadena (el C1 lleva =O y –NH₂)',
      oato: 'un éster: el C1 lleva =O y un oxígeno que lo une a otro radical (R–COO–R′)',
    };
    if (t.label.startsWith('de ')) {
      const n = carbonsIn(mol, t.atomIds);
      steps.push({
        title: `Cola del éster «${t.label}»`,
        text: `La parte «${t.label}» es el radical que viene del alcohol: ${n ? `${n} carbono${n === 1 ? '' : 's'}` : 'una cadena'} unido${n === 1 ? '' : 's'} al oxígeno del éster. Así R–COOH + HO–R′ → R–COO–R′ + H₂O.`,
        atomIds: t.atomIds,
        spans: t.span ? [t.span] : [],
      });
      continue;
    }
    const acid = ast.form === 'sustitutivo' && ast.acid ? ' La palabra «ácido» confirma la función.' : '';
    let clase = '';
    if (t.label === 'amina' || t.label === 'amida') {
      const nId = t.atomIds.find((id) => mol.atoms[id].el === 'N');
      if (nId !== undefined) {
        const subs = mol.neighbors(nId).length - 1; // todos los vecinos menos el carbono de la cadena
        clase = t.label === 'amina'
          ? ` Con ${subs} sustituyente${subs === 1 ? '' : 's'} en el nitrógeno es una amina ${aminaClase(subs + 1)}.`
          : subs === 0 ? ' El nitrógeno no lleva sustituyentes (amida primaria, –CONH₂).' : ` El nitrógeno lleva ${subs} sustituyente${subs === 1 ? '' : 's'} (se localizan con «N»).`;
      }
    }
    steps.push({
      title: `Grupo principal «-${t.label}»`,
      text: `Es ${what[t.label]}.${acid}${clase} El grupo principal fija la cadena y recibe el localizador más bajo posible.`,
      atomIds: t.atomIds,
      spans: t.span ? [t.span] : [],
    });
  }

  const groups = ast.form === 'sustitutivo' ? ast.groups : ast.radical.groups;
  for (const t of built.trace.filter((x) => x.role === 'grupo')) {
    const g = groups[/** @type {number} */ (t.groupIndex)];
    const pos = attachedPositions(mol, chain, t.atomIds);
    const k = pos.length;
    const where = whereText(pos);
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
          : g.sub.fg === 'amino'
            ? `Un grupo amino (–NH₂) se une ${where}, en lugar de un hidrógeno. Si hay una función de mayor prioridad (ácido, amida…), el amino se nombra como sustituyente.`
            : `Un grupo hidroxilo (–OH) se une ${where}, en lugar de un hidrógeno.`,
        atomIds: t.atomIds,
        spans,
      });
    } else if (g.sub.kind === 'alkoxy') {
      const per = Math.round(carbonsIn(mol, t.atomIds) / Math.max(k, 1));
      const common = COMMON_RADICALS.find((c) => c.canon === (g.sub.kind === 'alkoxy' ? g.sub.common : undefined));
      const nombre = common
        ? `«${g.sub.text}» es el nombre común de «${common.systematic.replace(/il$/, 'oxi')}»`
        : `Su nombre es el del radical con la terminación -oxi (${g.sub.text})`;
      steps.push({
        title: `Sustituyente «${g.sub.text}»`,
        text: `Un grupo alcoxi (–O–R): ${k === 1 ? 'un oxígeno se une' : `${COUNT[k] || k} oxígenos se unen`} ${where} y, del otro lado, un radical de ${per} carbono${per === 1 ? '' : 's'}. ${nombre}. El éter se nombra así cuando la cadena más larga es el otro lado del oxígeno.`,
        atomIds: t.atomIds,
        spans,
      });
    } else if (g.sub.kind === 'nsub') {
      const radicales = g.sub.terms.reduce((acc, t) => acc + t.mult, 0);
      const clase = radicales === 1 ? 'secundaria' : 'terciaria';
      steps.push({
        title: `Sustituyente «${g.sub.text}»`,
        text: `Un grupo amino sustituido: un nitrógeno se une ${where} y lleva ${radicales === 1 ? 'un radical' : `${COUNT[radicales] || radicales} radicales`} (${g.sub.terms.map((t) => (t.mult > 1 ? `${COUNT[t.mult] || t.mult} ` : '') + t.text).join(', ')}). Con la cadena a un lado y ${radicales === 1 ? 'ese radical' : 'esos radicales'} al otro, es una amina ${clase}; en la nomenclatura moderna se nombra como N-sustituida.`,
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
        text: `${k === 1 ? 'Un radical' : `${COUNT[k] || k} radicales`} de ${Math.round(carbonsIn(mol, t.atomIds) / Math.max(k, 1))} carbono${Math.round(carbonsIn(mol, t.atomIds) / Math.max(k, 1)) === 1 ? '' : 's'} ${plural(k, 'se une', 'se unen')} ${where}.${extra}`,
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

  steps.push(valencias(mol));
  return steps;
}
