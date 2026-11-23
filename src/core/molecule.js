// @ts-check
/**
 * Modelo molecular común (grafo). Independiente de cualquier editor o biblioteca gráfica.
 * - Los hidrógenos son implícitos: se calculan a partir de la valencia.
 * - Las coordenadas NO viven aquí (ver render.js): la identidad química no depende del dibujo.
 */

/** Valencia típica por elemento (átomo neutro). Con carga q la valencia es VALENCE + q (N⁺: 4, O⁻: 1). */
export const VALENCE = /** @type {Record<string, number>} */ ({
  C: 4,
  H: 1,
  F: 1,
  Cl: 1,
  Br: 1,
  I: 1,
  O: 2,
  N: 3,
  S: 6, // solo en el grupo sulfo (–SO₃H)
});

export const HALOGENS = ['F', 'Cl', 'Br', 'I'];

/**
 * @typedef {{ id: number, el: string, q?: number }} Atom
 * @typedef {{ a: number, b: number, order: 1 | 2 | 3 }} Bond
 * @typedef {{ code: string, message: string, atoms: number[] }} Issue
 */

export class Molecule {
  constructor() {
    /** @type {Atom[]} */
    this.atoms = [];
    /** @type {Bond[]} */
    this.bonds = [];
  }

  /**
   * @param {string} el
   * @param {number} [q] carga formal (solo para el grupo nitro: N⁺ y O⁻)
   * @returns {number} id estable del átomo
   */
  addAtom(el, q = 0) {
    const id = this.atoms.length;
    this.atoms.push(q ? { id, el, q } : { id, el });
    return id;
  }

  /** Valencia del átomo, contando su carga formal. @param {number} id @returns {number | undefined} */
  valenceOf(id) {
    const at = this.atoms[id];
    const v = VALENCE[at.el];
    return v === undefined ? undefined : v + (at.q || 0);
  }

  /**
   * @param {number} a
   * @param {number} b
   * @param {1 | 2 | 3} [order]
   */
  addBond(a, b, order = 1) {
    this.bonds.push({ a, b, order });
  }

  /** @param {number} id @returns {{ id: number, order: number }[]} */
  neighbors(id) {
    /** @type {{ id: number, order: number }[]} */
    const out = [];
    for (const bd of this.bonds) {
      if (bd.a === id) out.push({ id: bd.b, order: bd.order });
      else if (bd.b === id) out.push({ id: bd.a, order: bd.order });
    }
    return out;
  }

  /** Suma de órdenes de enlace del átomo. @param {number} id */
  bondSum(id) {
    return this.neighbors(id).reduce((s, n) => s + n.order, 0);
  }

  /** Hidrógenos implícitos (nunca negativo). @param {number} id */
  implicitH(id) {
    const v = this.valenceOf(id);
    if (v === undefined) return 0;
    return Math.max(0, v - this.bondSum(id));
  }

  /** @param {number} id */
  element(id) {
    return this.atoms[id].el;
  }

  /** Copia independiente (mismos ids). */
  clone() {
    const m = new Molecule();
    m.atoms = this.atoms.map((a) => ({ ...a }));
    m.bonds = this.bonds.map((b) => ({ ...b }));
    return m;
  }

  /**
   * Fija el orden del enlace a–b: 0 lo quita, y si no existía lo crea.
   * @param {number} a
   * @param {number} b
   * @param {0 | 1 | 2 | 3} order
   */
  setBond(a, b, order) {
    const i = this.bonds.findIndex((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
    if (order === 0) {
      if (i >= 0) this.bonds.splice(i, 1);
    } else if (i >= 0) {
      this.bonds[i].order = order;
    } else {
      this.bonds.push({ a, b, order });
    }
  }

  /**
   * Copia de la molécula sin los átomos indicados (y sus enlaces); los ids se renumeran.
   * @param {number[]} ids
   * @returns {{ mol: Molecule, map: Map<number, number> }} map: id viejo -> id nuevo
   */
  without(ids) {
    const drop = new Set(ids);
    const m = new Molecule();
    /** @type {Map<number, number>} */
    const map = new Map();
    for (const a of this.atoms) if (!drop.has(a.id)) map.set(a.id, m.addAtom(a.el, a.q || 0));
    for (const b of this.bonds) {
      const x = map.get(b.a);
      const y = map.get(b.b);
      if (x !== undefined && y !== undefined) m.addBond(x, y, b.order);
    }
    return { mol: m, map };
  }

  /**
   * Copia de cada componente conexa como molécula independiente.
   * @returns {{ mol: Molecule, map: Map<number, number> }[]} map: id viejo -> id nuevo
   */
  split() {
    return this.components().map((comp) => {
      const keep = new Set(comp);
      return this.without(this.atoms.map((a) => a.id).filter((id) => !keep.has(id)));
    });
  }

  /**
   * Añade una copia de otra molécula (sin enlazarla). @param {Molecule} other
   * @returns {Map<number, number>} id de `other` -> id nuevo en esta molécula
   */
  merge(other) {
    /** @type {Map<number, number>} */
    const map = new Map();
    for (const a of other.atoms) map.set(a.id, this.addAtom(a.el, a.q || 0));
    for (const b of other.bonds) this.addBond(/** @type {number} */ (map.get(b.a)), /** @type {number} */ (map.get(b.b)), b.order);
    return map;
  }

  /** Fórmula molecular en orden de Hill (C, H, luego alfabético). */
  formula() {
    /** @type {Record<string, number>} */
    const counts = {};
    for (const at of this.atoms) {
      counts[at.el] = (counts[at.el] || 0) + 1;
      const h = this.implicitH(at.id);
      if (h) counts.H = (counts.H || 0) + h;
    }
    const keys = Object.keys(counts).filter((k) => k !== 'C' && k !== 'H').sort();
    const order = [...(counts.C ? ['C'] : []), ...(counts.H ? ['H'] : []), ...keys];
    return order.map((k) => k + (counts[k] > 1 ? subscript(counts[k]) : '')).join('');
  }

  /**
   * Comprobaciones químicas básicas. No lanza: devuelve la lista de problemas.
   * @returns {Issue[]}
   */
  validate() {
    /** @type {Issue[]} */
    const issues = [];
    const n = this.atoms.length;
    for (const bd of this.bonds) {
      if (!(bd.a >= 0 && bd.a < n) || !(bd.b >= 0 && bd.b < n)) {
        issues.push({
          code: 'enlace_invalido',
          message: 'Un enlace apunta a un átomo que no existe.',
          atoms: [],
        });
      } else if (bd.a === bd.b) {
        issues.push({
          code: 'enlace_invalido',
          message: 'Un átomo no puede enlazarse consigo mismo.',
          atoms: [bd.a],
        });
      }
    }
    if (issues.length) return issues;
    for (const at of this.atoms) {
      const v = this.valenceOf(at.id);
      if (v === undefined) {
        issues.push({
          code: 'elemento_no_admitido',
          message: `El elemento ${at.el} todavía no está admitido.`,
          atoms: [at.id],
        });
        continue;
      }
      const s = this.bondSum(at.id);
      if (s > v) {
        issues.push({
          code: 'valencia',
          message: `El átomo de ${at.el} forma ${s} enlaces, pero su valencia máxima es ${v}.`,
          atoms: [at.id],
        });
      }
    }
    if (n > 0 && this.components().length > 1) {
      issues.push({
        code: 'desconectado',
        message: 'Hay átomos desconectados: la molécula debe ser una sola pieza.',
        atoms: [],
      });
    }
    return issues;
  }

  /** Componentes conexas (listas de ids). @returns {number[][]} */
  components() {
    const seen = new Set();
    /** @type {number[][]} */
    const out = [];
    for (const at of this.atoms) {
      if (seen.has(at.id)) continue;
      /** @type {number[]} */
      const comp = [];
      const stack = [at.id];
      seen.add(at.id);
      while (stack.length) {
        const cur = /** @type {number} */ (stack.pop());
        comp.push(cur);
        for (const nb of this.neighbors(cur)) {
          if (!seen.has(nb.id)) {
            seen.add(nb.id);
            stack.push(nb.id);
          }
        }
      }
      out.push(comp);
    }
    return out;
  }

  /** ¿Es un árbol (conexo y sin ciclos)? */
  isTree() {
    return (
      this.atoms.length > 0 &&
      this.components().length === 1 &&
      this.bonds.length === this.atoms.length - 1
    );
  }

  /**
   * Clave canónica de la molécula (solo árboles, es decir, estructuras acíclicas).
   * Dos moléculas con el mismo grafo químico producen la misma clave, sin importar
   * el orden de los átomos, los ids ni las coordenadas.
   * @returns {string | null} null si no es un árbol.
   */
  canonicalKey() {
    if (!this.isTree()) return this._ringKey();
    const centers = this._centers();
    const keys = centers.map((c) => this._rooted(c, -1, ''));
    if (keys.length === 1) return keys[0];
    // dos centros: unir por el enlace central, en orden estable
    const [c1, c2] = centers;
    const bd = this.bonds.find((x) => (x.a === c1 && x.b === c2) || (x.a === c2 && x.b === c1));
    const o = bd ? bd.order : 1;
    const k1 = this._rooted(c1, c2, '');
    const k2 = this._rooted(c2, c1, '');
    return [k1, k2].sort().join(`~${o}~`);
  }

  /**
   * Anillo de benceno (Kekulé) con sustituyentes acíclicos: los 6 carbonos en orden de ciclo.
   * @returns {{ ring: number[], alive: Set<number> } | null} null si no es exactamente ese caso.
   */
  benzeneRing() {
    const n = this.atoms.length;
    if (n < 6 || this.components().length !== 1 || this.bonds.length !== n) return null;
    // anillo = lo que queda al recortar hojas repetidamente
    const deg = this.atoms.map((a) => this.neighbors(a.id).length);
    const alive = new Set(this.atoms.map((a) => a.id));
    const queue = this.atoms.filter((a) => deg[a.id] <= 1).map((a) => a.id);
    while (queue.length) {
      const l = /** @type {number} */ (queue.pop());
      alive.delete(l);
      for (const nb of this.neighbors(l)) {
        if (alive.has(nb.id) && --deg[nb.id] === 1) queue.push(nb.id);
      }
    }
    if (alive.size !== 6) return null;
    const ringN = (/** @type {number} */ id) => this.neighbors(id).filter((nb) => alive.has(nb.id));
    if ([...alive].some((id) => ringN(id).length !== 2 || this.atoms[id].el !== 'C')) return null;
    // recorrer el ciclo
    const start = Math.min(...alive);
    /** @type {number[]} */
    const ring = [start];
    let prev = -1;
    let cur = start;
    for (;;) {
      const next = ringN(cur).find((nb) => nb.id !== prev);
      if (!next || next.id === start) break;
      if (ring.includes(next.id)) return null;
      ring.push(next.id);
      prev = cur;
      cur = next.id;
    }
    if (ring.length !== 6) return null;
    // Kekulé: cada carbono del anillo tiene exactamente un doble enlace dentro del anillo
    for (const id of ring) {
      if (ringN(id).filter((nb) => nb.order === 2).length !== 1 || ringN(id).some((nb) => nb.order === 3)) return null;
    }
    return { ring, alive };
  }

  /**
   * Clave canónica de un anillo de benceno con sustituyentes acíclicos (el único ciclo admitido).
   * El anillo se toma como aromático: las dos formas de Kekulé son la misma molécula, así que
   * se ignoran los órdenes de enlace del anillo y se toma la menor de las 12 lecturas
   * (6 giros × 2 sentidos) de los sustituyentes.
   * @returns {string | null} null si no es exactamente un anillo de benceno con sustituyentes acíclicos.
   */
  _ringKey() {
    const r = this.benzeneRing();
    if (!r) return null;
    const { ring, alive } = r;
    const sub = (/** @type {number} */ id) =>
      this.neighbors(id)
        .filter((nb) => !alive.has(nb.id))
        .map((nb) => `${nb.order === 1 ? '' : nb.order}${this._rooted(nb.id, id, '')}`)
        .sort()
        .join(',');
    const seq = ring.map((id) => `[${sub(id)}]`);
    /** @type {string[]} */
    const reads = [];
    for (let s = 0; s < 6; s++) {
      reads.push(Array.from({ length: 6 }, (_, k) => seq[(s + k) % 6]).join(' '));
      reads.push(Array.from({ length: 6 }, (_, k) => seq[(s - k + 12) % 6]).join(' '));
    }
    return `Ar6<${reads.sort()[0]}>`;
  }

  /** Centros del árbol (1 o 2) por recorte de hojas. @returns {number[]} */
  _centers() {
    const n = this.atoms.length;
    if (n <= 2) return this.atoms.map((a) => a.id);
    const deg = this.atoms.map((a) => this.neighbors(a.id).length);
    let leaves = this.atoms.filter((a) => deg[a.id] <= 1).map((a) => a.id);
    let remaining = n;
    while (remaining > 2) {
      remaining -= leaves.length;
      /** @type {number[]} */
      const next = [];
      for (const l of leaves) {
        deg[l] = 0;
        for (const nb of this.neighbors(l)) {
          if (deg[nb.id] > 0) {
            deg[nb.id]--;
            if (deg[nb.id] === 1) next.push(nb.id);
          }
        }
      }
      leaves = next;
    }
    return leaves;
  }

  /**
   * Cadena canónica de un subárbol con raíz `id` (AHU con etiquetas).
   * @param {number} id
   * @param {number} parent
   * @param {string} _unused
   * @returns {string}
   */
  _rooted(id, parent, _unused) {
    const kids = this.neighbors(id)
      .filter((nb) => nb.id !== parent)
      .map((nb) => `${nb.order === 1 ? '' : nb.order}${this._rooted(nb.id, id, '')}`)
      .sort();
    const q = this.atoms[id].q;
    return `${this.atoms[id].el}${q ? (q > 0 ? '+' : '-') : ''}(${kids.join(',')})`;
  }
}

/** @param {number} n */
function subscript(n) {
  const map = '₀₁₂₃₄₅₆₇₈₉';
  return String(n)
    .split('')
    .map((d) => map[Number(d)])
    .join('');
}
