// @ts-check
/**
 * Modelo molecular común (grafo). Independiente de cualquier editor o biblioteca gráfica.
 * - Los hidrógenos son implícitos: se calculan a partir de la valencia.
 * - Las coordenadas NO viven aquí (ver render.js): la identidad química no depende del dibujo.
 */

/** Valencia típica por elemento (alcance v0.1: C y halógenos; O y N previstos). */
export const VALENCE = /** @type {Record<string, number>} */ ({
  C: 4,
  H: 1,
  F: 1,
  Cl: 1,
  Br: 1,
  I: 1,
  O: 2,
  N: 3,
});

export const HALOGENS = ['F', 'Cl', 'Br', 'I'];

/**
 * @typedef {{ id: number, el: string }} Atom
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
   * @returns {number} id estable del átomo
   */
  addAtom(el) {
    const id = this.atoms.length;
    this.atoms.push({ id, el });
    return id;
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
    const el = this.atoms[id].el;
    const v = VALENCE[el];
    if (v === undefined) return 0;
    return Math.max(0, v - this.bondSum(id));
  }

  /** @param {number} id */
  element(id) {
    return this.atoms[id].el;
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
      const v = VALENCE[at.el];
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
    if (!this.isTree()) return null;
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
    return `${this.atoms[id].el}(${kids.join(',')})`;
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
