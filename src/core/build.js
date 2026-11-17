// @ts-check
/**
 * Construcción del grafo molecular a partir del AST (química determinista).
 *
 * - Valida localizadores (rango, cantidad vs. multiplicador).
 * - Si faltan localizadores, prueba TODAS las posiciones posibles: si todas dan la misma
 *   molécula (p. ej. "bromoetano") se acepta; si dan moléculas distintas (p. ej.
 *   "bromopropano") NO se adivina: el estado es "incompleto" y se pide el localizador.
 * - Registra la trazabilidad grupo del nombre -> átomos (para el resaltado cruzado).
 */
import { Molecule } from './molecule.js';
import { stemOf } from './lexicon.js';

/**
 * @typedef {import('./parser.js').Ast} Ast
 * @typedef {import('./parser.js').Group} Group
 * @typedef {import('./parser.js').Radical} Radical
 * @typedef {import('./parser.js').Sub} Sub
 * @typedef {import('./parser.js').Span} Span
 * @typedef {{ code: string, message: string, from?: number, to?: number }} BuildError
 * @typedef {{ type: string, message: string }} BuildNote
 * @typedef {{ role: 'cadena' | 'grupo' | 'halogenuro', label: string, span: Span | null, atomIds: number[], groupIndex?: number }} TraceItem
 * @typedef {{
 *   status: 'valido' | 'invalido' | 'incompleto',
 *   molecule: Molecule | null, chain: number[],
 *   trace: TraceItem[], errors: BuildError[], notes: BuildNote[]
 * }} BuildResult
 */

const MAX_COMBOS = 20000;

/**
 * @param {Ast} ast
 * @returns {BuildResult}
 */
export function build(ast) {
  if (ast.form === 'sustitutivo') {
    const stem = stemOf(ast.parent.n);
    return buildStructure({
      n: ast.parent.n,
      groups: ast.groups,
      attach: [],
      label: `${stem}ano`,
      chainSpan: ast.parent.span,
    });
  }
  return buildStructure({
    n: ast.radical.n,
    groups: ast.radical.groups,
    attach: [{ pos: 1, el: ast.halide.el, text: ast.halide.text, span: ast.halide.span }],
    label: 'el radical',
    chainSpan: ast.radicalSpan,
  });
}

/**
 * Posiciones (1..n) de un grupo, o null si faltan los localizadores.
 * @param {Group} g
 * @param {number} n
 * @param {string} label
 * @returns {{ positions: number[] | null, errors: BuildError[] }}
 */
function positionsOf(g, n, label) {
  /** @type {BuildError[]} */
  const errors = [];
  const text = g.sub.text || 'este sustituyente';
  const span = g.span ? { from: g.span.from, to: g.span.to } : {};
  if (!g.locants) {
    if (n === 1) return { positions: Array(g.mult || 1).fill(1), errors };
    return { positions: null, errors };
  }
  const k = g.locants.length;
  const locs = g.locants.join(',');
  if (g.mult === null && k > 1) {
    errors.push({
      code: 'multiplicador',
      message: `Escribiste ${k} localizadores (${locs}) para «${text}», pero falta el multiplicador (di-, tri-, tetra-…).`,
      ...span,
    });
  } else if (g.mult !== null && k !== g.mult) {
    errors.push({
      code: 'multiplicador',
      message:
        k === 1
          ? `El prefijo indica ${g.mult} sustituyentes pero diste un solo localizador (${locs}). Si van en el mismo carbono repite el número (${Array(g.mult).fill(locs).join(',')}).`
          : `El prefijo indica ${g.mult} sustituyentes pero diste ${k} localizadores (${locs}).`,
      ...span,
    });
  }
  for (const loc of g.locants) {
    if (loc < 1 || loc > n) {
      errors.push({
        code: 'localizador_fuera',
        message: `El localizador ${loc} no existe: ${label} tiene ${n} carbono${n === 1 ? '' : 's'} (del 1 al ${n}).`,
        ...span,
      });
    }
  }
  return { positions: errors.length ? [] : [...g.locants], errors };
}

/**
 * Comprueba los grupos anidados de un radical (requieren localizadores explícitos).
 * @param {Radical} r
 * @param {BuildError[]} errors
 */
function checkNested(r, errors) {
  for (const g of r.groups) {
    const { positions, errors: e } = positionsOf(g, r.n, 'el radical');
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
    const { positions } = positionsOf(g, r.n, 'el radical');
    for (const pos of positions || []) created.push(...attachSub(mol, ids[pos - 1], g.sub));
  }
  return created;
}

/**
 * @param {number} n
 * @param {Group[]} groups
 * @param {(number[] | null)[]} positions posiciones por grupo
 * @param {{ pos: number, el: string, text: string, span: Span }[]} attach
 * @param {string} label
 * @param {Span | null} chainSpan
 */
function assemble(n, groups, positions, attach, label, chainSpan) {
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
  groups.forEach((g, gi) => {
    /** @type {number[]} */
    const atomIds = [];
    for (const pos of positions[gi] || []) atomIds.push(...attachSub(mol, chain[pos - 1], g.sub));
    trace.push({ role: 'grupo', label: g.sub.text, span: g.span, atomIds, groupIndex: gi });
  });
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
        message: `El carbono ${pos + 1} tendría más de 4 enlaces. Un carbono extremo de la cadena admite hasta 3 sustituyentes y uno interior hasta 2 (el resto de sus enlaces son de la cadena y los hidrógenos).`,
      });
    } else {
      out.push({ code: issue.code, message: issue.message });
    }
  }
  return out;
}

/**
 * @param {{ n: number, groups: Group[], attach: { pos: number, el: string, text: string, span: Span }[], label: string, chainSpan: Span | null }} spec
 * @returns {BuildResult}
 */
function buildStructure(spec) {
  const { n, groups, attach, label, chainSpan } = spec;
  /** @type {BuildError[]} */
  const errors = [];
  /** @type {BuildNote[]} */
  const notes = [];
  /** @type {(number[] | null)[]} */
  const fixed = groups.map((g) => {
    const r = positionsOf(g, n, label);
    errors.push(...r.errors);
    if (g.sub.kind === 'radical') checkNested(g.sub.radical, errors);
    return r.positions;
  });
  if (errors.length) return fail(errors);

  const unknown = fixed.map((p, i) => (p === null ? i : -1)).filter((i) => i >= 0);
  if (unknown.length === 0) return finish(fixed);

  // Localizadores omitidos: enumerar posibilidades y comparar moléculas resultantes
  const sizes = unknown.map((i) => groups[i].mult || 1);
  let estimate = 1;
  for (const k of sizes) estimate *= multisetCount(n, k);
  if (estimate > MAX_COMBOS) {
    return fail([{ code: 'localizador_ambiguo', message: 'Faltan localizadores y hay demasiadas posibilidades: indica en qué carbono va cada sustituyente.' }]);
  }
  /** @type {Map<string, (number[] | null)[]>} */
  const byKey = new Map();
  for (const combo of product(unknown.map((_, j) => multisets(n, sizes[j])))) {
    const pos = [...fixed];
    unknown.forEach((gi, j) => (pos[gi] = combo[j]));
    const { mol, chain } = assemble(n, groups, pos, attach, label, chainSpan);
    if (mol.validate().length) continue;
    const key = mol.canonicalKey();
    void chain;
    if (key !== null && !byKey.has(key)) byKey.set(key, pos);
  }
  if (byKey.size === 0) {
    const first = assemble(n, groups, unknown.reduce((acc, gi) => { acc[gi] = Array(groups[gi].mult || 1).fill(1); return acc; }, [...fixed]), attach, label, chainSpan);
    return fail(valenceErrors(first.mol, first.chain).length ? valenceErrors(first.mol, first.chain) : [{ code: 'valencia', message: 'Con esos sustituyentes no se puede construir la molécula sin exceder la valencia del carbono.' }]);
  }
  if (byKey.size > 1) {
    const gi = unknown[0];
    const options = [...new Set([...byKey.values()].map((p) => (p[gi] || []).join(',')))];
    const g = groups[gi];
    return {
      status: 'incompleto', molecule: null, chain: [], trace: [], notes,
      errors: [{
        code: 'localizador_ambiguo',
        message: `Falta el localizador de «${g.sub.text}»: en ${label} puede ir en distintos carbonos (${options.slice(0, 6).join(' / ')}) y cada opción es una molécula diferente. Escríbelo antes del nombre, por ejemplo «${options[0]}-${g.sub.text}».`,
        ...(g.span ? { from: g.span.from, to: g.span.to } : {}),
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
    const { mol, chain, trace } = assemble(n, groups, positions, attach, label, chainSpan);
    const issues = valenceErrors(mol, chain);
    if (issues.length) return fail(issues);
    return { status: 'valido', molecule: mol, chain, trace, errors: [], notes };
  }

  /** @param {BuildError[]} errs @returns {BuildResult} */
  function fail(errs) {
    const ambiguous = errs.some((e) => e.code === 'localizador_ambiguo');
    return { status: ambiguous ? 'incompleto' : 'invalido', molecule: null, chain: [], trace: [], errors: errs, notes };
  }
}

/** Multiconjuntos de tamaño k con elementos 1..n (en orden no decreciente). @param {number} n @param {number} k @returns {number[][]} */
function multisets(n, k) {
  /** @type {number[][]} */
  const out = [];
  /** @param {number[]} cur @param {number} min */
  const rec = (cur, min) => {
    if (cur.length === k) {
      out.push([...cur]);
      return;
    }
    for (let v = min; v <= n; v++) {
      cur.push(v);
      rec(cur, v);
      cur.pop();
    }
  };
  rec([], 1);
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
