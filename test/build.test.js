// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/core/parser.js';
import { build } from '../src/core/build.js';

/** @param {string} name */
function make(name) {
  const p = parse(name);
  assert.equal(p.status, 'valido', `${name}: ${JSON.stringify(p.errors)}`);
  return build(/** @type {import('../src/core/parser.js').Ast} */ (p.ast));
}

/** @param {string} name */
function keyOf(name) {
  const r = make(name);
  assert.equal(r.status, 'valido', `${name}: ${JSON.stringify(r.errors)}`);
  return /** @type {import('../src/core/molecule.js').Molecule} */ (r.molecule).canonicalKey();
}

test('fórmulas moleculares de casos de referencia', () => {
  /** @type {[string, string][]} */
  const casos = [
    ['hexano', 'C₆H₁₄'],
    ['metano', 'CH₄'],
    ['5-fluoro-1-yodo-2-metilhexano', 'C₇H₁₄FI'],
    ['1-bromo-2-metilpropano', 'C₄H₉Br'],
    ['bromoetano', 'C₂H₅Br'],
    ['2,2-dimetilpropano', 'C₅H₁₂'],
    ['1,2-dibromoetano', 'C₂H₄Br₂'],
    ['2-(2-metilpropil)heptano', 'C₁₁H₂₄'],
    ['tetraclorometano', 'CCl₄'],
    ['triclorometano', 'CHCl₃'],
  ];
  for (const [nombre, f] of casos) {
    const r = make(nombre);
    assert.equal(r.status, 'valido', nombre);
    assert.equal(r.molecule?.formula(), f, nombre);
  }
});

test('el mismo compuesto escrito de distintas formas da la misma molécula', () => {
  /** @type {string[][]} */
  const grupos = [
    ['1-bromo-2-metilpropano', '2-metil-1-bromopropano', 'bromuro de isobutilo', '1-bromo-2-metilpropano', 'bromuro de 2-metilpropilo'],
    ['bromoetano', '1-bromoetano', 'bromuro de etilo', '2-bromoetano'],
    ['5-fluoro-1-yodo-2-metilhexano', '5-fluor-2-metil-1-yodo-hexano', '2-metil-5-fluoro-1-iodohexano'],
    ['2-bromopropano', 'bromuro de isopropilo'],
    ['2-bromo-2-metilpropano', 'bromuro de terc-butilo', 'bromuro de tert-butilo'],
    ['2-clorobutano', 'cloruro de sec-butilo', 'cloruro de 1-metilpropilo'],
    ['2-metilpropano', 'isobutano', 'metilpropano'.replace('metil', '2-metil')],
    ['2,2-dimetilpropano', 'neopentano'],
    ['2-metilbutano', 'isopentano'],
    ['triclorometano', 'cloroformo', '1,1,1-triclorometano'],
    ['tetraclorometano', 'tetracloruro de carbono'],
    ['3-metil-hexano'.replace('-hexano', 'hexano'), '4-metilhexano'.replace('4', '3')],
  ];
  for (const g of grupos) {
    const base = keyOf(g[0]);
    for (const n of g) assert.equal(keyOf(n), base, `${n} ≠ ${g[0]}`);
  }
});

test('isómeros distintos no se confunden', () => {
  assert.notEqual(keyOf('1-bromopropano'), keyOf('2-bromopropano'));
  assert.notEqual(keyOf('2-metilbutano'), keyOf('pentano'));
  assert.notEqual(keyOf('2-metilbutano'), keyOf('2,2-dimetilpropano'));
});

test('localizador omitido: se acepta solo si no hay ambigüedad', () => {
  const ok = make('bromoetano');
  assert.equal(ok.status, 'valido');
  assert.ok(ok.notes.some((n) => n.type === 'localizador_omitido'));
  for (const amb of ['bromopropano', 'metilpropano', 'dimetilpropano', 'clorobutano']) {
    const r = make(amb);
    assert.equal(r.status, 'incompleto', amb);
    assert.equal(r.errors[0].code, 'localizador_ambiguo');
  }
  assert.equal(make('metilmetano').status, 'valido');
});

test('errores de localizadores', () => {
  assert.equal(make('7-bromohexano').errors[0].code, 'localizador_fuera');
  assert.equal(make('0-bromohexano').errors[0].code, 'localizador_fuera');
  assert.equal(make('2-dimetilpropano').errors[0].code, 'multiplicador');
  assert.equal(make('2,2-metilpropano').errors[0].code, 'multiplicador');
  assert.equal(make('2,3,4-dimetilhexano').errors[0].code, 'multiplicador');
  const r = make('2-dimetilpropano');
  assert.match(r.errors[0].message, /2,2/);
});

test('valencias: no se pueden poner más sustituyentes de los que caben', () => {
  assert.equal(make('1,1,1,1-tetrabromoetano').errors[0].code, 'valencia');
  assert.equal(make('2,2,2-tribromopropano').errors[0].code, 'valencia');
  assert.equal(make('pentabromometano').status, 'invalido');
  assert.equal(make('1,1,1-tribromoetano').status, 'valido');
  assert.equal(make('2,2-dibromopropano').status, 'valido');
});

test('trazabilidad: cada grupo del nombre conoce sus átomos', () => {
  const r = make('5-fluoro-1-yodo-2-metilhexano');
  const mol = /** @type {import('../src/core/molecule.js').Molecule} */ (r.molecule);
  const fluoro = r.trace.find((t) => t.role === 'grupo' && t.label === 'fluoro');
  assert.ok(fluoro);
  assert.equal(fluoro.atomIds.length, 1);
  assert.equal(mol.element(fluoro.atomIds[0]), 'F');
  // el flúor está unido al carbono 5 de la cadena
  const nb = mol.neighbors(fluoro.atomIds[0])[0].id;
  assert.equal(nb, r.chain[4]);
  const metil = r.trace.find((t) => t.label === 'metil');
  assert.equal(mol.neighbors(metil?.atomIds[0] ?? -1)[0].id, r.chain[1]);
});

test('radical anidado necesita localizador salvo en cadena de 1 carbono', () => {
  assert.equal(make('2-(metilpropil)heptano').status, 'incompleto');
  assert.equal(make('2-(2-metilpropil)heptano').status, 'valido');
});
