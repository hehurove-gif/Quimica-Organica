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
 * Alcanos / compuestos con nombre común que el sistema reconoce y traduce al sistemático.
 * `chain` + `groups` describen la estructura: [{ locants, el|methyl }]
 */
export const COMMON_COMPOUNDS = /** @type {{ names: string[], systematic: string, chain: number, groups: { locants: number[], methyl?: boolean, el?: string }[] }[]} */ ([
  { names: ['isobutano'], systematic: '2-metilpropano', chain: 3, groups: [{ locants: [2], methyl: true }] },
  { names: ['isopentano'], systematic: '2-metilbutano', chain: 4, groups: [{ locants: [2], methyl: true }] },
  { names: ['neopentano'], systematic: '2,2-dimetilpropano', chain: 3, groups: [{ locants: [2, 2], methyl: true }] },
  { names: ['cloroformo'], systematic: 'triclorometano', chain: 1, groups: [{ locants: [1, 1, 1], el: 'Cl' }] },
  { names: ['bromoformo'], systematic: 'tribromometano', chain: 1, groups: [{ locants: [1, 1, 1], el: 'Br' }] },
  { names: ['yodoformo'], systematic: 'triyodometano', chain: 1, groups: [{ locants: [1, 1, 1], el: 'I' }] },
  { names: ['tetracloruro de carbono'], systematic: 'tetraclorometano', chain: 1, groups: [{ locants: [1, 1, 1, 1], el: 'Cl' }] },
]);

/**
 * Funciones que el sistema reconoce pero todavía no implementa (fuera de alcance v0.1).
 * Se usan para decir "esto viene después" en vez de "no entiendo".
 */
export const FUERA_DE_ALCANCE = /** @type {[RegExp, string][]} */ ([
  [/ciclo/, 'ciclos (ciclo…)'],
  [/benc?eno|benzo|fenil|fenol|tolueno/, 'compuestos aromáticos'],
  [/(?:met|et|prop|but|pent|hex|hept|oct|non|dec)(?:en|in)(?:o|il|ilo)?(?![a-z])|dieno|trieno|vinil|alil|etinil/, 'alquenos y alquinos (dobles y triples enlaces)'],
  [/(?:an|en|in)(?:di|tri)?ol(?![a-z])|hidroxi/, 'alcoholes (-ol)'],
  [/anal(?![a-z])|formil|oxo(?![a-z])/, 'aldehídos (-al)'],
  [/anona(?![a-z])|cetona|acetona/, 'cetonas (-ona)'],
  [/oico|carboxi|acido|oato(?![a-z])|ester/, 'ácidos carboxílicos y ésteres'],
  [/amina|amino|amida/, 'aminas y amidas'],
  [/eter|metoxi|etoxi|propoxi|butoxi/, 'éteres'],
  [/nitro|sulfo|tio/, 'otros grupos funcionales'],
]);
