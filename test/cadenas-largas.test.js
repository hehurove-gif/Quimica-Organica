// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/core/analyze.js';
import { stemOf, STEMS } from '../src/core/lexicon.js';
import { Molecule } from '../src/core/molecule.js';
import { nameMolecule } from '../src/core/namer.js';

test('raíces de 10 en adelante', () => {
  /** @type {[number, string][]} */
  const casos = [
    [10, 'dec'], [11, 'undec'], [12, 'dodec'], [13, 'tridec'], [14, 'tetradec'], [15, 'pentadec'],
    [16, 'hexadec'], [17, 'heptadec'], [18, 'octadec'], [19, 'nonadec'], [20, 'eicos'],
    [21, 'heneicos'], [22, 'docos'], [23, 'tricos'], [29, 'nonacos'], [30, 'triacont'],
    [31, 'hentriacont'], [32, 'dotriacont'], [40, 'tetracont'],
  ];
  for (const [n, s] of casos) assert.equal(stemOf(n), s, String(n));
  assert.equal(new Set(STEMS.map(([s]) => s)).size, STEMS.length, 'sin raíces repetidas');
});

/** @param {number} n */
function alkane(n) {
  const m = new Molecule();
  let prev = m.addAtom('C');
  for (let i = 1; i < n; i++) {
    const id = m.addAtom('C');
    m.addBond(prev, id);
    prev = id;
  }
  return m;
}

test('alcanos largos: nombre, fórmula y lectura de vuelta', () => {
  /** @type {[number, string, string][]} */
  const casos = [[11, 'undecano', 'C₁₁H₂₄'], [12, 'dodecano', 'C₁₂H₂₆'], [20, 'eicosano', 'C₂₀H₄₂'], [21, 'heneicosano', 'C₂₁H₄₄'], [30, 'triacontano', 'C₃₀H₆₂']];
  for (const [n, nombre, formula] of casos) {
    const r = nameMolecule(alkane(n));
    assert.ok(r.ok, nombre);
    if (r.ok) assert.equal(r.systematic, nombre);
    const a = analyze(nombre);
    assert.equal(a.status, 'valido', nombre);
    assert.equal(a.formula, formula, nombre);
    assert.equal(a.molecule?.canonicalKey(), alkane(n).canonicalKey(), nombre);
  }
});

test('el ejemplo del usuario: 2-metil-1-bromoeicosano', () => {
  const a = analyze('2-metil-1-bromoeicosano');
  assert.equal(a.status, 'valido', a.errors[0]?.message);
  assert.equal(a.formula, 'C₂₁H₄₃Br');
  assert.equal(a.names?.sistematico, '1-bromo-2-metileicosano');
  assert.equal(analyze('1-bromo-2-metilicosano').names?.sistematico, '1-bromo-2-metileicosano'); // «icos» también se lee
});

test('radicales y multiplicadores largos sin ambigüedad (tridecil ≠ tri + decil)', () => {
  const a = analyze('2-tridecilhexano');
  assert.equal(a.status, 'valido', a.errors[0]?.message);
  assert.equal(a.formula, 'C₁₉H₄₀'); // 6 + 13 carbonos
  const b = analyze('2,3,4-trimetilhexano');
  assert.equal(b.formula, 'C₉H₂₀');
  const c = analyze('bromuro de dodecilo');
  assert.equal(c.status, 'valido');
  assert.equal(c.formula, 'C₁₂H₂₅Br');
  // 12 átomos de cloro no caben en un butano: se rechaza por valencia, no por límite del léxico
  assert.equal(analyze('1,1,1,2,2,2,3,3,3,4,4,4-dodecaclorobutano').status, 'invalido');
});

test('funciones en cadenas largas', () => {
  const a = analyze('1-dodecanol');
  assert.equal(a.status, 'valido');
  assert.equal(a.formula, 'C₁₂H₂₆O');
  assert.equal(analyze('ácido hexadecanoico').formula, 'C₁₆H₃₂O₂');
  assert.equal(analyze('1-octadeceno').formula, 'C₁₈H₃₆');
});
