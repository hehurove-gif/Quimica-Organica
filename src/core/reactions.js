// @ts-check
/**
 * Reacciones orgánicas del compendio. Cada reacción es una función determinista que transforma
 * el grafo `Molecule` (cambiar órdenes de enlace, quitar/unir átomos); los H implícitos se
 * recalculan solos. Los coeficientes salen de `balance.js` (conservación de átomos), nunca de
 * una tabla. Lo que no está soportado devuelve `fuera_de_alcance` en vez de inventar un producto.
 */
import { balance, conserves } from './balance.js';
import { speciesFromName, fromMolecule, inorganic, CATION_OF } from './species.js';
import { Molecule } from './molecule.js';

/** @typedef {import('./species.js').Species} Species */
/**
 * @typedef {'valido' | 'sin_reaccion' | 'incompleto' | 'invalido' | 'fuera_de_alcance'} Status
 * @typedef {{
 *   status: Status, id: string, title: string,
 *   substrates: Species[], reagents: Species[], products: Species[],
 *   conditions: string, reversible: boolean,
 *   coefficients: { reactants: number[], products: number[] } | null,
 *   equation: string | null, equationSemi: string | null,
 *   steps: string[], notes: string[], errors: { code: string, message: string }[],
 * }} ReactionResult
 * @typedef {{ error: { status: Status, code: string, message: string }, steps?: string[] }
 *   | { products: Species[], reagents?: Species[], conditions?: string, steps: string[], notes?: string[],
 *       alternatives?: Species[], reversible?: boolean, noBalance?: boolean }} Outcome
 * @typedef {{
 *   nombre: string, arity: number, ringOk?: boolean, accept?: Species['kind'][],
 *   run: (inputs: Species[], opts: Record<string, string>) => Outcome,
 * }} ReactionDef
 */

// ───────────────────────── utilidades de grafo ─────────────────────────

/** @param {Molecule} mol @param {number} id */
const el = (mol, id) => mol.element(id);
/** @param {Molecule} mol @param {number} id */
const cNeighbors = (mol, id) => mol.neighbors(id).filter((n) => el(mol, n.id) === 'C');

/** Átomos del anillo de benceno (vacío si no hay). @param {Molecule} mol @returns {Set<number>} */
function ringAtoms(mol) {
  const r = mol.benzeneRing();
  return new Set(r ? r.ring : []);
}

/**
 * Alcoholes: –OH sobre un carbono sp³ que no es de ácido ni de fenol ni de enol.
 * @param {Molecule} mol @returns {{ o: number, c: number }[]}
 */
function alcoholSites(mol) {
  const ring = ringAtoms(mol);
  /** @type {{ o: number, c: number }[]} */
  const out = [];
  for (const a of mol.atoms) {
    if (a.el !== 'O' || mol.neighbors(a.id).length !== 1 || mol.implicitH(a.id) !== 1 || a.q) continue;
    const n = mol.neighbors(a.id)[0];
    if (n.order !== 1 || el(mol, n.id) !== 'C' || ring.has(n.id)) continue;
    if (mol.neighbors(n.id).some((x) => x.order !== 1)) continue; // ácido, enol, etc.
    out.push({ o: a.id, c: n.id });
  }
  return out;
}

/** –OH de ácido carboxílico. @param {Molecule} mol @returns {{ o: number, c: number }[]} */
function acidSites(mol) {
  /** @type {{ o: number, c: number }[]} */
  const out = [];
  for (const a of mol.atoms) {
    if (a.el !== 'O' || mol.neighbors(a.id).length !== 1 || mol.implicitH(a.id) !== 1 || a.q) continue;
    const n = mol.neighbors(a.id)[0];
    if (el(mol, n.id) !== 'C') continue;
    const carbonyl = mol.neighbors(n.id).some((x) => x.order === 2 && el(mol, x.id) === 'O' && mol.neighbors(x.id).length === 1);
    if (carbonyl) out.push({ o: a.id, c: n.id });
  }
  return out;
}

/** Ésteres R–C(=O)–O–R'. @param {Molecule} mol @returns {{ c: number, o1: number, o2: number, r: number }[]} */
function esterSites(mol) {
  /** @type {{ c: number, o1: number, o2: number, r: number }[]} */
  const out = [];
  for (const a of mol.atoms) {
    if (a.el !== 'C') continue;
    const nb = mol.neighbors(a.id);
    const o1 = nb.find((x) => x.order === 2 && el(mol, x.id) === 'O' && mol.neighbors(x.id).length === 1);
    if (!o1) continue;
    for (const x of nb) {
      if (x.order !== 1 || el(mol, x.id) !== 'O') continue;
      const other = mol.neighbors(x.id).filter((y) => y.id !== a.id);
      if (other.length === 1 && el(mol, other[0].id) === 'C' && mol.implicitH(x.id) === 0) {
        out.push({ c: a.id, o1: o1.id, o2: x.id, r: other[0].id });
      }
    }
  }
  return out;
}

/** Enlaces múltiples C–C fuera del anillo aromático. @param {Molecule} mol */
function multipleCC(mol) {
  const ring = ringAtoms(mol);
  return mol.bonds.filter((b) => b.order >= 2 && el(mol, b.a) === 'C' && el(mol, b.b) === 'C' && !(ring.has(b.a) && ring.has(b.b)));
}

/** ¿Es un alcano acíclico (solo C, enlaces simples)? @param {Molecule} mol */
const isAlkane = (mol) => mol.isTree() && mol.atoms.every((a) => a.el === 'C') && mol.bonds.every((b) => b.order === 1);

/** @param {Molecule} mol @param {number} id */
const nameOf = (mol, id) => fromMolecule(mol.without(mol.atoms.map((a) => a.id).filter((x) => x !== id)).mol).name;

// ───────────────────────── opciones y mensajes ─────────────────────────

/**
 * @param {Record<string, string>} opts @param {string} key @param {string[]} allowed @param {string} def
 * @returns {{ value: string } | { error: Outcome }}
 */
function choose(opts, key, allowed, def) {
  const v = opts[key] ?? def;
  if (allowed.includes(v)) return { value: v };
  return { error: { error: { status: 'incompleto', code: 'opcion', message: `Elige ${key}: ${allowed.join(', ')}.` } } };
}

/** @param {Status} status @param {string} code @param {string} message @param {string[]} [steps] @returns {Outcome} */
const fail = (status, code, message, steps) => ({ error: { status, code, message }, steps });

/** @param {Molecule} mol */
const species = (mol) => fromMolecule(mol);

// ───────────────────────── grupo A: cambio de orden de enlace ─────────────────────────

/** @type {ReactionDef['run']} */
function reduccion([s], opts) {
  const mol = /** @type {Molecule} */ (s.mol);
  const red = choose(opts, 'reductor', ['LiAlH4', 'NaBH4'], 'NaBH4');
  if ('error' in red) return red.error;
  const sites = mol.atoms.filter((a) => a.el === 'O' && mol.neighbors(a.id).length === 1 && mol.neighbors(a.id)[0].order === 2 && el(mol, mol.neighbors(a.id)[0].id) === 'C');
  if (!sites.length) return fail('sin_reaccion', 'sin_carbonilo', 'No hay un grupo C=O de aldehído o cetona que reducir.', ['Se busca un C=O con H o con dos carbonos vecinos: no existe en esta molécula.']);
  if (sites.length > 1) return fail('fuera_de_alcance', 'varios_carbonilos', 'Hay varios grupos C=O: todavía no elijo cuál reducir.');
  const o = sites[0].id;
  const c = mol.neighbors(o)[0].id;
  if (mol.neighbors(c).some((n) => n.id !== o && el(mol, n.id) !== 'C')) {
    return fail('fuera_de_alcance', 'carbonilo_derivado', 'Ese C=O es de un ácido, éster o amida: el compendio solo cubre aldehídos y cetonas.');
  }
  const aldehyde = mol.implicitH(c) >= 1;
  const m = mol.clone();
  m.setBond(c, o, 1);
  const notes = [];
  if (multipleCC(mol).length) notes.push(`El ${red.value} reduce el C=O y deja intacto el enlace C=C.`);
  return {
    products: [species(m)], reagents: [inorganic('[H]')], conditions: red.value,
    steps: [
      `Se localiza el grupo carbonilo C=O (${aldehyde ? 'aldehído: el C lleva H' : 'cetona: el C está entre dos carbonos'}).`,
      `El agente reductor (${red.value}) aporta 2[H]: se rompe el enlace π del C=O y se añaden un H al C y un H al O.`,
      `Resultado: ${aldehyde ? 'alcohol primario' : 'alcohol secundario'}.`,
    ],
    notes,
  };
}

/** @type {ReactionDef['run']} */
function hidrogenacion([s], opts) {
  const mol = /** @type {Molecule} */ (s.mol);
  const cat = choose(opts, 'catalizador', ['Ni', 'Pd', 'Pt'], 'Pt');
  if ('error' in cat) return cat.error;
  const bonds = multipleCC(mol);
  if (!bonds.length) return fail('sin_reaccion', 'sin_insaturacion', 'No hay enlaces dobles ni triples C–C que hidrogenar.', ['Se buscan enlaces C=C o C≡C: no hay ninguno.']);
  const m = mol.clone();
  let h2 = 0;
  for (const b of bonds) {
    h2 += b.order - 1;
    m.setBond(b.a, b.b, 1);
  }
  const notes = [];
  if (mol.atoms.some((a) => a.el === 'O' && mol.neighbors(a.id).some((n) => n.order === 2))) notes.push('Con estos catalizadores solo se hidrogenan los enlaces C–C múltiples; el C=O no se toca.');
  return {
    products: [species(m)], reagents: [inorganic('H2')], conditions: cat.value,
    steps: [
      `Se localizan los enlaces múltiples C–C: ${bonds.map((b) => (b.order === 2 ? 'C=C' : 'C≡C')).join(', ')}.`,
      `Con el catalizador ${cat.value}, cada enlace π incorpora una molécula de H₂ (en total ${h2}).`,
      'Todos los enlaces C–C quedan simples: el producto es un alcano (saturado).',
    ],
    notes,
  };
}

/** @type {ReactionDef['run']} */
function oxidacion([s], opts) {
  const mol = /** @type {Molecule} */ (s.mol);
  const ox = choose(opts, 'oxidante', ['KMnO4', 'K2Cr2O7', 'PCC'], 'KMnO4');
  if ('error' in ox) return ox.error;
  const sites = alcoholSites(mol);
  if (!sites.length) return fail('sin_reaccion', 'sin_alcohol', 'No hay un grupo –OH de alcohol que oxidar.', ['Se busca un –OH sobre un carbono saturado: no existe.']);
  if (sites.length > 1) return fail('fuera_de_alcance', 'polialcohol', 'Hay varios –OH: todavía no elijo cuál oxidar.');
  const { o, c } = sites[0];
  const grade = cNeighbors(mol, c).length; // 0-1 primario, 2 secundario, 3 terciario
  const kind = grade <= 1 ? 'primario' : grade === 2 ? 'secundario' : 'terciario';
  const steps = [`El carbono que lleva el –OH tiene ${grade} carbono(s) vecino(s): el alcohol es ${kind}.`];
  if (kind === 'terciario') {
    return fail('sin_reaccion', 'terciario', 'Un alcohol terciario no se oxida en condiciones normales.', [
      ...steps,
      'Para oxidar hay que quitar un H del carbono del –OH; en un alcohol terciario ese carbono no tiene H, y romper un enlace C–C requiere condiciones drásticas.',
    ]);
  }
  const m = mol.clone();
  m.setBond(c, o, 2);
  const conditions = ox.value;
  if (kind === 'secundario') {
    steps.push(`El oxidante (${ox.value}) quita el H del –OH y el H del carbono: se forma C=O.`, 'Un alcohol secundario da una cetona y ahí se detiene.');
    return { products: [species(m), inorganic('H2O')], reagents: [inorganic('[O]')], conditions, steps };
  }
  if (ox.value === 'PCC') {
    steps.push('El PCC es un oxidante suave: quita 2 H y se detiene en el aldehído.');
    return { products: [species(m), inorganic('H2O')], reagents: [inorganic('[O]')], conditions, steps };
  }
  const ald = species(m);
  const acid = m.clone();
  const oh = acid.addAtom('O');
  acid.addBond(c, oh, 1);
  steps.push(
    `Primera oxidación: el alcohol primario pasa a aldehído (${ald.name ?? 'aldehído'}).`,
    `Con un oxidante fuerte (${ox.value}) el aldehído se oxida otra vez: el C gana un –OH y se forma el ácido carboxílico.`,
  );
  return { products: [species(acid), inorganic('H2O')], reagents: [inorganic('[O]')], conditions, steps };
}


// ───────────────────────── grupo B: añadir/quitar átomos con regla de regioselectividad ─────────────────────────

/**
 * Agrupa productos por clave canónica (conserva el primero de cada clave).
 * @template T @param {(T & { sp: Species })[]} list @returns {(T & { sp: Species })[]}
 */
function uniqueByKey(list) {
  const seen = new Set();
  return list.filter((x) => (seen.has(x.sp.key) ? false : (seen.add(x.sp.key), true)));
}

/** @type {ReactionDef['run']} */
function markovnikov([s], opts) {
  const mol = /** @type {Molecule} */ (s.mol);
  const rea = choose(opts, 'reactivo', ['HCl', 'HBr', 'HI', 'H2O'], 'HBr');
  if ('error' in rea) return rea.error;
  const dbl = multipleCC(mol);
  if (!dbl.length) return fail('sin_reaccion', 'sin_alqueno', 'No hay un doble enlace C=C al que adicionar.', ['Se busca un enlace C=C: no existe en esta molécula.']);
  if (dbl.some((b) => b.order === 3)) return fail('fuera_de_alcance', 'alquino', 'La adición a alquinos no está en el compendio: solo alquenos.');
  if (dbl.length > 1) return fail('fuera_de_alcance', 'varios_dobles', 'Hay varios enlaces C=C: todavía no elijo cuál reacciona.');
  const { a, b } = dbl[0];
  const ha = mol.implicitH(a);
  const hb = mol.implicitH(b);
  // X (o –OH) va al carbono con menos H; H al que ya tiene más
  const targets = ha > hb ? [b] : hb > ha ? [a] : [a, b];
  const sym = rea.value === 'H2O' ? 'O' : rea.value.slice(1);
  const made = uniqueByKey(targets.map((t) => {
    const m = mol.clone();
    m.setBond(a, b, 1);
    const x = m.addAtom(sym);
    m.addBond(t, x, 1);
    return { sp: species(m) };
  }));
  const role = made.length > 1 ? 'mezcla' : 'principal';
  const all = made.map((x) => ({ ...x.sp, role: /** @type {'principal' | 'mezcla'} */ (role) }));
  const steps = [
    `Se localiza el doble enlace C=C; los carbonos tienen ${ha} y ${hb} H.`,
    `El reactivo ${rea.value === 'H2O' ? 'H–OH (medio ácido)' : rea.value} es asimétrico y se adiciona al C=C, que pasa a enlace simple.`,
    ha === hb
      ? 'Regla de Markovnikov: los dos carbonos tienen los mismos H, así que la regla no decide y se obtiene una mezcla (si los productos son distintos).'
      : `Regla de Markovnikov: el H se une al carbono que ya tiene más H (${Math.max(ha, hb)}) y ${rea.value === 'H2O' ? 'el –OH' : 'el halógeno'} al carbono más sustituido.`,
  ];
  const notes = made.length > 1 ? ['Sin diferencia de H entre los carbonos del doble enlace, Markovnikov no elige: se forman ambos productos.'] : [];
  return {
    products: [all[0]], alternatives: all.slice(1), reagents: [inorganic(rea.value)],
    conditions: rea.value === 'H2O' ? 'H⁺' : '', steps, notes,
  };
}

/** @type {ReactionDef['run']} */
function deshidratacion([s]) {
  const mol = /** @type {Molecule} */ (s.mol);
  const sites = alcoholSites(mol);
  if (!sites.length) return fail('sin_reaccion', 'sin_alcohol', 'No hay un grupo –OH de alcohol que eliminar.', ['Se busca un –OH sobre un carbono saturado: no existe.']);
  if (sites.length > 1) return fail('fuera_de_alcance', 'polialcohol', 'Hay varios –OH: todavía no elijo cuál eliminar.');
  const { o, c } = sites[0];
  const beta = cNeighbors(mol, c).filter((n) => mol.implicitH(n.id) >= 1 && mol.neighbors(n.id).every((x) => x.order === 1));
  if (!beta.length) return fail('sin_reaccion', 'sin_beta', 'Ningún carbono vecino al del –OH tiene H, así que no puede formarse un doble enlace.', ['Se busca un H en los carbonos vecinos al del –OH: no hay ninguno.']);
  const made = uniqueByKey(beta.map((n) => {
    const { mol: m, map } = mol.without([o]);
    m.setBond(/** @type {number} */ (map.get(c)), /** @type {number} */ (map.get(n.id)), 2);
    return { sp: species(m), h: mol.implicitH(n.id) };
  }));
  const minH = Math.min(...made.map((x) => x.h));
  const principals = made.filter((x) => x.h === minH);
  const role = principals.length > 1 ? 'mezcla' : 'principal';
  const out = [
    ...principals.map((x) => ({ ...x.sp, role: /** @type {'principal' | 'mezcla'} */ (role) })),
    ...made.filter((x) => x.h !== minH).map((x) => ({ ...x.sp, role: /** @type {'secundario'} */ ('secundario') })),
  ];
  const steps = [
    'Se localiza el –OH y el carbono que lo lleva; el medio ácido (H₂SO₄) y el calor lo eliminan junto con un H vecino (se sale H₂O).',
    `Carbonos vecinos con H: ${beta.map((n) => `${mol.implicitH(n.id)} H`).join(', ')}.`,
    made.length === 1
      ? 'Solo hay un alqueno posible.'
      : 'Regla de Zaitsev: se pierde el H del carbono vecino con menos H; así el doble enlace queda en el carbono más sustituido y el alqueno es más estable.',
  ];
  const notes = ['El compendio no distingue cis/trans: la estereoquímica queda fuera de alcance.'];
  if (made.length > 1) notes.push('Los alquenos «secundarios» se forman en menor cantidad.');
  return { products: [out[0], inorganic('H2O')], alternatives: out.slice(1), conditions: 'H₂SO₄, calor', steps, notes };
}

/** @type {ReactionDef['run']} */
function halogenacion([s], opts) {
  const mol = /** @type {Molecule} */ (s.mol);
  const hal = choose(opts, 'halogeno', ['Cl2', 'Br2'], 'Cl2');
  if ('error' in hal) return hal.error;
  if (!isAlkane(mol)) return fail('fuera_de_alcance', 'no_alcano', 'La halogenación radicalar del compendio es solo de alcanos acíclicos (solo C e H, enlaces simples).');
  const x = hal.value.slice(0, -1);
  const made = uniqueByKey(mol.atoms.filter((a) => mol.implicitH(a.id) >= 1).map((a) => {
    const m = mol.clone();
    const h = m.addAtom(x);
    m.addBond(a.id, h, 1);
    return { sp: species(m), deg: cNeighbors(mol, a.id).length };
  })).sort((p, q) => q.deg - p.deg);
  const top = made.filter((m) => m.deg === made[0].deg);
  /** @type {Species[]} */
  let out;
  /** @type {string[]} */
  const notes = ['Con exceso de halógeno pueden sustituirse más H (polisustitución); aquí se muestra la monosustitución.'];
  if (hal.value === 'Br2') {
    const role = top.length > 1 ? 'mezcla' : 'principal';
    out = [
      ...top.map((m) => ({ ...m.sp, role: /** @type {'principal' | 'mezcla'} */ (role) })),
      ...made.filter((m) => m.deg !== made[0].deg).map((m) => ({ ...m.sp, role: /** @type {'secundario'} */ ('secundario') })),
    ];
  } else {
    out = made.map((m) => ({ ...m.sp, role: /** @type {'principal' | 'mezcla'} */ (made.length > 1 ? 'mezcla' : 'principal') }));
    if (made.length > 1) notes.push('El cloro es poco selectivo: se obtiene una mezcla de todos los isómeros, aunque el H terciario se sustituye algo más fácil.');
  }
  const steps = [
    `La luz ultravioleta rompe ${hal.value} en dos átomos radicales ${x}•.`,
    `Un radical ${x}• arranca un H del alcano y el radical alquilo resultante toma un átomo de ${x} de otra molécula ${hal.value}: se sustituye H por ${x} y se libera ${'H' + x}.`,
    made.length === 1
      ? 'Todos los H son equivalentes: hay un único producto monosustituido.'
      : hal.value === 'Br2'
        ? 'El bromo es selectivo: sustituye preferentemente el H del carbono más sustituido (terciario > secundario > primario).'
        : 'Hay varios tipos de H distintos, así que hay varios productos posibles.',
  ];
  return { products: [out[0], inorganic('H' + x)], alternatives: out.slice(1), reagents: [inorganic(hal.value)], conditions: 'luz UV (hν)', steps, notes };
}

// ───────────────────────── registro y ensamblado ─────────────────────────

/** @type {Record<string, ReactionDef>} */
export const REACTIONS = {
  oxidacion: { nombre: 'Oxidación de alcoholes', arity: 1, run: oxidacion },
  reduccion: { nombre: 'Reducción de aldehídos y cetonas', arity: 1, run: reduccion },
  hidrogenacion: { nombre: 'Hidrogenación catalítica de alquenos y alquinos', arity: 1, run: hidrogenacion },
  markovnikov: { nombre: 'Adición electrofílica a alquenos (Markovnikov)', arity: 1, run: markovnikov },
  deshidratacion: { nombre: 'Deshidratación de alcoholes (Zaitsev)', arity: 1, run: deshidratacion },
  halogenacion: { nombre: 'Halogenación radicalar de alcanos', arity: 1, run: halogenacion },
};

const SUBS = '₀₁₂₃₄₅₆₇₈₉';
/** @param {number} n */
const coefText = (n) => (n > 1 ? `${n} ` : '');
/** @param {Species} s */
const nameText = (s) => s.name ?? s.formula;
/** @param {Species} s */
const semiText = (s) => s.semi ?? s.formula;

/** @param {string} id @param {string} title @returns {ReactionResult} */
function empty(id, title) {
  return {
    status: 'valido', id, title, substrates: [], reagents: [], products: [], conditions: '', reversible: false,
    coefficients: null, equation: null, equationSemi: null, steps: [], notes: [], errors: [],
  };
}

/**
 * Ejecuta una reacción.
 * @param {string} id clave de REACTIONS
 * @param {string[]} names nombres de los reactivos orgánicos (1 o 2 según la reacción)
 * @param {Record<string, string>} [opts] reactivo/condición (oxidante, reductor, catalizador, base, halogeno, reactivo)
 * @returns {ReactionResult}
 */
export function react(id, names, opts = {}) {
  const def = REACTIONS[id];
  if (!def) return { ...empty(id, id), status: 'invalido', errors: [{ code: 'reaccion_desconocida', message: `No conozco la reacción «${id}».` }] };
  const base = empty(id, def.nombre);
  if (names.length < def.arity || names.slice(0, def.arity).some((n) => !n.trim())) {
    return { ...base, status: 'incompleto', errors: [{ code: 'faltan_reactivos', message: `Esta reacción necesita ${def.arity} reactivo(s) orgánico(s).` }] };
  }
  /** @type {Species[]} */
  const inputs = [];
  for (const n of names.slice(0, def.arity)) {
    const r = speciesFromName(n);
    if (!r.ok) {
      const st = r.analysis?.status;
      const status = st === 'fuera_de_alcance' ? 'fuera_de_alcance' : st === 'invalido' ? 'invalido' : 'incompleto';
      return { ...base, status, errors: r.analysis?.errors.length ? r.analysis.errors : [{ code: 'no_leido', message: r.message }] };
    }
    inputs.push(r.species);
  }
  const accept = def.accept ?? ['organic'];
  for (const s of inputs) {
    if (!accept.includes(s.kind)) {
      return { ...base, substrates: inputs, status: 'fuera_de_alcance', errors: [{ code: 'tipo_de_reactivo', message: `«${nameText(s)}» no es un reactivo válido para esta reacción (se esperaba: ${accept.join(' / ')}).` }] };
    }
    if (!def.ringOk && s.mol && (!s.mol.isTree() || s.mol.benzeneRing())) {
      return { ...base, substrates: inputs, status: 'fuera_de_alcance', errors: [{ code: 'anillo', message: `«${nameText(s)}» tiene un anillo: esta reacción solo está soportada para cadenas acíclicas, así que no invento un producto.` }] };
    }
  }
  const out = def.run(inputs, opts);
  if ('error' in out) {
    return { ...base, substrates: inputs, status: out.error.status, errors: [{ code: out.error.code, message: out.error.message }], steps: out.steps ?? [] };
  }
  const reagents = out.reagents ?? [];
  for (const p of [...out.products, ...(out.alternatives ?? [])]) {
    const issues = p.mol && p.kind !== 'polymer' ? p.mol.validate().filter((i) => !(p.kind === 'salt' && i.code === 'carga')) : [];
    if (issues.length) {
      return { ...base, substrates: inputs, status: 'invalido', errors: [{ code: 'producto_invalido', message: `Error interno: el producto «${nameText(p)}» no es una estructura válida (${issues[0].message}).` }] };
    }
  }
  const left = [...inputs, ...reagents];
  /** @type {ReactionResult['coefficients']} */
  let coef = null;
  if (!out.noBalance) {
    coef = balance(left.map((s) => s.counts), out.products.map((s) => s.counts));
    if (!coef || !conserves(left.map((s) => s.counts), out.products.map((s) => s.counts), coef)) {
      return { ...base, substrates: inputs, status: 'invalido', errors: [{ code: 'no_balancea', message: 'Error interno: la ecuación no se puede balancear con estos productos.' }] };
    }
  }
  const withCoef = (/** @type {Species[]} */ list, /** @type {number[] | undefined} */ cs) => list.map((s, i) => ({ ...s, coef: cs ? cs[i] : undefined }));
  const L = withCoef(left, coef?.reactants);
  const R = withCoef(out.products, coef?.products);
  const arrow = out.reversible ? '⇌' : '→';
  const cond = out.conditions ? ` [${out.conditions}]` : '';
  const fmt = (/** @type {Species[]} */ list, /** @type {(s: Species) => string} */ f) => list.map((s) => `${coefText(s.coef ?? 1)}${f(s)}`).join(' + ');
  const unitPrefix = out.noBalance ? 'n ' : '';
  return {
    ...base,
    substrates: L.slice(0, inputs.length),
    reagents: L.slice(inputs.length),
    products: [...R, ...(out.alternatives ?? [])],
    conditions: out.conditions ?? '',
    reversible: !!out.reversible,
    coefficients: coef,
    equation: `${unitPrefix}${fmt(L, nameText)} ${arrow}${cond} ${fmt(R, nameText)}`,
    equationSemi: `${unitPrefix}${fmt(L, semiText)} ${arrow}${cond} ${fmt(R, semiText)}`,
    steps: out.steps,
    notes: out.notes ?? [],
  };
}

export { CATION_OF, Molecule, SUBS, alcoholSites, acidSites, esterSites, multipleCC, isAlkane, nameOf };
