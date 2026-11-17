// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/core/parser.js';
import { build } from '../src/core/build.js';
import { nameMolecule, diagnose } from '../src/core/namer.js';
import { Molecule } from '../src/core/molecule.js';

/** @param {string} name */
function make(name) {
  const p = parse(name);
  assert.equal(p.status, 'valido', `${name}: ${JSON.stringify(p.errors)}`);
  const r = build(/** @type {import('../src/core/parser.js').Ast} */ (p.ast));
  assert.equal(r.status, 'valido', `${name}: ${JSON.stringify(r.errors)}`);
  return { ast: /** @type {import('../src/core/parser.js').Ast} */ (p.ast), r, mol: /** @type {Molecule} */ (r.molecule) };
}

/** @param {string} name */
function canon(name) {
  const { mol } = make(name);
  const n = nameMolecule(mol);
  assert.ok(n.ok, `${name}: ${n.ok ? '' : n.reason}`);
  return n.ok ? n : /** @type {never} */ (null);
}

test('nombre canónico: casos de referencia (revisados a mano)', () => {
  /** @type {[string, string][]} */
  const casos = [
    ['hexano', 'hexano'],
    ['metano', 'metano'],
    ['2-metil-1-bromopropano', '1-bromo-2-metilpropano'],
    ['5-fluor-2-metil-1-yodo-hexano', '5-fluoro-2-metil-1-yodohexano'],
    ['5-fluoro-1-yodo-2-metilhexano', '5-fluoro-2-metil-1-yodohexano'], // el orden de la investigación no era alfabético
    ['bromuro de isobutilo', '1-bromo-2-metilpropano'],
    ['bromuro de etilo', 'bromoetano'],
    ['isobutano', '2-metilpropano'],
    ['neopentano', '2,2-dimetilpropano'],
    ['isopentano', '2-metilbutano'],
    ['3-metilbutano', '2-metilbutano'],
    ['2-etilbutano', '3-metilpentano'],
    ['3-etil-2-metilpentano', '3-etil-2-metilpentano'],
    ['2,2,4-trimetilpentano', '2,2,4-trimetilpentano'],
    ['2,3-dimetilbutano', '2,3-dimetilbutano'],
    ['2-bromo-1-cloroetano', '1-bromo-2-cloroetano'],
    ['1,2-dibromoetano', '1,2-dibromoetano'],
    ['1,1-dicloroetano', '1,1-dicloroetano'],
    ['cloroformo', 'triclorometano'],
    ['tetracloruro de carbono', 'tetraclorometano'],
    ['bromuro de terc-butilo', '2-bromo-2-metilpropano'],
    ['3-metil-hexano'.replace('-hexano', 'hexano'), '3-metilhexano'],
    ['4-metilhexano', '3-metilhexano'], // 4 desde un extremo = 3 desde el otro
  ];
  for (const [entrada, esperado] of casos) assert.equal(canon(entrada).systematic, esperado, entrada);
});

test('alfabético: di-, tri- y sec-/terc- no cuentan', () => {
  // etil (e) antes que metil (m) aunque haya "dimetil"
  assert.equal(canon('3-etil-2,4-dimetilhexano').systematic, '3-etil-2,4-dimetilhexano');
  // bromo antes que cloro antes que yodo
  assert.equal(canon('1-bromo-2-cloro-3-yodopropano').systematic, '1-bromo-2-cloro-3-yodopropano');
});

test('forma radicofuncional (solo con un halógeno)', () => {
  assert.equal(canon('bromoetano').radicofuncional, 'bromuro de etilo');
  assert.equal(canon('1-bromo-2-metilpropano').radicofuncional, 'bromuro de isobutilo');
  assert.equal(canon('2-bromopropano').radicofuncional, 'bromuro de isopropilo');
  assert.equal(canon('2-clorobutano').radicofuncional, 'cloruro de sec-butilo');
  assert.equal(canon('2-bromo-2-metilpropano').radicofuncional, 'bromuro de terc-butilo');
  assert.equal(canon('1-yodo-2-metilbutano').radicofuncional, 'yoduro de 2-metilbutilo');
  assert.equal(canon('1,2-dibromoetano').radicofuncional, null);
});

test('diagnóstico: numeración, cadena, orden alfabético y nombre correcto', () => {
  /** @param {string} s */
  const d = (s) => {
    const { ast, r, mol } = make(s);
    return diagnose(ast, mol, r.chain);
  };
  assert.deepEqual(d('1-bromo-2-metilpropano'), []);
  assert.deepEqual(d('5-fluoro-2-metil-1-yodohexano'), []);
  assert.deepEqual(d('bromoetano'), []);
  // imagen de referencia: mal orden alfabético (bromo antes que metil)
  const a = d('2-metil-1-bromopropano');
  assert.equal(a.length, 1);
  assert.equal(a[0].type, 'orden_alfabetico');
  assert.equal(a[0].correct, '1-bromo-2-metilpropano');
  // fluoro, yodo, metil: «metil» (m) va antes que «yodo» (y)
  const b = d('5-fluoro-1-yodo-2-metilhexano');
  assert.equal(b[0].type, 'orden_alfabetico');
  assert.equal(b[0].correct, '5-fluoro-2-metil-1-yodohexano');
  // numeración por el extremo equivocado
  const n = d('3-metilbutano');
  assert.equal(n[0].type, 'numeracion');
  assert.equal(n[0].correct, '2-metilbutano');
  assert.equal(d('2-bromo-1-cloroetano')[0].type, 'numeracion');
  // cadena no más larga
  const c = d('2-etilbutano');
  assert.equal(c[0].type, 'cadena');
  assert.equal(c[0].correct, '3-metilpentano');
});

test('moléculas fuera de alcance no reciben nombre inventado', () => {
  const m = new Molecule();
  const a = m.addAtom('C');
  m.addBond(a, m.addAtom('O'));
  const r = nameMolecule(m);
  assert.equal(r.ok, false);
  const dbl = new Molecule();
  const x = dbl.addAtom('C');
  dbl.addBond(x, dbl.addAtom('C'), 2);
  assert.equal(nameMolecule(dbl).ok, false);
  // cadena de 11 carbonos
  const big = new Molecule();
  let prev = big.addAtom('C');
  for (let i = 0; i < 10; i++) {
    const id = big.addAtom('C');
    big.addBond(prev, id);
    prev = id;
  }
  const rb = nameMolecule(big);
  assert.equal(rb.ok, false);
});

/** PRNG determinista. @param {number} a */
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Molécula aleatoria: árbol de carbonos + halógenos al azar respetando valencias. @param {() => number} rnd */
function randomMolecule(rnd) {
  const m = new Molecule();
  const nC = 1 + Math.floor(rnd() * 12);
  m.addAtom('C');
  for (let i = 1; i < nC; i++) {
    const cand = m.atoms.filter((a) => a.el === 'C' && m.bondSum(a.id) < 4).map((a) => a.id);
    const p = cand[Math.floor(rnd() * cand.length)];
    m.addBond(p, m.addAtom('C'));
  }
  const nH = Math.floor(rnd() * 4);
  const els = ['F', 'Cl', 'Br', 'I'];
  for (let i = 0; i < nH; i++) {
    const cand = m.atoms.filter((a) => a.el === 'C' && m.bondSum(a.id) < 4).map((a) => a.id);
    if (!cand.length) break;
    m.addBond(cand[Math.floor(rnd() * cand.length)], m.addAtom(els[Math.floor(rnd() * 4)]));
  }
  return m;
}

test('ida y vuelta: estructura -> nombre -> parser -> estructura (1500 moléculas aleatorias)', () => {
  const rnd = mulberry32(2026);
  let nombradas = 0;
  let fuera = 0;
  for (let i = 0; i < 1500; i++) {
    const m = randomMolecule(rnd);
    assert.deepEqual(m.validate(), []);
    const n = nameMolecule(m);
    if (!n.ok) {
      fuera++;
      assert.match(n.reason, /carbonos|límite/, `razón inesperada: ${n.reason}`);
      continue;
    }
    nombradas++;
    const forms = [n.systematic, ...(n.radicofuncional ? [n.radicofuncional] : [])];
    for (const f of forms) {
      const p = parse(f);
      assert.equal(p.status, 'valido', `no se puede releer «${f}»: ${JSON.stringify(p.errors)}`);
      const r = build(/** @type {import('../src/core/parser.js').Ast} */ (p.ast));
      assert.equal(r.status, 'valido', `«${f}»: ${JSON.stringify(r.errors)}`);
      assert.equal(/** @type {Molecule} */ (r.molecule).canonicalKey(), m.canonicalKey(), `«${f}» no reconstruye la misma molécula`);
      // el nombre canónico no recibe diagnósticos sobre sí mismo
      if (f === n.systematic) {
        const pp = /** @type {import('../src/core/parser.js').Ast} */ (p.ast);
        assert.deepEqual(diagnose(pp, /** @type {Molecule} */ (r.molecule), r.chain), [], `diagnóstico espurio en «${f}»`);
      }
    }
  }
  assert.ok(nombradas > 1000, `solo ${nombradas} nombradas (${fuera} fuera de alcance)`);
});
