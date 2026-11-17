// @ts-check
/**
 * Estructura -> nombre (alcanos acíclicos con halógenos, v0.1) y diagnóstico pedagógico.
 *
 * Reglas aplicadas, en este orden (las mismas que se enseñan en bachillerato):
 *   1. Cadena principal = la más larga.
 *   2. Si hay varias del mismo largo: la que tiene MÁS sustituyentes.
 *   3. Numerar desde el extremo que dé los localizadores MÁS BAJOS al conjunto de sustituyentes.
 *   4. Si aún hay empate: el primer sustituyente en orden alfabético recibe el localizador más bajo.
 *   5. Los sustituyentes se escriben en orden alfabético (sin contar di-, tri-…, ni sec-, terc-).
 *
 * Es el MISMO módulo de reglas que usa el diagnóstico del nombre escrito por el alumno,
 * para que ida y vuelta nunca se contradigan.
 */
import { Molecule, HALOGENS } from './molecule.js';
import { HALIDE_CANON, HALO_CANON, COMMON_RADICALS, multOf, stemOf } from './lexicon.js';

class Unsupported extends Error {}

/**
 * @typedef {{ pos: number, text: string, sortKey: string, complex: boolean }} Sub
 * @typedef {{ n: number, subs: Sub[], name: string }} Model
 * @typedef {{
 *   ok: true, systematic: string, radicofuncional: string | null,
 *   model: Model, chain: number[]
 * } | { ok: false, reason: string }} NameResult
 */

const MAX_CHAIN = 10;

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

/**
 * Sustituyentes de una cadena numerada (path[0] = C1).
 * @param {Molecule} mol
 * @param {number[]} path
 * @param {number} attachedTo carbono/átomo del que cuelga la cadena si es un radical (-1 si es la cadena principal)
 * @returns {Sub[]}
 */
function subsOf(mol, path, attachedTo) {
  /** @type {Sub[]} */
  const subs = [];
  path.forEach((id, i) => {
    for (const nb of mol.neighbors(id)) {
      if (nb.id === path[i - 1] || nb.id === path[i + 1]) continue;
      if (i === 0 && nb.id === attachedTo) continue;
      const el = mol.element(nb.id);
      if (HALOGENS.includes(el)) {
        const text = HALO_CANON[el];
        subs.push({ pos: i + 1, text, sortKey: text, complex: false });
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
  const best = pickBest(paths.map((p) => ({ path: p, subs: subsOf(mol, p, parent) })));
  const n = best.path.length;
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
      if (mult === null) throw new Unsupported(`Hay ${k} sustituyentes iguales (el límite actual es 10).`);
      const t = g.complex ? `(${g.text})` : g.text;
      return omitLocants ? `${mult}${t}` : `${positions.join(',')}-${mult}${t}`;
    })
    .join('-');
}

/**
 * Nombre de la cadena con la numeración dada (sin elegir otra).
 * @param {Molecule} mol
 * @param {number[]} path
 * @returns {Model}
 */
export function modelFor(mol, path) {
  const n = path.length;
  const stem = stemOf(n);
  if (!stem) throw new Unsupported(`La cadena principal tiene ${n} carbonos (el límite actual es ${MAX_CHAIN}).`);
  const subs = subsOf(mol, path, -1);
  const omit = n === 1 || (n === 2 && subs.length === 1);
  return { n, subs, name: `${compose(subs, n, omit)}${stem}ano` };
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
  for (const a of mol.atoms) {
    if (a.el !== 'C' && !HALOGENS.includes(a.el)) return `El elemento ${a.el} todavía no está soportado para nombrar.`;
  }
  if (mol.bonds.some((b) => b.order !== 1)) return 'Los enlaces dobles y triples todavía no se pueden nombrar.';
  if (!mol.atoms.some((a) => a.el === 'C')) return 'No hay carbonos.';
  for (const a of mol.atoms) {
    if (HALOGENS.includes(a.el) && mol.neighbors(a.id).some((nb) => mol.element(nb.id) !== 'C')) {
      return 'Un halógeno unido a otro halógeno no se puede nombrar todavía.';
    }
  }
  return null;
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
    const carbons = mol.atoms.filter((a) => a.el === 'C').map((a) => a.id);
    /** @type {number[][]} */
    const all = [];
    for (const c of carbons) all.push(...pathsFrom(mol, c, -1));
    const best = pickBest(all.map((p) => ({ path: p, subs: subsOf(mol, p, -1) })));
    const model = modelFor(mol, best.path);

    // forma radicofuncional: solo cuando hay un único halógeno
    let radicofuncional = null;
    const halos = mol.atoms.filter((a) => HALOGENS.includes(a.el));
    if (halos.length === 1) {
      const h = halos[0].id;
      const c = mol.neighbors(h)[0].id;
      const r = radicalName(mol, c, h);
      radicofuncional = `${HALIDE_CANON[halos[0].el]} de ${r.text}o`;
    }
    return { ok: true, systematic: model.name, radicofuncional, model, chain: best.path };
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
  const typed = modelFor(mol, typedChain);
  const correct = canon.systematic;

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
  if (sig(typed.subs) !== sig(canon.model.subs)) {
    const reversed = [...typedChain].reverse();
    const sameChainReversed = sig(modelFor(mol, reversed).subs) === sig(canon.model.subs);
    if (sameChainReversed) {
      out.push({
        type: 'numeracion',
        correct,
        message: `La cadena se numera desde el extremo que da los localizadores más bajos al conjunto de sustituyentes. Numerada al revés, los localizadores serían ${canon.model.subs.map((s) => s.pos).sort((a, b) => a - b).join(',')}. Nombre correcto: «${correct}».`,
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
