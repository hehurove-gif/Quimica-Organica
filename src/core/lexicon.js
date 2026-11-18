// @ts-check
/**
 * Léxico de la nomenclatura en español (v0.1: alcanos, alquilos y halógenos).
 * Todo en minúsculas y sin acentos (ver normalize en parser.js).
 */

/** Raíces de cadena: [raíz, nº de carbonos]. */
export const STEMS = /** @type {[string, number][]} */ ([
  ['met', 1],
  ['et', 2],
  ['prop', 3],
  ['but', 4],
  ['pent', 5],
  ['hex', 6],
  ['hept', 7],
  ['oct', 8],
  ['non', 9],
  ['dec', 10],
]);

/** Raíz por número de carbonos. @param {number} n */
export function stemOf(n) {
  const f = STEMS.find(([, k]) => k === n);
  return f ? f[0] : null;
}

/** Multiplicadores: [prefijo, cantidad]. */
export const MULTS = /** @type {[string, number][]} */ ([
  ['di', 2],
  ['tri', 3],
  ['tetra', 4],
  ['penta', 5],
  ['hexa', 6],
  ['hepta', 7],
  ['octa', 8],
  ['nona', 9],
  ['deca', 10],
]);

/** @param {number} k */
export function multOf(k) {
  const f = MULTS.find(([, n]) => n === k);
  return f ? f[0] : null;
}

/**
 * Halógenos como prefijo. Se aceptan variantes (fluor/fluoro, yodo/iodo...).
 * `canon` es la forma que usa el sistema al escribir.
 */
export const HALO_PREFIXES = /** @type {Record<string, { el: string, canon: string }>} */ ({
  fluoro: { el: 'F', canon: 'fluoro' },
  fluor: { el: 'F', canon: 'fluoro' },
  cloro: { el: 'Cl', canon: 'cloro' },
  clor: { el: 'Cl', canon: 'cloro' },
  bromo: { el: 'Br', canon: 'bromo' },
  brom: { el: 'Br', canon: 'bromo' },
  yodo: { el: 'I', canon: 'yodo' },
  yod: { el: 'I', canon: 'yodo' },
  iodo: { el: 'I', canon: 'yodo' },
  iod: { el: 'I', canon: 'yodo' },
});

/** Nombre canónico del prefijo por elemento. */
export const HALO_CANON = /** @type {Record<string, string>} */ ({
  F: 'fluoro',
  Cl: 'cloro',
  Br: 'bromo',
  I: 'yodo',
});

/** Palabras de halogenuro (forma radicofuncional): "bromuro de etilo". */
export const HALIDE_WORDS = /** @type {Record<string, string>} */ ({
  fluoruro: 'F',
  cloruro: 'Cl',
  bromuro: 'Br',
  yoduro: 'I',
  ioduro: 'I',
});

export const HALIDE_CANON = /** @type {Record<string, string>} */ ({
  F: 'fluoruro',
  Cl: 'cloruro',
  Br: 'bromuro',
  I: 'yoduro',
});

/**
 * Radicales con nombre común aceptado en bachillerato.
 * `chain` = carbonos de la cadena del radical numerada desde el carbono de unión (C1);
 * `subs` = [localizadores, nº de metilos].  Solo metilos: es lo que cubren estos nombres.
 */
export const COMMON_RADICALS = /** @type {{ names: string[], canon: string, systematic: string, chain: number, methyls: number[] }[]} */ ([
  { names: ['isopropil'], canon: 'isopropil', systematic: '1-metiletil', chain: 2, methyls: [1] },
  { names: ['isobutil'], canon: 'isobutil', systematic: '2-metilpropil', chain: 3, methyls: [2] },
  {
    names: ['sec-butil', 'sec butil', 'secbutil', 's-butil'],
    canon: 'sec-butil',
    systematic: '1-metilpropil',
    chain: 3,
    methyls: [1],
  },
  {
    names: ['terc-butil', 'terc butil', 'tercbutil', 'tert-butil', 'tert butil', 'ter-butil', 'terbutil', 't-butil'],
    canon: 'terc-butil',
    systematic: '1,1-dimetiletil',
    chain: 2,
    methyls: [1, 1],
  },
  { names: ['isopentil'], canon: 'isopentil', systematic: '3-metilbutil', chain: 4, methyls: [3] },
  { names: ['neopentil'], canon: 'neopentil', systematic: '2,2-dimetilpropil', chain: 3, methyls: [2, 2] },
]);

/**
 * Compuestos con nombre común: se definen por su nombre SISTEMÁTICO (que se lee con la
 * misma gramática), así no se duplican estructuras.
 */
export const COMMON_COMPOUNDS = /** @type {{ names: string[], systematic: string }[]} */ ([
  { names: ['isobutano'], systematic: '2-metilpropano' },
  { names: ['isopentano'], systematic: '2-metilbutano' },
  { names: ['neopentano'], systematic: '2,2-dimetilpropano' },
  { names: ['cloroformo'], systematic: 'triclorometano' },
  { names: ['bromoformo'], systematic: 'tribromometano' },
  { names: ['yodoformo'], systematic: 'triyodometano' },
  { names: ['tetracloruro de carbono'], systematic: 'tetraclorometano' },
  { names: ['etileno'], systematic: 'eteno' },
  { names: ['acetileno'], systematic: 'etino' },
  { names: ['propileno'], systematic: 'propeno' },
  { names: ['alcohol metilico'], systematic: 'metanol' },
  { names: ['alcohol etilico'], systematic: 'etanol' },
  { names: ['alcohol propilico'], systematic: '1-propanol' },
  { names: ['alcohol isopropilico'], systematic: '2-propanol' },
  { names: ['alcohol butilico'], systematic: '1-butanol' },
  { names: ['etilenglicol', 'glicol'], systematic: '1,2-etanodiol' },
  { names: ['glicerina', 'glicerol'], systematic: '1,2,3-propanotriol' },
  { names: ['formaldehido', 'aldehido formico'], systematic: 'metanal' },
  { names: ['acetaldehido', 'aldehido acetico'], systematic: 'etanal' },
  { names: ['acetona'], systematic: 'propanona' },
  { names: ['acido formico'], systematic: 'acido metanoico' },
  { names: ['acido acetico'], systematic: 'acido etanoico' },
  { names: ['acido propionico'], systematic: 'acido propanoico' },
  { names: ['acido butirico'], systematic: 'acido butanoico' },
]);

/**
 * Funciones que el sistema reconoce pero todavía no implementa (fuera de alcance v0.1).
 * Se usan para decir "esto viene después" en vez de "no entiendo".
 */
export const FUERA_DE_ALCANCE = /** @type {[RegExp, string][]} */ ([
  [/ciclo/, 'ciclos (ciclo…)'],
  [/benc?eno|benzo|fenil|fenol|tolueno/, 'compuestos aromáticos'],
  [/vinil|alil|etinil|propargil/, 'sustituyentes con enlaces múltiples (vinil, alil…)'],
  [/oato(?![a-z])|[a-z]ato de |ester|carboxi|formil/, 'ésteres y otros derivados de ácidos'],
  [/amina|amino|amida/, 'aminas y amidas'],
  [/eter|metoxi|etoxi|propoxi|butoxi/, 'éteres'],
  [/nitro|sulfo|tio/, 'otros grupos funcionales'],
]);
