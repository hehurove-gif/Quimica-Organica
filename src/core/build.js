// @ts-check
/**
 * Construcción del grafo molecular a partir del AST (química determinista).
 *
 * - Valida localizadores (rango, cantidad vs. multiplicador).
 * - Si faltan localizadores, prueba TODAS las posiciones posibles: si todas dan la misma
 *   molécula (p. ej. "bromoetano", "butanona") se acepta; si dan moléculas distintas
 *   (p. ej. "bromopropano", "butanol") NO se adivina: el estado es "incompleto".
 * - Soporta enlaces múltiples (-eno, -ino), alcoholes, aldehídos, cetonas, ácidos, éteres,
 *   ésteres, aminas y amidas (también sus formas radicofuncionales: «etilmetilamina»).
 * - Registra la trazabilidad parte del nombre -> átomos (para el resaltado cruzado).
 */
import { Molecule } from './molecule.js';
import { stemOf } from './lexicon.js';

/**
 * @typedef {import('./parser.js').Ast} Ast
 * @typedef {import('./parser.js').Group} Group
 * @typedef {import('./parser.js').Radical} Radical
 * @typedef {import('./parser.js').Sub} Sub
 * @typedef {import('./parser.js').Span} Span
 * @typedef {import('./parser.js').EsterTail} EsterTail
 * @typedef {{ code: string, message: string, from?: number, to?: number }} BuildError
 * @typedef {{ type: string, message: string }} BuildNote
 * @typedef {{
 *   role: 'cadena' | 'grupo' | 'halogenuro' | 'insaturacion' | 'funcion' | 'alquilo',
 *   label: string, span: Span | null, atomIds: number[], groupIndex?: number
 * }} TraceItem
 * @typedef {{
 *   status: 'valido' | 'invalido' | 'incompleto' | 'fuera_de_alcance',
 *   molecule: Molecule | null, chain: number[],
 *   trace: TraceItem[], errors: BuildError[], notes: BuildNote[]
 * }} BuildResult
 * @typedef {{
 *   kind: 'group' | 'unsat' | 'suffix', label: string, span: Span | null,
 *   locants: number[] | null, mult: number | null, domain: number[],
 *   outMsg: (loc: number) => string, groupIndex?: number, fn?: string
 * }} Item
 * @typedef {{
 *   n: number, groups: Group[],
 *   attach: { pos: number, el: string, text: string, span: Span }[],
 *   unsat: import('./parser.js').Unsat | null, unsatLocs: number[] | null,
 *   suffix: import('./parser.js').Suffix | null, suffixLocs: number[] | null,
 *   ester: EsterTail | null,
 *   label: string, chainSpan: Span | null
 * }} Spec
 */

const MAX_COMBOS = 20000;

/**
 * @param {Ast} ast
 * @returns {BuildResult}
 */
export function build(ast) {
  if (ast.form === 'radicoamina' || ast.form === 'radicoeter') return buildRadicoHetero(ast);
  if (ast.form === 'sustitutivo') {
    const stem = stemOf(ast.parent.n);
    /** @type {BuildError[]} */
    const errors = [];
    if (ast.acid && ast.suffix?.kind !== 'oico') {
      errors.push({
        code: 'acido',
        message: 'La palabra «ácido» pide la terminación «-oico» (p. ej. «ácido etanoico»).',
        ...(ast.acid.span || {}),
      });
    }
    // Reparto de los localizadores escritos delante del nombre ("2-buteno", "2-butanol")
    let front = ast.front ? [...ast.front.values] : null;
    /** @type {number[] | null} */
    let unsatLocs = ast.unsat ? ast.unsat.locants : null;
    /** @type {number[] | null} */
    let suffixLocs = ast.suffix ? ast.suffix.locants : null;
    if (front && ast.unsat && !unsatLocs) {
      unsatLocs = front;
      front = null;
    }
    if (front && ast.suffix && !suffixLocs) {
      suffixLocs = front;
      front = null;
    }
    if (front && ast.front) {
      errors.push({
        code: 'localizador_sobrante',
        message: `Los localizadores «${front.join(',')}» no corresponden a nada: ${ast.unsat || ast.suffix ? 'ya se indicaron en otra parte del nombre' : 'un alcano no lleva localizadores delante de la cadena'}.`,
        from: ast.front.span.from, to: ast.front.span.to,
      });
    }
    if (errors.length) return { status: 'invalido', molecule: null, chain: [], trace: [], errors, notes: [] };
    return buildStructure({
      n: ast.parent.n,
      groups: ast.groups,
      attach: [],
      unsat: ast.unsat, unsatLocs,
      suffix: ast.suffix, suffixLocs, ester: ast.ester,
      label: ast.unsat ? `${stem}${ast.unsat.kind === 'en' ? 'eno' : 'ino'}` : `${stem}ano`,
      chainSpan: ast.parent.span,
    });
  }
  return buildStructure({
    n: ast.radical.n,
    groups: ast.radical.groups,
    attach: [{ pos: 1, el: ast.halide.el, text: ast.halide.text, span: ast.halide.span }],
    unsat: null, unsatLocs: null, suffix: null, suffixLocs: null, ester: null,
    label: 'el radical',
    chainSpan: ast.radicalSpan,
  });
}

/**
 * Posiciones de un elemento, o null si faltan los localizadores.
 * @param {Item} it
 * @returns {{ positions: number[] | null, errors: BuildError[] }}
 */
function positionsOf(it) {
  /** @type {BuildError[]} */
  const errors = [];
  const span = it.span ? { from: it.span.from, to: it.span.to } : {};
  const mult = it.mult;
  if (!it.locants) {
    if (it.domain.length === 1) return { positions: Array(mult || 1).fill(it.domain[0]), errors };
    return { positions: null, errors };
  }
  const k = it.locants.length;
  const locs = fmtLocs(it.locants);
  if (mult === null && k > 1) {
    errors.push({
      code: 'multiplicador',
      message: `Escribiste ${k} localizadores (${locs}) para «${it.label}», pero falta el multiplicador (di-, tri-, tetra-…).`,
      ...span,
    });
  } else if (mult !== null && k !== mult) {
    errors.push({
      code: 'multiplicador',
      message:
        k === 1
          ? `El prefijo indica ${mult} veces «${it.label}» pero diste un solo localizador (${locs}). Si van en el mismo carbono repite el número (${Array(mult).fill(locs).join(',')}).`
          : `El prefijo indica ${mult} veces «${it.label}» pero diste ${k} localizadores (${locs}).`,
      ...span,
    });
  }
  for (const loc of it.locants) {
    if (!it.domain.includes(loc)) errors.push({ code: 'localizador_fuera', message: it.outMsg(loc), ...span });
  }
  return { positions: errors.length ? [] : [...it.locants], errors };
}

/**
 * Comprueba los grupos anidados de un radical (requieren localizadores explícitos).
 * @param {Radical} r
 * @param {BuildError[]} errors
 */
function checkNested(r, errors) {
  for (const g of r.groups) {
    const { positions, errors: e } = positionsOf(groupItem(g, r.n, 'el radical'));
    errors.push(...e);
    if (positions === null) {
      errors.push({
        code: 'localizador_ambiguo',
        message: `Dentro del radical, indica el localizador de «${g.sub.text}» (el carbono 1 es el que se une a la cadena).`,
        ...(g.span ? { from: g.span.from, to: g.span.to } : {}),
      });
    }
    if (g.sub.kind === 'radical') checkNested(g.sub.radical, errors);
  }
}

/** @param {number} n @returns {number[]} */
const range = (n) => Array.from({ length: n }, (_, i) => i + 1);

/** Localizadores para mostrar: el 0 es el nitrógeno («N»). @param {number[]} locs */
const fmtLocs = (locs) => locs.map((x) => (x === 0 ? 'N' : String(x))).join(',');

/** Grupos principales que van siempre en un extremo de la cadena. */
const TERMINAL = ['al', 'oico', 'amida', 'oato'];

/**
 * @param {Group} g @param {number} n @param {string} label
 * @param {number} [gi]
 * @param {boolean} [allowN] el nitrógeno (localizador «N») es una posición válida
 * @returns {Item}
 */
function groupItem(g, n, label, gi, allowN = false) {
  return {
    kind: 'group', label: g.sub.text || 'este sustituyente', span: g.span,
    locants: g.locants, mult: g.mult, domain: allowN ? [0, ...range(n)] : range(n), groupIndex: gi,
    outMsg: (loc) => (loc === 0
      ? 'El localizador N (nitrógeno) solo existe en una amina o una amida con un único grupo «-amina» / «-amida».'
      : `El localizador ${loc} no existe: ${label} tiene ${n} carbono${n === 1 ? '' : 's'} (del 1 al ${n}).`),
  };
}

/**
 * Une un sustituyente a un carbono, creando átomos. Devuelve los ids creados.
 * @param {Molecule} mol
 * @param {number} carbon
 * @param {Sub} sub
 * @returns {number[]}
 */
function attachSub(mol, carbon, sub) {
  /** @type {number[]} */
  const created = [];
  if (sub.kind === 'halo') {
    const id = mol.addAtom(sub.el);
    mol.addBond(carbon, id);
    created.push(id);
    return created;
  }
  if (sub.kind === 'func') {
    const id = mol.addAtom(sub.fg === 'amino' ? 'N' : 'O');
    mol.addBond(carbon, id, sub.fg === 'oxo' ? 2 : 1);
    created.push(id);
    return created;
  }
  if (sub.kind === 'alkoxy') {
    // –O–R: el radical cuelga del oxígeno
    const o = mol.addAtom('O');
    mol.addBond(carbon, o);
    created.push(o, ...attachSub(mol, o, { kind: 'radical', radical: sub.radical, text: sub.text, common: sub.common }));
    return created;
  }
  const r = sub.radical;
  /** @type {number[]} */
  const ids = [];
  for (let i = 0; i < r.n; i++) {
    const id = mol.addAtom('C');
    created.push(id);
    ids.push(id);
    mol.addBond(i === 0 ? carbon : ids[i - 1], id);
  }
  for (const g of r.groups) {
    const { positions } = positionsOf(groupItem(g, r.n, 'el radical'));
    for (const pos of positions || []) created.push(...attachSub(mol, ids[pos - 1], g.sub));
  }
  return created;
}

/**
 * Construye la molécula para unas posiciones dadas. Devuelve null si la combinación es
 * imposible (p. ej. dos enlaces múltiples en el mismo enlace).
 * @param {Spec} spec
 * @param {Item[]} items
 * @param {(number[] | null)[]} positions  posiciones por elemento (mismo orden que items)
 */
function assemble(spec, items, positions) {
  const { n, attach, label, chainSpan } = spec;
  const mol = new Molecule();
  /** @type {number[]} */
  const chain = [];
  for (let i = 0; i < n; i++) {
    const id = mol.addAtom('C');
    chain.push(id);
    if (i) mol.addBond(chain[i - 1], id);
  }
  /** @type {TraceItem[]} */
  const trace = [{ role: 'cadena', label, span: chainSpan, atomIds: [...chain] }];
  for (const a of attach) {
    const id = mol.addAtom(a.el);
    mol.addBond(chain[a.pos - 1], id);
    trace.push({ role: 'halogenuro', label: a.text, span: a.span, atomIds: [id] });
  }
  /** Sustituyentes en el nitrógeno: se unen cuando el sufijo ya creó su N. @type {{ g: Group, atomIds: number[] }[]} */
  const deferredN = [];
  /** @type {number | null} */
  let nAtom = null;
  for (let k = 0; k < items.length; k++) {
    const it = items[k];
    const pos = positions[k] || [];
    if (it.kind === 'unsat' && spec.unsat) {
      const order = spec.unsat.kind === 'en' ? 2 : 3;
      /** @type {number[]} */
      const atoms = [];
      for (const p of pos) {
        const bond = mol.bonds.find((b) => b.a === chain[p - 1] && b.b === chain[p]);
        if (!bond || bond.order !== 1) return null;
        bond.order = order;
        atoms.push(chain[p - 1], chain[p]);
      }
      trace.push({ role: 'insaturacion', label: spec.unsat.kind === 'en' ? 'eno' : 'ino', span: spec.unsat.span, atomIds: [...new Set(atoms)] });
    } else if (it.kind === 'suffix' && spec.suffix) {
      const kind = spec.suffix.kind;
      /** @type {number[]} */
      const atoms = [];
      for (const p of pos) {
        const c = chain[p - 1];
        atoms.push(c);
        if (kind === 'ol') {
          atoms.push(...attachSub(mol, c, { kind: 'func', fg: 'hidroxi', text: 'ol' }));
        } else if (kind === 'amina') {
          const made = attachSub(mol, c, { kind: 'func', fg: 'amino', text: 'amina' });
          nAtom = made[0];
          atoms.push(...made);
        } else {
          atoms.push(...attachSub(mol, c, { kind: 'func', fg: 'oxo', text: 'o' }));
          if (kind === 'oico') {
            atoms.push(...attachSub(mol, c, { kind: 'func', fg: 'hidroxi', text: 'ol' }));
          } else if (kind === 'amida') {
            const made = attachSub(mol, c, { kind: 'func', fg: 'amino', text: 'amida' });
            nAtom = made[0];
            atoms.push(...made);
          } else if (kind === 'oato' && spec.ester) {
            // éster: C(=O)–O–R, con R como radical unido al oxígeno
            const o = mol.addAtom('O');
            mol.addBond(c, o);
            atoms.push(o);
            const alkyl = attachSub(mol, o, { kind: 'radical', radical: spec.ester.radical, text: spec.ester.text, common: spec.ester.common });
            trace.push({ role: 'alquilo', label: spec.ester.text, span: spec.ester.span, atomIds: alkyl });
          }
        }
      }
      trace.push({ role: 'funcion', label: kind, span: spec.suffix.span, atomIds: [...new Set(atoms)] });
    } else {
      const g = spec.groups[/** @type {number} */ (it.groupIndex)];
      /** @type {number[]} */
      const atomIds = [];
      for (const p of pos) {
        if (p === 0) deferredN.push({ g, atomIds });
        else atomIds.push(...attachSub(mol, chain[p - 1], g.sub));
      }
      trace.push({ role: 'grupo', label: g.sub.text, span: g.span, atomIds, groupIndex: it.groupIndex });
    }
  }
  for (const d of deferredN) {
    if (nAtom === null) return null;
    d.atomIds.push(...attachSub(mol, nAtom, d.g.sub));
  }
  return { mol, chain, trace };
}

/**
 * Mensajes de valencia en lenguaje de bachillerato.
 * @param {Molecule} mol
 * @param {number[]} chain
 * @returns {BuildError[]}
 */
function valenceErrors(mol, chain) {
  /** @type {BuildError[]} */
  const out = [];
  for (const issue of mol.validate()) {
    const id = issue.atoms[0];
    const pos = chain.indexOf(id);
    if (issue.code === 'valencia' && pos >= 0) {
      out.push({
        code: 'valencia',
        message: `El carbono ${pos + 1} tendría más de 4 enlaces. Un carbono extremo de la cadena admite hasta 3 sustituyentes y uno interior hasta 2 (el resto de sus enlaces son de la cadena y los hidrógenos); los enlaces dobles cuentan por dos.`,
      });
    } else {
      out.push({ code: issue.code, message: issue.message });
    }
  }
  return out;
}

/**
 * Elementos con posición (grupos, enlace múltiple, función principal).
 * @param {Spec} spec
 * @returns {Item[]}
 */
function itemsOf(spec) {
  const { n, groups, label } = spec;
  // el nitrógeno es una posición válida solo con un único -amina / -amida
  const allowN = !!spec.suffix && ['amina', 'amida'].includes(spec.suffix.kind) && spec.suffix.mult === 1;
  /** @type {Item[]} */
  const items = groups.map((g, gi) => groupItem(g, n, label, gi, allowN));
  if (spec.unsat) {
    const u = spec.unsat;
    const word = u.kind === 'en' ? 'doble' : 'triple';
    items.push({
      kind: 'unsat', label: u.kind === 'en' ? 'eno' : 'ino', span: u.span,
      locants: spec.unsatLocs, mult: u.mult > 1 ? u.mult : null, domain: range(n - 1),
      outMsg: (loc) => `El enlace ${word} no puede empezar en el carbono ${loc}: la cadena tiene ${n} carbonos, así que el enlace va del carbono ${loc} al ${loc + 1} y ${loc} debe estar entre 1 y ${n - 1}.`,
    });
  }
  if (spec.suffix) {
    const s = spec.suffix;
    const mult = s.mult > 1 ? s.mult : null;
    if (s.kind === 'ol' || s.kind === 'amina') {
      items.push({
        kind: 'suffix', label: s.kind, span: s.span, locants: spec.suffixLocs, mult, domain: range(n),
        outMsg: (loc) => `El localizador ${loc} no existe: la cadena tiene ${n} carbono${n === 1 ? '' : 's'}.`,
      });
    } else if (s.kind === 'ona') {
      items.push({
        kind: 'suffix', label: 'ona', span: s.span, locants: spec.suffixLocs, mult,
        domain: range(n).filter((i) => i > 1 && i < n),
        outMsg: (loc) => (loc === 1 || loc === n
          ? `La cetona no puede ir en el carbono ${loc}: ese es un extremo de la cadena (ahí el C=O sería un aldehído).`
          : `El localizador ${loc} no existe: la cadena tiene ${n} carbonos.`),
      });
    } else {
      // aldehído / ácido / amida / éster: siempre en los extremos
      const ends = n === 1 || mult === null ? [1] : [1, n];
      items.push({
        kind: 'suffix', label: s.kind, span: s.span, locants: spec.suffixLocs, mult,
        domain: [...new Set([1, n])],
        outMsg: (loc) => `El grupo «-${s.kind}» solo puede estar en los extremos de la cadena (carbono 1 o ${n}), no en el ${loc}.`,
      });
      void ends;
    }
  }
  return items;
}

/**
 * @param {Spec} spec
 * @returns {BuildResult}
 */
function buildStructure(spec) {
  const { n, label } = spec;
  /** @type {BuildError[]} */
  const errors = [];
  /** @type {BuildNote[]} */
  const notes = [];
  const items = itemsOf(spec);

  if (spec.suffix?.kind === 'oato' && spec.suffix.mult > 1) {
    return {
      status: 'fuera_de_alcance', molecule: null, chain: [], trace: [], notes,
      errors: [{
        code: 'fuera_de_alcance',
        message: 'Los diésteres y poliésteres (dos o más grupos -oato) todavía no están soportados. Un éster con un solo grupo sí: «etanoato de metilo».',
        ...(spec.suffix.span || {}),
      }],
    };
  }
  if (spec.suffix && TERMINAL.includes(spec.suffix.kind)) {
    const m = spec.suffix.mult;
    if (m > 2) errors.push({ code: 'multiplicador', message: `Una cadena solo tiene dos extremos: «${spec.suffix.kind}» no puede repetirse ${m} veces.`, ...(spec.suffix.span || {}) });
    else if (m === 2 && n === 1) errors.push({ code: 'multiplicador', message: 'Con un solo carbono no caben dos grupos terminales.', ...(spec.suffix.span || {}) });
  }
  if (spec.unsat && n < 2) {
    errors.push({ code: 'localizador_fuera', message: 'Un solo carbono no puede formar un enlace múltiple entre carbonos.', ...(spec.unsat.span || {}) });
  }

  /** @type {(number[] | null)[]} */
  const fixed = items.map((it) => {
    if (it.kind === 'suffix' && spec.suffix && TERMINAL.includes(spec.suffix.kind) && !it.locants) {
      return spec.suffix.mult === 2 && n > 1 ? [1, n] : [1];
    }
    const r = it.domain.length === 0 ? { positions: [], errors: [{ code: 'localizador_fuera', message: `Con ${n} carbono${n === 1 ? '' : 's'} no hay dónde colocar «${it.label}».`, ...(it.span || {}) }] } : positionsOf(it);
    errors.push(...r.errors);
    if (it.kind === 'group') {
      const g = spec.groups[/** @type {number} */ (it.groupIndex)];
      if (g.sub.kind === 'radical') checkNested(g.sub.radical, errors);
    }
    return r.positions;
  });
  // aldehído/ácido con localizadores escritos: deben ser los extremos
  if (spec.suffix && TERMINAL.includes(spec.suffix.kind) && spec.suffixLocs) {
    const want = spec.suffix.mult === 2 && n > 1 ? [1, n] : [1];
    if (spec.suffixLocs.join() !== want.join()) {
      errors.push({
        code: 'localizador_fuera',
        message: `El grupo «-${spec.suffix.kind}» va siempre en los extremos: aquí sería el carbono ${want.join(' y ')}.`,
        ...(spec.suffix.span || {}),
      });
    }
    const si = items.findIndex((x) => x.kind === 'suffix');
    fixed[si] = want;
    for (let i = errors.length - 1; i >= 0; i--) if (errors[i].code === 'localizador_fuera' && /extremos/.test(errors[i].message) && errors.length > 1 && !errors[i].message.includes('aquí sería')) errors.splice(i, 1);
  }
  if (errors.length) return fail(errors);

  const unknown = fixed.map((p, i) => (p === null ? i : -1)).filter((i) => i >= 0);
  if (unknown.length === 0) return finish(fixed);

  // Localizadores omitidos: enumerar posibilidades y comparar moléculas resultantes
  const sizes = unknown.map((i) => items[i].mult || 1);
  let estimate = 1;
  for (let j = 0; j < unknown.length; j++) estimate *= multisetCount(items[unknown[j]].domain.length, sizes[j]);
  if (estimate > MAX_COMBOS) {
    return fail([{ code: 'localizador_ambiguo', message: 'Faltan localizadores y hay demasiadas posibilidades: indica en qué carbono va cada parte del nombre.' }]);
  }
  /** @type {Map<string, (number[] | null)[]>} */
  const byKey = new Map();
  for (const combo of product(unknown.map((u, j) => multisets(items[u].domain, sizes[j])))) {
    const pos = [...fixed];
    unknown.forEach((gi, j) => (pos[gi] = combo[j]));
    const a = assemble(spec, items, pos);
    if (!a || a.mol.validate().length) continue;
    const key = a.mol.canonicalKey();
    if (key !== null && !byKey.has(key)) byKey.set(key, pos);
  }
  if (byKey.size === 0) {
    const first = unknown.reduce((acc, gi, j) => { acc[gi] = Array(sizes[j]).fill(items[gi].domain[0]); return acc; }, [...fixed]);
    const a = assemble(spec, items, first);
    const ve = a ? valenceErrors(a.mol, a.chain) : [];
    return fail(ve.length ? ve : [{ code: 'valencia', message: 'Con esos localizadores no se puede construir la molécula sin exceder la valencia del carbono.' }]);
  }
  if (byKey.size > 1) {
    const ui = unknown[0];
    const it = items[ui];
    const options = [...new Set([...byKey.values()].map((p) => fmtLocs(p[ui] || [])))];
    return {
      status: 'incompleto', molecule: null, chain: [], trace: [], notes,
      errors: [{
        code: 'localizador_ambiguo',
        message: `Falta el localizador de «${it.label}»: en ${label} puede ir en distintos carbonos (${options.slice(0, 6).join(' / ')}) y cada opción es una molécula diferente. Escríbelo en el nombre, por ejemplo «${options[0]}-${it.label}».`,
        ...(it.span ? { from: it.span.from, to: it.span.to } : {}),
      }],
    };
  }
  const only = /** @type {(number[] | null)[]} */ ([...byKey.values()][0]);
  notes.push({
    type: 'localizador_omitido',
    message: 'Omitiste algún localizador. Aquí no hay duda porque todas las posiciones posibles dan la misma molécula, pero en general conviene escribirlo.',
  });
  return finish(only);

  /** @param {(number[] | null)[]} positions @returns {BuildResult} */
  function finish(positions) {
    const a = assemble(spec, items, positions);
    if (!a) {
      return fail([{ code: 'enlace_repetido', message: 'Dos enlaces múltiples no pueden estar en el mismo enlace entre carbonos: revisa los localizadores.' }]);
    }
    const issues = valenceErrors(a.mol, a.chain);
    if (issues.length) return fail(issues);
    return { status: 'valido', molecule: a.mol, chain: a.chain, trace: a.trace, errors: [], notes };
  }

  /** @param {BuildError[]} errs @returns {BuildResult} */
  function fail(errs) {
    const ambiguous = errs.some((e) => e.code === 'localizador_ambiguo');
    return { status: ambiguous ? 'incompleto' : 'invalido', molecule: null, chain: [], trace: [], errors: errs, notes };
  }
}

/**
 * Cadena de carbonos más larga de la molécula (para dibujarla cuando no hay otra elegida).
 * @param {Molecule} mol
 * @returns {number[]}
 */
function longestCarbonPath(mol) {
  /** @type {number[]} */
  let best = [];
  /** @param {number} id */
  const carbons = (id) => mol.neighbors(id).filter((x) => mol.element(x.id) === 'C').map((x) => x.id);
  /** @param {number[]} path */
  const walk = (path) => {
    const nexts = carbons(path[path.length - 1]).filter((x) => !path.includes(x));
    if (nexts.length === 0) {
      if (path.length > best.length) best = [...path];
      return;
    }
    for (const x of nexts) walk([...path, x]);
  };
  for (const a of mol.atoms) if (a.el === 'C') walk([a.id]);
  return best;
}

/**
 * Amina o éter en forma radicofuncional: un nitrógeno (u oxígeno) con sus radicales,
 * «etilmetilamina», «dimetilamina», «etil metil éter».
 * @param {Extract<Ast, { form: 'radicoamina' | 'radicoeter' }>} ast
 * @returns {BuildResult}
 */
function buildRadicoHetero(ast) {
  const isAmine = ast.form === 'radicoamina';
  const span = ast.form === 'radicoamina' ? ast.aminaSpan : ast.eterSpan;
  const total = ast.radicals.reduce((s, r) => s + r.mult, 0);
  /** @type {BuildError[]} */
  const errors = [];
  if (isAmine && total > 3) {
    errors.push({ code: 'valencia', message: `El nitrógeno de una amina admite como máximo 3 radicales y escribiste ${total}.`, from: span.from, to: span.to });
  }
  if (!isAmine && total !== 2) {
    errors.push({
      code: 'multiplicador', from: span.from, to: span.to,
      message: `Un éter es R–O–R′: lleva exactamente dos radicales (p. ej. «etil metil éter», «dietil éter») y escribiste ${total}.`,
    });
  }
  for (const t of ast.radicals) checkNested(t.radical, errors);
  if (errors.length) return { status: 'invalido', molecule: null, chain: [], trace: [], errors, notes: [] };

  const mol = new Molecule();
  const hetero = mol.addAtom(isAmine ? 'N' : 'O');
  /** @type {TraceItem[]} */
  const trace = [{ role: 'funcion', label: isAmine ? 'amina' : 'éter', span, atomIds: [hetero] }];
  for (const t of ast.radicals) {
    /** @type {Sub} */
    const sub = { kind: 'radical', radical: t.radical, text: t.text, common: t.common };
    /** @type {number[]} */
    const atomIds = [];
    for (let k = 0; k < t.mult; k++) atomIds.push(...attachSub(mol, hetero, sub));
    trace.push({ role: 'alquilo', label: t.text, span: t.span, atomIds });
  }
  const issues = valenceErrors(mol, []);
  if (issues.length) return { status: 'invalido', molecule: null, chain: [], trace: [], errors: issues, notes: [] };
  return { status: 'valido', molecule: mol, chain: longestCarbonPath(mol), trace, errors: [], notes: [] };
}

/** Multiconjuntos de tamaño k con elementos del dominio (orden no decreciente). @param {number[]} domain @param {number} k @returns {number[][]} */
function multisets(domain, k) {
  /** @type {number[][]} */
  const out = [];
  /** @param {number[]} cur @param {number} from */
  const rec = (cur, from) => {
    if (cur.length === k) {
      out.push([...cur]);
      return;
    }
    for (let i = from; i < domain.length; i++) {
      cur.push(domain[i]);
      rec(cur, i);
      cur.pop();
    }
  };
  rec([], 0);
  return out;
}

/** @param {number} n @param {number} k */
function multisetCount(n, k) {
  // C(n+k-1, k)
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n + k - i)) / i;
  return Math.round(r);
}

/** Producto cartesiano. @param {number[][][]} lists @returns {number[][][]} */
function product(lists) {
  /** @type {number[][][]} */
  let acc = [[]];
  for (const l of lists) {
    /** @type {number[][][]} */
    const next = [];
    for (const a of acc) for (const x of l) next.push([...a, x]);
    acc = next;
  }
  return acc;
}
