// @ts-check
/**
 * Parser de nomenclatura sistemática en español (v0.1: alcanos, alquilos, halogenuros).
 *
 * Acepta varias formas de escribir el mismo compuesto:
 *   - Sustitutiva:     "1-bromo-2-metilpropano", "5-fluoro-1-yodo-2-metilhexano", "bromoetano"
 *   - Radicofuncional: "bromuro de etilo", "bromuro de isobutilo", "cloruro de 2-metilpropilo"
 *   - Nombres comunes: "isobutano", "neopentano", "cloroformo"
 *   - Variantes de ortografía y orden: "fluor", "iodo", "2-metil-1-bromopropano", espacios, "n-hexano"
 *
 * Solo hace análisis SINTÁCTICO. La química (posiciones, valencias, ambigüedad)
 * se resuelve en build.js. Nunca inventa una estructura.
 */
import {
  Ctx, alts, choice, eof, integer, lit, many, opt, seq, ws,
} from './peg.js';
import {
  COMMON_COMPOUNDS, COMMON_RADICALS, FUERA_DE_ALCANCE, HALIDE_WORDS, HALO_PREFIXES, MULTS, STEMS,
} from './lexicon.js';

/**
 * @typedef {{ from: number, to: number }} Span
 * @typedef {{ n: number, groups: Group[] }} Radical
 * @typedef {{ kind: 'halo', el: string, text: string, canon: string }
 *   | { kind: 'radical', radical: Radical, text: string, common?: string }} Sub
 * @typedef {{
 *   locants: number[] | null, mult: number | null, sub: Sub,
 *   span: Span | null, locSpan: Span | null, multSpan: Span | null, subSpan: Span | null,
 *   trailHyphen: boolean
 * }} Group
 * @typedef {{ type: string, message: string, from: number, to: number }} Note
 * @typedef {{
 *   form: 'sustitutivo', groups: Group[], parent: { n: number, span: Span | null },
 *   common?: { name: string, systematic: string }
 * } | {
 *   form: 'radicofuncional', halide: { el: string, text: string, span: Span },
 *   radical: Radical, radicalSpan: Span
 * }} Ast
 * @typedef {{
 *   status: 'valido' | 'incompleto' | 'invalido' | 'fuera_de_alcance' | 'vacio',
 *   ast: Ast | null, notes: Note[],
 *   errors: { code: string, message: string, from: number, to: number }[],
 *   normalized: string
 * }} ParseResult
 */

const ACCENTS = /** @type {Record<string, string>} */ ({
  á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n',
});

/** Minúsculas y sin acentos, carácter por carácter (los índices se conservan). @param {string} s */
export function normalize(s) {
  return s
    .toLowerCase()
    .replace(/[áéíóúüñ]/g, (c) => ACCENTS[c])
    .replace(/[–—−]/g, '-');
}

const stemP = alts(STEMS.map(([s]) => s), 'una cadena (met-, et-, prop-, but-, pent-, hex-…)');
const stemN = /** @type {Record<string, number>} */ (Object.fromEntries(STEMS));
const multP = alts(MULTS.map(([m]) => m), 'un multiplicador (di, tri, tetra…)');
const multN = /** @type {Record<string, number>} */ (Object.fromEntries(MULTS));
const haloP = alts(Object.keys(HALO_PREFIXES), 'un halógeno (fluoro, cloro, bromo, yodo)');
const locsP = seq(integer('un localizador (número)'), many(seq(ws, lit(','), ws, integer('un localizador (número)'))));

/** @param {string} text @returns {Sub} */
function methylSub(text = 'metil') {
  return { kind: 'radical', radical: { n: 1, groups: [] }, text };
}

/**
 * Grupo sintético (sin posición en el texto).
 * @param {number[]} locants
 * @param {Sub} sub
 * @returns {Group}
 */
function synthGroup(locants, sub) {
  return {
    locants, mult: locants.length > 1 ? locants.length : null, sub,
    span: null, locSpan: null, multSpan: null, subSpan: null, trailHyphen: false,
  };
}

/** @param {typeof COMMON_RADICALS[number]} c @returns {Radical} */
function commonToRadical(c) {
  const byLoc = new Map();
  for (const l of c.methyls) byLoc.set(l, (byLoc.get(l) || 0) + 1);
  /** @type {Group[]} */
  const groups = [];
  for (const [loc, k] of byLoc) {
    groups.push(synthGroup(Array(k).fill(loc), methylSub()));
  }
  return { n: c.chain, groups };
}

/**
 * Radical con nombre común. withO: acepta terminación "-ilo" (forma radicofuncional).
 * @param {boolean} withO
 * @returns {import('./peg.js').P}
 */
function commonRadicalP(withO) {
  /** @type {Map<string, typeof COMMON_RADICALS[number]>} */
  const map = new Map();
  for (const c of COMMON_RADICALS) {
    for (const nm of c.names) {
      map.set(nm, c);
      if (withO) map.set(`${nm}o`, c);
    }
  }
  const p = alts([...map.keys()], 'un radical (isopropil, isobutil, sec-butil, terc-butil…)');
  return (ctx, pos) => {
    const r = p(ctx, pos);
    if (!r) return null;
    const c = /** @type {typeof COMMON_RADICALS[number]} */ (map.get(r.value));
    /** @type {Sub} */
    const sub = { kind: 'radical', radical: commonToRadical(c), text: r.value, common: c.canon };
    return { pos: r.pos, value: sub };
  };
}

/**
 * Radical lineal: [n-] raíz + "il" (o "ilo").
 * @param {boolean} withO
 * @returns {import('./peg.js').P}
 */
function stemRadicalP(withO) {
  const ending = withO ? alts(['ilo', 'il'], 'la terminación -il / -ilo') : lit('il', 'la terminación -il');
  const inner = seq(opt(lit('n-')), stemP, ending);
  return (ctx, pos) => {
    const r = inner(ctx, pos);
    if (!r) return null;
    const [, stem, end] = r.value;
    /** @type {Sub} */
    const sub = {
      kind: 'radical',
      radical: { n: stemN[stem], groups: [] },
      text: ctx.input.slice(pos, r.pos),
      common: undefined,
    };
    void end;
    return { pos: r.pos, value: sub };
  };
}

/**
 * Radical completo con sustituyentes propios: "2-metilpropil".
 * `terminator` indica dónde termina el radical (fin del texto o «)»); sirve para decidir
 * si lo que sigue es el núcleo final del radical o todavía otro sustituyente.
 * @param {boolean} withO
 * @param {import('./peg.js').P} terminator
 * @returns {import('./peg.js').P}
 */
function radicalWithGroupsP(withO, terminator) {
  const core = choice(commonRadicalP(withO), stemRadicalP(withO));
  return (ctx, pos) => {
    /** @type {Group[]} */
    const groups = [];
    for (;;) {
      const c = core(ctx, pos);
      if (c && terminator(ctx, ws(ctx, c.pos).pos)) {
        const sub = /** @type {Sub} */ (c.value);
        if (sub.kind !== 'radical') return null;
        if (groups.length && sub.common) {
          // "2-metil-isopropilo" no tiene sentido: los nombres comunes no admiten más sustituyentes
          ctx.fail(pos, 'un radical sin sustituyentes añadidos');
          return null;
        }
        /** @type {Radical} */
        const radical = { n: sub.radical.n, groups: [...groups, ...sub.radical.groups] };
        return { pos: c.pos, value: { radical, common: sub.common, text: sub.text } };
      }
      const g = groupP(ctx, pos);
      if (!g) return null;
      groups.push(g.value);
      pos = g.pos;
    }
  };
}

/** Fin del texto (lookahead). @type {import('./peg.js').P} */
const atEnd = (ctx, pos) => (pos === ctx.input.length ? { pos, value: null } : null);

/** Cierre de paréntesis (lookahead). @type {import('./peg.js').P} */
const atClose = (ctx, pos) => (ctx.input[pos] === ')' ? { pos, value: null } : null);

/** Sustituyente entre paréntesis: "(2-metilpropil)". @type {import('./peg.js').P} */
const parenSubP = (ctx, pos) => {
  const open = lit('(')(ctx, pos);
  if (!open) return null;
  let p = ws(ctx, open.pos).pos;
  const inner = radicalWithGroupsP(false, atClose)(ctx, p);
  if (!inner) return null;
  p = ws(ctx, inner.pos).pos;
  const close = lit(')', 'el paréntesis de cierre «)»')(ctx, p);
  if (!close) return null;
  /** @type {Sub} */
  const sub = {
    kind: 'radical', radical: inner.value.radical, common: inner.value.common,
    text: ctx.input.slice(pos, close.pos),
  };
  return { pos: close.pos, value: sub };
};

/** Sustituyente: halógeno, radical común, paréntesis o radical lineal. @type {import('./peg.js').P} */
const subP = (ctx, pos) => {
  const h = haloP(ctx, pos);
  if (h) {
    const info = HALO_PREFIXES[h.value];
    /** @type {Sub} */
    const sub = { kind: 'halo', el: info.el, text: h.value, canon: info.canon };
    return { pos: h.pos, value: sub };
  }
  return choice(commonRadicalP(false), parenSubP, stemRadicalP(false))(ctx, pos);
};

/**
 * Grupo: [localizadores][-][multiplicador]sustituyente[-]
 * @type {import('./peg.js').P}
 */
function groupP(ctx, pos) {
  const start = pos;
  /** @type {number[] | null} */
  let locants = null;
  /** @type {Span | null} */
  let locSpan = null;
  const l = locsP(ctx, pos);
  if (l) {
    locants = [l.value[0], ...l.value[1].map((/** @type {any[]} */ x) => x[3])];
    locSpan = { from: pos, to: l.pos };
    pos = ws(ctx, l.pos).pos;
    if (ctx.input[pos] === '-') pos++;
    pos = ws(ctx, pos).pos;
  }
  /** @type {number | null} */
  let mult = null;
  /** @type {Span | null} */
  let multSpan = null;
  const m = multP(ctx, pos);
  if (m) {
    mult = multN[m.value];
    multSpan = { from: pos, to: m.pos };
    pos = m.pos;
  }
  const s = subP(ctx, pos);
  if (!s) return null;
  const subSpan = { from: pos, to: s.pos };
  pos = s.pos;
  let p2 = ws(ctx, pos).pos;
  let trailHyphen = false;
  if (ctx.input[p2] === '-') {
    trailHyphen = true;
    p2++;
  }
  pos = ws(ctx, p2).pos;
  /** @type {Group} */
  const g = {
    locants, mult, sub: s.value, span: { from: start, to: subSpan.to },
    locSpan, multSpan, subSpan, trailHyphen,
  };
  return { pos, value: g };
}

/** Cadena principal: [n-]raíz+"ano". @type {import('./peg.js').P} */
const parentP = (ctx, pos) => {
  const r = seq(opt(lit('n-')), stemP, lit('ano', 'la terminación -ano'))(ctx, pos);
  if (!r) return null;
  return { pos: r.pos, value: { n: stemN[r.value[1]], span: { from: pos, to: r.pos } } };
};

/** @type {import('./peg.js').P} */
const sustitutivoP = (ctx, pos) => {
  const g = many(groupP)(ctx, pos);
  if (!g) return null;
  const p = parentP(ctx, g.pos);
  if (!p) return null;
  /** @type {Ast} */
  const ast = { form: 'sustitutivo', groups: g.value, parent: p.value };
  return { pos: p.pos, value: ast };
};

/** Forma radicofuncional: "bromuro de etilo". @type {import('./peg.js').P} */
const radicofuncionalP = (ctx, pos) => {
  const h = alts(Object.keys(HALIDE_WORDS), 'bromuro, cloruro, fluoruro o yoduro')(ctx, pos);
  if (!h) return null;
  let p = ws(ctx, h.pos).pos;
  const de = lit('de')(ctx, p);
  if (!de) return null;
  p = ws(ctx, de.pos).pos;
  const rad = radicalWithGroupsP(true, atEnd)(ctx, p);
  if (!rad) return null;
  /** @type {Ast} */
  const ast = {
    form: 'radicofuncional',
    halide: { el: HALIDE_WORDS[h.value], text: h.value, span: { from: pos, to: h.pos } },
    radical: rad.value.radical,
    radicalSpan: { from: p, to: rad.pos },
  };
  return { pos: rad.pos, value: ast };
};

/** Nombres comunes de compuestos: "isobutano", "cloroformo". @type {import('./peg.js').P} */
const commonCompoundP = (ctx, pos) => {
  /** @type {Map<string, typeof COMMON_COMPOUNDS[number]>} */
  const map = new Map();
  for (const c of COMMON_COMPOUNDS) for (const nm of c.names) map.set(nm, c);
  const r = alts([...map.keys()], 'un nombre común (isobutano, cloroformo…)')(ctx, pos);
  if (!r) return null;
  const c = /** @type {typeof COMMON_COMPOUNDS[number]} */ (map.get(r.value));
  /** @type {Group[]} */
  const groups = c.groups.map((g) => {
    const sub = g.el
      ? /** @type {Sub} */ ({ kind: 'halo', el: g.el, text: '', canon: '' })
      : methylSub();
    return synthGroup(g.locants, sub);
  });
  /** @type {Ast} */
  const ast = {
    form: 'sustitutivo', groups, parent: { n: c.chain, span: null },
    common: { name: r.value, systematic: c.systematic },
  };
  return { pos: r.pos, value: ast };
};

/**
 * @param {string} text
 * @returns {ParseResult}
 */
export function parse(text) {
  const input = normalize(text);
  if (input.trim() === '') {
    return { status: 'vacio', ast: null, notes: [], errors: [], normalized: input };
  }
  const ctx = new Ctx(input);
  const top = seq(ws, choice(radicofuncionalP, commonCompoundP, sustitutivoP), ws, eof);
  const r = top(ctx, 0);
  if (r) {
    const ast = /** @type {Ast} */ (r.value[1]);
    return { status: 'valido', ast, notes: collectNotes(ast), errors: [], normalized: input };
  }

  // Falló: ¿es algo que todavía no implementamos?
  const hits = FUERA_DE_ALCANCE.filter(([re]) => re.test(input)).map(([, label]) => label);
  if (hits.length) {
    return {
      status: 'fuera_de_alcance', ast: null, notes: [],
      errors: [{
        code: 'fuera_de_alcance',
        message: `Detecté ${hits.join(', ')}. Todavía no está implementado, así que no dibujo una estructura parcial que pudiera engañarte.`,
        from: 0, to: input.length,
      }],
      normalized: input,
    };
  }

  const expected = [...ctx.expected].slice(0, 5).join(', ');
  if (ctx.farthest >= input.length) {
    return {
      status: 'incompleto', ast: null, notes: [],
      errors: [{
        code: 'incompleto',
        message: `Sigue escribiendo: aquí podría ir ${expected || 'más texto'}.`,
        from: input.length, to: input.length,
      }],
      normalized: input,
    };
  }
  const rest = text.slice(ctx.farthest);
  const found = (/^\S+/.exec(rest) || [' '])[0];
  return {
    status: 'invalido', ast: null, notes: [],
    errors: [{
      code: 'sintaxis',
      message: `No reconozco «${found}» en esta posición. Aquí esperaba: ${expected}.`,
      from: ctx.farthest, to: ctx.farthest + found.length,
    }],
    normalized: input,
  };
}

/**
 * Notas de forma (ortografía y estilo) detectadas al leer el nombre.
 * @param {Ast} ast
 * @returns {Note[]}
 */
function collectNotes(ast) {
  /** @type {Note[]} */
  const notes = [];
  /** @param {Group[]} groups @param {boolean} isLastBeforeParent */
  const visit = (groups, isLastBeforeParent) => {
    groups.forEach((g, i) => {
      if (g.sub.kind === 'halo' && g.subSpan && g.sub.text !== g.sub.canon) {
        notes.push({
          type: 'forma',
          message: `Se escribe «${g.sub.canon}» (tú escribiste «${g.sub.text}»).`,
          from: g.subSpan.from, to: g.subSpan.to,
        });
      }
      if (g.sub.kind === 'radical') visit(g.sub.radical.groups, false);
      if (isLastBeforeParent && i === groups.length - 1 && g.trailHyphen && g.span) {
        notes.push({
          type: 'forma',
          message: 'Antes de la cadena principal no se escribe guion (p. ej. «yodohexano», no «yodo-hexano»).',
          from: g.span.to, to: g.span.to + 1,
        });
      }
    });
  };
  if (ast.form === 'sustitutivo') visit(ast.groups, true);
  else visit(ast.radical.groups, false);
  return notes;
}
