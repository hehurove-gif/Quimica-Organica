// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/core/analyze.js';

const CASOS = /** @type {[string, string, string][]} */ ([
  ['polietileno', 'poli(eteno)', '–[CH₂–CH₂]ₙ–'],
  ['polieteno', 'poli(eteno)', '–[CH₂–CH₂]ₙ–'],
  ['polipropileno', 'poli(propeno)', '–[CH₂–CH(CH₃)]ₙ–'],
  ['policloruro de vinilo', 'poli(1-cloro-1-eteno)', '–[CH₂–CHCl]ₙ–'],
  ['poli(cloroeteno)', 'poli(1-cloro-1-eteno)', '–[CH₂–CHCl]ₙ–'],
  ['poliestireno', 'poli(etenilbenceno)', '–[CH₂–CH(C₆H₅)]ₙ–'],
  ['teflón', 'poli(1,1,2,2-tetrafluoro-1-eteno)', '–[CF₂–CF₂]ₙ–'],
  ['polimetacrilato de metilo', 'poli(2-metil-2-propenoato de metilo)', '–[CH₂–C(CH₃)(COOCH₃)]ₙ–'],
]);

test('polímeros de adición: nombre común o basado en el monómero → unidad repetitiva', () => {
  for (const [n, sist, unit] of CASOS) {
    const a = analyze(n);
    assert.equal(a.status, 'valido', n);
    assert.equal(a.names?.sistematico, sist, n);
    assert.equal(a.semidesarrollada, unit, n);
    assert.ok(a.notes.some((x) => x.type === 'polimero'), n);
    assert.deepEqual(a.molecule?.validate(), [], n);
  }
});

test('polímeros: la molécula devuelta es el monómero y la fórmula es (monómero)n', () => {
  const a = analyze('polietileno');
  assert.equal(a.molecule?.canonicalKey(), analyze('eteno').molecule?.canonicalKey());
  assert.equal(a.formula, '(C₂H₄)ₙ');
  assert.equal(analyze('poli(eteno)').correcto, true);
  assert.equal(analyze('polietileno').correcto, false);
});

test('polímeros: lo no catalogado se dice, no se inventa', () => {
  for (const n of ['polibutadieno', 'poliisopreno', 'poli(2-buteno)', 'polifenol']) {
    const a = analyze(n);
    assert.equal(a.status, 'fuera_de_alcance', n);
    assert.equal(a.molecule, null, n);
  }
  assert.notEqual(analyze('polixyz').status, 'valido');
});
