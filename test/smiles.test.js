// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { fromSmiles, toSmiles } from '../src/core/smiles.js';

test('fórmulas desde SMILES (con O y enlaces múltiples)', () => {
  /** @type {[string, string][]} */
  const casos = [
    ['CC(=O)O', 'C₂H₄O₂'],
    ['CCO', 'C₂H₆O'],
    ['C=C', 'C₂H₄'],
    ['C#C', 'C₂H₂'],
    ['CC(C)=O', 'C₃H₆O'],
    ['CCC=O', 'C₃H₆O'],
    ['C=CC=C', 'C₄H₆'],
    ['OCCO', 'C₂H₆O₂'],
    ['ClC(Cl)Cl', 'CHCl₃'],
    ['BrCC(C)C', 'C₄H₉Br'],
  ];
  for (const [smi, f] of casos) {
    const m = fromSmiles(smi);
    assert.deepEqual(m.validate(), [], smi);
    assert.equal(m.formula(), f, smi);
  }
});

test('ida y vuelta SMILES -> grafo -> SMILES -> grafo conserva la molécula', () => {
  for (const smi of ['CC(C)CC(=O)O', 'CC=CC(O)C', 'C=C(C)C', 'OC(=O)CC(=O)O', 'CC(Br)C(F)(Cl)C', 'C=CC=CC', 'CC#CC(C)C']) {
    const a = fromSmiles(smi);
    const b = fromSmiles(toSmiles(a));
    assert.equal(b.canonicalKey(), a.canonicalKey(), smi);
  }
});

test('la clave canónica distingue el orden de enlace y el orden de escritura no importa', () => {
  assert.notEqual(fromSmiles('CCC').canonicalKey(), fromSmiles('C=CC').canonicalKey());
  assert.notEqual(fromSmiles('C=CC').canonicalKey(), fromSmiles('C#CC').canonicalKey());
  assert.equal(fromSmiles('CC(O)C').canonicalKey(), fromSmiles('OC(C)C').canonicalKey());
  assert.equal(fromSmiles('CC(=O)O').canonicalKey(), fromSmiles('OC(C)=O').canonicalKey());
  assert.equal(fromSmiles('C=CCC').canonicalKey(), fromSmiles('CCC=C').canonicalKey());
  assert.notEqual(fromSmiles('C=CCC').canonicalKey(), fromSmiles('CC=CC').canonicalKey());
});

test('valencias de O y N en la validación', () => {
  assert.deepEqual(fromSmiles('CCO').validate(), []);
  assert.deepEqual(fromSmiles('CCN').validate(), []);
  assert.equal(fromSmiles('CO(C)C').validate()[0].code, 'valencia');
  assert.equal(fromSmiles('C=C=C=C').validate().length, 0); // cada C interior tiene 4 enlaces
  assert.equal(fromSmiles('CC(=O)(=O)C').validate()[0].code, 'valencia');
});

test('SMILES no soportado se rechaza con mensaje', () => {
  for (const s of ['C1CC1', 'c1ccccc1', '[Na+]', 'CC.O', 'C(', 'C)', 'C=', '', 'CXC']) {
    assert.throws(() => fromSmiles(s), /SMILES/, s);
  }
  const ring = fromSmiles('CCC');
  ring.addBond(0, 2);
  assert.throws(() => toSmiles(ring), /acíclicas/);
});
