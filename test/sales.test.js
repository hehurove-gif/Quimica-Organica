// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/core/analyze.js';

test('sales: estearato = octadecanoato de sodio (jabón), mismo grafo, carga formal en el O', () => {
  const a = analyze('estearato de sodio');
  const b = analyze('octadecanoato de sodio');
  assert.equal(a.status, 'valido');
  assert.equal(a.molecule?.canonicalKey(), b.molecule?.canonicalKey());
  assert.equal(a.names?.sistematico, 'octadecanoato de sodio');
  assert.equal(a.formula, 'C₁₈H₃₅O₂Na');
  assert.equal(b.correcto, true);
  assert.equal(a.correcto, false);
  assert.deepEqual(a.molecule?.validate(), []);
  assert.equal(a.molecule?.atoms.filter((x) => x.q === -1).length, 1);
  assert.ok(a.notes.some((n) => n.type === 'jabon'));
  assert.ok(a.notes.some((n) => n.type === 'comun'));
});

test('sales: otros cationes y ácidos, incluidos sustituidos y aromáticos', () => {
  assert.equal(analyze('etanoato de potasio').formula, 'C₂H₃O₂K');
  assert.equal(analyze('propanoato de litio').formula, 'C₃H₅O₂Li');
  assert.equal(analyze('acetato de sodio').names?.sistematico, 'etanoato de sodio');
  assert.equal(analyze('lactato de sodio').names?.sistematico, '2-hidroxipropanoato de sodio');
  assert.equal(analyze('benzoato de sodio').formula, 'C₇H₅O₂Na');
});

test('sales: lo no soportado se dice (diácidos, ácidos desconocidos) y los ésteres no se confunden', () => {
  assert.equal(analyze('etanodioato de sodio').status, 'fuera_de_alcance');
  assert.equal(analyze('xyzato de sodio').status, 'fuera_de_alcance');
  const e = analyze('etanoato de etilo');
  assert.equal(e.status, 'valido');
  assert.equal(e.formula, 'C₄H₈O₂');
});
