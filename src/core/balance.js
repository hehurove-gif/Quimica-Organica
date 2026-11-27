// @ts-check
/**
 * Balanceo de ecuaciones por conservación de átomos. Determinista y exacto: resuelve el espacio
 * nulo de la matriz especie×elemento con fracciones (BigInt) y devuelve los enteros mínimos.
 */

/** @typedef {Record<string, number>} Counts  elemento -> número de átomos */

/** @param {bigint} a @param {bigint} b @returns {bigint} */
const gcd = (a, b) => {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
};

/**
 * @param {Counts[]} reactants
 * @param {Counts[]} products
 * @returns {{ reactants: number[], products: number[] } | null} null si no hay solución única con enteros positivos
 */
export function balance(reactants, products) {
  const species = [...reactants, ...products];
  const sign = [...reactants.map(() => 1n), ...products.map(() => -1n)];
  const elements = [...new Set(species.flatMap((s) => Object.keys(s)))];
  const n = species.length;
  // matriz fila = elemento, columna = especie
  /** @type {bigint[][]} */
  const A = elements.map((el) => species.map((s, j) => BigInt(s[el] || 0) * sign[j]));
  // Gauss-Jordan sin fracciones
  /** @type {number[]} */
  const pivots = [];
  let row = 0;
  for (let col = 0; col < n && row < A.length; col++) {
    let p = row;
    while (p < A.length && A[p][col] === 0n) p++;
    if (p === A.length) continue;
    [A[row], A[p]] = [A[p], A[row]];
    for (let r = 0; r < A.length; r++) {
      if (r === row || A[r][col] === 0n) continue;
      const f = A[r][col];
      const g = A[row][col];
      A[r] = A[r].map((v, k) => v * g - A[row][k] * f);
      const d = A[r].reduce((acc, v) => gcd(acc, v), 0n);
      if (d > 1n) A[r] = A[r].map((v) => v / d);
    }
    pivots.push(col);
    row++;
  }
  const free = [...Array(n).keys()].filter((c) => !pivots.includes(c));
  if (free.length !== 1) return null; // sin solución o infinitas
  const f = free[0];
  // x_f = 1 (escalado); cada pivote: A[r][pivot]*x_pivot + A[r][f]*x_f = 0
  /** @type {bigint[]} */
  const num = Array(n).fill(0n);
  /** @type {bigint[]} */
  const den = Array(n).fill(1n);
  num[f] = 1n;
  pivots.forEach((c, r) => {
    num[c] = -A[r][f];
    den[c] = A[r][c];
    if (den[c] < 0n) {
      num[c] = -num[c];
      den[c] = -den[c];
    }
  });
  let lcm = 1n;
  for (const d of den) lcm = (lcm * d) / gcd(lcm, d);
  let vals = num.map((v, i) => (v * lcm) / den[i]);
  const g = vals.reduce((acc, v) => gcd(acc, v), 0n);
  vals = vals.map((v) => v / g);
  if (vals.some((v) => v <= 0n)) {
    if (vals.every((v) => v <= 0n)) vals = vals.map((v) => -v);
    else return null;
  }
  const out = vals.map((v) => Number(v));
  return { reactants: out.slice(0, reactants.length), products: out.slice(reactants.length) };
}

/**
 * ¿Se conservan los átomos con estos coeficientes?
 * @param {Counts[]} reactants @param {Counts[]} products
 * @param {{ reactants: number[], products: number[] }} coef
 */
export function conserves(reactants, products, coef) {
  /** @type {Counts} */
  const left = {};
  /** @type {Counts} */
  const right = {};
  reactants.forEach((s, i) => { for (const [e, c] of Object.entries(s)) left[e] = (left[e] || 0) + c * coef.reactants[i]; });
  products.forEach((s, i) => { for (const [e, c] of Object.entries(s)) right[e] = (right[e] || 0) + c * coef.products[i]; });
  const els = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...els].every((e) => (left[e] || 0) === (right[e] || 0));
}
