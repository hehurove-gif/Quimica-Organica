// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { fromSmiles } from '../src/core/smiles.js';
import { nameMolecule } from '../src/core/namer.js';
import { analyze } from '../src/core/analyze.js';

/**
 * SMILES → [nombre escolar, nombre IUPAC 2013]. Tabla de oro (requiere revisión docente).
 * @type {[string, string, string][]}
 */
const CANON = [
  ['CC=CC', '2-buteno', 'but-2-eno'],
  ['C=C', 'eteno', 'eteno'],
  ['C=CC=C', '1,3-butadieno', 'buta-1,3-dieno'],
  ['CC#C', 'propino', 'propino'],
  ['CC#CC', '2-butino', 'but-2-ino'],
  ['CCO', 'etanol', 'etanol'],
  ['CC(O)C', '2-propanol', 'propan-2-ol'],
  ['OCCO', '1,2-etanodiol', 'etano-1,2-diol'],
  ['CC(O)CC=C', '4-penten-2-ol', 'pent-4-en-2-ol'],
  ['CC=O', 'etanal', 'etanal'],
  ['CC(C)C=O', '2-metilpropanal', '2-metilpropanal'],
  ['O=CCCC=O', 'butanodial', 'butanodial'],
  ['CC(=O)C', 'propanona', 'propanona'],
  ['CCC(=O)C', 'butanona', 'butanona'],
  ['CCC(=O)CC', '3-pentanona', 'pentan-3-ona'],
  ['CC(=O)O', 'ácido etanoico', 'ácido etanoico'],
  ['CC(C)C(=O)O', 'ácido 2-metilpropanoico', 'ácido 2-metilpropanoico'],
  ['OC(=O)CCC(=O)O', 'ácido butanodioico', 'ácido butanodioico'],
  ['CC(O)CC=O', '3-hidroxibutanal', '3-hidroxibutanal'],
  ['CC(=O)CCC=O', '4-oxopentanal', '4-oxopentanal'],
  ['CC(=O)CC(=O)O', 'ácido 3-oxobutanoico', 'ácido 3-oxobutanoico'],
  ['CCC(Br)C(=O)C', '3-bromo-2-pentanona', '3-bromopentan-2-ona'],
];

test('nombre canónico con funciones (escolar e IUPAC 2013)', () => {
  for (const [smi, esc, iu] of CANON) {
    const r = nameMolecule(fromSmiles(smi));
    assert.ok(r.ok, `${smi}: ${r.ok ? '' : r.reason}`);
    if (r.ok) {
      assert.equal(r.systematic, esc, smi);
      assert.equal(r.iupac2013, iu, smi);
    }
  }
});

test('ida y vuelta: el nombre generado se lee de vuelta como la misma molécula', () => {
  for (const [smi] of CANON) {
    const mol = fromSmiles(smi);
    const r = nameMolecule(mol);
    assert.ok(r.ok, smi);
    if (!r.ok) continue;
    for (const nm of [r.systematic, r.iupac2013]) {
      const a = analyze(nm);
      assert.equal(a.status, 'valido', `${smi} -> ${nm}`);
      assert.equal(a.molecule?.canonicalKey(), mol.canonicalKey(), `${smi} -> ${nm}`);
      assert.equal(a.correcto, true, nm);
    }
  }
});

test('selección de cadena: el grupo principal manda sobre la longitud', () => {
  // CH3-CH2-CH2-CH(CH3)... el OH está en la rama corta: la cadena debe contenerlo
  const r = nameMolecule(fromSmiles('CCCCC(C)(O)C')); // 2-metil-2-hexanol
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.systematic, '2-metil-2-hexanol');
  // enlace doble en la cadena aunque haya otra más larga sin él
  const e = nameMolecule(fromSmiles('C=C(CC)CCC')); // 2-etil-1-penteno
  assert.ok(e.ok);
  if (e.ok) assert.equal(e.systematic, '2-etil-1-penteno');
});

test('diagnóstico: numeración y cadena con funciones', () => {
  const a = analyze('4-penten-2-ol');
  assert.equal(a.correcto, true);
  const b = analyze('2-penten-4-ol'); // numerado desde el extremo equivocado
  assert.equal(b.status, 'valido');
  assert.equal(b.correcto, false);
  assert.ok(b.notes.some((n) => n.type === 'numeracion' && /3-penten-2-ol/.test(n.message)), JSON.stringify(b.notes));
});
