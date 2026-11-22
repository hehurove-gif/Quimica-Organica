// @ts-check
/**
 * Estructura -> nombre (acíclicos: alcanos, alquenos, alquinos, halogenuros, alcoholes,
 * aldehídos, cetonas, ácidos carboxílicos, ésteres, amidas, aminas y éteres) y diagnóstico
 * pedagógico.
 *
 * Reglas aplicadas, en este orden (IUPAC 1979, la que se enseña en bachillerato):
 *   0. Grupo principal = el de mayor prioridad:
 *      ácido > éster > amida > aldehído > cetona > alcohol > amina.
 *      El resto de funciones se nombran como prefijos (hidroxi-, oxo-, amino-).
 *      Los éteres no son grupo principal: el lado más pequeño se nombra como alcoxi (-oxi).
 *      Éster: «alcanoato de …ilo» (la cola «…ilo» viene del alcohol y no es parte de la cadena).
 *      Amina y amida: los demás radicales del nitrógeno se localizan con «N» (N,N-dimetil…).
 *   1. Cadena principal = la que contiene MÁS grupos principales.
 *   2. Luego, la que contiene MÁS enlaces múltiples.
 *   3. Luego, la más larga.
 *   4. Luego, la que tiene MÁS sustituyentes.
 *   5. Numerar para dar localizadores MÁS BAJOS: primero al grupo principal, luego a los
 *      enlaces múltiples, luego al conjunto de sustituyentes.
 *   6. Si aún hay empate: el primer sustituyente en orden alfabético recibe el localizador más bajo.
 *   7. Los sustituyentes se escriben en orden alfabético (sin contar di-, tri-…, ni sec-, terc-).
 *
 * Es el MISMO módulo de reglas que usa el diagnóstico del nombre escrito por el alumno,
 * para que ida y vuelta nunca se contradigan.
 */
import { Molecule, HALOGENS } from './molecule.js';
import { HALIDE_CANON, HALO_CANON, COMMON_RADICALS, multOf, stemOf } from './lexicon.js';
import { parse } from './parser.js';
import { build } from './build.js';

class Unsupported extends Error {}
/** Cadena candidata descartable (deja un enlace múltiple fuera): no es un límite del sistema. */
class Inviable extends Unsupported {}

/**
 * `pos` es el carbono de la cadena (1..n) o `N_POS` (-1) si el sustituyente cuelga del nitrógeno.
 * @typedef {{ pos: number, text: string, sortKey: string, complex: boolean }} Sub
 * @typedef {'acido' | 'ester' | 'amida' | 'aldehido' | 'cetona' | 'alcohol' | 'amina'} FnKind
 * @typedef {{
 *   n: number, subs: Sub[], name: string, iupac: string,
 *   fn: FnKind | null, fnLocs: number[], unsat: 'en' | 'in' | null, unsatLocs: number[],
 *   path: number[], tail: string | null
 * }} Model
 * @typedef {{
 *   ok: true, systematic: string, iupac2013: string, radicofuncional: string | null,
 *   model: Model, chain: number[]
 * } | { ok: false, reason: string }} NameResult
 */

const MAX_CHAIN = 99;
/** Posición que representa al nitrógeno («N-metil»). Igual que en build.js. */
const N_POS = -1;

/** Clave para ordenar alfabéticamente: sin localizadores, sin sec-/terc-, sin paréntesis. @param {string} text */
function sortKeyOf(text) {
  return text
    .replace(/^[^a-z]+/, '')
    .replace(/^(sec|terc|tert|ter|n)-/, '')
    .replace(/[()]/g, '');
}

/** Radicales con nombre: clave del subárbol -> nombre. */
const KNOWN = (() => {
  /** @type {Map<string, string>} */
  const map = new Map();
  /** @param {number} n @param {number[]} methyls @param {string} name */
  const add = (n, methyls, name) => {
    const m = new Molecule();
    const parent = m.addAtom('C');
    /** @type {number[]} */
    const ids = [];
    for (let i = 0; i < n; i++) {
      const id = m.addAtom('C');
      m.addBond(i === 0 ? parent : ids[i - 1], id);
      ids.push(id);
    }
    for (const p of methyls) m.addBond(ids[p - 1], m.addAtom('C'));
    map.set(m._rooted(ids[0], parent, ''), name);
  };
  for (let n = 1; n <= MAX_CHAIN; n++) add(n, [], `${stemOf(n)}il`);
  for (const c of COMMON_RADICALS) add(c.chain, c.methyls, c.canon);
  return map;
})();

/**
 * @param {Molecule} mol
 * @param {number} id
 */
function carbonNbrs(mol, id) {
  return mol.neighbors(id).filter((nb) => mol.element(nb.id) === 'C').map((nb) => nb.id);
}

/**
 * Todas las trayectorias simples de carbonos que empiezan en `start`.
 * @param {Molecule} mol
 * @param {number} start
 * @param {number} avoid carbono vecino que NO se debe recorrer (-1 = ninguno)
 * @returns {number[][]}
 */
function pathsFrom(mol, start, avoid) {
  /** @type {number[][]} */
  const out = [];
  /** @param {number[]} path */
  const rec = (path) => {
    const last = path[path.length - 1];
    const nexts = carbonNbrs(mol, last).filter((x) => !path.includes(x) && x !== avoid);
    if (nexts.length === 0) {
      out.push(path);
      return;
    }
    // también es camino válido terminar aquí (para comparar longitudes), pero el más largo
    // siempre termina en hoja: basta con registrar hojas
    for (const x of nexts) rec([...path, x]);
  };
  rec([start]);
  return out;
}

const PRIORITY = /** @type {Record<FnKind, number>} */ ({ acido: 7, ester: 6, amida: 5, aldehido: 4, cetona: 3, alcohol: 2, amina: 1 });

/**
 * Heteroátomos unidos a un carbono: =O (oxo), –OH (oh), –O–C (éter/éster: O con dos vecinos) y N.
 * @param {Molecule} mol
 * @param {number} c
 */
function oxygensOf(mol, c) {
  /** @type {number[]} */
  const oxo = [];
  /** @type {number[]} */
  const oh = [];
  /** @type {number[]} */
  const ether = [];
  /** @type {number[]} */
  const nitrogens = [];
  for (const nb of mol.neighbors(c)) {
    const el = mol.element(nb.id);
    if (el === 'N') nitrogens.push(nb.id);
    if (el !== 'O') continue;
    if (nb.order === 2) oxo.push(nb.id);
    else if (mol.neighbors(nb.id).length === 1) oh.push(nb.id);
    else ether.push(nb.id);
  }
  return { oxo, oh, ether, nitrogens };
}

/** ¿Este nitrógeno está unido a un carbonilo (es el N de una amida)? @param {Molecule} mol @param {number} n */
function isAmideN(mol, n) {
  return mol.neighbors(n).some((nb) => mol.element(nb.id) === 'C' && oxygensOf(mol, nb.id).oxo.length > 0);
}

/**
 * Clase de función de un carbono (la de mayor prioridad) o null.
 * @param {Molecule} mol
 * @param {number} c
 * @returns {FnKind | null}
 */
function fnOf(mol, c) {
  const { oxo, oh, ether, nitrogens } = oxygensOf(mol, c);
  const cn = carbonNbrs(mol, c).length;
  if (oxo.length && oh.length) return 'acido';
  if (oxo.length && ether.length) return 'ester';
  if (oxo.length && nitrogens.length) return 'amida';
  if (oxo.length) return cn <= 1 ? 'aldehido' : 'cetona';
  if (oh.length) return 'alcohol';
  if (nitrogens.some((n) => !isAmideN(mol, n))) return 'amina';
  return null;
}

/** ¿El carbono es un carbonilo de ácido, éster o amida? @param {Molecule} mol @param {number} c */
function isAcylC(mol, c) {
  const k = fnOf(mol, c);
  return k === 'acido' || k === 'ester' || k === 'amida';
}

/**
 * Cuántas veces aparece la función `kind` en el carbono (-ol y -amina pueden repetirse).
 * @param {Molecule} mol @param {number} c @param {FnKind} kind
 */
function fnCount(mol, c, kind) {
  if (fnOf(mol, c) !== kind) return 0;
  if (kind === 'alcohol') return oxygensOf(mol, c).oh.length;
  if (kind === 'amina') return oxygensOf(mol, c).nitrogens.filter((n) => !isAmideN(mol, n)).length;
  return 1;
}

/**
 * Sustituyentes de una cadena numerada (path[0] = C1).
 * @param {Molecule} mol
 * @param {number[]} path
 * @param {number} attachedTo carbono/átomo del que cuelga la cadena si es un radical (-1 si es la cadena principal)
 * @param {FnKind | null} [principal] grupo principal (null en radicales: no admiten funciones)
 * @returns {Sub[]}
 */
function subsOf(mol, path, attachedTo, principal = null) {
  /** @type {Sub[]} */
  const subs = [];
  path.forEach((id, i) => {
    for (const nb of mol.neighbors(id)) {
      if (nb.id === path[i - 1] || nb.id === path[i + 1]) continue;
      if (i === 0 && nb.id === attachedTo) continue;
      const el = mol.element(nb.id);
      if (nb.order > 1 && el === 'C') {
        throw new Inviable('Hay un enlace múltiple fuera de la cadena principal (radicales como vinilo o alilo): todavía no se pueden nombrar.');
      }
      if (HALOGENS.includes(el)) {
        const text = HALO_CANON[el];
        subs.push({ pos: i + 1, text, sortKey: text, complex: false });
      } else if (el === 'O') {
        const cls = fnOf(mol, id);
        if (attachedTo !== -1) {
          throw new Inviable('Un radical con grupo funcional (hidroximetil, formil, metoxietil…) todavía no se puede nombrar.');
        }
        if (cls !== null && cls === principal) continue; // forma parte del sufijo (incluye el O del éster)
        if (cls === 'ester' || cls === 'amida') {
          throw new Inviable('Un éster o una amida que no es el grupo principal (carboxi, metoxicarbonil, carbamoil…) todavía no se puede nombrar.');
        }
        if (mol.neighbors(nb.id).length === 1) {
          const text = nb.order === 2 ? 'oxo' : 'hidroxi';
          subs.push({ pos: i + 1, text, sortKey: text, complex: false });
        } else {
          // éter: el otro lado del oxígeno se nombra como alcoxi (metoxi, etoxi, isopropoxi…)
          const other = carbonNbrs(mol, nb.id).find((x) => x !== id);
          if (other === undefined) throw new Inviable('Un oxígeno sin segundo carbono.');
          if (isAcylC(mol, other)) throw new Inviable('Un grupo aciloxi (R–CO–O–) como sustituyente todavía no se puede nombrar.');
          const r = radicalName(mol, other, nb.id);
          const text = r.text.replace(/il$/, 'oxi');
          subs.push({ pos: i + 1, text, sortKey: sortKeyOf(text), complex: r.complex });
        }
      } else if (el === 'N') {
        const cls = fnOf(mol, id);
        if (attachedTo !== -1) {
          throw new Inviable('Un radical con grupo funcional (aminometil, acetamido…) todavía no se puede nombrar.');
        }
        if (isAmideN(mol, nb.id)) {
          if (cls === 'amida' && principal === 'amida') continue; // el N de la amida es parte del sufijo
          throw new Inviable('Un N-acilo (acetamido…) o una amida que no es el grupo principal todavía no se puede nombrar.');
        }
        if (cls === 'amina' && principal === 'amina') continue; // parte del sufijo -amina
        if (mol.neighbors(nb.id).length > 1) {
          // amino sustituido: «(metilamino)», «(etilmetilamino)», «(dimetilamino)»
          const others = mol.neighbors(nb.id).filter((x) => x.id !== id);
          if (others.some((x) => mol.element(x.id) !== 'C' || isAcylC(mol, x.id))) {
            throw new Inviable('Una amina sustituida con acilo u otro heteroátomo (acetamido…) todavía no se puede nombrar.');
          }
          const rads = others.map((x) => radicalName(mol, x.id, nb.id));
          if (rads.some((r) => r.complex)) {
            throw new Inviable('Una amina sustituida con radicales ramificados como sustituyente todavía no se puede nombrar.');
          }
          /** @type {Map<string, number>} */
          const count = new Map();
          for (const r of rads) count.set(r.text, (count.get(r.text) || 0) + 1);
          const parts = [...count.entries()]
            .sort((x, y) => (sortKeyOf(x[0]) < sortKeyOf(y[0]) ? -1 : sortKeyOf(x[0]) > sortKeyOf(y[0]) ? 1 : 0))
            .map(([text, k]) => `${k > 1 ? multOf(k) || '' : ''}${text}`);
          const text = `${parts.join('')}amino`;
          subs.push({ pos: i + 1, text, sortKey: sortKeyOf(text), complex: true });
          continue;
        }
        subs.push({ pos: i + 1, text: 'amino', sortKey: 'amino', complex: false });
      } else {
        const r = radicalName(mol, nb.id, id);
        subs.push({ pos: i + 1, text: r.text, sortKey: sortKeyOf(r.text), complex: r.complex });
      }
    }
  });
  return subs;
}

/**
 * Nombre de un radical que cuelga de `parent` por el carbono `c`.
 * @param {Molecule} mol
 * @param {number} c
 * @param {number} parent
 * @returns {{ text: string, complex: boolean }}
 */
function radicalName(mol, c, parent) {
  const known = KNOWN.get(mol._rooted(c, parent, ''));
  if (known) return { text: known, complex: false };
  // radical sistemático: cadena más larga desde el carbono de unión (C1)
  const paths = pathsFrom(mol, c, parent);
  const best = pickBest(paths.map((p) => ({ path: p, subs: subsOf(mol, p, parent, null) })));
  const n = best.path.length;
  for (let i = 0; i < n - 1; i++) {
    if (mol.neighbors(best.path[i]).some((x) => x.id === best.path[i + 1] && x.order > 1)) {
      throw new Inviable('Un radical con enlace múltiple (vinilo, alilo, etinilo…) todavía no se puede nombrar.');
    }
  }
  const stem = stemOf(n);
  if (!stem) throw new Unsupported(`El radical tiene una cadena de ${n} carbonos (el límite actual es ${MAX_CHAIN}).`);
  const prefix = compose(best.subs, n, n === 1);
  return { text: `${prefix}${stem}il`, complex: prefix !== '' };
}

/**
 * @param {Sub[]} a
 * @param {Sub[]} b
 * @returns {number} negativo si `a` es mejor numeración que `b`
 */
function compareSubs(a, b) {
  if (a.length !== b.length) return b.length - a.length; // más sustituyentes es mejor
  const la = a.map((s) => s.pos).sort((x, y) => x - y);
  const lb = b.map((s) => s.pos).sort((x, y) => x - y);
  for (let i = 0; i < la.length; i++) if (la[i] !== lb[i]) return la[i] - lb[i];
  /** @param {Sub[]} s */
  const alpha = (s) =>
    [...s].sort((x, y) => (x.sortKey < y.sortKey ? -1 : x.sortKey > y.sortKey ? 1 : x.pos - y.pos)).map((x) => x.pos);
  const aa = alpha(a);
  const ab = alpha(b);
  for (let i = 0; i < aa.length; i++) if (aa[i] !== ab[i]) return aa[i] - ab[i];
  return 0;
}

/**
 * Elige la mejor entre trayectorias de MISMA longitud (las más largas).
 * @param {{ path: number[], subs: Sub[] }[]} cands
 */
function pickBest(cands) {
  const max = Math.max(...cands.map((c) => c.path.length));
  const longest = cands.filter((c) => c.path.length === max);
  return longest.reduce((best, c) => (compareSubs(c.subs, best.subs) < 0 ? c : best));
}

/**
 * Escribe los prefijos agrupados: "5-fluoro-1-yodo-2-metil".
 * @param {Sub[]} subs
 * @param {number} n largo de la cadena
 * @param {boolean} omitLocants
 */
function compose(subs, n, omitLocants) {
  /** @type {Map<string, { positions: number[], sortKey: string, complex: boolean, text: string }>} */
  const groups = new Map();
  for (const s of subs) {
    const g = groups.get(s.text);
    if (g) g.positions.push(s.pos);
    else groups.set(s.text, { positions: [s.pos], sortKey: s.sortKey, complex: s.complex, text: s.text });
  }
  void n;
  return [...groups.values()]
    .sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0))
    .map((g) => {
      const positions = g.positions.sort((x, y) => x - y);
      const k = positions.length;
      const mult = k > 1 ? multOf(k) : '';
      if (mult === null) throw new Unsupported(`Hay ${k} sustituyentes iguales (el límite actual es 20).`);
      const t = g.complex ? `(${g.text})` : g.text;
      const locs = positions.map((p) => (p === N_POS ? 'N' : p)).join(',');
      return omitLocants ? `${mult}${t}` : `${locs}-${mult}${t}`;
    })
    .join('-');
}

/**
 * Grupo principal de la molécula (el de mayor prioridad presente) o null.
 * @param {Molecule} mol
 * @returns {FnKind | null}
 */
function principalOf(mol) {
  /** @type {FnKind | null} */
  let best = null;
  for (const a of mol.atoms) {
    if (a.el !== 'C') continue;
    const k = fnOf(mol, a.id);
    if (k && (best === null || PRIORITY[k] > PRIORITY[best])) best = k;
  }
  return best;
}

/**
 * Descripción de una cadena numerada (sin elegir otra): sustituyentes, grupo principal y
 * enlaces múltiples, más los nombres escolar e IUPAC 2013.
 * @param {Molecule} mol
 * @param {number[]} path
 * @param {FnKind | null} [principal]
 * @returns {Model}
 */
export function modelFor(mol, path, principal = principalOf(mol)) {
  const n = path.length;
  const stem = stemOf(n);
  if (!stem) throw new Unsupported(`La cadena principal tiene ${n} carbonos (el límite actual es ${MAX_CHAIN}).`);
  const subs = subsOf(mol, path, -1, principal);
  /** @type {number[]} */
  const fnLocs = [];
  if (principal) {
    path.forEach((id, i) => {
      const k = fnCount(mol, id, principal);
      for (let j = 0; j < k; j++) fnLocs.push(i + 1);
    });
  }
  // Nitrógenos de la función principal (amina/amida): sus otros radicales son N-sustituyentes
  /** @type {string | null} */
  let tail = null;
  if (principal === 'amina' || principal === 'amida') {
    /** @type {number[]} */
    const ns = [];
    for (const id of path) {
      if (fnOf(mol, id) !== principal) continue;
      for (const nb of mol.neighbors(id)) {
        if (mol.element(nb.id) === 'N' && isAmideN(mol, nb.id) === (principal === 'amida')) ns.push(nb.id);
      }
    }
    for (const nId of ns) {
      const extra = mol.neighbors(nId).filter((nb) => !path.includes(nb.id));
      if (ns.length > 1 && extra.length) {
        throw new Unsupported('Con más de un nitrógeno hay que distinguir N y N′; esa notación todavía no está soportada.');
      }
      for (const nb of extra) {
        if (mol.element(nb.id) !== 'C') throw new Inviable('Un nitrógeno unido a algo que no es carbono todavía no se puede nombrar.');
        const r = radicalName(mol, nb.id, nId);
        subs.push({ pos: N_POS, text: r.text, sortKey: sortKeyOf(r.text), complex: r.complex });
      }
    }
  }
  if (principal === 'ester') {
    if (fnLocs.length > 1) throw new Unsupported('Los diésteres todavía no se pueden nombrar.');
    const c = path[fnLocs[0] - 1];
    const o = oxygensOf(mol, c).ether[0];
    const other = carbonNbrs(mol, o).find((x) => x !== c);
    if (other === undefined) throw new Inviable('Un éster sin radical al otro lado del oxígeno.');
    if (isAcylC(mol, other)) throw new Inviable('Los anhídridos y otros diacilos todavía no se pueden nombrar.');
    tail = `${radicalName(mol, other, o).text}o`;
  }
  /** @type {number[]} */
  const unsatLocs = [];
  /** @type {Set<number>} */
  const orders = new Set();
  for (let i = 0; i < n - 1; i++) {
    const o = mol.neighbors(path[i]).find((x) => x.id === path[i + 1])?.order ?? 1;
    if (o > 1) {
      unsatLocs.push(i + 1);
      orders.add(o);
    }
  }
  if (orders.size > 1) throw new Unsupported('Enlaces dobles y triples en la misma cadena (eninos): todavía no se pueden nombrar.');
  const unsat = orders.size ? (orders.has(2) ? 'en' : 'in') : null;
  /** @type {Model} */
  const m = { n, subs, name: '', iupac: '', fn: principal, fnLocs, unsat, unsatLocs, path, tail };
  m.name = formatName(m, 'escolar', { u: false, s: false });
  m.iupac = formatName(m, 'iupac', { u: false, s: false });
  return m;
}

/**
 * Escribe el nombre de un modelo.
 * @param {Model} m
 * @param {'escolar' | 'iupac'} style
 * @param {{ u: boolean, s: boolean }} omit omitir localizadores del enlace múltiple / del sufijo
 * @param {boolean} [omitPrefix] omitir localizadores de los sustituyentes
 */
function formatName(m, style, omit, omitPrefix) {
  const { n, subs, fn, fnLocs, unsat, unsatLocs } = m;
  const stem = /** @type {string} */ (stemOf(n));
  const hasN = subs.some((x) => x.pos === N_POS) || fn === 'amina' || fn === 'amida'; // con N posible, los localizadores se escriben siempre
  const skipPrefix = omitPrefix ?? (!hasN && (n === 1 || (n === 2 && subs.length === 1 && !fn && !unsat)));
  const prefixes = compose(subs, n, skipPrefix);
  const uk = unsat === 'en' ? 'en' : 'in';
  const uMult = unsatLocs.length;
  const sMult = fnLocs.length;
  const mw = (/** @type {number} */ k) => (k > 1 ? multOf(k) || '' : '');
  const sWord = fn ? { acido: 'oico', ester: 'oato', amida: 'amida', aldehido: 'al', cetona: 'ona', alcohol: 'ol', amina: 'amina' }[fn] : '';
  const sLocated = fn === 'cetona' || fn === 'alcohol' || fn === 'amina'; // las funciones terminales siempre están en el extremo
  const sLocs = fnLocs.join(',');
  const uLocs = unsatLocs.join(',');
  let core;
  if (style === 'escolar') {
    const uFront = unsat && !omit.u ? `${uLocs}-` : '';
    const sFront = !unsat && fn && sLocated && !omit.s ? `${sLocs}-` : '';
    const sMid = unsat && fn && sLocated && !omit.s ? `-${sLocs}-` : '';
    if (unsat) {
      core = `${uFront}${stem}${uMult > 1 ? `a${mw(uMult)}` : ''}${uk}${fn ? `${sMult > 1 ? 'o' : ''}${sMid}${mw(sMult)}${sWord}` : 'o'}`;
    } else if (fn) {
      core = `${sFront}${stem}an${sMult > 1 ? 'o' : ''}${mw(sMult)}${sWord}`;
    } else {
      core = `${stem}ano`;
    }
  } else {
    const uMid = unsat && !omit.u ? `-${uLocs}-` : '';
    const sMid = fn && sLocated && !omit.s ? `-${sLocs}-` : '';
    if (unsat) {
      core = `${stem}${uMult > 1 ? 'a' : ''}${uMid}${mw(uMult)}${uk}${fn ? `${sMult > 1 ? 'o' : ''}${sMid}${mw(sMult)}${sWord}` : 'o'}`;
    } else if (fn) {
      core = `${stem}an${sMult > 1 ? 'o' : ''}${sMid}${mw(sMult)}${sWord}`;
    } else {
      core = `${stem}ano`;
    }
  }
  const lead = prefixes ? `${prefixes}${style === 'escolar' && /^\d/.test(core) ? '-' : ''}` : '';
  return `${fn === 'acido' ? 'ácido ' : ''}${lead}${core}${m.tail ? ` de ${m.tail}` : ''}`;
}

/**
 * ¿El texto se lee (parser + constructor) como EXACTAMENTE esta molécula?
 * @param {string} text
 * @param {Molecule} mol
 */
function readsBack(text, mol) {
  const p = parse(text);
  if (p.status !== 'valido' || !p.ast) return false;
  const b = build(p.ast);
  return b.status === 'valido' && b.molecule !== null && b.molecule.canonicalKey() === mol.canonicalKey();
}

/**
 * Quita los localizadores que sobran SOLO si el nombre resultante sigue sin ambigüedad.
 * @param {Molecule} mol
 * @param {Model} m
 * @param {'escolar' | 'iupac'} style
 */
function shortest(mol, m, style) {
  const omit = { u: false, s: false };
  const full = formatName(m, style, omit);
  // Amina con solo N-sustituyentes («N-metiletanamina», no «N-metiletan-1-amina»): se quita el
  // localizador de la amina solo si el nombre más corto se lee igual
  if (m.fn === 'amina' && m.subs.length > 0 && m.subs.every((x) => x.pos === N_POS)) {
    const t = formatName(m, style, { ...omit, s: true });
    return readsBack(t, mol) ? t : full;
  }
  // con sustituyentes se conservan todos los localizadores (más claro para quien aprende)
  if (m.subs.length > 0) return full;
  // Con enlace múltiple y función a la vez, o con varias funciones iguales (butanodiona), los
  // localizadores se escriben siempre: «2-butin-1-ol», «3-buten-2-ona», «2,3-butanodiona».
  const conservar = (m.unsat !== null && m.fn !== null) || m.fnLocs.length > 1;
  if (conservar) return full;
  // IUPAC 2013, P-14.3.4: solo se omite el localizador en cadenas de uno o dos átomos (metanol,
  // etanol, eteno, etino) y en el propeno sin sustituyentes; propan-2-ona, butan-2-ona,
  // propa-1,2-dieno y prop-1-ino los conservan. El estilo escolar quita los que sobran.
  const iupacOmite = (/** @type {'u' | 's'} */ que) =>
    style !== 'iupac' || m.n <= 2 || (que === 'u' && m.n === 3 && m.unsat === 'en' && m.unsatLocs.length === 1 && !m.fn);
  if (m.fn && (m.fn === 'cetona' || m.fn === 'alcohol' || m.fn === 'amina') && iupacOmite('s')) {
    const t = formatName(m, style, { ...omit, s: true });
    if (readsBack(t, mol)) omit.s = true;
  }
  if (m.unsat && iupacOmite('u')) {
    const t = formatName(m, style, { ...omit, u: true });
    if (readsBack(t, mol)) omit.u = true;
  }
  const out = formatName(m, style, omit);
  return readsBack(out, mol) ? out : full;
}

/**
 * Motivo por el que una molécula no se puede nombrar todavía (o null si sí).
 * @param {Molecule} mol
 * @returns {string | null}
 */
function whyNot(mol) {
  if (mol.atoms.length === 0) return 'La molécula está vacía.';
  if (mol.validate().length) return 'La estructura tiene errores químicos; corrígelos antes de nombrarla.';
  if (!mol.isTree()) return 'Las estructuras con ciclos todavía no se pueden nombrar.';
  if (!mol.atoms.some((a) => a.el === 'C')) return 'No hay carbonos.';
  for (const a of mol.atoms) {
    if (a.el !== 'C' && a.el !== 'O' && a.el !== 'N' && !HALOGENS.includes(a.el)) return `El elemento ${a.el} todavía no está soportado para nombrar.`;
    const nbs = mol.neighbors(a.id);
    if (HALOGENS.includes(a.el) && nbs.some((nb) => mol.element(nb.id) !== 'C')) {
      return 'Un halógeno unido a otro halógeno o a O/N no se puede nombrar todavía.';
    }
    if (a.el === 'O') {
      if (nbs.length === 0 || nbs.some((nb) => mol.element(nb.id) !== 'C')) {
        return 'Los peróxidos, el agua y los enlaces O–N u O–O todavía no se pueden nombrar.';
      }
      if (nbs.length > 2) return 'Un oxígeno con más de dos enlaces todavía no se puede nombrar.';
    }
    if (a.el === 'N') {
      if (nbs.length === 0 || nbs.some((nb) => mol.element(nb.id) !== 'C' || nb.order !== 1)) {
        return 'Nitrilos, iminas, hidrazinas y enlaces N–N/N–O todavía no se pueden nombrar (solo aminas y amidas con enlaces sencillos al carbono).';
      }
      if (nbs.filter((nb) => oxygensOf(mol, nb.id).oxo.length > 0).length > 1) {
        return 'Las imidas (un nitrógeno unido a dos carbonilos) todavía no se pueden nombrar.';
      }
    }
    if (a.el === 'C') {
      const ox = oxygensOf(mol, a.id);
      const single = ox.oh.length + ox.ether.length + ox.nitrogens.length;
      if (ox.oxo.length > 1 || (ox.oxo.length === 1 && single > 1)) {
        return 'Carbonos con varios oxígenos o nitrógenos (CO₂, carbamatos, ureas, anhídridos…) todavía no se pueden nombrar.';
      }
      if (ox.oxo.length === 0 && (ox.ether.length > 1 || (ox.ether.length === 1 && single > 1) || ox.nitrogens.length > 1 || (ox.nitrogens.length === 1 && ox.oh.length > 0))) {
        return 'Acetales, hemiacetales y otros carbonos con varios heteroátomos todavía no se pueden nombrar.';
      }
      if (ox.oxo.length && nbs.some((nb) => HALOGENS.includes(mol.element(nb.id)))) {
        return 'Los halogenuros de acilo todavía no se pueden nombrar.';
      }
    }
  }
  return null;
}

/**
 * Comparación de dos numeraciones/cadenas candidatas (menor = mejor).
 * @param {Model} a
 * @param {Model} b
 */
function compareModels(a, b) {
  /** @param {number[]} x @param {number[]} y */
  const cmp = (x, y) => {
    for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i];
    return 0;
  };
  /** @param {number[]} x */
  const sorted = (x) => [...x].sort((p, q) => p - q);
  const steps = [
    b.fnLocs.length - a.fnLocs.length, // más grupos principales
    b.unsatLocs.length - a.unsatLocs.length, // más enlaces múltiples
    b.n - a.n, // cadena más larga
    b.subs.length - a.subs.length, // más sustituyentes
    cmp(sorted(a.fnLocs), sorted(b.fnLocs)), // localizadores bajos: grupo principal
    cmp(sorted(a.unsatLocs), sorted(b.unsatLocs)), // enlaces múltiples
    compareSubs(a.subs, b.subs), // sustituyentes (conjunto y luego orden alfabético)
  ];
  return steps.find((x) => x !== 0) ?? 0;
}

/**
 * Forma radicofuncional, solo si el texto se lee de vuelta como la misma molécula:
 *   - halogenuro de alquilo con un único halógeno: «bromuro de etilo»
 *   - éter sencillo (solo C y un O entre dos radicales): «etil metil éter», «dietil éter»
 *   - amina sencilla (solo C y un N con 1 a 3 radicales): «etilmetilamina», «dimetilamina»
 * @param {Molecule} mol
 * @returns {string | null}
 */
function radicofuncionalOf(mol) {
  const halos = mol.atoms.filter((a) => HALOGENS.includes(a.el));
  const hasO = mol.atoms.some((a) => a.el === 'O');
  const hasN = mol.atoms.some((a) => a.el === 'N');
  const multiple = mol.bonds.some((b) => b.order > 1);
  if (multiple) return null;
  if (halos.length === 1 && !hasO && !hasN) {
    const h = halos[0].id;
    const c = mol.neighbors(h)[0].id;
    const r = radicalName(mol, c, h);
    return `${HALIDE_CANON[halos[0].el]} de ${r.text}o`;
  }
  if (halos.length) return null;
  const heteros = mol.atoms.filter((a) => a.el === 'O' || a.el === 'N');
  if (heteros.length !== 1) return null;
  const h = heteros[0];
  const nbs = mol.neighbors(h.id).map((nb) => nb.id);
  if (h.el === 'O' ? nbs.length !== 2 : nbs.length < 1 || nbs.length > 3) return null;
  // todos los carbonos del molécula deben colgar de este heteroátomo (sin otros grupos)
  const rads = nbs.map((c) => radicalName(mol, c, h.id));
  if (rads.some((r) => r.complex)) return null;
  /** @type {Map<string, number>} */
  const count = new Map();
  for (const r of rads) count.set(r.text, (count.get(r.text) || 0) + 1);
  const parts = [...count.entries()]
    .sort((a, b) => (sortKeyOf(a[0]) < sortKeyOf(b[0]) ? -1 : sortKeyOf(a[0]) > sortKeyOf(b[0]) ? 1 : 0))
    .map(([text, k]) => `${k > 1 ? multOf(k) || '' : ''}${text}`);
  const text = h.el === 'O' ? `${parts.join(' ')} éter` : `${parts.join('')}amina`;
  return readsBack(text, mol) ? text : null;
}

/**
 * Nombre canónico de una molécula.
 * @param {Molecule} mol
 * @returns {NameResult}
 */
export function nameMolecule(mol) {
  const reason = whyNot(mol);
  if (reason) return { ok: false, reason };
  try {
    const principal = principalOf(mol);
    const carbons = mol.atoms.filter((a) => a.el === 'C').map((a) => a.id);
    /** @type {number[][]} */
    const all = [];
    for (const c of carbons) all.push(...pathsFrom(mol, c, -1));
    /** @type {Model | null} */
    let best = null;
    /** @type {Unsupported | null} */
    let firstError = null;
    for (const p of all) {
      let m;
      try {
        m = modelFor(mol, p, principal);
      } catch (e) {
        // una cadena candidata puede ser inviable (deja un enlace múltiple fuera); se descarta
        if (e instanceof Inviable) {
          firstError = firstError || e;
          continue;
        }
        throw e;
      }
      if (best === null || compareModels(m, best) < 0) best = m;
    }
    if (best === null) throw firstError || new Unsupported('No encuentro una cadena principal que se pueda nombrar.');
    const model = /** @type {Model} */ (best);
    // todos los grupos principales deben caber en la cadena elegida
    if (principal) {
      let total = 0;
      if (principal === 'amina') {
        // cada N de amina es UN grupo, aunque cuelguen de él varios carbonos (amina secundaria/terciaria)
        total = mol.atoms.filter((a) => a.el === 'N' && !isAmideN(mol, a.id)).length;
      } else {
        for (const c of carbons) total += fnCount(mol, c, principal);
      }
      if (total !== model.fnLocs.length) {
        throw new Unsupported('Hay grupos funcionales principales que no caben en una sola cadena: todavía no se pueden nombrar.');
      }
    }
    // todos los enlaces múltiples también (los de fuera ya los detecta subsOf)
    const systematic = shortest(mol, model, 'escolar');
    const iupac2013 = shortest(mol, model, 'iupac');

    const radicofuncional = radicofuncionalOf(mol);
    return { ok: true, systematic, iupac2013, radicofuncional, model, chain: model.path };
  } catch (e) {
    if (e instanceof Unsupported) return { ok: false, reason: e.message };
    throw e;
  }
}

/**
 * @typedef {{ type: 'cadena' | 'numeracion' | 'orden_alfabetico', message: string, correct: string }} Diagnostic
 */

/**
 * Compara el nombre ESCRITO por el alumno (ya construido como molécula, con la numeración
 * que él usó = `typedChain`) contra el nombre canónico y explica la diferencia.
 * @param {import('./parser.js').Ast} ast
 * @param {Molecule} mol
 * @param {number[]} typedChain
 * @returns {Diagnostic[]}
 */
export function diagnose(ast, mol, typedChain) {
  if (ast.form !== 'sustitutivo') return [];
  const canon = nameMolecule(mol);
  if (!canon.ok) return [];
  /** @type {Diagnostic[]} */
  const out = [];
  /** @type {Model} */
  let typed;
  try {
    typed = modelFor(mol, typedChain);
  } catch (e) {
    if (e instanceof Unsupported) return []; // la cadena escrita no se puede describir: no se compara
    throw e;
  }
  const correct = canon.systematic;

  if (typed.fnLocs.length < canon.model.fnLocs.length) {
    out.push({
      type: 'cadena', correct,
      message: `La cadena principal debe contener el grupo funcional principal (el de mayor prioridad: ácido > aldehído > cetona > alcohol). Nombre correcto: «${correct}».`,
    });
    return out;
  }
  if (typed.unsatLocs.length < canon.model.unsatLocs.length) {
    out.push({
      type: 'cadena', correct,
      message: `La cadena principal debe contener el mayor número de enlaces dobles/triples. Nombre correcto: «${correct}».`,
    });
    return out;
  }
  if (typed.n < canon.model.n) {
    out.push({
      type: 'cadena',
      correct,
      message: `La cadena principal debe ser la más larga: la tuya tiene ${typed.n} carbonos y existe una de ${canon.model.n}. Nombre correcto: «${correct}».`,
    });
    return out;
  }
  /** @param {Sub[]} s */
  const sig = (s) => s.map((x) => `${x.pos}:${x.text}`).sort().join('|');
  /** @param {Model} m */
  const full = (m) => `${sig(m.subs)}#${m.fnLocs.join()}#${m.unsatLocs.join()}`;
  if (full(typed) !== full(canon.model)) {
    const reversed = [...typedChain].reverse();
    let sameChainReversed = false;
    try {
      sameChainReversed = full(modelFor(mol, reversed)) === full(canon.model);
    } catch (e) {
      if (!(e instanceof Unsupported)) throw e;
    }
    if (sameChainReversed) {
      out.push({
        type: 'numeracion',
        correct,
        message: `La cadena se numera desde el extremo que da el localizador más bajo, por este orden: grupo principal, enlaces dobles/triples y por último sustituyentes. Numerada al revés resulta «${correct}».`,
      });
    } else {
      out.push({
        type: 'cadena',
        correct,
        message: `Hay otra elección de cadena principal que respeta mejor las reglas (más sustituyentes o localizadores más bajos). Nombre correcto: «${correct}».`,
      });
    }
    return out;
  }
  // misma estructura de numeración: revisar el orden alfabético del texto
  /** @type {string[]} */
  const written = [];
  for (const g of ast.groups) {
    const k = g.sub.kind === 'halo' ? g.sub.canon : sortKeyOf(g.sub.text.replace(/^n-/, ''));
    const key = sortKeyOf(k);
    if (written[written.length - 1] !== key) written.push(key);
  }
  const sorted = [...written].sort();
  if (written.some((k, i) => k !== sorted[i])) {
    out.push({
      type: 'orden_alfabetico',
      correct,
      message: `Los sustituyentes se escriben en orden alfabético (sin contar di-, tri-…): «${correct}».`,
    });
  }
  return out;
}
