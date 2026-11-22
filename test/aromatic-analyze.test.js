// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/core/analyze.js';

/** @param {string} n */
const ok = (n) => {
  const a = analyze(n);
  assert.equal(a.status, 'valido', n);
  return a;
};

test('analyze aromático: nombre canónico, fórmula, dibujo y pasos', () => {
  const a = ok('2,4,6-trinitrotolueno');
  assert.equal(a.names?.sistematico, '2,4,6-trinitrotolueno');
  assert.equal(a.formula, 'C₇H₅N₃O₆');
  assert.equal(a.correcto, true);
  assert.equal(a.semidesarrollada, 'C₆H₂(CH₃)(NO₂)₃');
  const svg = a.aromatic?.svg({ locants: true }) ?? '';
  assert.ok(svg.startsWith('<svg'));
  assert.equal(/NaN|undefined/.test(svg), false);
  assert.equal((svg.match(/class="atom el-/g) ?? []).length, 6 + 4); // 6 vértices + 4 sustituyentes
  assert.equal((svg.match(/<line data-bond="\d+-\d+"/g) ?? []).length, 6 + 3 + 4); // anillo + 3 dobles + 4 enlaces
  assert.ok(a.steps.length >= 5);
  assert.ok(a.steps.some((s) => /posiciones 2, 4 y 6/.test(s.text)));
});

test('analyze aromático: el dibujo respeta la numeración (grupo principal arriba, C1)', () => {
  const a = ok('ácido 2-hidroxibenzoico');
  assert.deepEqual(a.aromatic?.groups.map((g) => [g.pos, g.sub.name]), [[1, 'carboxi'], [2, 'hidroxi']]);
});

test('analyze aromático: equivalencias y nombres comunes', () => {
  assert.equal(ok('metilbenceno').correcto, true);
  assert.equal(ok('p-nitrotolueno').correcto, true);
  assert.equal(ok('1,3-dinitrobenceno').notes.some((n) => /m-/.test(n.message)), true);
  const x = ok('o-xileno');
  assert.equal(x.correcto, false);
  assert.ok(x.notes.some((n) => n.type === 'comun' && /1,2-dimetilbenceno/.test(n.message)));
  const o = ok('1,2-dimetil-4-bromobenceno');
  assert.equal(o.correcto, false);
  assert.equal(o.notes.find((n) => n.type === 'nombre_canonico')?.correct, '4-bromo-1,2-dimetilbenceno');
});

test('analyze aromático: ambiguo → incompleto con las opciones; contradicción → invalido', () => {
  const a = analyze('dibromobenceno');
  assert.equal(a.status, 'incompleto');
  assert.equal(a.molecule, null);
  assert.match(a.errors[0].message, /1,2-dibromobenceno.*1,3-dibromobenceno.*1,4-dibromobenceno/);
  assert.equal(analyze('1,1-dibromobenceno').status, 'invalido');
});

test('analyze aromático: grupos repetidos válidos pero sin nombre se dicen, no se inventan', () => {
  const a = ok('1,2-dihidroxibenceno');
  assert.equal(a.names, null);
  assert.ok(a.notes.some((n) => n.type === 'sin_nombre'));
});

test('analyze: las cadenas no se ven afectadas', () => {
  assert.equal(ok('2-metilbutano').names?.sistematico, '2-metilbutano');
  assert.equal(analyze('fenilmetano').status, 'fuera_de_alcance');
});
