// @ts-check
/**
 * Parser de nomenclatura sistemática en español.
 * v0.2: alcanos, alquenos, alquinos, alcoholes, aldehídos, cetonas, ácidos carboxílicos,
 *       radicales alquilo y halogenuros.
 *
 * Acepta varias formas de escribir el mismo compuesto:
 *   - Sustitutiva, estilo escolar:  "1-bromo-2-metilpropano", "2-buteno", "4-penten-2-ol", "1,3-butadieno"
 *   - Sustitutiva, estilo IUPAC 2013: "but-2-eno", "propan-2-ol", "pent-4-en-2-ol", "propano-1,2-diol"
 *   - Radicofuncional:  "bromuro de etilo", "bromuro de isobutilo"
 *   - Nombres comunes:  "isobutano", "acetona", "ácido acético", "alcohol etílico"
 *   - Variantes de ortografía y orden: "fluor", "iodo", "2-metil-1-bromopropano", espacios, "n-hexano"
 *
 * Solo hace análisis SINTÁCTICO (los localizadores se asignan en build.js).
 * Nunca inventa una estructura.
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
 *   | { kind: 'func', fg: 'hidroxi' | 'oxo', text: string }
 *   | { kind: 'radical', radical: Radical, text: string, common?: string }} Sub
 * @typedef {{
 *   locants: number[] | null, mult: number | null, sub: Sub,
 *   span: Span | null, locSpan: Span | null, multSpan: Span | null, subSpan: Span | null,
 *   trailHyphen: boolean
 * }} Group
 * @typedef {{ kind: 'en' | 'in', mult: number, locants: number[] | null, span: Span | null }} Unsat
 * @typedef {{ kind: 'ol' | 'ona' | 'al' | 'oico', mult: number, locants: number[] | null, span: Span | null }} Suffix
 * @typedef {{ values: number[], span: Span }} FrontLocs
 * @typedef {{ type: string, message: string, from: number, to: number }} Note
 * @typedef {{
 *   form: 'sustitutivo', groups: Group[], parent: { n: number, span: Span | null },
 *   unsat: Unsat | null, suffix: Suffix | null, front: FrontLocs | null,
 *   acid: { span: Span | null } | null,
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
const funcP = alts(['hidroxi', 'oxo'], 'un grupo (hidroxi, oxo)');
const locNum = integer('un localizador (número)');
const locsP = seq(locNum, many(seq(ws, lit(','), ws, locNum)));

/** @param {any[]} v @returns {number[]} */
const locValues = (v) => [v[0], ...v[1].map((/** @type {any[]} */ x) => x[3])];

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
    const stem = r.value[1];
    /** @type {Sub} */
    const sub = {
      kind: 'radical',
      radical: { n: stemN[stem], groups: [] },
      text: ctx.input.slice(pos, r.pos),
      common: undefined,
    };
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

/** Sustituyente: halógeno, hidroxi/oxo, radical común, paréntesis o radical lineal. @type {import('./peg.js').P} */
const subP = (ctx, pos) => {
  const h = haloP(ctx, pos);
  if (h) {
    const info = HALO_PREFIXES[h.value];
    /** @type {Sub} */
    const sub = { kind: 'halo', el: info.el, text: h.value, canon: info.canon };
    return { pos: h.pos, value: sub };
  }
  const f = funcP(ctx, pos);
  if (f) {
    /** @type {Sub} */
    const sub = { kind: 'func', fg: /** @type {'hidroxi' | 'oxo'} */ (f.value), text: f.value };
    return { pos: f.pos, value: sub };
  }
  return choice(commonRadicalP(false), parenSubP, stemRadicalP(false))(ctx, pos);
};

/**
 * Localizadores seguidos de separador: "2-", "2,3-", "2 ".
 * @param {Ctx} ctx @param {number} pos
 * @returns {{ values: number[], span: Span, pos: number } | null}
 */
function locsWithSep(ctx, pos) {
  const l = locsP(ctx, pos);
  if (!l) return null;
  let p = ws(ctx, l.pos).pos;
  if (ctx.input[p] === '-') p++;
  p = ws(ctx, p).pos;
  return { values: locValues(l.value), span: { from: pos, to: l.pos }, pos: p };
}

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
  const l = locsWithSep(ctx, pos);
  if (l) {
    locants = l.values;
    locSpan = l.span;
    pos = l.pos;
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

/* ------------------------- núcleo: cadena + enlaces múltiples + sufijo ------------------------- */

/** "-2-" o "-1,3-" entre partes del nombre (estilo IUPAC 2013). @type {import('./peg.js').P} */
const midLocsP = (ctx, pos) => {
  let p = ws(ctx, pos).pos;
  const a = lit('-')(ctx, p);
  if (!a) return null;
  p = ws(ctx, a.pos).pos;
  const l = locsP(ctx, p);
  if (!l) return null;
  p = ws(ctx, l.pos).pos;
  const b = lit('-', 'un guion «-» después de los localizadores')(ctx, p);
  if (!b) return null;
  return { pos: ws(ctx, b.pos).pos, value: { values: locValues(l.value), span: { from: pos, to: b.pos } } };
};

const suffixWordP = alts(['oico', 'ona', 'ol', 'al'], 'un sufijo (-ol, -al, -ona, -oico)');
const endingEnInP = alts(['en', 'in'], 'la terminación -en / -in');

/**
 * Parte tras el tallo: terminación (an/en/in) con multiplicador opcional.
 * @param {Ctx} ctx @param {number} pos
 * @returns {{ pos: number, kind: 'an' | 'en' | 'in', mult: number, mid: FrontLocs | null } | null}
 */
function endingP(ctx, pos) {
  // A) buta-1,3-dieno / butadieno   (a + [localizadores] + multiplicador + en|in)
  const a = lit('a')(ctx, pos);
  if (a) {
    const mid = opt(midLocsP)(ctx, a.pos);
    const m = multP(ctx, mid.pos);
    if (m) {
      const e = endingEnInP(ctx, m.pos);
      if (e) {
        return { pos: e.pos, kind: /** @type {'en' | 'in'} */ (e.value), mult: multN[m.value], mid: mid.value };
      }
    }
  }
  // B) but-2-eno / buteno / 2-buteno
  const mid = opt(midLocsP)(ctx, pos);
  const e = endingEnInP(ctx, mid.pos);
  if (e) return { pos: e.pos, kind: /** @type {'en' | 'in'} */ (e.value), mult: 1, mid: mid.value };
  // C) alcano
  const an = lit('an', 'la terminación -an / -en / -in')(ctx, pos);
  if (an) return { pos: an.pos, kind: 'an', mult: 1, mid: null };
  return null;
}

/**
 * Sufijo opcional tras la terminación, con "o" de enlace ("propanodiol") y localizadores
 * intermedios ("propan-2-ol").
 * @param {Ctx} ctx @param {number} pos
 * @returns {{ pos: number, kind: 'ol' | 'ona' | 'al' | 'oico', mult: number, mid: FrontLocs | null } | null}
 */
function suffixP(ctx, pos) {
  for (const link of [false, true]) {
    let p = pos;
    if (link) {
      const o = lit('o')(ctx, p);
      if (!o) continue;
      p = o.pos;
    }
    const mid = opt(midLocsP)(ctx, p);
    const m = multP(ctx, mid.pos);
    const w = suffixWordP(ctx, m ? m.pos : mid.pos);
    if (w) {
      return {
        pos: w.pos, kind: /** @type {'ol' | 'ona' | 'al' | 'oico'} */ (w.value),
        mult: m ? multN[m.value] : 1, mid: mid.value,
      };
    }
  }
  return null;
}

/** Núcleo del nombre. @type {import('./peg.js').P} */
const coreP = (ctx, pos) => {
  /** @type {FrontLocs | null} */
  let front = null;
  const l = locsWithSep(ctx, pos);
  if (l) {
    front = { values: l.values, span: l.span };
    pos = l.pos;
  }
  const nn = lit('n-')(ctx, pos);
  if (nn) pos = nn.pos;
  const st = stemP(ctx, pos);
  if (!st) return null;
  const stemSpan = { from: pos, to: st.pos };
  const e = endingP(ctx, st.pos);
  if (!e) return null;
  const sfx = suffixP(ctx, e.pos);
  let end;
  if (sfx) {
    end = sfx.pos;
  } else {
    const o = lit('o', 'la terminación -o (-ano, -eno, -ino) o un sufijo (-ol, -al, -ona, -oico)')(ctx, e.pos);
    if (!o) return null;
    end = o.pos;
  }
  /** @type {Unsat | null} */
  const unsat = e.kind === 'an'
    ? null
    : { kind: e.kind, mult: e.mult, locants: e.mid ? e.mid.values : null, span: { from: st.pos, to: e.pos } };
  /** @type {Suffix | null} */
  const suffix = sfx
    ? { kind: sfx.kind, mult: sfx.mult, locants: sfx.mid ? sfx.mid.values : null, span: { from: e.pos, to: sfx.pos } }
    : null;
  // el span de «cadena»: solo el tallo si hay enlace múltiple; con «ano» (y su «o» final) si es alcano
  const parentEnd = unsat ? stemSpan.to : sfx ? e.pos : end;
  return {
    pos: end,
    value: { n: stemN[st.value], parentSpan: { from: stemSpan.from, to: parentEnd }, unsat, suffix, front },
  };
};

/** @type {import('./peg.js').P} */
const sustitutivoP = (ctx, pos) => {
  /** @type {{ span: Span | null } | null} */
  let acid = null;
  const ac = lit('acido')(ctx, pos);
  if (ac) {
    acid = { span: { from: pos, to: ac.pos } };
    pos = ws(ctx, ac.pos).pos;
  }
  const g = many(groupP)(ctx, pos);
  const c = coreP(ctx, g.pos);
  if (!c) return null;
  /** @type {Ast} */
  const ast = {
    form: 'sustitutivo', groups: g.value,
    parent: { n: c.value.n, span: c.value.parentSpan },
    unsat: c.value.unsat, suffix: c.value.suffix, front: c.value.front, acid,
  };
  return { pos: c.pos, value: ast };
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

/**
 * Quita las posiciones del texto (el AST viene de OTRO texto: el nombre sistemático interno).
 * @param {any} node
 * @returns {any}
 */
function stripSpans(node) {
  if (Array.isArray(node)) return node.map(stripSpans);
  if (node && typeof node === 'object') {
    /** @type {any} */
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      out[k] = /span$/i.test(k) ? null : stripSpans(v);
    }
    return out;
  }
  return node;
}

/** Nombres comunes de compuestos: "isobutano", "acetona". @type {import('./peg.js').P} */
const commonCompoundP = (ctx, pos) => {
  /** @type {Map<string, typeof COMMON_COMPOUNDS[number]>} */
  const map = new Map();
  for (const c of COMMON_COMPOUNDS) for (const nm of c.names) map.set(nm, c);
  const r = alts([...map.keys()], 'un nombre común (acetona, isobutano, cloroformo…)')(ctx, pos);
  if (!r) return null;
  const c = /** @type {typeof COMMON_COMPOUNDS[number]} */ (map.get(r.value));
  const inner = parse(c.systematic);
  if (!inner.ast || inner.ast.form !== 'sustitutivo') return null;
  /** @type {Ast} */
  const ast = { ...stripSpans(inner.ast), common: { name: r.value, systematic: c.systematic } };
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
  if (ast.form === 'sustitutivo') {
    visit(ast.groups, true);
    if (ast.suffix?.kind === 'oico' && !ast.acid && !ast.common) {
      notes.push({
        type: 'forma',
        message: 'Los ácidos carboxílicos llevan la palabra «ácido» antes del nombre (p. ej. «ácido butanoico»).',
        from: 0, to: 0,
      });
    }
  } else visit(ast.radical.groups, false);
  return notes;
}
