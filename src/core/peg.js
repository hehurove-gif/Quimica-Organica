// @ts-check
/**
 * Mini biblioteca PEG (sin dependencias) para el parser de nomenclatura.
 *
 * Idea clave para el estado "incompleto": cada literal que no coincide registra el
 * punto exacto donde falló. Si el punto más lejano de fallo es el FINAL del texto,
 * el nombre podría completarse escribiendo más (incompleto); si falla antes, hay un
 * error real (inválido).
 */

export class Ctx {
  /** @param {string} input */
  constructor(input) {
    this.input = input;
    this.farthest = 0;
    /** @type {Set<string>} */
    this.expected = new Set();
  }

  /**
   * @param {number} pos
   * @param {string} what descripción de lo esperado
   */
  fail(pos, what) {
    if (pos > this.farthest) {
      this.farthest = pos;
      this.expected = new Set([what]);
    } else if (pos === this.farthest) {
      this.expected.add(what);
    }
  }
}

/**
 * @typedef {{ pos: number, value: any }} Ok
 * @typedef {(ctx: Ctx, pos: number) => Ok | null} P
 * @typedef {(ctx: Ctx, pos: number) => Ok} Total  parser que nunca falla
 */

/** Espacios en blanco opcionales (siempre tiene éxito). @type {Total} */
export const ws = (ctx, pos) => {
  const s = ctx.input;
  while (pos < s.length && /\s/.test(s[pos])) pos++;
  return { pos, value: null };
};

/**
 * Literal exacto.
 * @param {string} s
 * @param {string} [label]
 * @returns {P}
 */
export function lit(s, label = `«${s}»`) {
  return (ctx, pos) => {
    const inp = ctx.input;
    let k = 0;
    while (k < s.length && pos + k < inp.length && inp[pos + k] === s[k]) k++;
    if (k === s.length) return { pos: pos + k, value: s };
    ctx.fail(pos + k, label);
    return null;
  };
}

/**
 * Alternativa de cadenas (se prueba primero la más larga).
 * @param {string[]} list
 * @param {string} label
 * @returns {P}
 */
export function alts(list, label) {
  const sorted = [...list].sort((a, b) => b.length - a.length);
  return (ctx, pos) => {
    const inp = ctx.input;
    let best = 0;
    for (const s of sorted) {
      let k = 0;
      while (k < s.length && pos + k < inp.length && inp[pos + k] === s[k]) k++;
      if (k === s.length) return { pos: pos + k, value: s };
      if (k > best) best = k;
    }
    ctx.fail(pos + best, label);
    return null;
  };
}

/**
 * Número entero.
 * @param {string} label
 * @returns {P}
 */
export function integer(label) {
  return (ctx, pos) => {
    const m = /^\d+/.exec(ctx.input.slice(pos));
    if (!m) {
      ctx.fail(pos, label);
      return null;
    }
    return { pos: pos + m[0].length, value: Number(m[0]) };
  };
}

/** Fin del texto. @type {P} */
export const eof = (ctx, pos) => {
  if (pos === ctx.input.length) return { pos, value: null };
  ctx.fail(pos, 'el final del nombre');
  return null;
};

/**
 * Secuencia.
 * @param {...P} ps
 * @returns {P}
 */
export function seq(...ps) {
  return (ctx, pos) => {
    /** @type {any[]} */
    const vals = [];
    for (const p of ps) {
      const r = p(ctx, pos);
      if (!r) return null;
      pos = r.pos;
      vals.push(r.value);
    }
    return { pos, value: vals };
  };
}

/**
 * Alternativa ordenada.
 * @param {...P} ps
 * @returns {P}
 */
export function choice(...ps) {
  return (ctx, pos) => {
    for (const p of ps) {
      const r = p(ctx, pos);
      if (r) return r;
    }
    return null;
  };
}

/** @param {P} p @returns {Total} */
export function opt(p) {
  return (ctx, pos) => p(ctx, pos) ?? { pos, value: null };
}

/** @param {P} p @returns {Total} */
export function many(p) {
  return (ctx, pos) => {
    /** @type {any[]} */
    const vals = [];
    for (;;) {
      const r = p(ctx, pos);
      if (!r || r.pos === pos) break;
      pos = r.pos;
      vals.push(r.value);
    }
    return { pos, value: vals };
  };
}

/**
 * @param {P} p
 * @param {(v: any, from: number, to: number) => any} fn
 * @returns {P}
 */
export function map(p, fn) {
  return (ctx, pos) => {
    const r = p(ctx, pos);
    if (!r) return null;
    return { pos: r.pos, value: fn(r.value, pos, r.pos) };
  };
}
