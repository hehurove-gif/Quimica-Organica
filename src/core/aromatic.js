// @ts-check
/**
 * Derivados del benceno (plan de Química III): lectura de nombres y construcción de la molécula.
 *
 * Módulo propio, determinista y separado del analizador de cadenas: el anillo de benceno se
 * modela con enlaces de Kekulé alternados (la clave canónica de `Molecule` lo trata como
 * aromático) y los sustituyentes salen de un catálogo cerrado. Lo que no está en el catálogo
 * se declara `fuera_de_alcance`; nunca se inventa una estructura.
 *
 * Gramática (texto normalizado, sin tildes):
 *   [o-|m-|p-|orto-|meta-|para-] [«acido »] ( [localizadores-][mult]sustituyente )* padre
 *   padre ∈ benceno | tolueno | fenol | anilina | benzoico | benzaldehido | bencenosulfonico | xileno
 *
 * Los localizadores que faltan se resuelven solo si la estructura es única; si hay varias
 * posibilidades, el estado es `incompleto` y se ofrecen las opciones.
 */
import { Molecule } from './molecule.js';
import { fromSmiles } from './smiles.js';
import { normalize } from './parser.js';

/**
 * @typedef {{
 *   name: string, alpha: string, label: string,
 *   kind: 'frag' | 'nitro' | 'sulfo', smiles?: string,
 * }} SubSpec  name = prefijo (nitro, metil…), alpha = clave de orden alfabético, label = texto condensado
 * @typedef {{ word: string, id: string, principal: string | null, acid?: boolean, needsOrient?: boolean, second?: string, fixed?: [number, string][], common?: boolean }} Parent
 *   second = sustituyente cuya posición dan o-/m-/p-; fixed = sustituyentes que el nombre ya trae; common = nombre común
 * @typedef {{ sub: SubSpec, count: number, locants: number[] | null }} Group
 * @typedef {{
 *   kind: 'aromatico', text: string, parent: Parent, orient: 'o' | 'm' | 'p' | null, groups: Group[],
 * }} AromAst
 * @typedef {{ pos: number, sub: SubSpec }} Placed
 * @typedef {{ code: string, message: string }} AromError
 */

/** @type {SubSpec[]} */
export const SUBS = [
  { name: 'fluoro', alpha: 'fluoro', label: 'F', kind: 'frag', smiles: 'F' },
  { name: 'cloro', alpha: 'cloro', label: 'Cl', kind: 'frag', smiles: 'Cl' },
  { name: 'bromo', alpha: 'bromo', label: 'Br', kind: 'frag', smiles: 'Br' },
  { name: 'yodo', alpha: 'yodo', label: 'I', kind: 'frag', smiles: 'I' },
  { name: 'nitro', alpha: 'nitro', label: 'NO₂', kind: 'nitro' },
  { name: 'sulfo', alpha: 'sulfo', label: 'SO₃H', kind: 'sulfo' },
  { name: 'hidroxi', alpha: 'hidroxi', label: 'OH', kind: 'frag', smiles: 'O' },
  { name: 'amino', alpha: 'amino', label: 'NH₂', kind: 'frag', smiles: 'N' },
  { name: 'formil', alpha: 'formil', label: 'CHO', kind: 'frag', smiles: 'C=O' },
  { name: 'carboxi', alpha: 'carboxi', label: 'COOH', kind: 'frag', smiles: 'C(=O)O' },
  { name: 'metoxi', alpha: 'metoxi', label: 'OCH₃', kind: 'frag', smiles: 'OC' },
  { name: 'etoxi', alpha: 'etoxi', label: 'OC₂H₅', kind: 'frag', smiles: 'OCC' },
  { name: 'metil', alpha: 'metil', label: 'CH₃', kind: 'frag', smiles: 'C' },
  { name: 'etil', alpha: 'etil', label: 'C₂H₅', kind: 'frag', smiles: 'CC' },
  { name: 'propil', alpha: 'propil', label: 'C₃H₇', kind: 'frag', smiles: 'CCC' },
  { name: 'isopropil', alpha: 'isopropil', label: 'CH(CH₃)₂', kind: 'frag', smiles: 'C(C)C' },
  { name: 'butil', alpha: 'butil', label: 'C₄H₉', kind: 'frag', smiles: 'CCCC' },
  { name: 'isobutil', alpha: 'isobutil', label: 'CH₂CH(CH₃)₂', kind: 'frag', smiles: 'CC(C)C' },
  { name: 'sec-butil', alpha: 'butil', label: 'CH(CH₃)C₂H₅', kind: 'frag', smiles: 'C(C)CC' },
  { name: 'terc-butil', alpha: 'butil', label: 'C(CH₃)₃', kind: 'frag', smiles: 'C(C)(C)C' },
];

/** @param {string} name @returns {SubSpec} */
export function subByName(name) {
  const s = SUBS.find((x) => x.name === name);
  if (!s) throw new Error(`sustituyente desconocido: ${name}`);
  return s;
}

/** @type {Parent[]} */
export const PARENTS = [
  { word: 'bencenosulfonico', id: 'bencenosulfonico', principal: 'sulfo', acid: true },
  { word: 'benzaldehido', id: 'benzaldehido', principal: 'formil' },
  { word: 'benzoico', id: 'benzoico', principal: 'carboxi', acid: true },
  { word: 'benceno', id: 'benceno', principal: null },
  { word: 'tolueno', id: 'tolueno', principal: 'metil' },
  { word: 'fenol', id: 'fenol', principal: 'hidroxi' },
  { word: 'anilina', id: 'anilina', principal: 'amino' },
  { word: 'xileno', id: 'xileno', principal: 'metil', needsOrient: true, second: 'metil', common: true },
  // equivalentes sistemáticos válidos (IUPAC acepta los dos)
  { word: 'bencenamina', id: 'bencenamina', principal: 'amino' },
  { word: 'bencenocarbaldehido', id: 'bencenocarbaldehido', principal: 'formil' },
  { word: 'bencenocarboxilico', id: 'bencenocarboxilico', principal: 'carboxi', acid: true },
  // nombres comunes (se leen y se avisan como comunes)
  { word: 'fenilamina', id: 'fenilamina', principal: 'amino', common: true },
  { word: 'anisol', id: 'anisol', principal: 'metoxi', common: true },
  { word: 'fenetol', id: 'fenetol', principal: 'etoxi', common: true },
  { word: 'cumeno', id: 'cumeno', principal: 'isopropil', common: true },
  { word: 'cresol', id: 'cresol', principal: 'hidroxi', needsOrient: true, second: 'metil', common: true },
  { word: 'mesitileno', id: 'mesitileno', principal: null, fixed: [[1, 'metil'], [3, 'metil'], [5, 'metil']], common: true },
  { word: 'salicilico', id: 'salicilico', principal: 'carboxi', acid: true, fixed: [[1, 'carboxi'], [2, 'hidroxi']], common: true },
];

const MULTS = /** @type {[string, number][]} */ ([['hexa', 6], ['penta', 5], ['tetra', 4], ['tri', 3], ['di', 2]]);
const SUBS_BY_LEN = [...SUBS].sort((a, b) => b.name.length - a.name.length);
const ORIENT_POS = { o: 2, m: 3, p: 4 };
const ORIENT_WORD = /** @type {Record<string, 'o' | 'm' | 'p'>} */ ({ o: 'o', orto: 'o', m: 'm', meta: 'm', p: 'p', para: 'p' });

/**
 * Lee un nombre de derivado del benceno.
 * `no_aromatico` = el texto no termina en un padre aromático (lo atiende el analizador de cadenas).
 * @param {string} text
 * @returns {{ status: 'valido', ast: AromAst }
 *   | { status: 'no_aromatico' }
 *   | { status: 'invalido' | 'fuera_de_alcance', errors: AromError[] }}
 */
export function parseAromatic(text) {
  const t = normalize(text).replace(/\s+/g, ' ').trim().replace(/benzen/g, 'bencen');
  const parent = PARENTS.find((p) => t.endsWith(p.word));
  if (!parent) return { status: 'no_aromatico' };
  let rest = t.slice(0, t.length - parent.word.length).replace(/[\s-]+$/, '');

  if (/[()[\]]/.test(rest)) {
    return { status: 'fuera_de_alcance', errors: [{ code: 'fuera_de_alcance', message: 'Los sustituyentes compuestos entre paréntesis en un anillo todavía no están soportados.' }] };
  }
  if (parent.acid) {
    const m = /^acido(\s+|$)/.exec(rest);
    if (!m) {
      return { status: 'invalido', errors: [{ code: 'falta_acido', message: `Los nombres con «${parent.word}» empiezan con la palabra «ácido» (ácido ${parent.word}).` }] };
    }
    rest = rest.slice(m[0].length);
  } else if (/^acido\b/.test(rest)) {
    return { status: 'invalido', errors: [{ code: 'acido_sobra', message: `«${parent.word}» no lleva la palabra «ácido».` }] };
  }

  /** @type {'o' | 'm' | 'p' | null} */
  let orient = null;
  const om = /^(orto|meta|para|o|m|p)(?:-|$)/.exec(rest);
  if (om) {
    orient = ORIENT_WORD[om[1]];
    rest = rest.slice(om[0].length);
  }

  /** @type {Group[]} */
  const groups = [];
  let i = 0;
  while (i < rest.length) {
    if (rest[i] === '-' || rest[i] === ' ') { i++; continue; }
    /** @type {number[] | null} */
    let locants = null;
    const lm = /^(\d+(?:,\d+)*)-/.exec(rest.slice(i));
    if (lm) { locants = lm[1].split(',').map(Number); i += lm[0].length; }
    let mult = 1;
    const mm = MULTS.find(([w]) => rest.startsWith(w, i));
    if (mm) { mult = mm[1]; i += mm[0].length; }
    const sub = SUBS_BY_LEN.find((s) => rest.startsWith(s.name, i));
    if (!sub) {
      const token = rest.slice(i).split(/[-\s]/)[0] || rest.slice(i);
      return { status: 'fuera_de_alcance', errors: [{ code: 'sustituyente_no_soportado', message: `No reconozco «${token}» como sustituyente del anillo (todavía no está soportado).` }] };
    }
    i += sub.name.length;
    if (locants && locants.length !== mult) {
      return {
        status: 'invalido',
        errors: [{ code: 'multiplicador', message: locants.length > mult
          ? `Hay ${locants.length} localizadores para «${sub.name}» pero el multiplicador no lo indica (di, tri…).`
          : `El multiplicador pide ${mult} «${sub.name}» pero hay ${locants.length} localizador(es).` }],
      };
    }
    groups.push({ sub, count: mult, locants });
  }
  return { status: 'valido', ast: { kind: 'aromatico', text: t, parent, orient, groups } };
}

/**
 * Une un sustituyente a un carbono del anillo.
 * @param {Molecule} mol @param {number} ring @param {SubSpec} sub
 */
function attach(mol, ring, sub) {
  if (sub.kind === 'nitro') {
    const n = mol.addAtom('N', 1);
    mol.addBond(ring, n);
    mol.addBond(n, mol.addAtom('O'), 2);
    mol.addBond(n, mol.addAtom('O', -1));
  } else if (sub.kind === 'sulfo') {
    const s = mol.addAtom('S');
    mol.addBond(ring, s);
    mol.addBond(s, mol.addAtom('O'), 2);
    mol.addBond(s, mol.addAtom('O'), 2);
    mol.addBond(s, mol.addAtom('O'));
  } else {
    const frag = fromSmiles(/** @type {string} */ (sub.smiles));
    const off = mol.atoms.length;
    for (const a of frag.atoms) mol.addAtom(a.el);
    for (const b of frag.bonds) mol.addBond(off + b.a, off + b.b, b.order);
    mol.addBond(ring, off);
  }
}

/**
 * Anillo de benceno con sustituyentes. Los carbonos del anillo son los ids 0-5 (posición p = id p-1).
 * @param {Placed[]} placed
 * @returns {Molecule}
 */
export function buildRing(placed) {
  const m = new Molecule();
  const ring = Array.from({ length: 6 }, () => m.addAtom('C'));
  for (let i = 0; i < 6; i++) m.addBond(ring[i], ring[(i + 1) % 6], i % 2 === 0 ? 2 : 1);
  for (const p of [...placed].sort((a, b) => a.pos - b.pos)) attach(m, ring[p.pos - 1], p.sub);
  return m;
}

/**
 * Todas las colocaciones posibles de los sustituyentes sin localizador, sin repetir estructuras.
 * @param {Placed[]} fixed
 * @param {SubSpec[]} items  sustituyentes por colocar
 * @returns {{ placed: Placed[], molecule: Molecule }[]}
 */
function enumerate(fixed, items) {
  const used = new Set(fixed.map((p) => p.pos));
  const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name));
  /** @type {Map<string, { placed: Placed[], molecule: Molecule }>} */
  const seen = new Map();
  /** @param {number} k @param {Placed[]} acc @param {number} minPos */
  const go = (k, acc, minPos) => {
    if (k === sorted.length) {
      const molecule = buildRing(acc);
      const key = molecule.canonicalKey() ?? '';
      if (!seen.has(key)) seen.set(key, { placed: acc, molecule });
      return;
    }
    const same = k > 0 && sorted[k - 1].name === sorted[k].name;
    for (let pos = same ? minPos : 1; pos <= 6; pos++) {
      if (used.has(pos)) continue;
      used.add(pos);
      go(k + 1, [...acc, { pos, sub: sorted[k] }], pos + 1);
      used.delete(pos);
    }
  };
  go(0, [...fixed], 1);
  return [...seen.values()];
}

/**
 * Construye la molécula de un nombre ya leído.
 *  - `valido`: estructura única (`molecule`, `placed`).
 *  - `incompleto`: faltan localizadores y hay varias estructuras (`options`).
 *  - `invalido`: contradicción en el nombre.
 * @param {AromAst} ast
 * @returns {{ status: 'valido', molecule: Molecule, placed: Placed[] }
 *   | { status: 'incompleto', errors: AromError[], options: { placed: Placed[], molecule: Molecule }[] }
 *   | { status: 'invalido', errors: AromError[] }}
 */
export function buildAromatic(ast) {
  const { parent, orient, groups } = ast;
  /** @param {string} code @param {string} message @returns {{ status: 'invalido', errors: AromError[] }} */
  const bad = (code, message) => ({ status: 'invalido', errors: [{ code, message }] });

  /** @type {Placed[]} */
  const fixed = [];
  if (parent.fixed) for (const [pos, n] of parent.fixed) fixed.push({ pos, sub: subByName(n) });
  else if (parent.principal) fixed.push({ pos: 1, sub: subByName(parent.principal) });

  /** @type {SubSpec[]} */
  const loose = [];
  for (const g of groups) {
    if (g.locants) {
      for (const pos of g.locants) {
        if (pos < 1 || pos > 6) return bad('locante_fuera_de_rango', `El anillo de benceno tiene 6 posiciones: el localizador ${pos} no existe.`);
        if (pos === 1 && parent.principal) {
          return bad('posicion_ocupada', `La posición 1 ya la ocupa el grupo de «${parent.word}»; numera los demás sustituyentes desde 2.`);
        }
        if (fixed.some((p) => p.pos === pos)) return bad('posicion_repetida', `Hay dos sustituyentes en la posición ${pos}.`);
        fixed.push({ pos, sub: g.sub });
      }
    } else {
      for (let k = 0; k < g.count; k++) loose.push(g.sub);
    }
  }

  if (orient) {
    const located = groups.some((g) => g.locants);
    if (located) return bad('orient_y_localizadores', 'No mezcles o-/m-/p- con localizadores numéricos: usa uno u otro.');
    if (parent.fixed) return bad('orient_no_aplica', `«${parent.word}» ya fija las posiciones de sus sustituyentes: no lleva o-, m- ni p-.`);
    if (parent.needsOrient) {
      if (loose.length) return bad('orient_dos_sustituyentes', 'o-, m- y p-xileno ya llevan sus dos metilos; no admiten más sustituyentes.');
      const placed = [...fixed, { pos: ORIENT_POS[orient], sub: subByName(parent.second ?? 'metil') }];
      return { status: 'valido', molecule: buildRing(placed), placed };
    }
    const principalCount = parent.principal ? 1 : 0;
    if (principalCount + loose.length !== 2) {
      return bad('orient_dos_sustituyentes', 'Los prefijos o-, m- y p- solo valen cuando el anillo tiene exactamente dos sustituyentes.');
    }
    const opos = ORIENT_POS[orient];
    /** @type {Placed[]} */
    const placed = parent.principal
      ? [...fixed, { pos: opos, sub: loose[0] }]
      : [{ pos: 1, sub: loose[0] }, { pos: opos, sub: loose[1] }];
    return { status: 'valido', molecule: buildRing(placed), placed };
  }

  if (parent.needsOrient) {
    const opts = (['o', 'm', 'p']).map((o) => `${o}-${parent.word}`).join(', ');
    const options = (['o', 'm', 'p']).map((o) => {
      const placed = [...fixed, ...[{ pos: ORIENT_POS[/** @type {'o'|'m'|'p'} */ (o)], sub: subByName(parent.second ?? 'metil') }]];
      return { placed, molecule: buildRing(placed) };
    });
    return { status: 'incompleto', errors: [{ code: 'falta_orientacion', message: `«${parent.word}» necesita saber la posición del segundo sustituyente: ${opts}.` }], options };
  }

  if (fixed.length + loose.length > 6) return bad('demasiados', 'El anillo no tiene sitio para tantos sustituyentes (máximo 6 posiciones).');

  if (loose.length === 0) {
    const placed = fixed;
    return { status: 'valido', molecule: buildRing(placed), placed };
  }
  // benceno monosustituido: la posición es única
  if (fixed.length === 0 && loose.length === 1) {
    const placed = [{ pos: 1, sub: loose[0] }];
    return { status: 'valido', molecule: buildRing(placed), placed };
  }
  const options = enumerate(fixed, loose);
  if (options.length === 1) return { status: 'valido', molecule: options[0].molecule, placed: options[0].placed };
  return {
    status: 'incompleto',
    errors: [{ code: 'falta_localizador', message: 'Faltan localizadores: con ese nombre hay más de una estructura posible.' }],
    options,
  };
}

// ───────────────────────────── Nombre de una molécula aromática ─────────────────────────────

/** Clave de cada sustituyente del catálogo tal como se ve colgado del anillo. */
const SUB_KEYS = new Map(
  SUBS.map((s) => {
    const m = buildRing([{ pos: 1, sub: s }]);
    const nb = m.neighbors(0).find((x) => x.id >= 6);
    return [`${/** @type {{ id: number, order: number }} */ (nb).order}${m._rooted(/** @type {{ id: number }} */ (nb).id, 0, '')}`, s];
  }),
);

/** Prioridad como grupo principal (ácido > sulfónico > aldehído > hidroxilo > amina). */
const PRIORITY = ['carboxi', 'sulfo', 'formil', 'hidroxi', 'amino'];
const PARENT_OF = /** @type {Record<string, { word: string, acid: boolean }>} */ ({
  carboxi: { word: 'benzoico', acid: true },
  sulfo: { word: 'bencenosulfónico', acid: true },
  formil: { word: 'benzaldehído', acid: false },
  hidroxi: { word: 'fenol', acid: false },
  amino: { word: 'anilina', acid: false },
});
const MULT_WORD = ['', '', 'di', 'tri', 'tetra', 'penta', 'hexa'];
const ALKYL = new Set(['metil', 'etil', 'propil', 'isopropil', 'butil', 'isobutil', 'sec-butil', 'terc-butil']);

/**
 * @typedef {{
 *   ok: true,
 *   systematic: string, iupac2013: string,
 *   alternatives: string[],
 *   commons: string[],
 *   parent: string,
 *   ringOrder: number[],
 *   placed: Placed[],
 *   groups: { pos: number, sub: SubSpec, atomIds: number[] }[],
 * } | { ok: false, reason: string }} AromName
 */

/**
 * Compara dos listas de números (menor lexicográfico).
 * @param {number[]} a @param {number[]} b
 */
function cmpNums(a, b) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}

/**
 * Mejor numeración (C1 en el ancla si hay ancla). Menor conjunto de localizadores; a igualdad,
 * el primer prefijo alfabético recibe el menor localizador.
 * @param {{ idx: number, sub: SubSpec }[]} subs  posición en el ciclo (0-5) de cada sustituyente
 * @param {number | null} anchorIdx  índice (en `subs`) del sustituyente que va en C1, o null
 * @returns {{ s: number, d: 1 | -1, pos: number[] }}  pos[i] = localizador del sustituyente i
 */
function bestNumbering(subs, anchorIdx) {
  /** @type {{ s: number, d: 1 | -1, pos: number[] } | null} */
  let best = null;
  /** @type {number[]} */
  let bestKey = [];
  for (let s = 0; s < 6; s++) {
    for (const d of /** @type {(1 | -1)[]} */ ([1, -1])) {
      const pos = subs.map((x) => ((((x.idx - s) * d) % 6) + 6) % 6 + 1);
      if (anchorIdx !== null && pos[anchorIdx] !== 1) continue;
      const rest = subs.map((x, i) => ({ x, p: pos[i] })).filter((_, i) => i !== anchorIdx);
      const set = rest.map((r) => r.p).sort((a, b) => a - b);
      const alpha = [...rest]
        .sort((a, b) => a.x.sub.alpha.localeCompare(b.x.sub.alpha) || a.x.sub.name.localeCompare(b.x.sub.name) || a.p - b.p)
        .map((r) => r.p);
      const key = [...set, -1, ...alpha];
      if (!best || cmpNums(key, bestKey) < 0) { best = { s, d, pos }; bestKey = key; }
    }
  }
  return /** @type {{ s: number, d: 1 | -1, pos: number[] }} */ (best);
}

/**
 * Texto de los prefijos con localizadores, en orden alfabético.
 * @param {{ sub: SubSpec, p: number }[]} items
 * @param {boolean} omitLocants
 * @param {string} [joiner]
 */
function prefixText(items, omitLocants, joiner = '-') {
  /** @type {Map<string, { sub: SubSpec, locs: number[] }>} */
  const groups = new Map();
  for (const it of items) {
    const g = groups.get(it.sub.name) ?? { sub: it.sub, locs: [] };
    g.locs.push(it.p);
    groups.set(it.sub.name, g);
  }
  return [...groups.values()]
    .sort((a, b) => a.sub.alpha.localeCompare(b.sub.alpha) || a.sub.name.localeCompare(b.sub.name))
    .map((g) => {
      const loc = omitLocants ? '' : `${g.locs.sort((a, b) => a - b).join(',')}-`;
      return `${loc}${MULT_WORD[g.locs.length]}${g.sub.name}`;
    })
    .join(joiner);
}

/**
 * Lee el anillo y sus sustituyentes (del catálogo).
 * @param {Molecule} mol
 * @returns {{ ring: number[], subs: { idx: number, sub: SubSpec, atomIds: number[] }[] } | { error: string }}
 */
export function readRing(mol) {
  const r = mol.benzeneRing();
  if (!r) return { error: 'no es un anillo de benceno con sustituyentes sencillos' };
  const { ring, alive } = r;
  /** @type {{ idx: number, sub: SubSpec, atomIds: number[] }[]} */
  const subs = [];
  for (let idx = 0; idx < 6; idx++) {
    for (const nb of mol.neighbors(ring[idx])) {
      if (alive.has(nb.id)) continue;
      const sub = SUB_KEYS.get(`${nb.order}${mol._rooted(nb.id, ring[idx], '')}`);
      if (!sub) return { error: 'tiene un sustituyente que todavía no está soportado en anillos' };
      // átomos de la rama
      /** @type {number[]} */
      const atomIds = [];
      const walk = (/** @type {number} */ id, /** @type {number} */ from) => {
        atomIds.push(id);
        for (const x of mol.neighbors(id)) if (x.id !== from) walk(x.id, id);
      };
      walk(nb.id, ring[idx]);
      subs.push({ idx, sub, atomIds });
    }
  }
  return { ring, subs };
}

/**
 * Nombra un benceno sustituido (IUPAC: grupo principal en C1, menor conjunto de localizadores,
 * orden alfabético). Devuelve `ok: false` con el motivo si algo no está soportado.
 * @param {Molecule} mol
 * @returns {AromName}
 */
export function nameAromatic(mol) {
  const rr = readRing(mol);
  if ('error' in rr) return { ok: false, reason: rr.error };
  const { ring, subs } = rr;
  const count = (/** @type {string} */ n) => subs.filter((x) => x.sub.name === n).length;
  const principal = PRIORITY.find((n) => count(n) > 0) ?? null;
  if (principal && count(principal) > 1) {
    return { ok: false, reason: `tiene más de un grupo «${principal}» (diácidos, dioles, diaminas…), que todavía no están soportados` };
  }

  /**
   * @param {string | null} anchor nombre del sustituyente que va en C1 (padre retenido) o null
   * @param {string} parentWord
   * @param {boolean} acid
   */
  const compose = (anchor, parentWord, acid) => {
    const anchorIdx = anchor === null ? null : subs.findIndex((x) => x.sub.name === anchor);
    const num = bestNumbering(subs, anchorIdx === -1 ? null : anchorIdx);
    const items = subs.map((x, i) => ({ sub: x.sub, p: num.pos[i] })).filter((_, i) => i !== anchorIdx);
    const omit = items.length === 0 || (anchor === null && items.length === 1);
    const pre = prefixText(items, omit);
    const placed = subs.map((x, i) => ({ pos: num.pos[i], sub: x.sub })).sort((a, b) => a.pos - b.pos);
    return { text: `${acid ? 'ácido ' : ''}${pre}${parentWord}`, num, items, placed };
  };

  /** @type {ReturnType<typeof compose>} */
  let main;
  /** @type {string[]} */
  const alternatives = [];
  /** @type {string[]} */
  const commons = [];
  let parentWord = 'benceno';

  if (principal) {
    const pp = PARENT_OF[principal];
    main = compose(principal, pp.word, pp.acid);
    parentWord = pp.word;
    if (principal === 'hidroxi' || principal === 'amino') {
      alternatives.push(compose(null, 'benceno', false).text);
    }
    if (principal === 'amino') alternatives.push(compose('amino', 'bencenamina', false).text);
    if (principal === 'carboxi') alternatives.push(compose('carboxi', 'bencenocarboxílico', true).text);
    if (principal === 'formil') alternatives.push(compose('formil', 'bencenocarbaldehído', false).text);
  } else if (count('metil') === 1 && !subs.some((x) => x.sub.name !== 'metil' && ALKYL.has(x.sub.name))) {
    main = compose('metil', 'tolueno', false);
    parentWord = 'tolueno';
    alternatives.push(compose(null, 'benceno', false).text);
  } else {
    main = compose(null, 'benceno', false);
  }
  const sistematico = main.text;

  // todas las posiciones ocupadas por el mismo sustituyente: los localizadores sobran
  if (!principal && parentWord === 'benceno' && subs.length === 6 && new Set(subs.map((x) => x.sub.name)).size === 1) {
    alternatives.push(`${MULT_WORD[6]}${subs[0].sub.name}benceno`);
  }

  // nombres comunes de una sola pieza
  const solo = (/** @type {string} */ n) => subs.length === 1 && subs[0].sub.name === n;
  if (solo('metoxi')) commons.push('anisol');
  if (solo('etoxi')) commons.push('fenetol');
  if (solo('isopropil')) commons.push('cumeno');
  if (solo('amino')) commons.push('fenilamina');
  if (subs.length === 3 && subs.every((x) => x.sub.name === 'metil') && new Set(subs.map((x) => x.idx % 2)).size === 1) commons.push('mesitileno');

  // o-, m-, p- cuando hay exactamente dos sustituyentes
  if (subs.length === 2) {
    const d = ((subs[1].idx - subs[0].idx) % 6 + 6) % 6;
    const o = d === 1 || d === 5 ? 'o' : d === 2 || d === 4 ? 'm' : 'p';
    if (principal || parentWord === 'tolueno') {
      const acid = principal !== null && PARENT_OF[principal].acid;
      alternatives.push(`${acid ? 'ácido ' : ''}${o}-${main.items[0].sub.name}${parentWord}`);
    } else {
      alternatives.push(`${o}-${prefixText(subs.map((x) => ({ sub: x.sub, p: 0 })), true, '')}${parentWord}`);
    }
    if (count('metil') === 2) commons.push(`${o}-xileno`);
    if (count('metil') === 1 && count('hidroxi') === 1) commons.push(`${o}-cresol`);
    if (o === 'o' && count('carboxi') === 1 && count('hidroxi') === 1) commons.push('ácido salicílico');
  }
  return {
    ok: true,
    systematic: sistematico,
    iupac2013: sistematico,
    alternatives: [...new Set(alternatives)].filter((a) => a !== sistematico),
    commons,
    parent: parentWord,
    groups: main.placed.map((p) => ({ pos: p.pos, sub: p.sub, atomIds: /** @type {number[]} */ (subs.find((x, i) => x.sub === p.sub && main.num.pos[i] === p.pos)?.atomIds) })),
    ringOrder: Array.from({ length: 6 }, (_, k) => ring[(((main.num.s + main.num.d * k) % 6) + 6) % 6]),
    placed: main.placed,
  };
}
