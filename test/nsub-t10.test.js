// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/core/analyze.js';
import { fromSmiles } from '../src/core/smiles.js';

/**
 * Amino sustituido como prefijo, tal como lo escriben las presentaciones de clase:
 * «2-(metilamino)propano». Oráculo: SMILES escrito a mano + nombre esperado escrito a mano.
 * @type {[string, string, string, string][]}  [nombre de clase, SMILES, nombre canónico escolar, fórmula]
 */
const CASOS = [
  ['2-(metilamino)propano', 'CC(C)NC', 'N-metil-2-propanamina', 'C₄H₁₁N'],
  ['1-(etilmetilamino)butano', 'CCCCN(C)CC', 'N-etil-N-metil-1-butanamina', 'C₇H₁₇N'],
  ['2-(dimetilamino)propano', 'CC(C)N(C)C', 'N,N-dimetil-2-propanamina', 'C₅H₁₃N'],
  ['3-(dimetilamino)pentano', 'CCC(CC)N(C)C', 'N,N-dimetil-3-pentanamina', 'C₇H₁₇N'],
  ['2-bromo-1-(dimetilamino)propano', 'CC(Br)CN(C)C', '2-bromo-N,N-dimetil-1-propanamina', 'C₅H₁₂BrN'],
  ['ácido 2-(metilamino)propanoico', 'CC(NC)C(=O)O', 'ácido 2-(metilamino)propanoico', 'C₄H₉NO₂'],
  ['ácido 2-(etilmetilamino)propanoico', 'CC(N(C)CC)C(=O)O', 'ácido 2-(etilmetilamino)propanoico', 'C₆H₁₃NO₂'],
  ['ácido 3-(metilamino)butanoico', 'CC(NC)CC(=O)O', 'ácido 3-(metilamino)butanoico', 'C₅H₁₁NO₂'],
];

for (const [nombre, smiles, canon, formula] of CASOS) {
  test(`amino sustituido: ${nombre}`, () => {
    const r = analyze(nombre);
    assert.equal(r.status, 'valido', nombre);
    assert.ok(r.molecule);
    assert.equal(r.molecule.canonicalKey(), fromSmiles(smiles).canonicalKey(), 'estructura distinta a la esperada');
    assert.equal(r.formula, formula);
    assert.equal(r.names?.sistematico, canon);
    assert.equal(r.molecule.validate().length, 0);
    // ida y vuelta: el nombre canónico se vuelve a leer como la misma molécula
    const back = analyze(canon);
    assert.equal(back.status, 'valido', canon);
    assert.equal(back.molecule?.canonicalKey(), r.molecule.canonicalKey());
  });
}

test('amino sustituido: el paso explicativo habla de amina secundaria/terciaria', () => {
  const sec = analyze('2-(metilamino)propano').steps.map((s) => s.text).join(' ');
  const ter = analyze('2-(dimetilamino)propano').steps.map((s) => s.text).join(' ');
  assert.match(sec, /amina secundaria/);
  assert.match(ter, /amina terciaria/);
});

test('amino sustituido: dibujo con N(CH₃)₂ y sin átomos perdidos', () => {
  assert.equal(analyze('2-(dimetilamino)propano').semidesarrollada, 'CH₃–CH(N(CH₃)₂)–CH₃');
  assert.equal(analyze('2-(metilamino)propano').semidesarrollada, 'CH₃–CH(NHCH₃)–CH₃');
});

test('amino sustituido: lo no soportado se dice, no se inventa', () => {
  for (const n of ['2-(metilamino', '2-(metilaminoo)propano', '2-(amino)propano']) {
    const r = analyze(n);
    assert.notEqual(r.status, 'valido', n);
  }
});
