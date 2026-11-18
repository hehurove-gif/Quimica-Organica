// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/core/analyze.js';
import { fromSmiles } from '../src/core/smiles.js';

/**
 * Tabla de oro (T2/T3): nombre → fórmula y SMILES. Revisada de forma independiente en
 * tools/check_golden.py; requiere revisión docente (ver docs/plan-de-pruebas.md).
 * @type {[string, string, string][]}
 */
const ORO = [
  ['2-buteno', 'C₄H₈', 'CC=CC'],
  ['but-2-eno', 'C₄H₈', 'CC=CC'],
  ['1-buteno', 'C₄H₈', 'C=CCC'],
  ['eteno', 'C₂H₄', 'C=C'],
  ['1,3-butadieno', 'C₄H₆', 'C=CC=C'],
  ['buta-1,3-dieno', 'C₄H₆', 'C=CC=C'],
  ['propadieno', 'C₃H₄', 'C=C=C'],
  ['1-propino', 'C₃H₄', 'C#CC'],
  ['prop-1-ino', 'C₃H₄', 'C#CC'],
  ['2-butino', 'C₄H₆', 'CC#CC'],
  ['etanol', 'C₂H₆O', 'CCO'],
  ['2-propanol', 'C₃H₈O', 'CC(O)C'],
  ['propan-2-ol', 'C₃H₈O', 'CC(O)C'],
  ['1,2-etanodiol', 'C₂H₆O₂', 'OCCO'],
  ['etano-1,2-diol', 'C₂H₆O₂', 'OCCO'],
  ['1,2,3-propanotriol', 'C₃H₈O₃', 'OCC(O)CO'],
  ['4-penten-2-ol', 'C₅H₁₀O', 'CC(O)CC=C'],
  ['pent-4-en-2-ol', 'C₅H₁₀O', 'CC(O)CC=C'],
  ['metanal', 'CH₂O', 'C=O'],
  ['etanal', 'C₂H₄O', 'CC=O'],
  ['propanal', 'C₃H₆O', 'CCC=O'],
  ['2-metilpropanal', 'C₄H₈O', 'CC(C)C=O'],
  ['butanodial', 'C₄H₆O₂', 'O=CCCC=O'],
  ['propanona', 'C₃H₆O', 'CC(=O)C'],
  ['acetona', 'C₃H₆O', 'CC(=O)C'],
  ['2-butanona', 'C₄H₈O', 'CCC(=O)C'],
  ['butanona', 'C₄H₈O', 'CCC(=O)C'],
  ['3-pentanona', 'C₅H₁₀O', 'CCC(=O)CC'],
  ['pentano-2,4-diona', 'C₅H₈O₂', 'CC(=O)CC(=O)C'],
  ['ácido metanoico', 'CH₂O₂', 'OC=O'],
  ['ácido etanoico', 'C₂H₄O₂', 'CC(=O)O'],
  ['ácido acético', 'C₂H₄O₂', 'CC(=O)O'],
  ['ácido propanoico', 'C₃H₆O₂', 'CCC(=O)O'],
  ['ácido 2-metilpropanoico', 'C₄H₈O₂', 'CC(C)C(=O)O'],
  ['ácido butanodioico', 'C₄H₆O₄', 'OC(=O)CCC(=O)O'],
  ['3-hidroxibutanal', 'C₄H₈O₂', 'CC(O)CC=O'],
  ['4-oxopentanal', 'C₅H₈O₂', 'CC(=O)CCC=O'],
  ['2-bromo-1-etanol', 'C₂H₅BrO', 'OCCBr'],
  ['2-bromoetan-1-ol', 'C₂H₅BrO', 'OCCBr'],
  ['3-cloro-2-butanona', 'C₄H₇ClO', 'CC(Cl)C(=O)C'],
];

test('tabla de oro: fórmula y estructura (mismo grafo que el SMILES)', () => {
  for (const [name, formula, smiles] of ORO) {
    const r = analyze(name);
    assert.equal(r.status, 'valido', `${name}: ${r.errors.map((e) => e.message).join(' | ')}`);
    assert.equal(r.formula, formula, name);
    const ref = fromSmiles(smiles);
    assert.equal(r.molecule?.canonicalKey(), ref.canonicalKey(), name);
  }
});

test('localizador omitido: se acepta solo si no hay duda', () => {
  for (const n of ['butanona', 'eteno', 'propanona', 'etanol', 'propadieno']) {
    assert.equal(analyze(n).status, 'valido', n);
  }
  // Decisión abierta (docs): «2-bromoetanol» se usa en la práctica, pero con localizador omitido
  // hay dos moléculas posibles (OH en C1 o en C2), así que el sistema pide el localizador.
  for (const n of ['propanol', 'buteno', 'butadieno', 'pentanona', '2-bromoetanol']) {
    // pentanona: 2 y 3 son moléculas distintas
    assert.equal(analyze(n).status, 'incompleto', n);
  }
});

test('errores químicos con mensaje claro', () => {
  /** @type {[string, RegExp][]} */
  const casos = [
    ['1-butanona', /extremo/],
    ['4-buteno', /entre 1 y 3/],
    ['2,3-buteno', /multiplicador/],
    ['2-hexano', /no corresponden/],
    ['3-propanal', /extremos/],
    ['1,1,1-tribromoetan-1-ol', /4 enlaces/],
  ];
  for (const [t, re] of casos) {
    const r = analyze(t);
    assert.ok(['invalido', 'incompleto'].includes(r.status), `${t}: ${r.status}`);
    assert.equal(r.molecule, null, t);
    assert.ok(re.test(r.errors.map((e) => e.message).join(' ')) || re.source === '.', `${t}: ${r.errors[0]?.message}`);
  }
});

test('«ácido» exige -oico, y -oico sin «ácido» es válido con nota', () => {
  assert.equal(analyze('ácido etanol').status, 'invalido');
  const r = analyze('butanoico');
  assert.equal(r.status, 'valido');
  assert.ok(r.notes.some((n) => /ácido/.test(n.message)));
});

test('funciones aún no soportadas: fuera de alcance, nunca una estructura', () => {
  for (const n of ['propanamida', 'etilamina', 'etoxietano', 'etanoato de metilo']) {
    const r = analyze(n);
    assert.equal(r.status, 'fuera_de_alcance', n);
    assert.equal(r.molecule, null, n);
  }
});
