// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/core/analyze.js';
import { fromSmiles } from '../src/core/smiles.js';

/**
 * Ésteres con acilo de nombre común y cualquier radical («acetato de isopropilo») y sales orgánicas.
 * @type {[string, string, string, string][]}  [nombre, SMILES, nombre sistemático, fórmula]
 */
const CASOS = [
  ['acetato de isopropilo', 'CC(=O)OC(C)C', 'etanoato de isopropilo', 'C₅H₁₀O₂'],
  ['acetato de isobutilo', 'CC(=O)OCC(C)C', 'etanoato de isobutilo', 'C₆H₁₂O₂'],
  ['acetato de terc-butilo', 'CC(=O)OC(C)(C)C', 'etanoato de terc-butilo', 'C₆H₁₂O₂'],
  ['acetato de pentilo', 'CC(=O)OCCCCC', 'etanoato de pentilo', 'C₇H₁₄O₂'],
  ['propionato de etilo', 'CCC(=O)OCC', 'propanoato de etilo', 'C₅H₁₀O₂'],
  ['butirato de metilo', 'CCCC(=O)OC', 'butanoato de metilo', 'C₅H₁₀O₂'],
  ['formiato de propilo', 'C(=O)OCCC', 'metanoato de propilo', 'C₄H₈O₂'],
];

for (const [nombre, smiles, sist, formula] of CASOS) {
  test(`éster común: ${nombre}`, () => {
    const r = analyze(nombre);
    assert.equal(r.status, 'valido', nombre);
    assert.equal(r.molecule?.canonicalKey(), fromSmiles(smiles).canonicalKey());
    assert.equal(r.formula, formula);
    assert.equal(r.names?.sistematico, sist);
  });
}

test('sales orgánicas: Na/K/Li se leen (salts.js); otros metales se declaran fuera de alcance, sin estructura inventada', () => {
  assert.equal(analyze('acetato de sodio').status, 'valido');
  assert.equal(analyze('propanoato de potasio').status, 'valido');
  for (const n of ['etanoato de calcio', 'acetato de magnesio']) {
    const r = analyze(n);
    assert.equal(r.status, 'fuera_de_alcance', n);
    assert.equal(r.molecule, null, n);
  }
});

test('éster común con radical inexistente no se inventa', () => {
  assert.notEqual(analyze('acetato de xyz').status, 'valido');
});
