// @ts-check
/**
 * Parser de nomenclatura sistemática en español.
 * v0.3: alcanos, alquenos, alquinos, alcoholes, aldehídos, cetonas, ácidos carboxílicos,
 *       éteres, ésteres, aminas, amidas, radicales alquilo y halogenuros.
 *
 * Acepta varias formas de escribir el mismo compuesto:
 *   - Sustitutiva, estilo escolar:  "1-bromo-2-metilpropano", "2-buteno", "4-penten-2-ol", "1,3-butadieno"
 *   - Sustitutiva, estilo IUPAC 2013: "but-2-eno", "propan-2-ol", "pent-4-en-2-ol", "propano-1,2-diol"
 *   - Radicofuncional:  "bromuro de etilo", "bromuro de isobutilo", "etilmetilamina", "etil metil éter"
 *   - Ésteres: "etanoato de metilo";  amidas: "N-metiletanamida";  éteres: "metoxietano"
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
  COMMON_ACYL, COMMON_COMPOUNDS, COMMON_RADICALS, FUERA_DE_ALCANCE, HALIDE_WORDS, HALO_PREFIXES, MULTS, STEMS_READ,
} from './lexicon.js';

/**
 * @typedef {{ from: number, to: number }} Span
 * @typedef {{ n: number, groups: Group[] }} Radical
 * @typedef {{ kind: 'halo', el: string, text: string, canon: string }
 *   | { kind: 'func', fg: 'hidroxi' | 'oxo' | 'amino', text: string }
 *   | { kind: 'radical', radical: Radical, text: string, common?: string }
 *   | { kind: 'alkoxy', radical: Radical, text: string, common?: string }
 *   | { kind: 'nsub', terms: RadicalTerm[], text: string }} Sub
 * @typedef {{
 *   locants: number[] | null, mult: number | null, sub: Sub,
 *   span: Span | null, locSpan: Span | null, multSpan: Span | null, subSpan: Span | null,
 *   trailHyphen: boolean
 * }} Group
 * @typedef {{ kind: 'en' | 'in', mult: number, locants: number[] | null, span: Span | null }} Unsat
 * @typedef {{ kind: 'ol' | 'ona' | 'al' | 'oico' | 'amina' | 'amida' | 'oato', mult: number, locants: number[] | null, span: Span | null }} Suffix
 * @typedef {{ radical: Radical, text: string, common?: string, span: Span | null }} EsterTail
 * @typedef {{ radical: Radical, mult: number, text: string, common?: string, span: Span | null }} RadicalTerm
 * @typedef {{ values: number[], span: Span }} FrontLocs
 * @typedef {{ type: string, message: string, from: number, to: number }} Note
 * @typedef {{
 *   form: 'sustitutivo', groups: Group[], parent: { n: number, span: Span | null },
 *   unsat: Unsat | null, suffix: Suffix | null, front: FrontLocs | null,
 *   acid: { span: Span | null } | null, ester: EsterTail | null,
 *   common?: { name: string, systematic: string }
 * } | {
 *   form: 'radicofuncional', halide: { el: string, text: string, span: Span },
 *   radical: Radical, radicalSpan: Span
 * } | {
 *   form: 'radicoamina', radicals: RadicalTerm[], aminaSpan: Span
 * } | {
 *   form: 'radicoeter', radicals: RadicalTerm[], eterSpan: Span
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
    // «N» mayúscula como localizador del nitrógeno (N-metil, N,N-dimetil, 2,N-dimetil): se marca con «@»
    .replace(/(^|[^A-Za-zÁ-ÿ])N(?=\s*[-,])/g, '$1@')
    .toLowerCase()
    .replace(/[áéíóúüñ]/g, (c) => ACCENTS[c])
    .replace(/[–—−]/g, '-');
}

const stemP = alts(STEMS_READ.map(([s]) => s), 'una cadena (met-, et-, prop-, but-, pent-, hex-…)');
const stemN = /** @type {Record<string, number>} */ (Object.fromEntries(STEMS_READ));
const multP = alts(MULTS.map(([m]) => m), 'un multiplicador (di, tri, tetra…)');
const multN = /** @type {Record<string, number>} */ (Object.fromEntries(MULTS));
const haloP = alts(Object.keys(HALO_PREFIXES), 'un halógeno (fluoro, cloro, bromo, yodo)');
const funcP = alts(['hidroxi', 'oxo', 'amino'], 'un grupo (hidroxi, oxo, amino)');
const locNum = integer('un localizador (número)');
/** «N» (nitrógeno) como localizador: vale -1 (centinela; un «0» escrito sigue siendo el número 0). @type {import('./peg.js').P} */
const nLoc = (ctx, pos) => {
  const r = lit('@', 'el localizador N (nitrógeno)')(ctx, pos);
  return r ? { pos: r.pos, value: -1 } : null;
};
const locAny = choice(locNum, nLoc);
/** @param {import('./peg.js').P} item @returns {import('./peg.js').P} */
const locList = (item) => seq(item, many(seq(ws, lit(','), ws, item)));
const locsP = locList(locNum);
const locsAnyP = locList(locAny);

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
 * Terminación del radical: «il» (sustituyente), «ilo» (radicofuncional: «bromuro de etilo»,
 * «etanoato de metilo») u «oxi» (alcoxi: «metoxi», «isopropoxi»).
 * @typedef {'il' | 'ilo' | 'oxi'} RadMode
 */

/**
 * Radical con nombre común.
 * @param {RadMode} mode
 * @returns {import('./peg.js').P}
 */
function commonRadicalP(mode) {
  /** @type {Map<string, typeof COMMON_RADICALS[number]>} */
  const map = new Map();
  for (const c of COMMON_RADICALS) {
    for (const nm of c.names) {
      map.set(mode === 'oxi' ? nm.replace(/il$/, 'oxi') : nm, c);
      if (mode === 'ilo') map.set(`${nm}o`, c);
    }
  }
  const p = alts([...map.keys()], mode === 'oxi' ? 'un alcoxi (isopropoxi, isobutoxi, terc-butoxi…)' : 'un radical (isopropil, isobutil, sec-butil, terc-butil…)');
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
 * Radical lineal: [n-] raíz + "il" (o "ilo", o "oxi").
 * @param {RadMode} mode
 * @returns {import('./peg.js').P}
 */
function stemRadicalP(mode) {
  const ending = mode === 'ilo'
    ? alts(['ilo', 'il'], 'la terminación -il / -ilo')
    : mode === 'oxi' ? lit('oxi', 'la terminación -oxi') : lit('il', 'la terminación -il');
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
 * @param {RadMode} mode
 * @param {import('./peg.js').P} terminator
 * @returns {import('./peg.js').P}
 */
function radicalWithGroupsP(mode, terminator) {
  const core = choice(commonRadicalP(mode), stemRadicalP(mode));
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

/**
 * Sustituyente entre paréntesis: "(2-metilpropil)" o "(2-metilpropoxi)".
 * @param {RadMode} mode
 * @returns {import('./peg.js').P}
 */
const parenP = (mode) => (ctx, pos) => {
  const open = lit('(')(ctx, pos);
  if (!open) return null;
  let p = ws(ctx, open.pos).pos;
  const inner = radicalWithGroupsP(mode, atClose)(ctx, p);
  if (!inner) return null;
  p = ws(ctx, inner.pos).pos;
  const close = lit(')', 'el paréntesis de cierre «)»')(ctx, p);
  if (!close) return null;
  /** @type {Sub} */
  const sub = {
    kind: mode === 'oxi' ? 'alkoxy' : 'radical', radical: inner.value.radical, common: inner.value.common,
    text: ctx.input.slice(pos, close.pos),
  };
  return { pos: close.pos, value: sub };
};

/**
 * Amino sustituido entre paréntesis: «(metilamino)», «(etilmetilamino)», «(dimetilamino)».
 * Es como se nombran en clase las aminas secundarias y terciarias («2-(metilamino)propano»).
 * @type {import('./peg.js').P}
 */
const nsubP = (ctx, pos) => {
  const open = lit('(')(ctx, pos);
  if (!open) return null;
  /** @type {RadicalTerm[]} */
  const terms = [];
  let p = ws(ctx, open.pos).pos;
  for (;;) {
    const t = radTermP(ctx, p);
    if (!t) break;
    terms.push(t.value);
    p = t.pos;
  }
  if (!terms.length) return null;
  const am = lit('amino', 'la terminación -amino')(ctx, p);
  if (!am) return null;
  p = ws(ctx, am.pos).pos;
  const close = lit(')', 'el paréntesis de cierre «)»')(ctx, p);
  if (!close) return null;
  /** @type {Sub} */
  const sub = { kind: 'nsub', terms, text: ctx.input.slice(pos, close.pos) };
  return { pos: close.pos, value: sub };
};

/** Un radical leído en modo «oxi» pasa a ser un alcoxi. @param {import('./peg.js').Ok | null} r */
function asAlkoxy(r) {
  if (!r) return null;
  const v = r.value;
  /** @type {Sub} */
  const sub = { kind: 'alkoxy', radical: v.radical, text: v.text, common: v.common };
  return { pos: r.pos, value: sub };
}

/** Sustituyente: halógeno, hidroxi/oxo/amino, alcoxi, radical común, paréntesis o radical lineal. @type {import('./peg.js').P} */
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
    const sub = { kind: 'func', fg: /** @type {'hidroxi' | 'oxo' | 'amino'} */ (f.value), text: f.value };
    return { pos: f.pos, value: sub };
  }
  const ns = nsubP(ctx, pos);
  if (ns) return ns;
  const ax = asAlkoxy(choice(commonRadicalP('oxi'), parenP('oxi'), stemRadicalP('oxi'))(ctx, pos));
  if (ax) return ax;
  return choice(commonRadicalP('il'), parenP('il'), stemRadicalP('il'))(ctx, pos);
};

/**
 * Localizadores seguidos de separador: "2-", "2,3-", "2 ". Con `allowN` acepta también «N» (nitrógeno).
 * @param {Ctx} ctx @param {number} pos @param {boolean} [allowN]
 * @returns {{ values: number[], span: Span, pos: number } | null}
 */
function locsWithSep(ctx, pos, allowN = false) {
  const l = (allowN ? locsAnyP : locsP)(ctx, pos);
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
  const l = locsWithSep(ctx, pos, true);
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
  /** @type {{ pos: number, value: any } | null} */
  let s = null;
  if (m) {
    // «tridecil» es un radical de 13 carbonos, no «tri + decil»: si se lee sin multiplicador, gana
    const whole = subP(ctx, pos);
    if (whole && !(whole.value.kind === 'halo')) s = whole;
    if (!s) {
      mult = multN[m.value];
      multSpan = { from: pos, to: m.pos };
      pos = m.pos;
    }
  }
  if (!s) s = subP(ctx, pos);
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

const suffixWordP = alts(['oico', 'oato', 'amina', 'amida', 'ona', 'ol', 'al'], 'un sufijo (-ol, -al, -ona, -oico, -oato, -amina, -amida)');
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
 * @returns {{ pos: number, kind: Suffix['kind'], mult: number, mid: FrontLocs | null } | null}
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
        pos: w.pos, kind: /** @type {Suffix['kind']} */ (w.value),
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
  const nn = choice(lit('n-'), lit('@-'))(ctx, pos); // «N-hexano» con N mayúscula también es «n-hexano»
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
    const o = lit('o', 'la terminación -o (-ano, -eno, -ino) o un sufijo (-ol, -al, -ona, -oico, -oato, -amina, -amida)')(ctx, e.pos);
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
  let end = c.pos;
  /** @type {EsterTail | null} */
  let ester = null;
  if (c.value.suffix?.kind === 'oato') {
    // éster: «etanoato de metilo» = parte ácida + «de» + radical -ilo
    let p = ws(ctx, c.pos).pos;
    const de = lit('de', 'la palabra «de» (p. ej. «etanoato de metilo»)')(ctx, p);
    if (!de) return null;
    p = ws(ctx, de.pos).pos;
    const rad = radicalWithGroupsP('ilo', atEnd)(ctx, p);
    if (!rad) return null;
    ester = { radical: rad.value.radical, text: rad.value.text, common: rad.value.common, span: { from: p, to: rad.pos } };
    end = rad.pos;
  }
  /** @type {Ast} */
  const ast = {
    form: 'sustitutivo', groups: g.value,
    parent: { n: c.value.n, span: c.value.parentSpan },
    unsat: c.value.unsat, suffix: c.value.suffix, front: c.value.front, acid, ester,
  };
  return { pos: end, value: ast };
};

/** Forma radicofuncional: "bromuro de etilo". @type {import('./peg.js').P} */
const radicofuncionalP = (ctx, pos) => {
  const h = alts(Object.keys(HALIDE_WORDS), 'bromuro, cloruro, fluoruro o yoduro')(ctx, pos);
  if (!h) return null;
  let p = ws(ctx, h.pos).pos;
  const de = lit('de')(ctx, p);
  if (!de) return null;
  p = ws(ctx, de.pos).pos;
  const rad = radicalWithGroupsP('ilo', atEnd)(ctx, p);
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
 * Radical simple (común o lineal, terminado en «il») con multiplicador opcional: «etil», «dimetil».
 * Es la pieza de «etilmetilamina» y «etil metil éter». Si se lee entero como radical, gana
 * («tridecil» = 13 carbonos, no «tri + decil»).
 * @type {import('./peg.js').P}
 */
const radTermP = (ctx, pos) => {
  const core = choice(commonRadicalP('il'), stemRadicalP('il'));
  let mult = 1;
  let r = core(ctx, pos);
  if (!r) {
    const m = multP(ctx, pos);
    if (!m) return null;
    r = core(ctx, m.pos);
    if (!r) return null;
    mult = multN[m.value];
  }
  /** @type {RadicalTerm} */
  const term = { radical: r.value.radical, mult, text: r.value.text, common: r.value.common, span: { from: pos, to: r.pos } };
  return { pos: r.pos, value: term };
};

/** Amina radicofuncional: «metilamina», «dimetilamina», «etilmetilamina». @type {import('./peg.js').P} */
const radicoaminaP = (ctx, pos) => {
  /** @type {RadicalTerm[]} */
  const terms = [];
  let p = pos;
  for (;;) {
    const t = radTermP(ctx, p);
    if (!t) break;
    terms.push(t.value);
    p = t.pos;
  }
  if (!terms.length) return null;
  const am = lit('amina', 'la terminación -amina')(ctx, p);
  if (!am) return null;
  /** @type {Ast} */
  const ast = { form: 'radicoamina', radicals: terms, aminaSpan: { from: p, to: am.pos } };
  return { pos: am.pos, value: ast };
};

/** Éter radicofuncional: «etil metil éter», «dietil éter». @type {import('./peg.js').P} */
const radicoeterP = (ctx, pos) => {
  /** @type {RadicalTerm[]} */
  const terms = [];
  let p = pos;
  for (;;) {
    const t = radTermP(ctx, p);
    if (!t) break;
    terms.push(t.value);
    p = ws(ctx, t.pos).pos;
  }
  if (!terms.length) return null;
  const et = lit('eter', 'la palabra «éter»')(ctx, p);
  if (!et) return null;
  /** @type {Ast} */
  const ast = { form: 'radicoeter', radicals: terms, eterSpan: { from: p, to: et.pos } };
  return { pos: et.pos, value: ast };
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
 * Éster con acilo de nombre común y cualquier radical: «acetato de isopropilo».
 * Se reescribe como «etanoato de isopropilo» y se lee con la gramática normal.
 * @type {import('./peg.js').P}
 */
const commonEsterP = (ctx, pos) => {
  const m = new RegExp(`^(${Object.keys(COMMON_ACYL).join('|')}) de (\\S+)`).exec(ctx.input.slice(pos));
  if (!m) return null;
  const systematic = `${COMMON_ACYL[m[1]]} de ${m[2]}`;
  const inner = parse(systematic);
  if (!inner.ast || inner.ast.form !== 'sustitutivo') return null;
  /** @type {Ast} */
  const ast = { ...stripSpans(inner.ast), common: { name: `${m[1]} de ${m[2]}`, systematic } };
  return { pos: pos + m[0].length, value: ast };
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
  const top = seq(ws, choice(radicofuncionalP, radicoaminaP, radicoeterP, commonCompoundP, commonEsterP, sustitutivoP), ws, eof);
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
  if (ast.form === 'radicoamina' || ast.form === 'radicoeter') return notes;
  if (ast.form === 'sustitutivo') {
    visit(ast.groups, true);
    if (ast.ester) visit(ast.ester.radical.groups, false);
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
