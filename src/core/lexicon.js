// @ts-check
/**
 * Léxico de la nomenclatura en español (v0.1: alcanos, alquilos y halógenos).
 * Todo en minúsculas y sin acentos (ver normalize en parser.js).
 */

const UNITS_PREFIX = ['', 'hen', 'do', 'tri', 'tetra', 'penta', 'hexa', 'hepta', 'octa', 'nona'];

/**
 * Raíces de 1 a 99 carbonos: [raíz, nº de carbonos].
 * 11–19 undec…nonadec; 20 eicos (también «icos»); 21–29 heneicos, docos, tricos…;
 * decenas: triacont, tetracont…; unidades delante: hentriacont, dotriacont…
 * @returns {[string, number][]}
 */
function buildStems() {
  /** @type {[string, number][]} */
  const out = [['met', 1], ['et', 2], ['prop', 3], ['but', 4], ['pent', 5], ['hex', 6], ['hept', 7], ['oct', 8], ['non', 9], ['dec', 10]];
  const teens = ['undec', 'dodec', 'tridec', 'tetradec', 'pentadec', 'hexadec', 'heptadec', 'octadec', 'nonadec'];
  teens.forEach((t, i) => out.push([t, 11 + i]));
  out.push(['eicos', 20]);
  const tens = ['', '', 'cos', 'triacont', 'tetracont', 'pentacont', 'hexacont', 'heptacont', 'octacont', 'nonacont'];
  for (let n = 21; n <= 99; n++) {
    const t = Math.floor(n / 10);
    const u = n % 10;
    if (u === 0) {
      out.push([tens[t] === 'cos' ? 'eicos' : tens[t], n]);
    } else if (t === 2) {
      out.push([u === 1 ? 'heneicos' : `${UNITS_PREFIX[u]}cos`, n]);
    } else {
      out.push([`${UNITS_PREFIX[u]}${tens[t]}`, n]);
    }
  }
  return out;
}

/** Raíces de cadena (1–99 carbonos). */
export const STEMS = buildStems();

/** Variantes que también se aceptan al leer (no se usan al escribir). */
const STEM_ALIASES = /** @type {[string, number][]} */ ([['icos', 20], ['henicos', 21]]);

/** Todas las raíces aceptadas al leer. */
export const STEMS_READ = [...STEMS, ...STEM_ALIASES];

/** Raíz por número de carbonos. @param {number} n */
export function stemOf(n) {
  const f = STEMS.find(([, k]) => k === n);
  return f ? f[0] : null;
}

/** Multiplicadores: [prefijo, cantidad] (2–20). */
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
  ['undeca', 11],
  ['dodeca', 12],
  ['trideca', 13],
  ['tetradeca', 14],
  ['pentadeca', 15],
  ['hexadeca', 16],
  ['heptadeca', 17],
  ['octadeca', 18],
  ['nonadeca', 19],
  ['icosa', 20],
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
  { names: ['acido laurico'], systematic: 'acido dodecanoico' },
  { names: ['acido miristico'], systematic: 'acido tetradecanoico' },
  { names: ['acido palmitico'], systematic: 'acido hexadecanoico' },
  { names: ['acido estearico'], systematic: 'acido octadecanoico' },
  { names: ['acido oxalico'], systematic: 'acido etanodioico' },
  { names: ['acido malonico'], systematic: 'acido propanodioico' },
  { names: ['acido succinico'], systematic: 'acido butanodioico' },
  { names: ['acido lactico'], systematic: 'acido 2-hidroxipropanoico' },
  { names: ['acido acrilico'], systematic: 'acido propenoico' },
  { names: ['acido metacrilico'], systematic: 'acido 2-metilpropenoico' },
  { names: ['acroleina', 'aldehido acrilico'], systematic: 'propenal' },
  { names: ['isooctano'], systematic: '2,2,4-trimetilpentano' },
  { names: ['isopreno'], systematic: '2-metil-1,3-butadieno' },
  { names: ['cloruro de vinilo'], systematic: 'cloroeteno' },
  { names: ['cloruro de etilo'], systematic: 'cloroetano' },
  { names: ['acrilato de metilo'], systematic: 'propenoato de metilo' },
  { names: ['metacrilato de metilo'], systematic: '2-metilpropenoato de metilo' },
  { names: ['acetamida'], systematic: 'etanamida' },
  { names: ['formamida'], systematic: 'metanamida' },
  { names: ['acetato de metilo'], systematic: 'etanoato de metilo' },
  { names: ['acetato de etilo'], systematic: 'etanoato de etilo' },
  { names: ['formiato de metilo'], systematic: 'metanoato de metilo' },
  { names: ['formiato de etilo'], systematic: 'metanoato de etilo' },
  { names: ['eter etilico', 'eter dietilico'], systematic: 'etoxietano' },
  { names: ['eter metilico', 'eter dimetilico'], systematic: 'metoximetano' },
]);

/** Acilos comunes de los ésteres de clase: «acetato de isopropilo» = «etanoato de isopropilo». */
export const COMMON_ACYL = /** @type {Record<string, string>} */ ({
  formiato: 'metanoato',
  acetato: 'etanoato',
  propionato: 'propanoato',
  butirato: 'butanoato',
});

const quitaTildes = (/** @type {string} */ t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const TILDES = /** @type {Record<string, string>} */ ({
  acido: 'ácido', eter: 'éter', aldehido: 'aldehído', formaldehido: 'formaldehído', acetaldehido: 'acetaldehído',
  etilico: 'etílico', metilico: 'metílico', propilico: 'propílico', isopropilico: 'isopropílico', butilico: 'butílico',
  laurico: 'láurico', miristico: 'mirístico', palmitico: 'palmítico', estearico: 'esteárico', oxalico: 'oxálico', malonico: 'malónico', succinico: 'succínico', lactico: 'láctico', acrilico: 'acrílico', metacrilico: 'metacrílico', acroleina: 'acroleína',
  formico: 'fórmico', acetico: 'acético', propionico: 'propiónico', butirico: 'butírico', dietilico: 'dietílico', dimetilico: 'dimetílico',
});

/**
 * Nombres comunes de una molécula a partir de su nombre sistemático (el sentido contrario de
 * COMMON_COMPOUNDS): «propanona» -> [«acetona»]; «etanoato de isopropilo» -> [«acetato de isopropilo»].
 * @param {string} systematic
 * @returns {string[]}
 */
export function commonNamesOf(systematic) {
  const key = quitaTildes(systematic);
  const fila = COMMON_COMPOUNDS.find((c) => quitaTildes(c.systematic) === key);
  /** @type {string[]} */
  const out = fila ? [...fila.names] : [];
  for (const [comun, sist] of Object.entries(COMMON_ACYL)) {
    if (key.startsWith(`${sist} de `)) out.push(`${comun}${key.slice(sist.length)}`);
  }
  const bonito = (/** @type {string} */ n) => n.split(' ').map((w) => TILDES[w] ?? w).join(' ');
  // sin repetir lo que ya produce la fila de COMMON_COMPOUNDS
  return [...new Set(out.map(bonito))];
}

/**
 * Funciones que el sistema reconoce pero todavía no implementa.
 * Se usan para decir "esto viene después" en vez de "no entiendo".
 * (v0.3: éteres, ésteres, aminas y amidas ya se leen y se nombran.)
 */
export const FUERA_DE_ALCANCE = /** @type {[RegExp, string][]} */ ([
  [/ciclo/, 'ciclos (ciclo…)'],
  [/benc?eno|benzo|fenil|fenol|tolueno|anilina/, 'compuestos aromáticos'],
  [/vinil|alil|etinil|propargil/, 'sustituyentes con enlaces múltiples (vinil, alil…)'],
  [/dioato|trioato|dicarboxil|anhidrido/, 'diésteres, poliésteres y anhídridos'],
  [/carboxi|formil|carbamoil|acil/, 'derivados de ácidos (carboxi, formil, carbamoil…)'],
  [/nitril|ciano|imina|hidrazin|hidroxilamin|urea|carbamato/, 'nitrilos, iminas y otros grupos con nitrógeno'],
  [/\bde (sodio|potasio|litio|calcio|magnesio|amonio)\b/, 'sales orgánicas (acetato de sodio, propanoato de potasio…)'],
  [/nitro|sulfo|tio/, 'otros grupos funcionales'],
]);
